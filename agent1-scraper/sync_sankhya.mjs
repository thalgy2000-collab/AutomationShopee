import XLSX from "xlsx";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

const XLS_PATH = "C:\\Users\\marke\\Downloads\\Estoque Douglas IMP.xls";
const CSV_PATH = resolve("lote_d1fae5.csv");
const SANKHYA_MAP_PATH = resolve("../agent2-enricher/sankhya_map.json");
const PRODUTOS_DIR = resolve("../agent2-enricher/produtos");

async function main() {
  // 1. Build map from Excel
  const wb = XLSX.readFile(XLS_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const map = {};
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (row && row[1]) {
      const sku = String(row[1]).trim();
      const sankhya = String(row[2] || "").trim();
      if (sankhya) {
        map[sku] = sankhya;
      }
    }
  }

  console.log(`Mapeados ${Object.keys(map).length} códigos Sankhya da planilha.`);
  await writeFile(SANKHYA_MAP_PATH, JSON.stringify(map, null, 2), "utf-8");
  console.log(`Salvo em ${SANKHYA_MAP_PATH}`);

  // 2. Update CSV
  const csvContent = await readFile(CSV_PATH, "utf-8");
  const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  const updatedRecords = records.map((r) => ({
    sku: r.sku,
    cod_sankhya: map[r.sku] || r.cod_sankhya || "",
    titulo_bruto: r.titulo_bruto,
    status: r.status,
    cor: r.cor,
    classificacao: r.classificacao,
  }));
  await writeFile(CSV_PATH, stringify(updatedRecords, { header: true }), "utf-8");
  console.log(`Atualizado ${CSV_PATH} com coluna cod_sankhya.`);

  // 3. Update JSON files in produtos/
  const files = (await readdir(PRODUTOS_DIR)).filter((f) => f.endsWith(".json"));
  let updatedJsonCount = 0;
  for (const f of files) {
    const fPath = join(PRODUTOS_DIR, f);
    const prod = JSON.parse(await readFile(fPath, "utf-8"));

    const varCodes = [];
    if (Array.isArray(prod.variacoes)) {
      prod.variacoes.forEach((v) => {
        const vSankhya = map[v.sku] || "";
        v.cod_sankhya = vSankhya;
        if (vSankhya && !varCodes.includes(vSankhya)) varCodes.push(vSankhya);
      });
    }

    prod.cod_sankhya = map[prod.sku] || (varCodes.length > 0 ? varCodes.join(", ") : "");
    await writeFile(fPath, JSON.stringify(prod, null, 2), "utf-8");
    updatedJsonCount++;
  }
  console.log(`Atualizados ${updatedJsonCount} arquivos JSON de produtos com cod_sankhya.`);
}

main().catch(console.error);
