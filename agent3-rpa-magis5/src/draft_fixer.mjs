/**
 * draft_fixer.mjs — Correção de Variações em Rascunhos da Magis5
 *
 * Navega pela tela de consulta da Magis5, identifica produtos em rascunho
 * com variações incorretas/ausentes, e corrige recriando as variações
 * com os códigos Sankhya e preços corretos.
 */

import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import {
  MAGIS5_CONSULT_URL,
  MAGIS5_BASE_URL,
  ACTION_TIMEOUT_MS,
  SCREENSHOTS_DIR,
  PRODUTOS_DIR,
  ROOT_DIR,
} from "./config.mjs";
import { getCatalogVariations } from "../../agent0-sankhya/src/sankhya_client.mjs";
import { extractParentSku, extractVariationSuffix } from "../../agent2-enricher/grouping.mjs";
import { sanitizeDescription } from "./publisher.mjs";

// Tamanhos padrão para camisas BRK (masculino e feminino baby look)
const SIZES_MASC = ["PP", "P", "M", "G", "GG", "G1", "G2"];
const SIZES_FEM = ["PP", "P", "M", "G", "GG", "G1", "G2"];

/**
 * Busca diretamente o link de edição de um produto pelo seu SKU exato no Magis5.
 *
 * @param {import('playwright').Page} page
 * @param {string} sku - SKU a buscar (ex: FUSION123)
 * @returns {Promise<{ editUrl: string, title: string, sku: string } | null>}
 */
export async function findProductEditUrlBySku(page, sku) {
  if (!page.url().includes("consult.php")) {
    await page.goto(MAGIS5_CONSULT_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
  }

  const skuInput = page.locator('input[placeholder*="sku" i], #sku, input[name="sku"]').first();
  if (await skuInput.isVisible().catch(() => false)) {
    await skuInput.fill(sku);
    const searchBtn = page.locator('button:has-text("Buscar"), input[value="Buscar"]').first();
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  const editLink = page.locator("a[href*='variation.php?id=']").first();
  if (await editLink.isVisible().catch(() => false)) {
    const href = await editLink.getAttribute("href");
    const card = editLink.locator('xpath=ancestor::*[contains(@class, "card") or contains(@class, "m-portlet") or self::tr]').first();
    const title = await card.innerText().catch(() => "");
    return {
      editUrl: href,
      title: title.split("\n")[0]?.trim() || sku,
      sku: sku.toUpperCase()
    };
  }
  return null;
}

/**
 * Lista os produtos em status "Rascunho" na tela de consulta da Magis5.
 *
 * @param {import('playwright').Page} page
 * @param {object} options
 * @param {string} [options.filterSku] - Filtrar por SKU específico
 * @param {number} [options.maxPages] - Número máximo de páginas a percorrer
 * @returns {Promise<Array<{ sku: string, title: string, editUrl: string, productId: string }>>}
 */
export async function listDraftProducts(page, options = {}) {
  const { filterSku = null, maxPages = 5 } = options;

  console.log(`\n🔍 Navegando para tela de consulta: ${MAGIS5_CONSULT_URL}`);
  await page.goto(MAGIS5_CONSULT_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Filtrar por SKU se especificado
  if (filterSku) {
    console.log(`🔎 Filtrando por SKU: ${filterSku}`);
    const skuInput = page.locator('input[placeholder*="SKU" i], input[name*="sku" i], #sku, #filterSku, input[placeholder*="sku"]').first();
    if (await skuInput.isVisible().catch(() => false)) {
      await skuInput.fill(filterSku);
      const searchBtn = page.locator('button:has-text("Buscar"), button:has-text("Filtrar"), button[type="submit"]').first();
      if (await searchBtn.isVisible().catch(() => false)) {
        await searchBtn.click();
      }
      await page.waitForTimeout(3000);
    }
  }

  const allDrafts = [];
  let currentPage = 1;

  while (currentPage <= maxPages) {
    console.log(`📄 Lendo página ${currentPage} da lista de produtos...`);

    // Aguarda a tabela/cards carregarem
    await page.waitForTimeout(1500);

    // Extrai informações dos produtos na página atual
    const products = await page.evaluate(() => {
      const results = [];

      // Tenta localizar linhas de tabela ou cards de produto
      // Magis5 usa tabelas com .m-datatable ou cards .m-portlet
      const rows = document.querySelectorAll(
        'table tbody tr, .m-datatable__row, .product-row, [class*="product-item"], .m-portlet'
      );

      for (const row of rows) {
        const text = row.innerText || "";
        const textLower = text.toLowerCase();

        // Verifica se é rascunho (busca por badges/labels de status) ou se foi buscado por SKU
        const isDraft =
          textLower.includes("rascunho") ||
          textLower.includes("draft") ||
          textLower.includes("pendente") ||
          textLower.includes("não publicado") ||
          Boolean(filterSku);

        if (!isDraft) continue;

        // Extrai SKU
        let sku = "";
        const skuEl = row.querySelector('[data-sku], .sku, td:first-child');
        if (skuEl) {
          sku = (skuEl.getAttribute("data-sku") || skuEl.innerText || "").trim();
        }
        // Fallback: busca no texto
        if (!sku) {
          const skuMatch = text.match(/SKU[:\s]*([A-Z0-9_-]+)/i);
          if (skuMatch) sku = skuMatch[1];
        }

        // Extrai título
        let title = "";
        const titleEl = row.querySelector('.title, .product-title, td:nth-child(2), h5, h4');
        if (titleEl) title = titleEl.innerText.trim().substring(0, 80);

        // Extrai link de edição
        let editUrl = "";
        const editLink = row.querySelector('a[href*="variation.php?id="], a:has(i.flaticon-edit), a:has-text("Editar")');
        if (editLink) {
          editUrl = editLink.getAttribute("href") || "";
        }

        // Extrai ID do produto
        let productId = "";
        if (editUrl) {
          const idMatch = editUrl.match(/id=(\d+)/);
          if (idMatch) productId = idMatch[1];
        }
        if (!productId) {
          const dataId = row.getAttribute("data-id") || row.querySelector("[data-id]")?.getAttribute("data-id") || "";
          productId = dataId;
        }

        if (sku || productId) {
          results.push({ sku, title, editUrl, productId });
        }
      }

      return results;
    });

    console.log(`   📦 Encontrados ${products.length} rascunho(s) nesta página.`);
    allDrafts.push(...products);

    // Se filtrou por SKU específico, 1 página é suficiente
    if (filterSku) break;

    // Verifica se há próxima página e se ela não está desabilitada
    const nextLi = page.locator('.pagination li.next, .pagination li:has(a:has-text("Próxima")), .pagination li:has(a:has-text(">")), .pagination li:has(a:has-text("›"))').first();
    const isNextLiDisabled = await nextLi.evaluate((el) => el.classList.contains("disabled")).catch(() => false);

    const nextBtn = page.locator('.pagination a:has-text("Próxima"), .pagination .next a, a:has-text("›"), a:has-text(">"), .m-datatable__pager-link--next').first();
    const hasNext = await nextBtn.isVisible().catch(() => false);
    const isNextEnabled = hasNext && !isNextLiDisabled && (await nextBtn.isEnabled().catch(() => false));

    if (!isNextEnabled || currentPage >= maxPages) break;

    try {
      await nextBtn.click({ timeout: 4000 });
      await page.waitForTimeout(2000);
      currentPage++;
    } catch {
      break;
    }
  }

  console.log(`\n📊 Total de rascunhos encontrados: ${allDrafts.length}`);
  return allDrafts;
}

/**
 * Constrói a lista de variações corretas para um SKU pai.
 * Usa getCatalogVariations() para FUSION, e lógica genérica para outros.
 *
 * @param {string} parentSku - SKU pai (ex: FUSION123, C02820BL)
 * @returns {Promise<{ variations: Array<{ nome: string, cod_sankhya: string, preco: number }>, attrName: string, isFusion: boolean }>}
 */
export async function buildCatalogForSku(parentSku) {
  const clean = String(parentSku).trim().toUpperCase();

  // 1. Tenta usar getCatalogVariations para produtos FUSION
  const fusionMatch = clean.match(/^FUSION(\d+)(BL)?$/i);
  if (fusionMatch) {
    const baseFusion = `FUSION${fusionMatch[1]}`;
    const isBabyLook = !!fusionMatch[2];
    const catalog = getCatalogVariations(baseFusion);

    if (catalog && catalog.length > 0) {
      // Filtra apenas as variações do tipo correto (BL = feminino, sem BL = masculino)
      const filtered = catalog.filter((v) => {
        if (isBabyLook) return v.sku.includes("BL");
        return !v.sku.includes("BL");
      });

      // Se não há filtro específico, retorna todas
      const variations = (filtered.length > 0 ? filtered : catalog.slice(0, 7)).map((v) => ({
        nome: v.sku.replace(baseFusion, "").replace("BL", "") || v.sku,
        cod_sankhya: v.cod_sankhya,
        preco: 0, // Será preenchido pelo shopify_prices
      }));

      // Tenta buscar preço no shopify_prices.json
      const preco = await getShopifyPrice(baseFusion);
      if (preco > 0) {
        variations.forEach((v) => (v.preco = preco));
      }

      return {
        variations,
        attrName: "Tamanho",
        isFusion: true,
      };
    }
  }

  // 2. Para camisas C028xx (e similares), busca variações nos JSONs existentes
  const productJsonPath = resolve(PRODUTOS_DIR, `${clean}.json`);
  if (existsSync(productJsonPath)) {
    const product = JSON.parse(await readFile(productJsonPath, "utf-8"));

    // Se já tem variações definidas, usa elas
    if (Array.isArray(product.variacoes) && product.variacoes.length > 0) {
      return {
        variations: product.variacoes.map((v) => ({
          nome: v.tamanho || v.nome || extractVariationSuffix(v.sku) || v.sku,
          cod_sankhya: v.cod_sankhya || v.sku || "",
          preco: v.preco_sem_promocao || v.preco || product.preco?.preco_sem_promocao || 0,
        })),
        attrName: product.atributos_magis5?.[0]?.nome || "Tamanho",
        isFusion: false,
      };
    }
  }

  // 3. Fallback: Busca variações filhas nos JSONs enriquecidos
  const childProducts = [];
  try {
    const files = await readdir(PRODUTOS_DIR);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const childSku = f.replace(".json", "");
      const childParent = extractParentSku(childSku);
      if (childParent === clean && childSku !== clean) {
        const childData = JSON.parse(await readFile(resolve(PRODUTOS_DIR, f), "utf-8"));
        const suffix = extractVariationSuffix(childSku) || childSku.replace(clean, "");
        childProducts.push({
          nome: suffix,
          cod_sankhya: childData.cod_sankhya || childSku,
          preco: childData.preco?.preco_sem_promocao || childData.preco_sem_promocao || 0,
        });
      }
    }
  } catch {}

  if (childProducts.length > 0) {
    return {
      variations: childProducts,
      attrName: "Tamanho",
      isFusion: false,
    };
  }

  // 4. Último fallback: Grade padrão masculina sem códigos Sankhya
  console.warn(`  ⚠️ Nenhum catálogo encontrado para ${clean}, usando grade padrão PP→G2 sem Sankhya.`);
  const preco = await getShopifyPrice(clean);
  return {
    variations: SIZES_MASC.map((s) => ({
      nome: s,
      cod_sankhya: "",
      preco,
    })),
    attrName: "Tamanho",
    isFusion: false,
  };
}

/**
 * Busca preço do produto no shopify_prices.json
 */
async function getShopifyPrice(sku) {
  try {
    const candidates = [
      resolve(ROOT_DIR, "agent2-enricher/shopify_prices.json"),
      resolve(ROOT_DIR, "shopify_prices.json"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        const raw = JSON.parse(await readFile(c, "utf-8"));
        const bySku = raw.por_sku || {};
        const item = bySku[sku] || bySku[sku.toUpperCase()];
        if (item && item.preco_sem_promocao) return item.preco_sem_promocao;
        // Tenta com sufixo de tamanho
        const withPP = bySku[`${sku}PP`] || bySku[`${sku}P`];
        if (withPP && withPP.preco_sem_promocao) return withPP.preco_sem_promocao;
      }
    }
  } catch {}

  const clean = String(sku || "").trim().toUpperCase();
  if (/^FUSION/i.test(clean)) return 219.90;
  if (/^C0/i.test(clean)) return 169.90;
  return 0;
}

/**
 * Corrige as variações de um produto na tela de edição da Magis5.
 *
 * @param {import('playwright').Page} page
 * @param {string} editUrl - URL completa ou relativa da tela de edição
 * @param {object} catalog - Resultado de buildCatalogForSku
 * @param {object} options
 * @param {boolean} [options.dryRun=true] - Se true, não salva
 * @returns {Promise<{ success: boolean, sku: string, variationsFixed: number, screenshot: string, error?: string }>}
 */
export async function fixProductVariations(page, editUrl, sku, catalog, options = {}) {
  const { dryRun = true } = options;
  const { variations, attrName } = catalog;

  console.log(`\n───────────────────────────────────────────────────`);
  console.log(`🔧 Corrigindo variações do produto: ${sku}`);
  console.log(`   Modo: ${dryRun ? "🛡️ DRY-RUN (Simulação)" : "🚀 PRODUÇÃO (Salvamento real)"}`);
  console.log(`   Variações a configurar: ${variations.length} (${variations.map(v => v.nome).join(", ")})`);
  console.log(`───────────────────────────────────────────────────`);

  // 1. Navega para a tela de edição
  const fullUrl = editUrl.startsWith("http") ? editUrl : `${MAGIS5_BASE_URL}${editUrl}`;
  console.log(`🌐 Navegando para: ${fullUrl}`);
  await page.goto(fullUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Verifica se a página carregou corretamente
  const currentUrl = page.url();
  if (currentUrl.includes("login") || currentUrl.includes("autenticacao")) {
    throw new Error("Sessão expirada — redirecionado para login");
  }

  // 2. Verifica se existe seção de variações
  const attrInput = page.locator('input#attribute, input[placeholder*="Cor, Tamanho"]').first();
  const hasAttrInput = await attrInput.isVisible().catch(() => false);

  if (!hasAttrInput) {
    console.warn("  ⚠️ Campo de atributo de variação não encontrado na tela de edição.");
    // Tenta screenshot para diagnóstico
    const diagScreenshot = join(SCREENSHOTS_DIR, `diag-${sku}-${Date.now()}.png`);
    await page.screenshot({ path: diagScreenshot, fullPage: true }).catch(() => {});
    return { success: false, sku, variationsFixed: 0, screenshot: diagScreenshot, error: "Campo de atributo não encontrado" };
  }

  // 3. Limpa variações existentes (remove todas as tags do tagify)
  console.log("🧹 Limpando variações existentes...");

  // Remove tags existentes no tagify
  const existingTags = page.locator('.tagify__tag');
  let tagCount = await existingTags.count();
  console.log(`   Tags existentes encontradas: ${tagCount}`);

  while (tagCount > 0) {
    // Clica no X de remoção da primeira tag
    const removeBtn = page.locator('.tagify__tag__removeBtn, .tagify__tag .tagify__tag-btn').first();
    if (await removeBtn.isVisible().catch(() => false)) {
      await removeBtn.click();
      await page.waitForTimeout(200);
    } else {
      // Fallback: remove via JS
      await page.evaluate(() => {
        const tags = document.querySelectorAll('.tagify__tag');
        tags.forEach(t => t.remove());
      });
      break;
    }
    tagCount = await existingTags.count();
  }

  // Limpa o campo de atributo e reconfigura
  const currentAttrValue = await attrInput.inputValue().catch(() => "");
  if (currentAttrValue.toLowerCase() !== attrName.toLowerCase()) {
    await attrInput.fill("");
    await page.waitForTimeout(200);
    await attrInput.fill(attrName);
    console.log(`  • Atributo configurado como: "${attrName}"`);
  }

  // 4. Insere as novas variações (tamanhos)
  console.log(`🎨 Inserindo ${variations.length} variações novas...`);
  const tagifyInput = page.locator('.tagify__input').first();
  if (await tagifyInput.isVisible().catch(() => false)) {
    for (const v of variations) {
      console.log(`   + Inserindo: "${v.nome}"`);
      await tagifyInput.click();
      await page.keyboard.type(v.nome);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(250);
    }
  } else {
    console.warn("  ⚠️ Tagify input não encontrado. Tentando input alternativo...");
    const altInput = page.locator('.input-tags, [id^="variationTagify"]').first();
    if (await altInput.isVisible().catch(() => false)) {
      for (const v of variations) {
        await altInput.click();
        await page.keyboard.type(v.nome);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(250);
      }
    }
  }

  // 5. Gera lista de variações
  console.log('⚙️ Clicando em "Gerar lista de variações"...');
  const btnGenVar = page.locator('button:has-text("Gerar lista de variações")');
  if (await btnGenVar.isVisible().catch(() => false)) {
    await btnGenVar.click();
    await page.waitForTimeout(3000);
    console.log("  ✓ Lista de variações gerada.");
  } else {
    console.warn("  ⚠️ Botão 'Gerar lista de variações' não encontrado.");
  }

  // 6. Preenche preço geral (se disponível)
  const targetPrice = variations.find(v => v.preco > 0)?.preco || 0;
  let samePriceActive = false;
  if (targetPrice > 0) {
    const commonPriceEl = page.locator('#commonVariationPrice').first();
    if (await commonPriceEl.isVisible().catch(() => false)) {
      await commonPriceEl.click();
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(100);
      const formattedPrice = targetPrice.toFixed(2).replace(".", ",");
      await commonPriceEl.type(formattedPrice, { delay: 40 });
      await page.waitForTimeout(200);
      console.log(`  • Preço geral preenchido: R$ ${formattedPrice}`);
    }

    // Marca "Mesmo preço para todas variações"
    samePriceActive = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      const target = inputs.find(i => i.closest('label, div')?.innerText?.includes('Mesmo preço'));
      if (target) {
        if (!target.checked) target.click();
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    });
    if (samePriceActive) {
      console.log('  • "Mesmo preço para todas variações" marcado.');
    }
    await page.waitForTimeout(500);
  }

  // 7. Preenche os códigos Sankhya nos campos SKU de cada variação
  console.log("🏷️ Preenchendo códigos Sankhya nas variações...");
  let filledCount = 0;

  for (let i = 0; i < variations.length; i++) {
    const v = variations[i];

    // Campo SKU da variação
    const skuInput = page.locator(`#variationSKU-${i}`);
    if (await skuInput.isVisible().catch(() => false)) {
      const codVal = v.cod_sankhya || "";
      if (codVal) {
        await skuInput.scrollIntoViewIfNeeded();
        await skuInput.fill(codVal);
        console.log(`  • Variação ${i} (${v.nome}): SKU Sankhya = "${codVal}"`);
        filledCount++;
        await page.waitForTimeout(250);
      }
    }

    // Campo preço da variação (somente se não estiver usando preço comum)
    if (!samePriceActive) {
      const pInput = page.locator(`#variationPrice-${i}`);
      if (await pInput.isVisible().catch(() => false)) {
        const isEnabled = await pInput.isEnabled().catch(() => false);
        if (isEnabled && v.preco > 0) {
          await pInput.scrollIntoViewIfNeeded();
          await pInput.click({ force: true });
          await page.keyboard.press("Control+A");
          await page.keyboard.press("Backspace");
          const formatted = v.preco.toFixed(2).replace(".", ",");
          await pInput.type(formatted, { delay: 30 });
          await page.waitForTimeout(150);
        }
      }
    }
  }

  console.log(`\n✅ ${filledCount}/${variations.length} variações com código Sankhya preenchido.`);

  // 8. Anexo da Tabela de Medidas Oficial — EXCLUSIVO PARA FUSION
  const isFusionSku = Boolean(catalog.isFusion || /^FUSION/i.test(sku));
  if (isFusionSku) {
    const tabelaMedidasPath = resolve(ROOT_DIR, "uploads/tabela_medidas_masculino.jpg");
    if (existsSync(tabelaMedidasPath)) {
      console.log(`📏 [FUSION] Verificando anexo da Tabela de Medidas na galeria...`);
      try {
        const generalDropzone = page.locator('#list_image');
        const gHiddenInput = page.locator('#list_image input[type="file"], .dz-hidden-input').first();
        if (await gHiddenInput.count() > 0) {
          await gHiddenInput.setInputFiles(tabelaMedidasPath);
          await page.waitForTimeout(2000);
          console.log(`  ✓ [FUSION] Tabela de Medidas oficial anexada à galeria!`);
        } else if (await generalDropzone.count() > 0) {
          await generalDropzone.scrollIntoViewIfNeeded().catch(() => {});
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 6000 }),
            generalDropzone.click({ force: true }),
          ]);
          await fileChooser.setFiles(tabelaMedidasPath);
          await page.waitForTimeout(2000);
          console.log(`  ✓ [FUSION] Tabela de Medidas anexada via file chooser!`);
        }
      } catch (uploadErr) {
        console.warn(`  ⚠️ Aviso ao anexar tabela de medidas FUSION: ${uploadErr.message}`);
      }
    }

    // Atualiza a descrição na Magis5 com a descrição completa do JSON do produto (ou injeta tabela oficial FUSION)
    // ATENÇÃO: Preenche via evaluate direto no DOM para NUNCA vazar eventos de teclado para os campos de SKU de variação!
    const localJsonPath = resolve(ROOT_DIR, `agent2-enricher/produtos/${sku}.json`);
    let updatedDescText = "";
    if (existsSync(localJsonPath)) {
      try {
        const raw = JSON.parse(readFileSync(localJsonPath, "utf-8"));
        if (raw.descricao) updatedDescText = sanitizeDescription(raw.descricao, raw);
      } catch {}
    }

    if (updatedDescText) {
      console.log(`📝 Sincronizando descrição atualizada do produto (${sku}.json) no Magis5 via DOM seguro...`);
      await page.evaluate((text) => {
        const el = document.querySelector('#description') || document.querySelector('textarea');
        if (el) {
          el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, updatedDescText);
      await page.waitForTimeout(300);
    } else if (isFusionSku) {
      const currentDesc = await page.locator('#description').inputValue().catch(() => "");
      if (!currentDesc.includes("53cm") || !currentDesc.includes("82cm")) {
        console.log(`📝 [FUSION] Atualizando descrição com a Tabela de Medidas Oficial FUSION via DOM...`);
        const fusionSizeText = `\n\nTabela de Medidas Oficial BRK Fishing (Masculino com Capuz e Máscara):\n` +
          `- Tamanho PP: Tórax: 53cm | Altura: 67cm | Manga (Gola ao Punho): 82cm\n` +
          `- Tamanho P: Tórax: 54cm | Altura: 69cm | Manga (Gola ao Punho): 83,5cm\n` +
          `- Tamanho M: Tórax: 56cm | Altura: 71cm | Manga (Gola ao Punho): 85cm\n` +
          `- Tamanho G: Tórax: 59cm | Altura: 73cm | Manga (Gola ao Punho): 86,5cm\n` +
          `- Tamanho GG: Tórax: 62cm | Altura: 75cm | Manga (Gola ao Punho): 88cm\n` +
          `- Tamanho G1: Tórax: 65cm | Altura: 77cm | Manga (Gola ao Punho): 88cm\n` +
          `- Tamanho G2: Tórax: 68cm | Altura: 79cm | Manga (Gola ao Punho): 88cm\n`;
        const fullDesc = (currentDesc + fusionSizeText).trim();
        await page.evaluate((text) => {
          const el = document.querySelector('#description') || document.querySelector('textarea');
          if (el) {
            el.value = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, fullDesc);
        await page.waitForTimeout(300);
      }
    }
  } else {
    console.log(`ℹ️ [NÃO-FUSION] Produto ${sku}: mantendo imagens e descrições originais (tabela de medidas FUSION não aplicável).`);
  }

  // 8b. Verificação estrita e sanitização final dos campos SKU de variação:
  // Garante que NENHUM campo de SKU contenha descrição, título ou mais de 30 caracteres.
  console.log("🛡️ Sanitizando campos SKU das variações para garantir apenas códigos Sankhya numéricos...");
  await page.evaluate((expectedList) => {
    expectedList.forEach((v, idx) => {
      const el = document.querySelector(`#variationSKU-${idx}`);
      if (el && v.cod_sankhya) {
        const cleanCod = String(v.cod_sankhya).trim();
        if (el.value !== cleanCod) {
          el.value = cleanCod;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
  }, variations);
  await page.waitForTimeout(300);

  // 9. Screenshot de evidência (antes de salvar)
  const timestamp = Date.now();
  const screenshotPath = join(SCREENSHOTS_DIR, `fix-${sku}-${timestamp}.png`);

  if (dryRun) {
    await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 10000 }).catch(() => {});
    console.log(`\n🛡️ [DRY-RUN] Simulação concluída. Screenshot: ${screenshotPath}`);
    return {
      success: true,
      sku,
      variationsFixed: filledCount,
      screenshot: screenshotPath,
      dryRun: true,
    };
  }

  // 9. Salvamento real
  console.log("💾 Salvando rascunho corrigido...");
  const saveBtn = page.locator('button:has-text("Salvar")').last();
  await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(600);

  // Aguarda a resposta da API de salvamento do Magis5
  const savePromise = page.waitForResponse(
    (res) => (res.url().includes("variations/product") || res.url().includes("product")) && res.status() === 200,
    { timeout: 20000 }
  ).catch(() => null);

  await saveBtn.click();
  const apiRes = await savePromise;
  if (apiRes) {
    console.log("  ✓ Resposta 200 recebida da API do Magis5!");
  }

  // Aguarda o alerta ou confirmação no DOM
  let isSaved = Boolean(apiRes);
  if (!isSaved) {
    for (let w = 0; w < 10; w++) {
      await page.waitForTimeout(500);
      const hasSuccessText = await page.evaluate(() => {
        return document.body.innerText.includes("Produto atualizado com sucesso") ||
               document.body.innerText.includes("salvo com sucesso");
      });
      if (hasSuccessText) {
        isSaved = true;
        console.log("  ✓ Confirmação no texto da página: Produto atualizado com sucesso!");
        break;
      }
    }
  }

  await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 10000 }).catch(() => {});

  if (!isSaved) {
    const errorAlerts = await page.locator('.alert-danger, .toast-error, .invalid-feedback, .text-danger, .swal2-title').evaluateAll(els => 
      els.map(e => e.innerText?.trim()).filter(Boolean)
    ).catch(() => []);
    const errorMsg = errorAlerts.join(" | ") || "Magis5 não confirmou salvamento";
    console.error(`❌ Falha ao salvar: ${errorMsg}`);
    return { success: false, sku, variationsFixed: filledCount, screenshot: screenshotPath, error: errorMsg };
  }

  console.log(`✅ Rascunho corrigido e salvo com sucesso! Screenshot: ${screenshotPath}`);
  return {
    success: true,
    sku,
    variationsFixed: filledCount,
    screenshot: screenshotPath,
    dryRun: false,
  };
}
