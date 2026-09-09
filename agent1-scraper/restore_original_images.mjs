import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse } from "csv-parse/sync";

const DEFAULT_INPUT = "lote_d1fae5.csv";
const DOWNLOADS_DIR = resolve("downloads");
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let inputFile = DEFAULT_INPUT;
  let targetSku = null;
  let limit = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputFile = args[i + 1];
      i++;
    } else if (args[i] === "--sku" && args[i + 1]) {
      targetSku = args[i + 1];
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { inputFile: resolve(inputFile), targetSku, limit };
}

async function fetchProductFromShopify(sku) {
  const cleanSku = String(sku).trim();
  const searchSku = cleanSku.includes("_") ? cleanSku.split("_")[0] : cleanSku;

  const suggestUrl = `https://brkfishing.com.br/search/suggest.json?q=${encodeURIComponent(searchSku)}&resources[type]=product`;
  const res = await fetch(suggestUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const products = data?.resources?.results?.products || [];
  if (products.length === 0) return null;

  const handle = products[0].handle;
  const productRes = await fetch(`https://brkfishing.com.br/products/${handle}.js`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });

  if (!productRes.ok) return null;
  return await productRes.json();
}

async function downloadRawOriginalImage(url, destPath) {
  let fullUrl = url.startsWith("//") ? `https:${url}` : url;
  fullUrl = fullUrl.replace(/(_\d+x\d+|\.compact|\.medium|\.large|\.grande)\./g, ".");

  const response = await fetch(fullUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(destPath, Buffer.from(arrayBuffer));
}

async function main() {
  const { inputFile, targetSku, limit } = parseArgs();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  🔄 RESTAURAÇÃO DE FOTOS ORIGINAIS DO SITE (BRK FISHING)");
  if (targetSku) console.log(`  Alvo SKU: ${targetSku}`);
  if (limit) console.log(`  Limite: ${limit} produtos`);
  console.log("  Ação: Baixar fotos originais puras sem filtros ou compressão");
  console.log("═══════════════════════════════════════════════════════════════\n");

  let skusToProcess = [];

  if (targetSku) {
    skusToProcess = [{ sku: targetSku }];
  } else if (existsSync(inputFile)) {
    const content = await readFile(inputFile, "utf-8");
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    skusToProcess = records;
  }

  if (limit && limit > 0) {
    skusToProcess = skusToProcess.slice(0, limit);
  }

  console.log(`Iniciando restauração para ${skusToProcess.length} produtos...\n`);

  let sucessos = 0;
  let erros = 0;

  for (let i = 0; i < skusToProcess.length; i++) {
    const item = skusToProcess[i];
    const sku = item.sku;
    const progresso = `[${i + 1}/${skusToProcess.length}]`;

    console.log(`${progresso} 🔄 Restaurando originais de ${sku}...`);

    try {
      const shopifyData = await fetchProductFromShopify(sku);
      if (!shopifyData || !shopifyData.images || shopifyData.images.length === 0) {
        console.warn(`${progresso} ⚠️ Não encontrado na Shopify ou sem imagens.`);
        erros++;
        continue;
      }

      const skuDir = join(DOWNLOADS_DIR, sku);
      await mkdir(skuDir, { recursive: true });

      for (let idx = 0; idx < shopifyData.images.length; idx++) {
        const imgUrl = shopifyData.images[idx];
        const numStr = String(idx + 1).padStart(2, "0");
        const destPath = join(skuDir, `${numStr}.jpg`);
        await downloadRawOriginalImage(imgUrl, destPath);
      }

      console.log(`${progresso} ✅ Fotos originais puras restauradas (${shopifyData.images.length} fotos)`);
      sucessos++;
    } catch (err) {
      console.error(`${progresso} ❌ Erro ao restaurar ${sku}:`, err.message);
      erros++;
    }

    await sleep(400);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  🎉 Restauração concluída! Sucessos: ${sucessos} | Erros: ${erros}`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
