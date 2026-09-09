import { loadAndValidateAll } from "./src/checkpoint.mjs";
import { CSV_PATH, COLOR_PUBLISHED } from "./src/config.mjs";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse } from "csv-parse/sync";

async function main() {
  const checkpoint = await loadAndValidateAll();
  let csvRecords = [];
  const csvMap = {};
  if (existsSync(CSV_PATH)) {
    const csvContent = await readFile(CSV_PATH, "utf-8");
    csvRecords = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    csvRecords.forEach(r => { csvMap[r.sku] = r; });
  }

  const candidates = checkpoint.items.filter(i => i.valid);
  const toProcess = [];

  for (const item of candidates) {
    const csvRow = csvMap[item.sku] || {};
    const isPublished = item.product.is_published === true ||
      item.product.status === "concluido" ||
      csvRow.status === "publicado" ||
      csvRow.status === "concluido" ||
      csvRow.cor === COLOR_PUBLISHED ||
      csvRow.cor === "#47D359";

    if (!isPublished) {
      toProcess.push(item);
    }
  }

  console.log(`Total de produtos no catálogo: ${checkpoint.total}`);
  console.log(`Total já concluídos / publicados: ${checkpoint.total - toProcess.length}`);
  console.log(`Total pendentes para criação na Magis5: ${toProcess.length}\n`);

  const top10 = toProcess.slice(0, 10);
  console.log("=================== TOP 10 CANDIDATOS ===================");
  top10.forEach((item, idx) => {
    const p = item.product;
    const varCount = p.variacoes ? p.variacoes.length : 0;
    const priceText = p.preco?.preco_sem_promocao ? `R$ ${p.preco.preco_sem_promocao.toFixed(2)}` : "N/A";
    const promoText = p.preco?.em_promocao ? ` (Promoção: R$ ${p.preco.preco_com_promocao.toFixed(2)})` : "";
    console.log(`${idx + 1}. [${p.sku}] - ${p.titulo_shopee}`);
    console.log(`   Tipo: ${varCount > 0 ? `${varCount} Variações` : "Simples"} | Preço: ${priceText}${promoText} | Marca: ${p.marca || "N/A"}`);
    if (varCount > 0) {
      console.log(`   Variações: ${p.variacoes.map(v => `${v.nome || v.sku} (${v.sku})`).join(", ")}`);
    }
  });
}

main().catch(console.error);
