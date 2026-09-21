import { extractProductsFromXls, normalizeHexColor } from "./colorFilter.mjs";
import { getCollectionNameFromFilename } from "./scraper.mjs";
import { writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { stringify } from "csv-stringify/sync";

const DEFAULT_XLS = "C:\\Users\\marke\\Downloads\\Estoque Douglas IMP.xls";
const DEFAULT_COLOR = "#D1FAE5";

function parseArgs() {
  const args = process.argv.slice(2);
  let xlsPath = DEFAULT_XLS;
  let color = DEFAULT_COLOR;
  let outPath = "lote_d1fae5.csv";
  let limit = null;
  let collection = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input") {
      const parts = [];
      i++;
      while (i < args.length && !args[i].startsWith("--")) {
        parts.push(args[i]);
        i++;
      }
      xlsPath = parts.join(" ").replace(/^["']|["']$/g, "");
      i--;
    } else if (args[i] === "--color" && args[i + 1]) {
      color = args[i + 1].replace(/^["']|["']$/g, "");
      i++;
    } else if (args[i] === "--output" && args[i + 1]) {
      outPath = args[i + 1].replace(/^["']|["']$/g, "");
      i++;
    } else if (args[i] === "--collection" && args[i + 1]) {
      collection = args[i + 1].replace(/^["']|["']$/g, "").trim();
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  const colorFilter = color && !["TODAS", "ALL", "SEM_FILTRO", "NULL"].includes(color.trim().toUpperCase())
    ? normalizeHexColor(color)
    : null;

  if (!collection && xlsPath) {
    collection = getCollectionNameFromFilename(xlsPath);
  }

  return {
    xlsPath: resolve(xlsPath),
    color: colorFilter,
    outPath: resolve(outPath),
    limit,
    collection,
  };
}

async function main() {
  const { xlsPath, color, outPath, limit, collection } = parseArgs();

  console.log("═══════════════════════════════════════════════════");
  console.log("  Extração de Produtos por Cor");
  console.log(`  Planilha: ${xlsPath}`);
  console.log(`  Filtro de cor: ${color}`);
  if (collection) console.log(`  Coleção: ${collection}`);
  console.log("═══════════════════════════════════════════════════");

  let items = extractProductsFromXls(xlsPath, color);
  console.log(`\nEncontrados ${items.length} produtos com a cor ${color}`);

  if (items.length === 0 && color) {
    const allItems = extractProductsFromXls(xlsPath, null);
    if (allItems.length > 0) {
      console.log(`💡 A planilha não possui células com a cor ${color}.`);
      console.log(`👉 Carregando automaticamente todos os ${allItems.length} produtos encontrados na planilha.`);
      items = allItems;
    }
  }

  const selected = limit && limit > 0 ? items.slice(0, limit) : items;
  if (limit) {
    console.log(`Aplicando limite: exportando ${selected.length} produtos.`);
  }

  // Prepara registros para o CSV do scraper
  const records = selected.map((item) => ({
    sku: item.sku,
    cod_sankhya: item.cod_sankhya,
    titulo_bruto: item.titulo_bruto,
    status: "pendente",
    cor: item.cor,
    classificacao: item.classificacao,
    colecao: collection || "",
  }));

  const csvContent = stringify(records, { header: true });
  await writeFile(outPath, csvContent, "utf-8");

  console.log(`\n✅ Arquivo gerado com sucesso: ${outPath}`);
  console.log(`Total de SKUs prontos para o scraper: ${records.length}\n`);

  console.log("Exemplos de produtos extraídos:");
  selected.slice(0, 5).forEach((p, idx) => {
    console.log(`  ${idx + 1}. SKU: ${p.sku} | ${p.titulo_bruto.substring(0, 45)}...`);
  });
}

import { fileURLToPath } from "node:url";

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch((err) => {
    console.error("❌ Erro ao extrair lote:", err);
    process.exit(1);
  });
}
