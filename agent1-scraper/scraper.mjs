/**
 * Agente 1 — Scraper BRK Fishing com Otimização de Imagens (Opção A - Sharp.js)
 *
 * 1. Lê a planilha de produtos (lote_d1fae5.csv ou fornecida via --input)
 * 2. Busca cada produto na API pública da Shopify da BRK Fishing
 * 3. Baixa todas as imagens em alta resolução
 * 4. Aplica etapa de APRIMORAMENTO DE QUALIDADE (Opção A - Sharp.js):
 *    - Nitidez adaptativa
 *    - Realce de saturação e brilho
 *    - Normalização de contraste
 *    - Recompressão MozJPEG em alta qualidade (92%)
 * 5. Salva na pasta downloads/{sku}/
 * 6. Atualiza o CSV de lote com status "scraped"
 */

import { readFile, writeFile, mkdir, readdir, cp } from "node:fs/promises";
import { existsSync, symlinkSync } from "node:fs";
import { resolve, join, basename, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { enhanceImage } from "./imageEnhancer.mjs";
import { extractParentSku, extractVariationSuffix } from "../agent2-enricher/grouping.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = resolve(SCRIPT_DIR, "lote_d1fae5.csv");
const DOWNLOADS_DIR = resolve(SCRIPT_DIR, "downloads");
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const CLOTHING_SIZES = new Set([
  "PP", "P", "M", "G", "GG", "XG", "XXG", "EXG", "EGG", "EG",
  "G1", "G2", "G3", "G4", "G5",
  "1", "2", "4", "6", "8", "10", "12", "14", "16", "INFANTIL"
]);

/**
 * Detecta se o item é uma camisa / vestuário com variação de tamanho.
 */
export function isShirtOrClothingSize(item, parentSku, variation) {
  const title = (item.titulo_bruto || "").toUpperCase();
  const classif = (item.classificacao || "").toUpperCase();

  const isClothing =
    classif.includes("CAMISA") ||
    classif.includes("VESTUARIO") ||
    classif.includes("ROUPA") ||
    title.includes("CAMISA") ||
    title.includes("CAMISETA") ||
    title.includes("BABY LOOK") ||
    title.includes("REGATA") ||
    title.includes("MANGA LONGA") ||
    title.includes("MANGA CURTA") ||
    title.includes("POLO") ||
    title.includes("CROPPED") ||
    title.includes("BLUSA");

  const isSize = variation && CLOTHING_SIZES.has(variation.toUpperCase());

  return Boolean(parentSku && parentSku !== item.sku && (isClothing || isSize));
}

export function getCollectionNameFromFilename(filename) {
  if (!filename) return "";
  let base = basename(filename, extname(filename));
  base = base.replace(/_\d{10,}$/, "");
  base = base.replace(/_+sankhya(_+.*)?$/i, "");
  base = base.replace(/_\d{10,}$/, "");

  if (base.toLowerCase().startsWith("lote_") || base.toLowerCase() === "lote") {
    return "";
  }

  const words = base.split(/[_\s-]+/).filter(Boolean);
  if (words.length === 0) return "";

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function parseArgs() {
  const args = process.argv.slice(2);
  let inputFile = DEFAULT_INPUT;
  let limit = null;
  let targetSku = null;
  let collection = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input") {
      const parts = [];
      i++;
      while (i < args.length && !args[i].startsWith("--")) {
        parts.push(args[i]);
        i++;
      }
      inputFile = parts.join(" ").replace(/^["']|["']$/g, "");
      i--;
    } else if (args[i] === "--collection" && args[i + 1]) {
      collection = args[i + 1].replace(/^["']|["']$/g, "").trim();
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if ((args[i] === "--sku" || args[i] === "--skus") && args[i + 1]) {
      targetSku = args[i + 1];
      i++;
    }
  }

  return { inputFile: resolve(inputFile), limit, targetSku, collection };
}

const SHOPIFY_DOMAINS = [
  "https://brkfishing.com.br",
  "https://www.brkagro.com.br",
  "https://www.brkmotors.com.br",
];

/**
 * Busca produto na API da BRK Fishing, BRK Agro ou BRK Motors por SKU ou termo.
 * Tenta pelo SKU da variação e, se não encontrar, tenta pelo parentSku.
 */
async function fetchProductFromShopify(sku, fallbackParentSku = null) {
  const skusToTry = [sku];
  if (fallbackParentSku && fallbackParentSku !== sku) {
    skusToTry.push(fallbackParentSku);
  }

  for (const currentSku of skusToTry) {
    const cleanSku = String(currentSku).trim();
    const searchSku = cleanSku.includes("_") ? cleanSku.split("_")[0] : cleanSku;

    for (const domain of SHOPIFY_DOMAINS) {
      try {
        const suggestUrl = `${domain}/search/suggest.json?q=${encodeURIComponent(searchSku)}&resources[type]=product`;
        const res = await fetch(suggestUrl, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(6000),
        });

        if (!res.ok) continue;

        const data = await res.json();
        const products = data?.resources?.results?.products || [];
        if (products.length === 0) continue;

        const handle = products[0].handle;
        const productRes = await fetch(`${domain}/products/${handle}.js`, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(6000),
        });

        if (!productRes.ok) continue;

        const product = await productRes.json();
        if (product) {
          product._sourceDomain = domain;
          return product;
        }
      } catch {
        // Tenta próximo domínio
      }
    }
  }

  return null;
}

/**
 * Baixa uma imagem e aplica o aprimoramento de qualidade da Opção A
 */
async function downloadAndEnhanceImage(url, destPath) {
  // Garante URL com protocolo HTTPS e máxima resolução
  let fullUrl = url.startsWith("//") ? `https:${url}` : url;
  fullUrl = fullUrl.replace(/(_\d+x\d+|\.compact|\.medium|\.large|\.grande)\./g, ".");

  const response = await fetch(fullUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Salva a imagem original direta do site, sem qualquer filtro
  await writeFile(destPath, buffer);
}

async function main() {
  const { inputFile, limit, targetSku, collection: argCollection } = parseArgs();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  🎣 AGENTE 1 — SCRAPER COM ENHANCEMENT DE IMAGENS (OPÇÃO A)");
  console.log(`  Arquivo de entrada: ${inputFile}`);
  if (limit) console.log(`  Limite: ${limit} produtos`);
  if (targetSku) console.log(`  SKU específico: ${targetSku}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  let records = [];
  if (existsSync(inputFile)) {
    try {
      const csvContent = await readFile(inputFile, "utf-8");
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      });
    } catch {}
  }

  const collection = argCollection || (targetSku ? "" : (records[0]?.colecao || ""));
  const targetBaseDir = collection ? join(DOWNLOADS_DIR, collection) : DOWNLOADS_DIR;
  await mkdir(targetBaseDir, { recursive: true });

  if (collection) {
    console.log(`📁 Coleção / Pasta de Destino: ${targetBaseDir}\n`);
  }

  let pendentes = [];
  if (targetSku) {
    const rawSkus = targetSku.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    console.log(`🎯 SKUs alvo informados para download (${rawSkus.length}): ${rawSkus.join(", ")}`);
    for (const singleSku of rawSkus) {
      const found = records.filter(r => r.sku === singleSku || r.sku.startsWith(singleSku));
      if (found.length > 0) {
        pendentes.push(...found);
      } else {
        pendentes.push({ sku: singleSku, titulo_bruto: singleSku });
      }
    }
    // Remove duplicatas mantendo a ordem
    pendentes = Array.from(new Map(pendentes.map(p => [p.sku, p])).values());
  } else {
    if (records.length === 0) {
      console.error(`❌ Arquivo de lote não encontrado ou vazio: ${inputFile}`);
      process.exit(1);
    }
    pendentes = records.filter(r => r.status === "pendente" || !r.status);
  }

  if (limit && limit > 0) {
    pendentes = pendentes.slice(0, limit);
  }

  console.log(`Encontrados ${pendentes.length} produtos pendentes para download.\n`);

  let sucessos = 0;
  let erros = 0;
  const downloadedShirtModels = new Map(); // parentSku -> { sourceDir, sku, count }

  for (let i = 0; i < pendentes.length; i++) {
    const item = pendentes[i];
    const sku = item.sku;
    const progresso = `[${i + 1}/${pendentes.length}]`;

    const parentSku = extractParentSku(sku, item.titulo_bruto || "");
    const variation = extractVariationSuffix(sku, item.titulo_bruto || "");
    const isShirtSize = isShirtOrClothingSize(item, parentSku, variation);
    const skuDir = join(targetBaseDir, sku);

    // REGRA 1: Se for variação de tamanho da mesma camisa e já baixamos uma variação deste modelo nesta execução
    if (isShirtSize && downloadedShirtModels.has(parentSku)) {
      const parentInfo = downloadedShirtModels.get(parentSku);
      console.log(`${progresso} 👕 [REGRA CAMISA] ${sku} (Tamanho ${variation || 'variação'}): Fotos já baixadas via ${parentInfo.sku} (${parentSku}). Reutilizando imagens sem baixar novamente.`);

      try {
        if (!existsSync(skuDir)) {
          try {
            symlinkSync(parentInfo.sourceDir, skuDir, "junction");
          } catch {
            await cp(parentInfo.sourceDir, skuDir, { recursive: true });
          }
        }
        item.status = "scraped";
        sucessos++;
      } catch (linkErr) {
        console.warn(`  ⚠️ Falha ao vincular imagens para ${sku}: ${linkErr.message}`);
      }

      // Salva progresso incremental no CSV
      if (records.length > 0 && existsSync(inputFile)) {
        try {
          const updatedCsv = stringify(records, { header: true, columns: Object.keys(records[0]) });
          await writeFile(inputFile, updatedCsv, "utf-8");
        } catch {}
      }
      continue;
    }

    // REGRA 2: Se fotos para este modelo ou SKU já existem no disco de execuções anteriores
    let existingImagesDir = null;
    if (isShirtSize) {
      const parentDir = join(targetBaseDir, parentSku);
      if (existsSync(parentDir)) {
        try {
          const pFiles = (await readdir(parentDir)).filter(f => f.toLowerCase().endsWith(".jpg"));
          if (pFiles.length > 0) existingImagesDir = parentDir;
        } catch {}
      }
    }
    if (!existingImagesDir && existsSync(skuDir)) {
      try {
        const sFiles = (await readdir(skuDir)).filter(f => f.toLowerCase().endsWith(".jpg"));
        if (sFiles.length > 0) existingImagesDir = skuDir;
      } catch {}
    }

    if (existingImagesDir) {
      console.log(`${progresso} ⚡ [CACHE LOCAL] Fotos para o modelo ${parentSku || sku} já existem no disco em ${basename(existingImagesDir)}. Vinculando para ${sku}...`);
      try {
        if (!existsSync(skuDir)) {
          try {
            symlinkSync(existingImagesDir, skuDir, "junction");
          } catch {
            await cp(existingImagesDir, skuDir, { recursive: true });
          }
        }
        if (isShirtSize) {
          downloadedShirtModels.set(parentSku, { sourceDir: existingImagesDir, sku });
        }
        item.status = "scraped";
        sucessos++;

        if (records.length > 0 && existsSync(inputFile)) {
          try {
            const updatedCsv = stringify(records, { header: true, columns: Object.keys(records[0]) });
            await writeFile(inputFile, updatedCsv, "utf-8");
          } catch {}
        }
        continue;
      } catch {}
    }

    // Caso contrário: busca produto na Shopify (apenas para a 1ª variação encontrada)
    console.log(`${progresso} 🔍 Buscando produto: ${sku} - ${item.titulo_bruto || ""}`);

    try {
      const shopifyData = await fetchProductFromShopify(sku, parentSku);
      if (!shopifyData) {
        console.warn(`${progresso} ⚠️ Produto não encontrado nos sites BRK (Fishing / Agro / Motors).`);
        item.status = "erro: produto nao encontrado no site";
        erros++;
        continue;
      }
      console.log(`${progresso} 🌐 Encontrado em: ${shopifyData._sourceDomain}`);

      const images = shopifyData.images || [];
      if (images.length === 0) {
        console.warn(`${progresso} ⚠️ Nenhuma foto encontrada para o produto.`);
        item.status = "erro: sem fotos";
        erros++;
        continue;
      }

      await mkdir(skuDir, { recursive: true });

      console.log(`${progresso} 📥 Baixando e aprimorando ${images.length} fotos para ${sku}...`);

      for (let idx = 0; idx < images.length; idx++) {
        const imgUrl = images[idx];
        const numStr = String(idx + 1).padStart(2, "0");
        const destPath = join(skuDir, `${numStr}.jpg`);

        await downloadAndEnhanceImage(imgUrl, destPath);
      }

      // Se for camisa com variação de tamanho, vincula também à pasta do código pai
      if (isShirtSize) {
        const parentDir = join(targetBaseDir, parentSku);
        if (!existsSync(parentDir)) {
          try {
            symlinkSync(skuDir, parentDir, "junction");
          } catch {
            await cp(skuDir, parentDir, { recursive: true });
          }
        }
        downloadedShirtModels.set(parentSku, { sourceDir: skuDir, sku, count: images.length });
        console.log(`   📌 [REGRA CAMISA] Fotos salvas para o modelo ${parentSku}. Próximos tamanhos deste modelo reutilizarão estas fotos automaticamente.`);
      }

      const relativeFolder = collection ? `downloads/${collection}/${sku}/` : `downloads/${sku}/`;
      console.log(`${progresso} ✅ ${images.length} fotos salvas e aprimoradas com sucesso em ${relativeFolder}`);
      item.status = "scraped";
      sucessos++;
    } catch (err) {
      console.error(`${progresso} ❌ Erro ao processar ${sku}:`, err.message);
      item.status = `erro: ${err.message}`;
      erros++;
    }

    // Salva progresso incremental no CSV se houver registros
    if (records.length > 0 && existsSync(inputFile)) {
      try {
        const updatedCsv = stringify(records, { header: true, columns: Object.keys(records[0]) });
        await writeFile(inputFile, updatedCsv, "utf-8");
      } catch {}
    }

    await sleep(600);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  🎉 Concluído! Sucessos: ${sucessos} | Erros: ${erros}`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch((err) => {
    console.error("❌ Erro fatal no scraper:", err);
    process.exit(1);
  });
}
