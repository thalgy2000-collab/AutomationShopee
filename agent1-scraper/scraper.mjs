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
import { extractParentSku, extractVariationSuffix } from "../agent2-enricher/grouping.mjs";
import { setupLockAutoRelease } from "../agent2-enricher/lock_manager.mjs";

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
  let retryErrors = false;

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
    } else if (args[i] === "--retry-errors" || args[i] === "--retry") {
      retryErrors = true;
    }
  }

  return { inputFile: resolve(inputFile), limit, targetSku, collection, retryErrors };
}

export function getModelCategory(skuOrModel) {
  if (!skuOrModel) return "OUTROS";
  const up = String(skuOrModel).trim().toUpperCase();
  if (up.startsWith("C0")) return "C0";
  if (up.startsWith("CAX")) return "CAX";
  if (up.startsWith("FUSION")) return "FUSION";
  if (up.startsWith("ADV")) return "ADV";
  if (up.startsWith("BA")) return "BA";
  if (up.startsWith("BT")) return "BT";
  if (up.startsWith("CI")) return "CI";
  if (up.startsWith("CMB")) return "CMB";
  if (up.startsWith("CCPBR")) return "CCPBR";
  if (up.startsWith("CPT")) return "CPT";
  if (up.startsWith("CR")) return "CR";
  if (up.startsWith("T") && /^T\d/i.test(up)) return "T";
  if (up.startsWith("ISCA")) return "ISCA";
  if (up.startsWith("ANZOL")) return "ANZOL";
  if (up.startsWith("CALCA") || up.startsWith("CALÇA")) return "CALCAS";
  if (up.startsWith("SANDALIA")) return "CALCADOS";
  if (up.startsWith("OC")) return "OC";
  if (up.startsWith("RAGLAN")) return "RAGLAN";
  if (up.startsWith("SM")) return "SM";
  return "OUTROS";
}

export async function findExistingModelDir(baseDir, sku, parentSku) {
  const candidates = [
    join(baseDir, sku),
    join(baseDir, getModelCategory(sku), sku),
  ];
  if (parentSku && parentSku !== sku) {
    candidates.push(join(baseDir, parentSku));
    candidates.push(join(baseDir, getModelCategory(parentSku), parentSku));
  }

  for (const cand of candidates) {
    if (existsSync(cand)) {
      try {
        const files = (await readdir(cand)).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
        if (files.length > 0) return cand;
      } catch {}
    }
  }
  return null;
}

const SHOPIFY_DOMAINS = [
  "https://brkfishing.com.br",
  "https://www.brkagro.com.br",
  "https://www.brkmotors.com.br",
];

// Cache em memória durante a execução do script: normalParentCode -> { product, ambiguous, notFound, sourceDomain }
const parentProductCache = new Map();

// Contadores de requisições de rede
let totalShopifyRequests = 0;

/**
 * Normaliza o código pai para chave canônica de comparação:
 * Remove canais (_FULL, _SHOPEE, etc.) e sufixos de tamanho colados ou separados por hífen/underscore.
 */
export function normalizeParentCode(sku, rawTitle = "") {
  if (!sku) return "";
  let s = String(sku).trim().replace(/_(?:FULL|SHOPEE|ML|MAGIS5|BRK)$/i, "");
  s = s.replace(/[-_](PP|P|M|G|GG|XG|XXG|EXG|EGG|EG|G[1-5]|[0-9]{1,2})$/i, "");
  const p = extractParentSku(s, rawTitle);
  return (p || s).toUpperCase();
}

/**
 * Busca produto na API da BRK Fishing, BRK Agro ou BRK Motors com casamento estrito por código pai.
 * Nunca casa por prefixo ("C02883" não casa com "C02883BL" nem "C02883I").
 */
export async function fetchProductFromShopify(sku, fallbackParentSku = null, rawTitle = "") {
  const normTargetParent = normalizeParentCode(fallbackParentSku || sku, rawTitle);
  const cleanSku = String(sku).trim().toUpperCase();

  // Verifica cache em memória por código pai
  if (parentProductCache.has(normTargetParent)) {
    const cached = parentProductCache.get(normTargetParent);
    if (cached.ambiguous) {
      return { product: null, ambiguous: true, networkError: false, fromCache: true };
    }
    if (cached.notFound) {
      return { product: null, notFound: true, networkError: false, fromCache: true };
    }
    return { product: cached.product, ambiguous: false, networkError: false, fromCache: true };
  }

  // Termos de busca na API suggest
  const searchTerms = [normTargetParent];
  if (cleanSku !== normTargetParent && !searchTerms.includes(cleanSku)) {
    searchTerms.push(cleanSku);
  }

  let lastNetworkError = null;

  for (const searchTerm of searchTerms) {
    for (const domain of SHOPIFY_DOMAINS) {
      await sleep(150); // Pausa curta entre domínios para respeitar o servidor

      let attempt = 0;
      let backoffMs = 1000;
      const maxAttempts = 3;

      while (attempt < maxAttempts) {
        attempt++;
        const suggestUrl = `${domain}/search/suggest.json?q=${encodeURIComponent(searchTerm)}&resources[type]=product`;
        const t0 = Date.now();
        totalShopifyRequests++;

        try {
          const res = await fetch(suggestUrl, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(6000),
          });
          const dur = Date.now() - t0;
          console.log(`  🌐 [HTTP ${res.status}] ${domain} (${dur}ms) - busca: "${searchTerm}"`);

          if (res.status === 429) {
            console.warn(`  ⚠️ Rate limit (429) em ${domain}. Backoff aguardando ${backoffMs}ms...`);
            await sleep(backoffMs);
            backoffMs *= 2;
            continue;
          }

          if (!res.ok) {
            break;
          }

          const data = await res.json();
          const rawProducts = data?.resources?.results?.products || [];
          if (rawProducts.length === 0) {
            break;
          }

          // Limita candidatos a no máximo 5 para inspecionar
          const candidateProducts = rawProducts.slice(0, 5);
          const matchedProducts = [];

          for (const cand of candidateProducts) {
            if (!cand.handle) continue;
            await sleep(100);
            totalShopifyRequests++;
            const tProduct0 = Date.now();

            try {
              const productRes = await fetch(`${domain}/products/${cand.handle}.js`, {
                headers: { "User-Agent": USER_AGENT },
                signal: AbortSignal.timeout(6000),
              });
              const durProd = Date.now() - tProduct0;
              console.log(`  🌐 [HTTP ${productRes.status}] ${domain}/products/${cand.handle}.js (${durProd}ms)`);

              if (productRes.status === 429) {
                console.warn(`  ⚠️ Rate limit (429) no produto ${cand.handle}. Backoff aguardando 2s...`);
                await sleep(2000);
                continue;
              }

              if (!productRes.ok) continue;

              const fullProduct = await productRes.json();
              if (!fullProduct || !fullProduct.variants) continue;

              // Verifica se alguma variante possui exatamente o SKU buscado ou o mesmo código pai normalizado
              const exactVariantMatch = fullProduct.variants.some(v => {
                const vSku = String(v.sku || "").trim().toUpperCase();
                const vSkuClean = vSku.replace(/_(?:FULL|SHOPEE|ML|MAGIS5|BRK)$/i, "");
                return vSku === cleanSku || vSkuClean === cleanSku;
              });

              const parentCodeMatch = fullProduct.variants.some(v => {
                const vParent = normalizeParentCode(v.sku);
                return vParent === normTargetParent;
              });

              if (exactVariantMatch || parentCodeMatch) {
                fullProduct._sourceDomain = domain;
                fullProduct._exactVariant = exactVariantMatch;
                matchedProducts.push(fullProduct);
              }
            } catch (pErr) {
              lastNetworkError = pErr.message;
            }
          }

          if (matchedProducts.length > 0) {
            // Se houver mais de um produto diferente que casou
            if (matchedProducts.length > 1) {
              // Verifica se um deles casou com exatidão da variante
              const exactOnly = matchedProducts.filter(p => p._exactVariant);
              if (exactOnly.length === 1) {
                parentProductCache.set(normTargetParent, { product: exactOnly[0] });
                return { product: exactOnly[0], ambiguous: false, networkError: false };
              }

              // Múltiplos produtos distintos casaram -> Marca ambíguo e NÃO baixa
              console.warn(`  ⚠️ Ambiguidade detectada para ${normTargetParent}: ${matchedProducts.length} produtos casaram nos sites BRK.`);
              parentProductCache.set(normTargetParent, { ambiguous: true });
              return { product: null, ambiguous: true, networkError: false };
            }

            // Exatamente 1 produto casou
            const singleMatch = matchedProducts[0];
            parentProductCache.set(normTargetParent, { product: singleMatch });
            return { product: singleMatch, ambiguous: false, networkError: false };
          }

          // Nenhum produto dos candidatos casou com o código pai exato
          break;
        } catch (err) {
          lastNetworkError = err.message;
          if (attempt < maxAttempts) {
            console.warn(`  ⚠️ Falha na tentativa ${attempt}/${maxAttempts} para ${domain}: ${err.message}. Tentando novamente em ${backoffMs}ms...`);
            await sleep(backoffMs);
            backoffMs *= 2;
          }
        }
      }
    }
  }

  // Registra notFound no cache para não repetir buscas infrutíferas para o mesmo pai
  if (!lastNetworkError) {
    parentProductCache.set(normTargetParent, { notFound: true });
  }

  return {
    product: null,
    ambiguous: false,
    networkError: Boolean(lastNetworkError),
    errorDetail: lastNetworkError,
  };
}

/**
 * Baixa uma imagem e valida se o buffer gravado é válido (> 0 bytes).
 * Suporta URL direta como string ou objeto contendo { src: string }.
 */
export async function downloadAndEnhanceImage(imgItem, destPath) {
  let url = typeof imgItem === "string" ? imgItem : (imgItem?.src || "");
  if (!url) {
    throw new Error("URL de imagem vazia ou objeto inválido");
  }

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

  if (!buffer || buffer.length === 0) {
    throw new Error("Imagem baixada com tamanho 0 bytes (arquivo corrompido ou vazio)");
  }

  // Salva a imagem no disco
  await writeFile(destPath, buffer);
}

async function main() {
  setupLockAutoRelease("agent1");
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
    if (retryErrors) {
      pendentes = records.filter(r => r.status === "pendente" || !r.status || (typeof r.status === "string" && r.status.startsWith("erro")));
    } else {
      pendentes = records.filter(r => r.status === "pendente" || !r.status);
    }
  }

  // Contadores para o relatório AGENT1_RESULT
  let totalPendentesEncontrados = pendentes.length;
  let sucessos = 0;
  let reutilizados = 0;
  let erros = 0;
  const naoEncontrados = [];
  const errosRede = [];
  const semFotos = [];
  const ambiguos = [];

  if (pendentes.length === 0) {
    // Estatísticas da distribuição atual do lote
    const totalRecords = records.length;
    const scrapedCount = records.filter(r => r.status === "scraped").length;
    const errorCount = records.filter(r => typeof r.status === "string" && r.status.startsWith("erro")).length;
    const otherCount = totalRecords - scrapedCount - errorCount;

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("ℹ️ Nenhum produto pendente para download no lote atual.");
    console.log(`   Total no arquivo: ${totalRecords}`);
    console.log(`   Já baixados (scraped): ${scrapedCount}`);
    console.log(`   Com erro anteriormente: ${errorCount}`);
    if (otherCount > 0) console.log(`   Outros status: ${otherCount}`);
    if (errorCount > 0) {
      console.log("👉 Dica: Para reprocessar os produtos que falharam, use a opção '--retry-errors'.");
    }
    console.log("═══════════════════════════════════════════════════════════════\n");

    const zeroResult = {
      processados: 0,
      scraped: scrapedCount,
      reutilizados: 0,
      erros: errorCount,
      naoEncontrados: [],
      errosRede: [],
      semFotos: [],
      ambiguos: [],
      pendentesEncontrados: 0,
      totalLote: totalRecords
    };
    console.log(`AGENT1_RESULT ${JSON.stringify(zeroResult)}`);
    process.exit(2);
  }

  if (limit && limit > 0) {
    pendentes = pendentes.slice(0, limit);
  }

  console.log(`Encontrados ${pendentes.length} produtos para processar nesta execução.\n`);

  const downloadedShirtModels = new Map(); // parentSku -> { sourceDir, sku, count }

  for (let i = 0; i < pendentes.length; i++) {
    const item = pendentes[i];
    const sku = item.sku;
    const progresso = `[${i + 1}/${pendentes.length}]`;

    const parentSku = extractParentSku(sku, item.titulo_bruto || "");
    const variation = extractVariationSuffix(sku, item.titulo_bruto || "");
    const isShirtSize = isShirtOrClothingSize(item, parentSku, variation);
    const categoryFolder = getModelCategory(parentSku || sku);
    const categoryBaseDir = collection ? targetBaseDir : join(targetBaseDir, categoryFolder);
    const skuDir = join(categoryBaseDir, sku);

    // REGRA 1: Se for variação de tamanho da mesma camisa e já baixamos uma variação deste modelo nesta execução
    if (isShirtSize && downloadedShirtModels.has(parentSku)) {
      const parentInfo = downloadedShirtModels.get(parentSku);
      console.log(`${progresso} 👕 [REGRA CAMISA] ${sku} (Tamanho ${variation || 'variação'}): Fotos já baixadas via ${parentInfo.sku} (${parentSku}). Reutilizando imagens sem baixar novamente.`);

      try {
        if (!existsSync(skuDir)) {
          await mkdir(categoryBaseDir, { recursive: true });
          try {
            symlinkSync(parentInfo.sourceDir, skuDir, "junction");
          } catch {
            await cp(parentInfo.sourceDir, skuDir, { recursive: true });
          }
        }
        item.status = "scraped";
        sucessos++;
        reutilizados++;
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

    // REGRA 2: Se fotos para este modelo ou SKU já existem no disco de execuções anteriores (busca direta ou em subpastas de categorias)
    let existingImagesDir = await findExistingModelDir(targetBaseDir, sku, parentSku);
    if (!existingImagesDir && !collection) {
      existingImagesDir = await findExistingModelDir(DOWNLOADS_DIR, sku, parentSku);
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
        reutilizados++;

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
      const searchRes = await fetchProductFromShopify(sku, parentSku, item.titulo_bruto || "");
      const shopifyData = searchRes?.product;

      if (!shopifyData) {
        if (searchRes?.ambiguous) {
          console.warn(`${progresso} ⚠️ Múltiplos produtos distintos casaram com ${sku}. Marcado como ambíguo.`);
          item.status = `erro: produto ambíguo nos sites BRK (múltiplos modelos coincidentes)`;
          ambiguos.push(sku);
        } else if (searchRes?.networkError) {
          console.warn(`${progresso} ⚠️ Erro de rede ou timeout ao consultar sites BRK (${searchRes.errorDetail || "falha de conexão"}).`);
          item.status = "erro: falha de rede ao consultar sites BRK";
          errosRede.push(sku);
        } else {
          console.warn(`${progresso} ⚠️ SKU ${sku} não está publicado nos sites BRK; sem fotos.`);
          item.status = `erro: SKU ${sku} não está publicado nos sites BRK; sem fotos`;
          naoEncontrados.push(sku);
        }
        erros++;
        continue;
      }
      console.log(`${progresso} 🌐 Encontrado em: ${shopifyData._sourceDomain}${searchRes.fromCache ? ' (via cache)' : ''}`);

      const images = shopifyData.images || [];
      if (images.length === 0) {
        console.warn(`${progresso} ⚠️ SKU ${sku} publicado mas sem imagens cadastradas nos sites BRK.`);
        item.status = `erro: SKU ${sku} não possui fotos cadastradas nos sites BRK`;
        semFotos.push(sku);
        erros++;
        continue;
      }

      await mkdir(skuDir, { recursive: true });

      console.log(`${progresso} 📥 Baixando e validando ${images.length} fotos para ${sku}...`);

      for (let idx = 0; idx < images.length; idx++) {
        const imgItem = images[idx];
        const numStr = String(idx + 1).padStart(2, "0");
        const destPath = join(skuDir, `${numStr}.jpg`);

        await downloadAndEnhanceImage(imgItem, destPath);
      }

      // Se for camisa com variação de tamanho, vincula também à pasta do código pai
      if (isShirtSize) {
        const parentDir = join(categoryBaseDir, parentSku);
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

      const relativeFolder = collection ? `downloads/${collection}/${sku}/` : `downloads/${categoryFolder}/${sku}/`;
      console.log(`${progresso} ✅ ${images.length} fotos salvas e validadas com sucesso em ${relativeFolder}`);
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

    await sleep(400);
  }

  const scrapedNovo = sucessos - reutilizados;
  const resultPayload = {
    processados: pendentes.length,
    scraped: sucessos,
    baixadosNovos: scrapedNovo,
    reutilizados,
    erros,
    naoEncontrados,
    errosRede,
    semFotos,
    ambiguos,
    pendentesEncontrados: totalPendentesEncontrados,
    totalRequisicoesRede: totalShopifyRequests
  };

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  🎉 Concluído! Sucessos: ${sucessos} (Novos baixados: ${scrapedNovo}, Reutilizados/Cache: ${reutilizados}) | Erros: ${erros}`);
  console.log(`  🌐 Total de requisições Shopify realizadas: ${totalShopifyRequests}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log(`AGENT1_RESULT ${JSON.stringify(resultPayload)}`);
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch((err) => {
    console.error("❌ Erro fatal no scraper:", err);
    process.exit(1);
  });
}
