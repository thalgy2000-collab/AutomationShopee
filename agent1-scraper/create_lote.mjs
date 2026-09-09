import { extractProductsFromXls, normalizeHexColor } from "./colorFilter.mjs";
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

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      xlsPath = args[i + 1];
      i++;
    } else if (args[i] === "--color" && args[i + 1]) {
      color = args[i + 1];
      i++;
    } else if (args[i] === "--output" && args[i + 1]) {
      outPath = args[i + 1];
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  const colorFilter = color && !["TODAS", "ALL", "SEM_FILTRO", "NULL"].includes(color.trim().toUpperCase())
    ? normalizeHexColor(color)
    : null;

  return {
    xlsPath: resolve(xlsPath),
    color: colorFilter,
    outPath: resolve(outPath),
    limit,
  };
}

async function main() {
  const { xlsPath, color, outPath, limit } = parseArgs();

  console.log("═══════════════════════════════════════════════════");
  console.log("  Extração de Produtos por Cor");
  console.log(`  Planilha: ${xlsPath}`);
  console.log(`  Filtro de cor: ${color}`);
  console.log("═══════════════════════════════════════════════════");

  const items = extractProductsFromXls(xlsPath, color);
  console.log(`\nEncontrados ${items.length} produtos com a cor ${color}`);

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

main().catch((err) => {
  console.error("❌ Erro ao extrair lote:", err);
  process.exit(1);
});
