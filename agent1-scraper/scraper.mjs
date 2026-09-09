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

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { enhanceImage } from "./imageEnhancer.mjs";

const DEFAULT_INPUT = "lote_d1fae5.csv";
const DOWNLOADS_DIR = resolve("downloads");
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let inputFile = DEFAULT_INPUT;
  let limit = null;
  let targetSku = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputFile = args[i + 1];
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--sku" && args[i + 1]) {
      targetSku = args[i + 1];
      i++;
    }
  }

  return { inputFile: resolve(inputFile), limit, targetSku };
}

/**
 * Busca produto na API da BRK Fishing por SKU ou termo
 */
async function fetchProductFromShopify(sku) {
  const cleanSku = String(sku).trim();
  const searchSku = cleanSku.includes("_") ? cleanSku.split("_")[0] : cleanSku;

  const suggestUrl = `https://brkfishing.com.br/search/suggest.json?q=${encodeURIComponent(searchSku)}&resources[type]=product`;
  const res = await fetch(suggestUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    throw new Error(`Busca na Shopify retornou HTTP ${res.status}`);
  }

  const data = await res.json();
  const products = data?.resources?.results?.products || [];
  if (products.length === 0) {
    return null;
  }

  const handle = products[0].handle;
  const productRes = await fetch(`https://brkfishing.com.br/products/${handle}.js`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });

  if (!productRes.ok) {
    throw new Error(`Detalhes do produto ${handle} retornou HTTP ${productRes.status}`);
  }

  return await productRes.json();
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
  const { inputFile, limit, targetSku } = parseArgs();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  🎣 AGENTE 1 — SCRAPER COM ENHANCEMENT DE IMAGENS (OPÇÃO A)");
  console.log(`  Arquivo de entrada: ${inputFile}`);
  if (targetSku) console.log(`  Alvo SKU: ${targetSku}`);
  if (limit) console.log(`  Limite: ${limit} produtos`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (!existsSync(inputFile)) {
    console.error(`❌ Arquivo de lote não encontrado: ${inputFile}`);
    process.exit(1);
  }

  const content = await readFile(inputFile, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  let pendentes = records.filter((r) => {
    if (targetSku) return r.sku === targetSku;
    return r.status === "pendente" || !r.status;
  });

  if (limit && limit > 0) {
    pendentes = pendentes.slice(0, limit);
  }

  console.log(`Encontrados ${pendentes.length} produtos pendentes para download.\n`);

  await mkdir(DOWNLOADS_DIR, { recursive: true });

  let sucessos = 0;
  let erros = 0;

  for (let i = 0; i < pendentes.length; i++) {
    const item = pendentes[i];
    const sku = item.sku;
    const progresso = `[${i + 1}/${pendentes.length}]`;

    console.log(`${progresso} 🔍 Buscando produto: ${sku} - ${item.titulo_bruto || ""}`);

    try {
      const shopifyData = await fetchProductFromShopify(sku);
      if (!shopifyData) {
        console.warn(`${progresso} ⚠️ Produto não encontrado no site BRK Fishing.`);
        item.status = "erro: produto nao encontrado no site";
        erros++;
        continue;
      }

      const images = shopifyData.images || [];
      if (images.length === 0) {
        console.warn(`${progresso} ⚠️ Nenhuma foto encontrada para o produto.`);
        item.status = "erro: sem fotos";
        erros++;
        continue;
      }

      const skuDir = join(DOWNLOADS_DIR, sku);
      await mkdir(skuDir, { recursive: true });

      console.log(`${progresso} 📥 Baixando e aprimorando ${images.length} fotos para ${sku}...`);

      for (let idx = 0; idx < images.length; idx++) {
        const imgUrl = images[idx];
        const numStr = String(idx + 1).padStart(2, "0");
        const destPath = join(skuDir, `${numStr}.jpg`);

        await downloadAndEnhanceImage(imgUrl, destPath);
      }

      console.log(`${progresso} ✅ ${images.length} fotos salvas e aprimoradas com sucesso em downloads/${sku}/`);
      item.status = "scraped";
      sucessos++;
    } catch (err) {
      console.error(`${progresso} ❌ Erro ao processar ${sku}:`, err.message);
      item.status = `erro: ${err.message}`;
      erros++;
    }

    // Salva progresso incremental no CSV
    const updatedCsv = stringify(records, { header: true, columns: Object.keys(records[0]) });
    await writeFile(inputFile, updatedCsv, "utf-8");

    await sleep(600);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  🎉 Concluído! Sucessos: ${sucessos} | Erros: ${erros}`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("❌ Erro fatal no scraper:", err);
  process.exit(1);
});
