import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import {
  MAGIS5_BASE_URL,
  FIXED_DIMENSIONS,
  SCREENSHOTS_DIR,
  DOWNLOADS_DIR,
  ACTION_TIMEOUT_MS,
} from "./config.mjs";
import { validateProduct } from "./checkpoint.mjs";

/**
 * Mapeia qualquer peso informado para a opção mais próxima da pré-seleção da Shopee/Magis5:
 * 10g, 20g, 30g, 50g, 100g, 150g, 200g, 250g, 300g, 500g, 750g, 1kg, 1.5kg, 2kg, 3kg, 5kg
 *
 * @param {string|number} rawWeight
 * @returns {string}
 */
export function getClosestShopeeWeight(rawWeight) {
  if (!rawWeight) return "10g";
  const str = String(rawWeight).toLowerCase().trim().replace(",", ".");
  const isKg = str.includes("kg");
  const numMatch = str.match(/[\d.]+/);
  if (!numMatch) return "10g";

  let targetGrams = parseFloat(numMatch[0]);
  if (isKg) targetGrams *= 1000;

  const options = [
    { label: "10g", grams: 10 },
    { label: "20g", grams: 20 },
    { label: "30g", grams: 30 },
    { label: "50g", grams: 50 },
    { label: "100g", grams: 100 },
    { label: "150g", grams: 150 },
    { label: "200g", grams: 200 },
    { label: "250g", grams: 250 },
    { label: "300g", grams: 300 },
    { label: "500g", grams: 500 },
    { label: "750g", grams: 750 },
    { label: "1kg", grams: 1000 },
    { label: "1.5kg", grams: 1500 },
    { label: "2kg", grams: 2000 },
    { label: "3kg", grams: 3000 },
    { label: "5kg", grams: 5000 },
  ];

  let closest = options[0];
  let minDiff = Math.abs(options[0].grams - targetGrams);

  for (let i = 1; i < options.length; i++) {
    const diff = Math.abs(options[i].grams - targetGrams);
    if (diff < minDiff) {
      minDiff = diff;
      closest = options[i];
    }
  }

  return closest.label;
}

/**
 * Coleta os caminhos absolutos das imagens locais válidas para o produto.
 *
 * @param {object} product
 * @returns {Promise<string[]>}
 */
export async function resolveProductImages(product) {
  const images = [];

  // 1. Tentar ler do array direto
  if (Array.isArray(product.imagens)) {
    for (const p of product.imagens) {
      if (existsSync(p)) images.push(resolve(p));
    }
    if (images.length > 0) return images;
  }

  // 2. Tentar ler da pasta downloads/{sku}
  const skuDir = join(DOWNLOADS_DIR, product.sku);
  if (existsSync(skuDir)) {
    const entries = await readdir(skuDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.toLowerCase().endsWith(".jpg")) {
        images.push(resolve(join(skuDir, e.name)));
      }
    }
  }

  return images;
}

/**
 * Resolve a imagem específica da variação correspondente ao site oficial,
 * garantindo que apenas a foto oficial (sem banners de cabeçalho) seja enviada.
 *
 * @param {object} product
 * @param {object} variant
 * @returns {Promise<string|null>}
 */
export async function resolveVariationImage(product, variant) {
  const rawImgs = variant.imagens || product.imagens || [];
  if (rawImgs.length === 0) return null;
  if (rawImgs.length === 1 && existsSync(rawImgs[0])) return resolve(rawImgs[0]);

  // Consulta o Shopify para obter a posição exata da imagem do modelo no site
  try {
    const searchSku = variant.sku || product.sku;
    const searchUrl = `https://brkfishing.com.br/search/suggest.json?q=${encodeURIComponent(searchSku)}&resources[type]=product`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(3500) });
    const data = await res.json();
    const handle = data?.resources?.results?.products?.[0]?.handle;
    if (handle) {
      const pRes = await fetch(`https://brkfishing.com.br/products/${handle}.js`, { signal: AbortSignal.timeout(3500) });
      const pData = await pRes.json();
      const shopifyVar = pData.variants?.find((sv) => sv.sku === variant.sku || sv.title?.includes(variant.nome));
      if (shopifyVar?.featured_image?.position) {
        const posStr = String(shopifyVar.featured_image.position).padStart(2, "0");
        const matchPos = rawImgs.find((img) => img.includes(`${posStr}.jpg`) || img.includes(`${posStr}.png`));
        if (matchPos && existsSync(matchPos)) {
          return resolve(matchPos);
        }
      }
    }
  } catch {
    // Fallback se requisição falhar ou offline
  }

  // Fallback 1: se for código 208, procura 07.jpg
  if (variant.sku?.includes("208") || variant.nome === "208") {
    const m07 = rawImgs.find((img) => img.endsWith("07.jpg") || img.endsWith("7.jpg"));
    if (m07 && existsSync(m07)) return resolve(m07);
  }

  // Fallback 2: última imagem da lista de fotos da variação (geralmente produto isolado em fundo branco)
  for (let i = rawImgs.length - 1; i >= 0; i--) {
    if (existsSync(rawImgs[i])) return resolve(rawImgs[i]);
  }

  return rawImgs[0] ? resolve(rawImgs[0]) : null;
}

/**
 * Realiza o preenchimento completo e upload do produto no Magis5 via Playwright.
 *
 * @param {import('playwright').Page} page
 * @param {object} product
 * @param {{ dryRun?: boolean, integrationName?: string }} options
 * @returns {Promise<{ success: boolean, dryRun: boolean, screenshot: string, sku: string }>}
 */
export async function publishProductToMagis5(page, product, options = {}) {
  const { dryRun = true, integrationName = "Shopee" } = options;
  const sku = product.sku;

  console.log(`\n───────────────────────────────────────────────────`);
  console.log(`📦 Processando Produto: [${sku}] ${product.titulo_shopee?.substring(0, 50)}...`);
  console.log(`   Modo: ${dryRun ? "🛡️ DRY-RUN (Simulação segura)" : "🚀 PRODUÇÃO (Publicação real)"}`);
  console.log(`   Código Sankhya: ${product.cod_sankhya || "N/A"}`);
  console.log(`───────────────────────────────────────────────────`);

  // 1. Validação de Pré-Voo
  const validation = validateProduct(product);
  if (!validation.valid) {
    throw new Error(`Falha no checkpoint do produto ${sku}: ${validation.errors.join("; ")}`);
  }

  // 2. Resolver imagens locais no disco
  const imageFiles = await resolveProductImages(product);
  console.log(`📸 Imagens locais encontradas: ${imageFiles.length}`);

  // 3. Navegar para a tela de criação de produtos com variações
  const createUrl = `${MAGIS5_BASE_URL}/v2/admin/product/variations/variation.php`;
  console.log(`🌐 Navegando para tela de criação Shopee: ${createUrl}`);
  await page.goto(createUrl, { waitUntil: "networkidle" });

  // 4. Selecionar o Marketplace "Shopee" e clicar em "Prosseguir"
  console.log("🛒 Selecionando Marketplace Shopee...");
  const mpButton = page.locator('button[data-id="marketplaces"]');
  await mpButton.waitFor({ state: "visible", timeout: ACTION_TIMEOUT_MS });
  await mpButton.click();
  await page.waitForTimeout(300);

  const shopeeItem = page.locator('.dropdown-menu.show a:has-text("Shopee"), .dropdown-menu.show .dropdown-item:has-text("Shopee")').first();
  await shopeeItem.click();
  await page.waitForTimeout(300);

  const prosseguirBtn = page.locator('button:has-text("Prosseguir")').first();
  await prosseguirBtn.click();
  await page.waitForTimeout(2000);

  // 5. Preenchimento dos Dados Gerais
  console.log("📝 Preenchendo campos do anúncio...");

  // SKU Principal (ou Sankhya se produto simples)
  const skuEl = page.locator('#sku, input[name="sku"]').first();
  if (await skuEl.isVisible().catch(() => false)) {
    await skuEl.fill(product.sku);
    console.log(`  • SKU: ${product.sku}`);
    // Aguarda retorno da checagem assíncrona do SKU para não sobrescrever os campos seguintes
    await page.waitForTimeout(2000);
  }

  // Título Shopee
  const titleEl = page.locator('#title');
  if (await titleEl.isVisible().catch(() => false)) {
    await titleEl.click({ force: true });
    await titleEl.fill(product.titulo_shopee);
    await titleEl.dispatchEvent('input').catch(() => {});
    await titleEl.dispatchEvent('change').catch(() => {});
    console.log(`  • Título: ${product.titulo_shopee.substring(0, 60)}...`);
  }

  // Condição (Novo)
  const condSelect = page.locator('#condition, select[name="condition"]').first();
  if (await condSelect.isVisible().catch(() => false)) {
    await condSelect.selectOption("new").catch(() => {});
  }

  // Marca
  if (product.marca && product.marca !== "N/A") {
    const brandEl = page.locator('#brand, input[name="brand"]').first();
    if (await brandEl.isVisible().catch(() => false)) {
      await brandEl.fill(product.marca);
      console.log(`  • Marca: ${product.marca}`);
    }
  }

  // Modelo
  if (product.modelo && product.modelo !== "N/A") {
    const modelEl = page.locator('#model, input[name="model"]').first();
    if (await modelEl.isVisible().catch(() => false)) {
      await modelEl.fill(product.modelo);
      console.log(`  • Modelo: ${product.modelo}`);
    }
  }

  // Dimensões e Peso Fixos (Regra de Negócio: 3x20x30 cm | 0.250 kg)
  console.log(`  • Medidas: ${FIXED_DIMENSIONS.altura_cm}×${FIXED_DIMENSIONS.largura_cm}×${FIXED_DIMENSIONS.comprimento_cm} cm | ${FIXED_DIMENSIONS.peso_kg} kg`);
  const heightEl = page.locator('#height');
  const widthEl = page.locator('#width');
  const lengthEl = page.locator('#length');
  const weightEl = page.locator('#weight');

  if (await heightEl.isVisible().catch(() => false)) await heightEl.fill(String(FIXED_DIMENSIONS.altura_cm));
  if (await widthEl.isVisible().catch(() => false)) await widthEl.fill(String(FIXED_DIMENSIONS.largura_cm));
  if (await lengthEl.isVisible().catch(() => false)) await lengthEl.fill(String(FIXED_DIMENSIONS.comprimento_cm));
  if (await weightEl.isVisible().catch(() => false)) await weightEl.fill(String(FIXED_DIMENSIONS.peso_kg));

  // Descrição
  const descEl = page.locator('#description, textarea[name="description"]').first();
  if (await descEl.isVisible().catch(() => false)) {
    await descEl.fill(product.descricao);
    console.log(`  • Descrição rica preenchida (${product.descricao.length} caracteres)`);
  }

  // 6. Seleção de Categorias Encadeadas (com mapeamento de sinônimos e resolução automática)
  if (product.categoria_sugerida) {
    let catPath = product.categoria_sugerida
      .replace(/Animais de Estimação/gi, "Animais Domésticos")
      .replace(/Esportes e Lazer/gi, "Esportes e Atividades ao Ar Livre")
      .replace(/Artigos para Cães/gi, "Cães")
      .replace(/Cachorros/gi, "Cães");

    // Para calçados/sandálias masculinas, garante a árvore oficial padrão da Shopee
    const fullSearch = `${product.titulo_shopee || ""} ${product.modelo || ""} ${product.categoria_sugerida || ""} ${product.sku || ""}`.toLowerCase();
    const isFootwear = /sand[aá]lia|chinelo|babuche|croc|clog|tamanco|\bslides?\b|sapato|cal[çc]ado/i.test(fullSearch) || /colt|brave|boaonda/i.test(product.sku || "");
    const isFem = /feminin|mulher|starfem|flowf/i.test(fullSearch);

    if (isFootwear && !isFem) {
      catPath = "Sapatos Masculinos > Sandalia e Chinelos > Chinelos";
    }

    // Para produtos de pesca (excluindo calçados), garante a árvore oficial da Shopee
    const isFishing = !isFootwear && /pesca|isca|linha|anzol|vara|carretilha|molinete|snap|chumbada/i.test(
      `${product.titulo_shopee || ""} ${product.modelo || ""} ${product.categoria_sugerida || ""}`
    );
    if (isFishing && !catPath.includes("Pescaria")) {
      catPath = "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > " +
        (catPath.split(">").pop().trim() || "Acessórios de Pesca");
    }

    console.log(`📂 Configurando Categoria Shopee: ${catPath}`);
    const catParts = catPath.split(">").map(p => p.trim()).filter(Boolean);

    const normalizeText = (t) =>
      (t || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    for (let c = 0; c < catParts.length; c++) {
      const part = catParts[c];
      const normPart = normalizeText(part);

      // Aguarda até o select do nível atual carregar opções
      let curSelect = page.locator('.card:has-text("Categorias") select:visible').last();
      if (!(await curSelect.isVisible().catch(() => false))) break;

      // Aguarda opções chegarem via AJAX se ainda estiver vazio
      let validOptions = [];
      for (let w = 0; w < 6; w++) {
        const options = await curSelect.locator("option").evaluateAll((nodes) =>
          nodes.map((n) => ({ value: n.value, text: n.innerText.trim() }))
        ).catch(() => []);
        validOptions = options.filter(
          (o) => o.value && !o.text.toLowerCase().includes("selecione")
        );
        if (validOptions.length > 0) break;
        await page.waitForTimeout(400);
      }

      if (validOptions.length === 0) break;

      let matched = null;
      // 1. Match exato
      matched = validOptions.find((o) => normalizeText(o.text) === normPart);

      // 2. Substring (um contém o outro)
      if (!matched) {
        matched = validOptions.find(
          (o) =>
            normalizeText(o.text).includes(normPart) ||
            normPart.includes(normalizeText(o.text))
        );
      }

      // 3. Match por palavras-chave relevantes
      if (!matched) {
        const words = normPart
          .split(/\s+/)
          .filter((w) => w.length > 3 && !["para", "com", "sem", "sobre", "equipamentos", "artigos"].includes(w));
        for (const w of words) {
          matched = validOptions.find((o) => normalizeText(o.text).includes(w));
          if (matched) break;
        }
      }

      if (matched) {
        await curSelect.selectOption({ value: matched.value });
        console.log(`  • Nível ${c + 1} (${matched.text}): selecionado`);
        await page.waitForTimeout(1200);
      } else {
        console.warn(`  ⚠️ Subcategoria "${part}" não encontrada diretamente no nível ${c + 1}, tentando próximo...`);
      }
    }

    // Se ainda restar um select com opções pendentes (ex: subcategoria folha não finalizada), seleciona a melhor opção
    for (let r = 0; r < 3; r++) {
      const pendingSelect = page.locator('.card:has-text("Categorias") select:visible').last();
      if (!(await pendingSelect.isVisible().catch(() => false))) break;

      const currentSelectedText = await pendingSelect.evaluate(
        (el) => el.options[el.selectedIndex]?.text || ""
      ).catch(() => "");

      if (currentSelectedText.toLowerCase().includes("selecione")) {
        // Aguarda opções carregarem
        let validLeaf = [];
        for (let w = 0; w < 5; w++) {
          const leafOpts = await pendingSelect.locator("option").evaluateAll((nodes) =>
            nodes.map((n) => ({ value: n.value, text: n.innerText.trim() }))
          ).catch(() => []);
          validLeaf = leafOpts.filter((o) => o.value && !o.text.toLowerCase().includes("selecione"));
          if (validLeaf.length > 0) break;
          await page.waitForTimeout(400);
        }

        if (validLeaf.length > 0) {
          // Tenta achar alguma opção com palavra-chave do título ou pega a primeira
          const normTitle = normalizeText(product.titulo_shopee || "");
          const bestLeaf = validLeaf.find(o => normTitle.includes(normalizeText(o.text))) || validLeaf[0];
          console.log(`  • Selecionando subcategoria final necessária: ${bestLeaf.text}`);
          await pendingSelect.selectOption({ value: bestLeaf.value });
          await page.waitForTimeout(1200);
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // Clicar em "Gerar ficha técnica"
    console.log("⚙️ Gerando Ficha Técnica...");
    const btnFicha = page.locator('button:has-text("Gerar ficha técnica")').first();
    if (await btnFicha.isVisible().catch(() => false)) {
      // Aguarda até o botão estar habilitado
      let enabled = await btnFicha.isEnabled().catch(() => false);
      for (let w = 0; w < 10 && !enabled; w++) {
        await page.waitForTimeout(500);
        enabled = await btnFicha.isEnabled().catch(() => false);
      }
      if (enabled) {
        await btnFicha.click();
        await page.waitForTimeout(2500);
        console.log("  • Ficha técnica gerada com sucesso.");
      } else {
        console.warn("  ⚠️ Botão 'Gerar ficha técnica' permaneceu desabilitado, prosseguindo...");
      }
    }
  }

  // 7. Preenchimento da Ficha Técnica com Atributos Enriquecidos
  const atributos = product.atributos || {};
  if (Object.keys(atributos).length > 0) {
    console.log(`📋 Preenchendo campos da Ficha Técnica (${Object.keys(atributos).length} atributos)...`);

    const normalize = (str) =>
      (str || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");

    const fichaFields = page.locator('input[id^="field_optional_"], select[id^="field_optional_"]');
    const fCount = await fichaFields.count();

    for (let f = 0; f < fCount; f++) {
      const field = fichaFields.nth(f);
      if (!(await field.isVisible().catch(() => false))) continue;

      const labelText = await field.evaluate((el) => {
        let parent = el.parentElement;
        for (let i = 0; i < 4 && parent; i++) {
          const lbl = parent.querySelector("label");
          if (lbl && lbl.innerText.trim()) return lbl.innerText.trim();
          parent = parent.parentElement;
        }
        return "";
      });

      if (!labelText) continue;
      const normLabel = normalize(labelText);

      // Regra 1: "no tamanho do pacote sempre deixar em branco"
      if (normLabel.includes("tamanhodopacote") || normLabel.includes("tamanhopacote") || (normLabel.includes("pacote") && normLabel.includes("tamanho"))) {
        await field.fill("");
        const fieldId = await field.getAttribute("id");
        if (fieldId) {
          const unitId = fieldId.replace("field_optional_", "unit_");
          const unitSelect = page.locator(`#${unitId}`);
          if (await unitSelect.isVisible().catch(() => false)) {
            await unitSelect.selectOption("").catch(() => {});
          }
        }
        console.log(`  • ${labelText}: [DEIXADO EM BRANCO]`);
        continue;
      }

      // Regra 4: "na quantidade por pacote sempre colocar número inteiro, nunca colocar string sempre número"
      if (
        normLabel === "quantidadeporpacote" ||
        normLabel.includes("quantidadeporpacote") ||
        normLabel.includes("quantidadepacote") ||
        (normLabel.includes("quantidade") && normLabel.includes("pacote") && !normLabel.includes("tamanho"))
      ) {
        const rawVal = atributos.quantidade_por_pacote ?? atributos.quantidade_da_embalagem ?? atributos.quantidade ?? 1;
        const intVal = parseInt(String(rawVal).replace(/\D/g, ""), 10) || 1;
        await field.click({ force: true });
        await field.fill(String(intVal));
        console.log(`  • ${labelText}: ${intVal} (número inteiro)`);
        continue;
      }

      // Regra 5: "quantidade da embalagem" também sempre como número inteiro
      if (
        normLabel === "quantidadedaembalagem" ||
        normLabel.includes("quantidadedaembalagem") ||
        (normLabel.includes("quantidade") && normLabel.includes("embalagem"))
      ) {
        const rawVal = atributos.quantidade_da_embalagem ?? atributos.quantidade_por_pacote ?? atributos.quantidade ?? 1;
        const intVal = parseInt(String(rawVal).replace(/\D/g, ""), 10) || 1;
        await field.click({ force: true });
        await field.fill(String(intVal));
        console.log(`  • ${labelText}: ${intVal} (número inteiro)`);
        continue;
      }

      for (const [attrKey, attrVal] of Object.entries(atributos)) {
        const normKey = normalize(attrKey);
        if (normLabel.includes(normKey) || normKey.includes(normLabel)) {
          // Se for tamanho do pacote, ignorar
          if (normKey.includes("tamanhodopacote") || normKey.includes("tamanhopacote")) {
            await field.fill("");
            console.log(`  • ${labelText}: [DEIXADO EM BRANCO]`);
            break;
          }

          // Regra 2: "no comprimento colocar somente o número e selecionar 'cm' na escala ao lado"
          if (normLabel.includes("comprimento") || normKey.includes("comprimento")) {
            const numStr = String(attrVal).replace(",", ".").match(/[\d.]+/)?.[0] || String(attrVal);
            await field.fill(numStr);
            console.log(`  • ${labelText}: ${numStr} (somente o número)`);

            const fieldId = await field.getAttribute("id");
            if (fieldId) {
              const unitId = fieldId.replace("field_optional_", "unit_");
              const unitSelect = page.locator(`#${unitId}`);
              if (await unitSelect.isVisible().catch(() => false)) {
                await unitSelect.selectOption("cm").catch(() => {});
                console.log(`    ↳ Escala de Comprimento selecionada: "cm"`);
              }
            }
            break;
          }

          // Regra 3: "no campo 'Peso do Produto' sempre aproxima para o peso mais proximo que estiver na pré seleção"
          if (normLabel.includes("pesodoproduto") || normKey.includes("pesodoproduto")) {
            const closestWeight = getClosestShopeeWeight(attrVal);
            await field.click({ force: true });
            await field.fill(closestWeight);
            await page.waitForTimeout(400);
            const ttOption = page.locator(`.tt-suggestion:has-text("${closestWeight}")`).first();
            if (await ttOption.isVisible().catch(() => false)) {
              await ttOption.click();
            } else {
              await field.press("Enter");
            }
            console.log(`  • ${labelText}: ${attrVal} -> aproximado para pré-seleção: "${closestWeight}"`);
            break;
          }

          // Regra 4: "quantidade por pacote sempre número inteiro"
          if (normLabel.includes("quantidadeporpacote") || normKey.includes("quantidadeporpacote")) {
            const intVal = parseInt(String(attrVal).replace(/\D/g, ""), 10) || 1;
            await field.fill(String(intVal));
            console.log(`  • ${labelText}: ${intVal} (número inteiro)`);
            break;
          }

          const tagName = await field.evaluate((el) => el.tagName);
          if (tagName === "SELECT") {
            await field.selectOption({ label: String(attrVal) }).catch(async () => {
              await field.selectOption(String(attrVal)).catch(() => {});
            });
          } else {
            await field.fill(String(attrVal));
          }
          console.log(`  • ${labelText}: ${attrVal}`);
          break;
        }
      }
    }

    // Verificação de garantia extra para Quantidade por Pacote
    try {
      const qppInputs = page.locator('label:has-text("Quantidade por Pacote")').locator('xpath=..//input');
      const qppCount = await qppInputs.count();
      for (let i = 0; i < qppCount; i++) {
        const inp = qppInputs.nth(i);
        const currVal = (await inp.inputValue().catch(() => "")) || "";
        if (!currVal.trim()) {
          const rawVal = atributos.quantidade_por_pacote ?? 1;
          const intVal = parseInt(String(rawVal).replace(/\D/g, ""), 10) || 1;
          await inp.fill(String(intVal));
          console.log(`  • [Garantia] Quantidade por Pacote preenchido com: ${intVal}`);
        }
      }
    } catch (_) {}
  }

  // 8. Upload de Fotos
  if (imageFiles.length > 0) {
    console.log(`📸 Enviando ${imageFiles.length} fotos do produto...`);
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(imageFiles.slice(0, 8));
      await page.waitForTimeout(1500);
      console.log(`  • ${Math.min(imageFiles.length, 8)} fotos carregadas com sucesso.`);
    }
  }

  // 9. Configuração das Variações
  console.log(`🎨 Configurando seção de Variações...`);

  // Sempre define "modelo" como padrão em atributo
  const attrInput = page.locator('#attribute');
  if (await attrInput.isVisible().catch(() => false)) {
    await attrInput.fill('modelo');
    console.log('  • Atributo definido como: "modelo"');
    await page.waitForTimeout(300);
  }

  // Prepara lista de variações a criar (Regra: sem promoção)
  let variationsToCreate = [];
  if (Array.isArray(product.variacoes) && product.variacoes.length > 0) {
    variationsToCreate = product.variacoes.map((v) => ({
      nome: String(v.nome || v.sku?.replace(product.sku + '_', '') || v.sku || 'Padrão').trim(),
      cod_sankhya: String(v.cod_sankhya || product.cod_sankhya || '').trim(),
      preco: v.preco_sem_promocao ?? product.preco_sem_promocao ?? product.preco?.preco_sem_promocao ?? v.preco_atual ?? v.preco_com_promocao ?? 0,
    }));
  } else {
    // Produto simples cadastrado na tela de variação
    variationsToCreate = [
      {
        nome: String(product.modelo || 'Padrão').trim(),
        cod_sankhya: String(product.cod_sankhya || product.sku || '').trim(),
        preco: product.preco_sem_promocao ?? product.preco?.preco_sem_promocao ?? product.preco_atual ?? product.preco_com_promocao ?? 0,
      },
    ];
  }

  // Preenche cada variação no input de tags
  const tagifyInput = page.locator('.input-tags, [id^="variationTagify"], .tagify__input').first();
  if (await tagifyInput.isVisible().catch(() => false)) {
    for (const v of variationsToCreate) {
      console.log(`  • Inserindo variação: "${v.nome}"`);
      await tagifyInput.click();
      await page.keyboard.type(v.nome);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }
  }

  // Clica em "Gerar lista de variações"
  console.log('⚙️ Clicando em "Gerar lista de variações"...');
  const btnGenVar = page.locator('button:has-text("Gerar lista de variações")');
  if (await btnGenVar.isVisible().catch(() => false)) {
    await btnGenVar.click();
    await page.waitForTimeout(2500);
  }

  // Regra: "sempre adicionar o preço nesse campo da foto e selecionar a caixinha 'mesmo preço para todas variações' e sem promoção."
  const targetCommonPrice = variationsToCreate[0]?.preco || product.preco_sem_promocao || product.preco?.preco_sem_promocao || 0;
  if (targetCommonPrice > 0) {
    const priceNum = typeof targetCommonPrice === 'number' ? targetCommonPrice : parseFloat(String(targetCommonPrice).replace(',', '.'));
    const cents = Math.round(priceNum * 100).toString();
    const commonPriceEl = page.locator('#commonVariationPrice');
    if (await commonPriceEl.isVisible().catch(() => false)) {
      await commonPriceEl.scrollIntoViewIfNeeded();
      await commonPriceEl.click({ force: true });
      await commonPriceEl.pressSequentially(cents, { delay: 50 });
      await page.waitForTimeout(300);
      console.log(`  • Preço de venda geral preenchido no cabeçalho (sem promoção): R$ ${priceNum.toFixed(2)}`);
    }

    // Seleciona a caixinha "Mesmo preço para todas variações:"
    const samePriceCheckbox = page.locator('.checkbox:has-text("Mesmo preço para todas variações") input[type="checkbox"], label:has-text("Mesmo preço para todas variações") input[type="checkbox"]').first();
    if (await samePriceCheckbox.isVisible().catch(() => false)) {
      const isChecked = await samePriceCheckbox.isChecked().catch(() => false);
      if (!isChecked) {
        await samePriceCheckbox.check({ force: true }).catch(async () => {
          await page.locator('label:has-text("Mesmo preço para todas variações")').first().click().catch(() => {});
        });
        console.log('  • Caixinha "Mesmo preço para todas variações" selecionada.');
      }
    } else {
      const samePriceLabel = page.locator('label:has-text("Mesmo preço para todas variações"), .checkbox:has-text("Mesmo preço para todas variações")').first();
      if (await samePriceLabel.isVisible().catch(() => false)) {
        await samePriceLabel.click().catch(() => {});
        console.log('  • Label "Mesmo preço para todas variações" clicado.');
      }
    }
    await page.waitForTimeout(500);
  }

  // Preenche o código do Sankhya no campo SKU da variação
  for (let i = 0; i < variationsToCreate.length; i++) {
    const v = variationsToCreate[i];

    // Preenche código do Sankhya no campo SKU
    const skuInput = page.locator(`#variationSKU-${i}`);
    if (await skuInput.isVisible().catch(() => false)) {
      const skuVal = v.cod_sankhya || product.cod_sankhya || v.sku || product.sku;
      if (skuVal) {
        await skuInput.fill(skuVal);
        console.log(`  • Variação ${i} (${v.nome}): SKU preenchido com código: "${skuVal}"`);
        // Aguarda sincronização automática do Sankhya na Magis5 (EAN, estoque e fotos da variação)
        await page.waitForTimeout(1500);
      }
    }

    // Garante que o preço da variação esteja preenchido caso não tenha sido preenchido automaticamente
    const pInput = page.locator(`#variationPrice-${i}`);
    if (await pInput.isVisible().catch(() => false)) {
      const curPrice = await pInput.inputValue();
      if (!curPrice || curPrice.includes("0,00") || curPrice.includes("0.00")) {
        const priceNum = typeof v.preco === 'number' ? v.preco : parseFloat(String(v.preco).replace(',', '.'));
        const cents = Math.round(priceNum * 100).toString();
        await pInput.scrollIntoViewIfNeeded();
        await pInput.click({ force: true });
        await pInput.pressSequentially(cents, { delay: 50 });
        await page.waitForTimeout(300);
        const formattedPrice = await pInput.inputValue();
        console.log(`  • Variação ${i} (${v.nome}): Preço definido na linha: ${formattedPrice}`);
      }
    }
  }

  // 10. Imagens das Variações: Shopee exige estritamente no máximo 1 foto por variação (1/1)
  console.log(`🖼️ Configurando fotos das variações (1 foto oficial por modelo, igual ao site)...`);
  await page.waitForTimeout(2000);

  const varImagesCard = page.locator('.card:has-text("Imagens das variações"), [id*="VariationImages"], [id*="collapseVariationImages"]');
  if (await varImagesCard.count() > 0) {
    // Remove fotos pré-carregadas pelo ERP dentro da variação para não estourar o limite de 1 foto da Shopee
    const delBtns = varImagesCard.locator('.btn-light-danger, .btn-danger, [data-action="remove"], button:has(i), a:has(i)');
    let btnCount = await delBtns.count();
    if (btnCount > 0) {
      console.log(`  • Removendo ${btnCount} foto(s) pré-carregadas pelo ERP dentro da variação...`);
      for (let d = 0; d < btnCount; d++) {
        const btn = varImagesCard.locator('.btn-light-danger, .btn-danger, [data-action="remove"], button:has(i), a:has(i)').first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(400);
          const swalConfirm = page.locator('.swal2-confirm');
          if (await swalConfirm.isVisible().catch(() => false)) {
            await swalConfirm.click().catch(() => {});
            await page.waitForTimeout(300);
          }
        }
      }
      console.log("  • Limpeza de fotos pré-carregadas da variação concluída.");
    }
  }

  // Faz o upload da foto individual oficial para cada variação
  const fileInputs = page.locator('input[type="file"]');
  const fCount = await fileInputs.count();

  for (let i = 0; i < variationsToCreate.length; i++) {
    const v = variationsToCreate[i];
    const targetFileInput = fileInputs.nth(i + 1); // index 0 é fotos gerais, index 1+ são variações

    // Verifica se a variação já possui 1 foto (Shopee: 1/1)
    const varBadges = page.locator('span:has-text("/1 imagens de variação")');
    if (await varBadges.nth(i).isVisible().catch(() => false)) {
      const badgeText = await varBadges.nth(i).innerText().catch(() => "");
      if (badgeText.includes("1/1")) {
        console.log(`  • Variação ${i} (${v.nome}): Já possui 1/1 foto (respeitando limite da Shopee).`);
        continue;
      }
    }

    if (await targetFileInput.count() > 0) {
      const varPhoto = await resolveVariationImage(product, v);
      if (varPhoto && existsSync(varPhoto)) {
        console.log(`  • Variação ${i} (${v.nome}): Enviando foto oficial do site: ${varPhoto}`);
        await targetFileInput.setInputFiles(varPhoto);
        await page.waitForTimeout(1500);
      } else {
        console.warn(`  ⚠️ Variação ${i} (${v.nome}): Foto não encontrada localmente.`);
      }
    }
  }

  // 11. Modo Dry-Run vs Publicação Real
  const timestamp = Date.now();
  if (dryRun) {
    const screenshotPath = join(SCREENSHOTS_DIR, `dryrun-${sku}-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n🛡️ [DRY-RUN] Simulação concluída com sucesso!`);
    console.log(`📸 Screenshot comprobatório salvo em: ${screenshotPath}`);
    return {
      success: true,
      dryRun: true,
      screenshot: screenshotPath,
      sku,
    };
  }

  // Verificação de segurança de campos obrigatórios antes do clique em Salvar
  const finalTitleEl = page.locator('#title');
  if (await finalTitleEl.isVisible().catch(() => false)) {
    const curVal = await finalTitleEl.inputValue();
    if (!curVal || curVal.trim() === '') {
      console.log(`  ⚠️ Título Shopee estava vazio, re-preenchendo: ${product.titulo_shopee}`);
      await finalTitleEl.click({ force: true });
      await finalTitleEl.fill(product.titulo_shopee);
      await finalTitleEl.dispatchEvent('input').catch(() => {});
      await finalTitleEl.dispatchEvent('change').catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  // Publicação em Produção (se confirmada com flag --publish)
  console.log("🚀 [PRODUÇÃO] Clicando no botão Salvar...");
  const saveBtn = page.locator('button:has-text("Salvar")').last();
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();

  // Aguarda confirmação ou redirecionamento da Magis5 (até 10 segundos)
  let isSaved = false;
  for (let w = 0; w < 10; w++) {
    await page.waitForTimeout(1000);
    const currUrl = page.url();
    if (currUrl.includes("index.php") || !currUrl.includes("variation.php")) {
      isSaved = true;
      break;
    }
  }

  const screenshotPath = join(SCREENSHOTS_DIR, `published-${sku}-${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Captura mensagens de alerta ou toast na tela
  const toastTexts = await page.locator('.toast, .alert, .notification, [class*="alert"], [class*="toast"], .swal2-title, .invalid-feedback, span:has-text("/1 imagens de variação")')
    .evaluateAll(els => els.map(e => e.innerText.trim()).filter(Boolean))
    .catch(() => []);

  if (!isSaved) {
    const errorMsg = toastTexts
      .filter(t => !t.includes("algumas contas não permitem definir preços diferentes"))
      .join(" | ") || "Magis5 não redirecionou (erro de validação na tela)";
    console.error(`❌ [FALHA NO SALVAMENTO] O Magis5 recusou salvar o SKU ${sku}: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      screenshot: screenshotPath,
      sku,
    };
  }

  console.log(`✅ [PRODUÇÃO] Anúncio salvo com sucesso no Magis5! Redirecionado para a lista de produtos. Screenshot: ${screenshotPath}`);

  return {
    success: true,
    dryRun: false,
    screenshot: screenshotPath,
    sku,
  };
}
