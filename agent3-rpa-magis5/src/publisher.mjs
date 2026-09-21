import path, { join, resolve, basename } from "node:path";
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
import { resolveAllProductImages, resolveVariantImage, resolveLocalImage } from "./image_resolver.mjs";
import { generateFriendlyModel } from "../../agent2-enricher/schemas.mjs";

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

function normalizeLocalImagePath(p, sku = null) {
  return resolveLocalImage(p, sku);
}

/**
 * Remove estritamente qualquer menção ao código SKU, códigos internos ou referências
 * do texto da descrição antes de enviar ao Magis5 / Shopee.
 *
 * @param {string} desc - Texto original da descrição
 * @param {object} product - Objeto do produto
 * @returns {string} Descrição limpa sem SKU
 */
export function sanitizeDescription(desc, product = {}) {
  if (!desc) return "";
  let text = String(desc);
  const sku = product?.sku ? String(product.sku).trim() : "";

  // 1. Remove linhas que declaram explicitamente o SKU / Código / Referência
  text = text.replace(/^[ \t]*(?:-|\*)*[ \t]*(?:SKU|C[oó]digo(?: do Produto)?|Refer[eê]ncia|Ref)[ \t]*:[ \t]*[^\r\n]+[\r\n]*/gmi, "");

  // 2. Se a linha do Modelo tiver apenas o SKU bruto (ex: "- Modelo: C02829"), substitui pelo nome do modelo comercial
  if (sku) {
    const friendly = (product.modelo && product.modelo !== sku) ? product.modelo : "BRK Especial";
    const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`^([ \\t]*-[ \\t]*Modelo[ \\t]*:[ \\t]*)${escapedSku}[ \\t]*$`, "gmi"), `$1${friendly}`);
    
    // 3. Remove o SKU se estiver em parênteses ou colchetes: ex: "São Bento Medalhão (C02830)" -> "São Bento Medalhão"
    text = text.replace(new RegExp(`[ \\t]*[\\(\\[]${escapedSku}[\\)\\]]`, "gi"), "");
  }

  // 4. Remove qualquer código alfanumérico que esteja em parênteses na linha de Modelo (ex: "- Modelo: Algo (C02830)")
  text = text.replace(/([ \t]*-[ \t]*Modelo[ \t]*:[ \t]*[^\r\n\(]+)[ \t]*\([A-Za-z0-9_-]+\)/gi, "$1");

  // 5. Remove qualquer menção residual do SKU exato isolado
  if (sku) {
    const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${escapedSku}\\b`, "gi"), "");
    // Limpa parênteses vazios resultantes "()"
    text = text.replace(/[ \t]*\(\s*\)/g, "");
  }

  // 6. REGRA CRÍTICA: NUNCA colocar tamanho na descrição (remover menções e tabelas de medidas)
  text = text.replace(/^[ \t]*(?:-|\*)*[ \t]*Tamanho[ \t]*:[^\r\n]*[\r\n]*/gmi, "");
  text = text.replace(/\bTamanho\s*:\s*(?:Variado|[A-Z0-9\s,\/()\-]+(?=\n|$))/gmi, "");
  text = text.replace(/Tabela de Medidas[^\n]*:?[\s\S]*?(?=(?:Nossa Estampa|Garantia|Diferenciais|Cuidados|\n\n\n|$))/gi, "");
  text = text.replace(/^[ \t]*(?:Masculino|Feminino|Infantil)?[ \t]*Tamanho[ \t]*[A-Z0-9 ]+:[^\r\n]*[\r\n]*/gmi, "");

  return text.trim();
}

/**
 * Coleta os caminhos absolutos das imagens locais válidas para o produto.
 *
 * @param {object} product
 * @returns {Promise<string[]>}
 */
export async function resolveProductImages(product) {
  return resolveAllProductImages(product);
}

/**
 * Resolve a primeira foto oficial para a variação (Regra: preencher todas as variações com a primeira foto).
 *
 * @param {object} product
 * @param {object} variant
 * @param {string[]} imageFiles
 * @returns {Promise<string|null>}
 */
export async function resolveVariationImage(product, variant, imageFiles = []) {
  return resolveVariantImage(product, variant, imageFiles);
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

  // Monitoramento ativo de respostas do Magis5 e console do navegador
  let lastServerInsertError = "";
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`  [BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
    }
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("variation") || url.includes("save") || url.includes("product") || url.includes("shopee") || url.includes("insert")) {
      const status = res.status();
      if (status >= 400 || url.includes("save") || url.includes("variation.php") || url.includes("insert")) {
        let bodyText = "";
        try {
          bodyText = await res.text();
          if (bodyText.includes("SKU já cadastrado") || bodyText.includes("já cadastrado")) {
            lastServerInsertError = "SKU_ALREADY_EXISTS";
          }
          if (bodyText.length > 500) bodyText = bodyText.substring(0, 500) + "...";
        } catch (_) {}
        console.log(`  [NETWORK] ${res.request().method()} ${url} -> Status: ${status} | Body: ${bodyText}`);
      }
    }
  });

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

  // Modelo (REGRA: NUNCA colocar SKU no modelo - usar características como 'FUSION AZUL', etc.)
  const friendlyModel = generateFriendlyModel(
    product.sku,
    product.titulo_shopee,
    product.atributos?.estampa,
    product.modelo
  );
  if (friendlyModel && friendlyModel !== "N/A") {
    const modelEl = page.locator('#model, input[name="model"]').first();
    if (await modelEl.isVisible().catch(() => false)) {
      await modelEl.fill(friendlyModel);
      console.log(`  • Modelo comercial: ${friendlyModel}`);
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
    const cleanDesc = sanitizeDescription(product.descricao, product);
    await descEl.fill(cleanDesc);
    console.log(`  • Descrição rica preenchida sem SKU (${cleanDesc.length} caracteres)`);
  }

  // 6. Seleção de Categorias Encadeadas (com mapeamento de sinônimos e resolução automática)
  let resolvedCategory = "";
  let isCamisa = false;
  if (product.categoria_sugerida) {
    let catPath = product.categoria_sugerida
      .replace(/Animais de Estimação/gi, "Animais Domésticos")
      .replace(/Esportes e Lazer/gi, "Esportes e Atividades ao Ar Livre")
      .replace(/Artigos para Cães/gi, "Cães")
      .replace(/Cachorros/gi, "Cães");

    // Para calçados/sandálias masculinas, garante a árvore oficial padrão da Shopee
    const titleAndSku = `${product.titulo_shopee || ""} ${product.modelo || ""} ${product.sku || ""}`.toLowerCase();
    const isFootwear = /sand[aá]lia|chinelo|babuche|croc|clog|tamanco|\bslides?\b|sapato|cal[çc]ado/i.test(titleAndSku) || /colt|brave|boaonda/i.test(product.sku || "");
    const isFem = /feminin|mulher|starfem|flowf|baby\s*look/i.test(titleAndSku) || /bl$/i.test(product.sku || "") || /bl_/i.test(product.sku || "") || /bl/i.test(product.sku || "");
    const isInfantil = (/\binfantil\b|\binfantis\b|\bcrian[çc]a\b|\bkids\b|\bjuvenil\b/i.test(product.titulo_shopee || "") || /inf$/i.test(product.sku || "") || /i$/i.test(product.sku || "")) && !isFem && !/masculin/i.test(product.titulo_shopee || "");

    if (isFootwear && !isFem) {
      catPath = "Sapatos Masculinos > Sandalia e Chinelos > Chinelos";
    }

    // Para produtos de vestuário (camisas, camisetas, baby look), define a categoria padrão oficial
    isCamisa = !isFootwear && (
      /camisa|camiseta|baby\s*look|vestu[aá]rio|agro/i.test(titleAndSku) ||
      /^(?:c0|cax|fusion|cbt|cmb|apc|adv)/i.test(product.sku || "")
    );
    if (isCamisa) {
      if (isInfantil) {
        catPath = "Moda Infantil > Roupas Infantis > Blusas";
      } else if (isFem) {
        catPath = "Roupas Femininas > Blusas > Camisas e Blusas";
      } else {
        catPath = "Roupas Masculinas > Blusas > Camisas";
      }
    }


    // Para produtos de pesca (excluindo calçados e vestuário), garante a árvore oficial da Shopee
    const isFishing = !isFootwear && !isCamisa && /pesca|isca|linha|anzol|vara|carretilha|molinete|snap|chumbada/i.test(
      `${product.titulo_shopee || ""} ${product.modelo || ""} ${product.categoria_sugerida || ""}`
    );
    if (isFishing && !catPath.includes("Pescaria")) {
      catPath = "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > " +
        (catPath.split(">").pop().trim() || "Acessórios de Pesca");
    }

    // Para Varas de pesca, garante a subcategoria oficial da Shopee (Varas e Molinetes de Pesca)
    if (!/suporte|salva\s*vara|porta\s*vara/i.test(titleAndSku) && (/\bvara\b|blank|\bvaras\b/i.test(titleAndSku) || catPath.toLowerCase().includes("varas"))) {
      catPath = "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Varas e Molinetes de Pesca";
    }

    resolvedCategory = catPath;
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
        .replace(/compimento/g, "comprimento")
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

      // Regra: Blusa Cropped (sempre 'Não' para camisas)
      if (normLabel.includes("blusacropped") || normLabel.includes("cropped")) {
        const cropVal = atributos.blusa_cropped || "Não";
        const tagName = await field.evaluate((el) => el.tagName);
        if (tagName === "SELECT") {
          await field.selectOption({ label: cropVal }).catch(() => field.selectOption(cropVal).catch(() => {}));
        } else {
          await field.fill(cropVal);
        }
        console.log(`  • ${labelText}: ${cropVal}`);
        continue;
      }

      // Regra: Plus Size ('Não' por padrão para modelagem regular feminina)
      if (normLabel.includes("plussize")) {
        const psVal = atributos.plus_size || "Não";
        const tagName = await field.evaluate((el) => el.tagName);
        if (tagName === "SELECT") {
          await field.selectOption({ label: psVal }).catch(() => field.selectOption(psVal).catch(() => {}));
        } else {
          await field.fill(psVal);
        }
        console.log(`  • ${labelText}: ${psVal}`);
        continue;
      }

      // Regra: Pequeno / Estações do ano / Comprimento da parte de cima: deixar em branco por padrão
      if (normLabel === "pequeno" || normLabel.includes("estacoesdoano") || normLabel.includes("comprimentodapartedecima")) {
        const customVal = atributos[normLabel] || "";
        if (customVal) {
          await field.fill(customVal);
          console.log(`  • ${labelText}: ${customVal}`);
        } else {
          await field.fill("");
          console.log(`  • ${labelText}: [DEIXADO EM BRANCO]`);
        }
        continue;
      }

      // Regra Infantil: Se for roupa infantil (Moda Infantil), deixar em branco: Gola, Compimento da Manga, Dimensões do Produto, Idade recomendada
      const isProductInfantil = resolvedCategory && resolvedCategory.includes("Moda Infantil");
      if (isProductInfantil) {
        if (
          normLabel === "gola" ||
          normLabel.includes("compimentodamanga") ||
          normLabel.includes("comprimentodamanga") ||
          normLabel.includes("idaderecomendada") ||
          normLabel.includes("dimensoesdoproduto")
        ) {
          await field.fill("");
          console.log(`  • ${labelText}: [DEIXADO EM BRANCO - Padrão Infantil]`);
          continue;
        }
      }

      // Regra Geral: Dimensões do produto e Idade recomendada deixar em branco a menos que fornecido explicitamente
      if (normLabel.includes("idaderecomendada") || normLabel.includes("dimensoesdoproduto")) {
        const customVal = atributos[normLabel] || "";
        if (customVal) {
          await field.fill(customVal);
          console.log(`  • ${labelText}: ${customVal}`);
        } else {
          await field.fill("");
          console.log(`  • ${labelText}: [DEIXADO EM BRANCO]`);
        }
        continue;
      }

      // Regra Modelo: preencher com o SKU do produto
      if (normLabel === "modelo") {
        const modelVal = atributos.modelo || product.sku || product.modelo || "";
        if (modelVal) {
          await field.fill(modelVal);
          console.log(`  • ${labelText}: ${modelVal}`);
          continue;
        }
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

          // Regra 2: "no comprimento colocar somente o número e selecionar 'cm' na escala ao lado" (NÃO aplicar para manga!)
          if ((normLabel.includes("comprimento") || normKey.includes("comprimento")) && !normLabel.includes("manga") && !normKey.includes("manga")) {
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
            const valStr = String(attrVal);
            await field.selectOption({ label: valStr }).catch(async () => {
              await field.selectOption(valStr).catch(async () => {
                const options = await field.locator('option').all();
                for (const opt of options) {
                  const optText = (await opt.innerText()).trim();
                  if (normalize(optText) === normalize(valStr)) {
                    const optVal = await opt.getAttribute('value');
                    await field.selectOption(optVal).catch(() => {});
                    break;
                  }
                }
              });
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

  // 8. Upload de Fotos Gerais do Produto (Imagens Gerais Shopee - Capa e Galeria)
  console.log(`📸 Configurando Imagens Gerais do produto (Capa e Galeria)...`);
  const generalImagesContainer = page.locator('#parent_images');
  const generalDropzone = page.locator('#list_image');
  
  if (await generalImagesContainer.count() > 0) {
    let generalCount = await generalImagesContainer.locator('.m-portlet--sortable').count();
    console.log(`  • Imagens gerais existentes: ${generalCount}`);

    const generalPhotos = (Array.isArray(imageFiles) && imageFiles.length > 0)
      ? imageFiles.filter(f => existsSync(f))
      : (Array.isArray(product.imagens) ? product.imagens.filter(f => existsSync(f)) : []);

    if (generalCount === 0 && generalPhotos.length > 0) {
      const photosToUpload = generalPhotos.slice(0, 9);
      console.log(`  • Enviando ${photosToUpload.length} foto(s) para a Galeria Geral Shopee...`);
      for (let g = 0; g < photosToUpload.length; g++) {
        const photoPath = photosToUpload[g];
        try {
          let gUploaded = false;
          const gHiddenInput = generalDropzone.locator('input[type="file"], .dz-hidden-input').first();
          if (await gHiddenInput.count() > 0) {
            await gHiddenInput.setInputFiles(photoPath);
            await page.waitForTimeout(1500);
            gUploaded = true;
          }
          if (!gUploaded && await generalDropzone.count() > 0) {
            await generalDropzone.scrollIntoViewIfNeeded().catch(() => {});
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 8000 }),
              generalDropzone.click({ force: true }),
            ]);
            await fileChooser.setFiles(photoPath);
            await page.waitForTimeout(1500);
            gUploaded = true;
          }
        } catch (err) {
          console.warn(`  ⚠️ Falha ao subir imagem geral ${g + 1} (${path.basename(photoPath)}): ${err.message}`);
        }
      }
    }
    const finalGenCount = await generalImagesContainer.locator('.m-portlet--sortable').count();
    console.log(`  ✓ Total de Imagens Gerais do produto = ${finalGenCount}/9 foto(s).`);
  }

  // 9. Configuração das Variações
  console.log(`🎨 Configurando seção de Variações...`);

  const hasMultiAttributes = product.is_multi_model || (Array.isArray(product.atributos_magis5) && product.atributos_magis5.length > 1);
  let variationsToCreate = [];

  if (hasMultiAttributes) {
    const attrConfigs = product.atributos_magis5 || [
      {
        nome: "Modelo",
        valores: Array.from(new Set(product.variacoes.map(v => v.modelo_nome || v.modelo))).filter(Boolean),
      },
      {
        nome: "Tamanho",
        valores: Array.from(new Set(product.variacoes.map(v => v.tamanho))).filter(Boolean),
      },
    ];

    console.log(`  • Modo Multi-Atributos detectado (${attrConfigs.length} atributos: ${attrConfigs.map(a => a.nome).join(" x ")})`);

    // 1º Atributo: Modelo (com nomes comerciais, nunca SKU)
    const firstAttr = attrConfigs[0];
    const attrInput0 = page.locator('input#attribute, input[placeholder*="Cor, Tamanho"]').first();
    if (await attrInput0.isVisible().catch(() => false)) {
      await attrInput0.fill(firstAttr.nome || 'Modelo');
      console.log(`  • 1º Atributo definido como: "${firstAttr.nome || 'Modelo'}"`);
      await page.waitForTimeout(300);
    }

    const tagifyInput0 = page.locator('.tagify__input').first();
    if (await tagifyInput0.isVisible().catch(() => false)) {
      for (const val of firstAttr.valores) {
        console.log(`    - Inserindo modelo comercial: "${val}"`);
        await tagifyInput0.click();
        await page.keyboard.type(val);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
      }
    }

    // Clica em "+ Adicionar atributo" para abrir a 2ª linha
    const addAttrBtn = page.locator('a:has-text("Adicionar atributo"), button:has-text("Adicionar atributo")').first();
    if (await addAttrBtn.isVisible().catch(() => false)) {
      console.log('  • Clicando em "+ Adicionar atributo"...');
      await addAttrBtn.click();
      await page.waitForTimeout(600);
    }

    // 2º Atributo: Tamanho (PP ao G2)
    const secondAttr = attrConfigs[1];
    const attrInput1 = page.locator('input#attribute, input[placeholder*="Cor, Tamanho"]').nth(1);
    if (await attrInput1.isVisible().catch(() => false)) {
      await attrInput1.fill(secondAttr.nome || 'Tamanho');
      console.log(`  • 2º Atributo definido como: "${secondAttr.nome || 'Tamanho'}"`);
      await page.waitForTimeout(300);
    }

    const tagifyInput1 = page.locator('.tagify__input').nth(1);
    if (await tagifyInput1.isVisible().catch(() => false)) {
      for (const val of secondAttr.valores) {
        console.log(`    - Inserindo tamanho: "${val}"`);
        await tagifyInput1.click();
        await page.keyboard.type(val);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
      }
    }

    // Lista de variações para preenchimento de SKU Sankhya
    variationsToCreate = product.variacoes.map((v) => ({
      nome: String(v.nome || `${v.modelo_nome || v.modelo} - ${v.tamanho}`).trim(),
      cod_sankhya: String(v.cod_sankhya || v.sku || '').trim(),
      preco: v.preco_sem_promocao ?? product.preco_sem_promocao ?? product.preco?.preco_sem_promocao ?? v.preco_atual ?? 0,
      foto: v.imagens?.[0] || '',
    }));
  } else {
    // Modo 1 atributo clássico
    const attrInput = page.locator('#attribute');
    if (await attrInput.isVisible().catch(() => false)) {
      const isSizeVar = isCamisa || (Array.isArray(product.variacoes) && product.variacoes.some(v => /^(?:pp|p|m|g|gg|g[1-5]|xxg|exg|egg|xg|eg|\d{2}\/\d{2})$/i.test(v.nome || "")));
      const attrName = isSizeVar ? "Tamanho" : "modelo";
      await attrInput.fill(attrName);
      console.log(`  • Atributo definido como: "${attrName}"`);
      await page.waitForTimeout(300);
    }

    if (Array.isArray(product.variacoes) && product.variacoes.length > 0) {
      variationsToCreate = product.variacoes.map((v) => ({
        nome: String(v.nome || v.sku?.replace(product.sku + '_', '') || v.sku || 'Padrão').trim(),
        cod_sankhya: String(v.cod_sankhya || product.cod_sankhya || '').trim(),
        preco: v.preco_sem_promocao ?? product.preco_sem_promocao ?? product.preco?.preco_sem_promocao ?? v.preco_atual ?? v.preco_com_promocao ?? 0,
      }));
    } else {
      variationsToCreate = [
        {
          nome: String(product.modelo || 'Padrão').trim(),
          cod_sankhya: String(product.cod_sankhya || product.sku || '').trim(),
          preco: product.preco_sem_promocao ?? product.preco?.preco_sem_promocao ?? product.preco_atual ?? product.preco_com_promocao ?? 0,
        },
      ];
    }

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
  }

  // Clica em "Gerar lista de variações"
  console.log('⚙️ Clicando em "Gerar lista de variações"...');
  const btnGenVar = page.locator('button:has-text("Gerar lista de variações")');
  if (await btnGenVar.isVisible().catch(() => false)) {
    await btnGenVar.click();
    await page.waitForTimeout(3000);
  }

  // Preenche preço geral no cabeçalho e marca "Mesmo preço para todas variações"
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

  // Preenche o código do Sankhya no campo SKU da variação gerada
  for (let i = 0; i < variationsToCreate.length; i++) {
    const v = variationsToCreate[i];
    const skuInput = page.locator(`#variationSKU-${i}`);
    if (await skuInput.isVisible().catch(() => false)) {
      const skuVal = v.cod_sankhya || product.cod_sankhya || v.sku || product.sku;
      if (skuVal) {
        await skuInput.scrollIntoViewIfNeeded();
        await skuInput.fill(skuVal);
        console.log(`  • Variação ${i} (${v.nome}): SKU preenchido com código do Sankhya: "${skuVal}"`);
        await page.waitForTimeout(500);
      }
    }

    // Garante preço preenchido na linha
    const pInput = page.locator(`#variationPrice-${i}`);
    if (await pInput.isVisible().catch(() => false)) {
      const curPrice = await pInput.inputValue();
      if (!curPrice || curPrice.includes("0,00") || curPrice.includes("0.00")) {
        const priceNum = typeof v.preco === 'number' ? v.preco : parseFloat(String(v.preco).replace(',', '.'));
        const cents = Math.round(priceNum * 100).toString();
        await pInput.scrollIntoViewIfNeeded();
        await pInput.click({ force: true });
        await pInput.pressSequentially(cents, { delay: 50 });
        await page.waitForTimeout(200);
      }
    }

    // Garante estoque preenchido na linha se o campo for editável
    const stockInput = page.locator(`#variationStock-${i}`);
    if (await stockInput.isVisible().catch(() => false)) {
      const isEnabled = await stockInput.isEnabled().catch(() => false);
      if (isEnabled) {
        const curStock = await stockInput.inputValue().catch(() => "0");
        if (!curStock || curStock === "0") {
          const rawStock = v.estoque ?? v.qtd ?? v.saldo ?? 10;
          const targetStock = parseInt(String(rawStock).replace(/\D/g, ""), 10) || 10;
          await stockInput.scrollIntoViewIfNeeded();
          await stockInput.fill(String(targetStock));
          console.log(`  • Variação ${i} (${v.nome}): Estoque inicial definido como: ${targetStock}`);
          await page.waitForTimeout(200);
        }
      } else {
        console.log(`  • Variação ${i} (${v.nome}): Campo de estoque desabilitado pelo Magis5 (gerenciado por integração).`);
      }
    }
  }

  // Sanitização estrita dos campos SKU de variação: garante apenas o código Sankhya limpo
  await page.evaluate((expectedList) => {
    expectedList.forEach((v, idx) => {
      const el = document.querySelector(`#variationSKU-${idx}`);
      const cod = v.cod_sankhya || v.sku;
      if (el && cod) {
        const cleanCod = String(cod).trim();
        if (el.value !== cleanCod) {
          el.value = cleanCod;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
  }, variationsToCreate);

  // 10. Imagens das Variações (Shopee exige estritamente no máximo 1 foto por modelo)
  console.log(`🖼️ Configurando fotos das variações...`);
  await page.waitForTimeout(1500);

  const varImagesLists = page.locator('#parent_images_variation');
  const dropzones = page.locator('#list_variation_image');
  const totalDropzones = await varImagesLists.count();
  console.log(`  • Detectadas ${totalDropzones} seção(ões) de imagens de variação.`);

  const itemsToUploadPhotos = product.is_multi_model && Array.isArray(product.modelos_info)
    ? product.modelos_info
    : variationsToCreate.slice(0, totalDropzones);

  for (let i = 0; i < Math.min(totalDropzones, itemsToUploadPhotos.length); i++) {
    const item = itemsToUploadPhotos[i];
    const listEl = varImagesLists.nth(i);
    const dz = dropzones.nth(i);
    const varPhoto = item.foto || await resolveVariationImage(product, item, imageFiles);

    if (await listEl.count() > 0) {
      let currentCount = await listEl.locator('.m-portlet--sortable').count();
      const itemName = item.nome || item.sku || i;
      console.log(`  • Variação/Modelo ${i} (${itemName}): ${currentCount} foto(s) detectada(s).`);

      if (currentCount > 0) {
        console.log(`  • Limpando ${currentCount} foto(s) existentes da variação ${i} para padronizar com a 1ª foto...`);
        while (currentCount > 0) {
          const delBtn = listEl.locator('.btn-light-danger, button:has(i.flaticon-delete)').first();
          if (await delBtn.isVisible().catch(() => false)) {
            await delBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(300);
            const swalConfirm = page.locator('.swal2-confirm');
            if (await swalConfirm.isVisible().catch(() => false)) {
              await swalConfirm.click().catch(() => {});
              await page.waitForTimeout(300);
            }
          } else {
            break;
          }
          currentCount = await listEl.locator('.m-portlet--sortable').count();
        }
      }

      currentCount = await listEl.locator('.m-portlet--sortable').count();
      if (currentCount === 0 && varPhoto && existsSync(varPhoto)) {
        console.log(`  • Variação/Modelo ${i} (${itemName}): Enviando foto oficial: ${path.basename(varPhoto)}`);
        try {
          let uploaded = false;
          // Tenta input file oculto do dropzone
          const hiddenFileInput = dz.locator('input[type="file"], .dz-hidden-input').first();
          if (await hiddenFileInput.count() > 0) {
            try {
              await hiddenFileInput.setInputFiles(varPhoto);
              await page.waitForTimeout(2000);
              uploaded = true;
            } catch (_) {}
          }
          if (!uploaded && await dz.count() > 0) {
            await dz.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(400);
            const clickable = dz.locator('.dz-message, p, i').first();
            const targetClick = (await clickable.isVisible().catch(() => false)) ? clickable : dz;
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 8000 }),
              targetClick.click({ force: true }),
            ]);
            await fileChooser.setFiles(varPhoto);
            await page.waitForTimeout(2000);
            uploaded = true;
          }
          if (!uploaded) {
            const targetFileInput = page.locator('input[type="file"]').nth(i + 1);
            if (await targetFileInput.count() > 0) {
              await targetFileInput.setInputFiles(varPhoto);
              await page.waitForTimeout(2000);
            }
          }
        } catch (err) {
          console.warn(`  ⚠️ Falha no upload da foto da variação ${i} (${itemName}): ${err.message}`);
        }
      }

      const finalCount = await listEl.locator('.m-portlet--sortable').count();
      console.log(`  ✓ Variação/Modelo ${i} (${itemName}): Total final = ${finalCount}/1 foto(s).`);
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

  // Salvamento do Rascunho no Magis5
  console.log("💾 Clicando no botão Salvar para gravar o rascunho no Magis5...");
  const saveBtn = page.locator('button:has-text("Salvar")').first();
  await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  // Checagem de campos com erro de validação HTML5 antes de clicar
  const preInvalid = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(':invalid, .is-invalid, input[aria-invalid="true"]')).map(el => ({
      tag: el.tagName, id: el.id, name: el.name, msg: el.validationMessage, html: el.outerHTML.slice(0, 120)
    }));
  }).catch(() => []);
  if (preInvalid.length > 0) {
    console.log("  ⚠️ [VALIDAÇÃO PRÉ-SALVAR] Campos inválidos:", JSON.stringify(preInvalid));
  }

  // Executa o clique de salvamento de forma resiliente
  try {
    await saveBtn.click({ force: true });
  } catch {
    await saveBtn.evaluate(b => b.click());
  }

  await page.waitForTimeout(1000);
  const postInvalid = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(':invalid, .is-invalid, input[aria-invalid="true"], .has-error, .text-danger')).map(el => ({
      tag: el.tagName, id: el.id, name: el.name, msg: el.validationMessage || el.innerText, html: el.outerHTML.slice(0, 120)
    }));
  }).catch(() => []);
  if (postInvalid.length > 0) {
    console.log("  ⚠️ [VALIDAÇÃO PÓS-SALVAR] Campos inválidos:", JSON.stringify(postInvalid));
  }

  // Aguarda confirmação ou redirecionamento da Magis5 (até 25 segundos)
  let isSaved = false;
  for (let w = 0; w < 25; w++) {
    await page.waitForTimeout(1000);
    const currUrl = page.url();
    if (currUrl.includes("consult.php") || currUrl.includes("index.php") || !currUrl.includes("variation.php")) {
      isSaved = true;
      break;
    }
  }

  const screenshotPath = join(SCREENSHOTS_DIR, `draft-${sku}-${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Captura mensagens reais de erro, alerta ou toast na tela
  const toastTexts = await page.locator('.toast, .alert, .notification, [class*="alert"], [class*="toast"], .swal2-title, .invalid-feedback')
    .evaluateAll(els => els.map(e => e.innerText.trim()).filter(Boolean))
    .catch(() => []);

  if (!isSaved) {
    if (lastServerInsertError === "SKU_ALREADY_EXISTS") {
      console.log(`ℹ️ [JÁ EXISTE NO MAGIS5] O produto ${sku} já possui rascunho cadastrado com variações na Magis5. Marcando como concluído.`);
      return {
        success: true,
        dryRun: false,
        alreadyExists: true,
        screenshot: screenshotPath,
        sku,
      };
    }

    const errorMsg = toastTexts
      .filter(t => !t.includes("algumas contas não permitem definir preços diferentes"))
      .join(" | ") || "Magis5 não redirecionou (erro de validação na tela)";
    console.error(`❌ [FALHA NO SALVAMENTO] O Magis5 recusou salvar o rascunho do SKU ${sku}: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      screenshot: screenshotPath,
      sku,
    };
  }

  console.log(`✅ Anúncio/Rascunho salvo com sucesso no Magis5! Redirecionado para a listagem. Screenshot: ${screenshotPath}`);

  return {
    success: true,
    dryRun: false,
    screenshot: screenshotPath,
    sku,
  };
}
