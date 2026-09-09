import { readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";

const DOWNLOADS_DIR = resolve("downloads");
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchShopifyProduct(query) {
  const clean = String(query).trim().replace(/[_\s-]+/g, " ");
  // Tenta busca exata
  const suggestUrl = `https://brkfishing.com.br/search/suggest.json?q=${encodeURIComponent(clean)}&resources[type]=product`;
  try {
    const res = await fetch(suggestUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const products = data?.resources?.results?.products || [];
    if (products.length === 0) return null;

    const handle = products[0].handle;
    const pRes = await fetch(`https://brkfishing.com.br/products/${handle}.js`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (!pRes.ok) return null;
    return await pRes.json();
  } catch {
    return null;
  }
}

async function downloadOriginal(url, destPath) {
  let fullUrl = url.startsWith("//") ? `https:${url}` : url;
  fullUrl = fullUrl.replace(/(_\d+x\d+|\.compact|\.medium|\.large|\.grande)\./g, ".");

  const response = await fetch(fullUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(destPath, Buffer.from(arrayBuffer));
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  🔄 RESTAURAÇÃO TOTAL DAS PASTAS FÍSICAS (BRK FISHING)");
  console.log(`  Diretório: ${DOWNLOADS_DIR}`);
  console.log("  Ação: Mapear e restaurar 100% das fotos alteradas direto da CDN");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // 1. Varrer todos os arquivos .jpg que foram tocados durante o horário do enhance (16:13 - 16:26)
  const modifiedFiles = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".jpg")) {
        const s = await stat(fullPath);
        const d = new Date(s.mtime);
        const hours = d.getHours();
        const mins = d.getMinutes();
        if (hours === 16 && mins >= 13 && mins <= 26) {
          modifiedFiles.push({ path: fullPath, size: s.size });
        }
      }
    }
  }

  await walk(DOWNLOADS_DIR);
  console.log(`Encontrados ${modifiedFiles.length} arquivos que precisam ser restaurados.\n`);

  // Agrupar por pasta pai de primeiro nível dentro de downloads
  const groups = {};
  for (const item of modifiedFiles) {
    const rel = item.path.replace(DOWNLOADS_DIR, "").replace(/^[\\/]/, "");
    const topFolder = rel.split(/[\\/]/)[0];
    if (!groups[topFolder]) groups[topFolder] = [];
    groups[topFolder].push(item.path);
  }

  const topFolders = Object.keys(groups);
  console.log(`Agrupados em ${topFolders.length} pastas de produtos.\n`);

  let totalRestored = 0;
  let totalErrors = 0;

  for (let i = 0; i < topFolders.length; i++) {
    const folder = topFolders[i];
    const files = groups[folder];
    const progresso = `[${i + 1}/${topFolders.length}]`;

    console.log(`${progresso} 📦 Buscando produto para pasta "${folder}" (${files.length} fotos)...`);

    // Busca na Shopify
    let productData = await fetchShopifyProduct(folder);
    if (!productData && folder.includes("-")) {
      productData = await fetchShopifyProduct(folder.split("-")[0]);
    }
    if (!productData && folder.includes("_")) {
      productData = await fetchShopifyProduct(folder.split("_")[0]);
    }

    if (!productData || !productData.images || productData.images.length === 0) {
      console.warn(`  ⚠️ Produto "${folder}" não encontrado diretamente na Shopify BRK.`);
      totalErrors += files.length;
      continue;
    }

    const images = productData.images;
    console.log(`  🔍 Encontradas ${images.length} fotos oficiais na Shopify. Restaurando...`);

    for (const filePath of files) {
      const fileName = basename(filePath); // ex: 01.jpg
      const matchNum = fileName.match(/^(\d+)\.jpg$/i);
      let imgUrl = null;

      if (matchNum) {
        const idx = parseInt(matchNum[1], 10) - 1;
        if (idx >= 0 && idx < images.length) {
          imgUrl = images[idx];
        } else {
          // Se o número for maior, pega a última imagem oficial
          imgUrl = images[images.length - 1];
        }
      } else {
        imgUrl = images[0];
      }

      if (imgUrl) {
        try {
          await downloadOriginal(imgUrl, filePath);
          totalRestored++;
          const relPath = filePath.replace(DOWNLOADS_DIR, "").replace(/^[\\/]/, "");
          console.log(`  ✅ Restaurado: ${relPath}`);
        } catch (err) {
          console.error(`  ❌ Erro ao baixar para ${filePath}: ${err.message}`);
          totalErrors++;
        }
      }
      await sleep(150);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  🎉 Processo Concluído!`);
  console.log(`  Total de fotos restauradas para original puro: ${totalRestored}`);
  console.log(`  Erros/não encontrados: ${totalErrors}`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
