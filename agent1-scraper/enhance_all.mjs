import { enhanceDirectory } from "./imageEnhancer.mjs";
import { resolve } from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  let dir = resolve("downloads");
  let sku = null;
  let limit = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && args[i + 1]) {
      dir = resolve(args[i + 1]);
      i++;
    } else if (args[i] === "--sku" && args[i + 1]) {
      sku = args[i + 1];
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { dir, sku, limit };
}

async function main() {
  const { dir, sku, limit } = parseArgs();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  📸 OTIMIZAÇÃO DE QUALIDADE DE IMAGENS — OPÇÃO A (SHARP.JS)");
  console.log(`  Diretório: ${dir}`);
  if (sku) console.log(`  Filtro SKU: ${sku}`);
  if (limit) console.log(`  Limite: ${limit} imagens`);
  console.log("  Pipeline: Nitidez Adaptativa + Contraste + Boost de Cor + MozJPEG");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const startTime = Date.now();

  const results = await enhanceDirectory(dir, {
    skuFilter: sku,
    limit,
    onProgress: ({ current, total, file, result, error }) => {
      const fileName = file.split(/[\\/]/).slice(-2).join("/");
      if (error) {
        console.error(`  [${current}/${total}] ❌ ${fileName}: ${error}`);
      } else {
        const sizeBeforeKb = (result.sizeBefore / 1024).toFixed(1);
        const sizeAfterKb = (result.sizeAfter / 1024).toFixed(1);
        console.log(
          `  [${current}/${total}] ✨ ${fileName} (${result.width}x${result.height}) | ${sizeBeforeKb}KB ➜ ${sizeAfterKb}KB`
        );
      }
    },
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  ✅ Processamento concluído em ${durationSec}s!`);
  console.log(`  Total de imagens melhoradas: ${results.totalProcessed}`);
  if (results.totalErrors > 0) {
    console.log(`  ⚠️ Erros encontrados: ${results.totalErrors}`);
  }
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("❌ Falha na execução:", err);
  process.exit(1);
});
