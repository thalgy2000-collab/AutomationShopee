/**
 * sync_concluidos_douglas.mjs
 *
 * Realiza conferência na planilha "Estoque Douglas IMP.xls",
 * identifica todos os produtos/linhas pintados nas cores:
 *   - #47D359 (60% Ênfase 3 / Verde)
 *   - #83E28E (40% Ênfase 3 / Verde Claro)
 *
 * E atualiza:
 *   1. lote_d1fae5.csv com status="concluido" e respectiva cor
 *   2. produtos/*.json com is_published=true e status="concluido"
 *   3. Supabase (tabela produtos_shopee)
 *   4. Recompila relatorio.html (dashboard)
 *   5. Salva cópia atualizada do Excel com a coluna de status
 */

import fs from "node:fs";
import { resolve, join } from "node:path";
import cfb from "cfb";
import XLSX from "xlsx";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { extractParentSku } from "../agent2-enricher/grouping.mjs";
import { generateReport } from "../agent2-enricher/report.mjs";
const envPath = resolve("../agent2-enricher/.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      process.env[key] = val;
    }
  }
}
const { upsertProduct } = await import("../agent2-enricher/supabase_db.mjs");

const XLS_PATH = "C:/Users/marke/Downloads/Estoque Douglas IMP.xls";
const CSV_PATH = resolve("lote_d1fae5.csv");
const PRODUTOS_DIR = resolve("../agent2-enricher/produtos");
const DOWNLOADS_DIR = resolve("downloads");

async function main() {
  console.log("===============================================================");
  console.log("  Conferência da Planilha Estoque Douglas IMP.xls");
  console.log("  Cores Alvo: #47D359 e #83E28E");
  console.log("===============================================================\n");

  if (!fs.existsSync(XLS_PATH)) {
    throw new Error(`Planilha não encontrada em ${XLS_PATH}`);
  }

  // 1. Ler workbook binário BIFF8
  const c = cfb.read(XLS_PATH, { type: "file" });
  const wbEntry = cfb.find(c, "/Workbook");
  const buf = Buffer.from(wbEntry.content);

  // Mapear XFEXT para cores de preenchimento
  const xfFillColor = {};
  let offset = 0;
  while (offset < buf.length - 4) {
    const code = buf.readUInt16LE(offset);
    const length = buf.readUInt16LE(offset + 2);
    if (code === 0x087d) {
      const d = buf.slice(offset + 4, offset + 4 + length);
      const xfId = d.readUInt32LE(14);
      const tagFill = Buffer.from([0x04, 0x00, 0x14, 0x00]);
      const fIdx = d.indexOf(tagFill);
      if (fIdx !== -1) {
        const pSlice = d.slice(fIdx + 4, fIdx + 24);
        const colorType = pSlice.readUInt16LE(0);
        if (colorType === 2) {
          const hex = "#" + [pSlice[4], pSlice[5], pSlice[6]].map(x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
          xfFillColor[xfId] = hex;
        } else if (colorType === 3) {
          const tint = pSlice.readUInt16LE(2).toString(16);
          const themeId = pSlice.readUInt32LE(4);
          if (themeId === 6 && tint === "4ccc") xfFillColor[xfId] = "#83E28E";
          else if (themeId === 6 && tint === "3332") xfFillColor[xfId] = "#47D359";
        }
      }
    }
    offset += 4 + length;
  }

  // Mapear células por linha
  offset = 0;
  const rowColorMap = {};
  while (offset < buf.length - 4) {
    const code = buf.readUInt16LE(offset);
    const length = buf.readUInt16LE(offset + 2);
    if (code === 0x027e || code === 0x00fd || code === 0x0203 || code === 0x0201) {
      const r = buf.readUInt16LE(offset + 4);
      const col = buf.readUInt16LE(offset + 6);
      const xf = buf.readUInt16LE(offset + 8);
      const color = xfFillColor[xf];
      if (color) {
        if (!rowColorMap[r]) rowColorMap[r] = {};
        rowColorMap[r][col] = color;
      }
    }
    offset += 4 + length;
  }

  // Ler dados SheetJS
  const wb = XLSX.readFile(XLS_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const targetItems = [];
  const targetSkuMap = new Map();

  for (const rStr of Object.keys(rowColorMap)) {
    const r = parseInt(rStr, 10);
    const cols = rowColorMap[r];
    const rowVals = Object.values(cols);
    const rowData = sheetData[r] || [];
    const sku = String(rowData[1] || "").trim();
    const sankhya = String(rowData[2] || "").trim();
    const title = String(rowData[3] || "").trim();

    let matchedColor = null;
    if (rowVals.includes("#47D359")) matchedColor = "#47D359";
    else if (rowVals.includes("#83E28E")) matchedColor = "#83E28E";

    if (matchedColor && sku) {
      const item = {
        linhaExcel: r + 1,
        sku,
        sankhya,
        title,
        color: matchedColor,
        parentSku: extractParentSku(sku)
      };
      targetItems.push(item);
      targetSkuMap.set(sku, item);
    }
  }

  console.log(`✅ Total de linhas identificadas com preenchimento verde: ${targetItems.length}`);
  const count47 = targetItems.filter(t => t.color === "#47D359").length;
  const count83 = targetItems.filter(t => t.color === "#83E28E").length;
  console.log(`   • Cor #47D359 (60% Ênfase 3): ${count47} SKUs`);
  console.log(`   • Cor #83E28E (40% Ênfase 3): ${count83} SKUs\n`);

  // 2. Atualizar lote_d1fae5.csv
  console.log("Atualizando lote_d1fae5.csv...");
  const csvContent = fs.readFileSync(CSV_PATH, "utf-8");
  const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true, bom: true });

  let updatedCsvRows = 0;
  for (const r of records) {
    if (targetSkuMap.has(r.sku)) {
      const match = targetSkuMap.get(r.sku);
      r.status = "concluido";
      r.cor = match.color;
      updatedCsvRows++;
    }
  }
  fs.writeFileSync(CSV_PATH, stringify(records, { header: true }), "utf-8");
  console.log(`✅ ${updatedCsvRows} linhas atualizadas no CSV com status='concluido'!\n`);

  // 3. Atualizar JSONs em produtos/
  console.log("Atualizando JSONs em produtos/...");
  const files = fs.readdirSync(PRODUTOS_DIR).filter(f => f.endsWith(".json"));
  let updatedJsonCount = 0;
  const parentsUpdated = new Set();

  for (const file of files) {
    const fPath = join(PRODUTOS_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(fPath, "utf-8"));
      let changed = false;

      // Se o pai direto é um target
      if (targetSkuMap.has(data.sku) || targetSkuMap.has(data.parent_sku)) {
        data.is_published = true;
        data.status = "concluido";
        changed = true;
        parentsUpdated.add(data.sku);
      }

      // Se alguma variação é um target
      if (Array.isArray(data.variacoes)) {
        for (const v of data.variacoes) {
          if (targetSkuMap.has(v.sku)) {
            v.is_published = true;
            v.status = "concluido";
            data.is_published = true;
            data.status = "concluido";
            changed = true;
            parentsUpdated.add(data.sku);
          }
        }
      }

      if (changed) {
        fs.writeFileSync(fPath, JSON.stringify(data, null, 2), "utf-8");
        updatedJsonCount++;
        try {
          await upsertProduct(data);
        } catch (dbErr) {
          console.warn(`Aviso ao atualizar Supabase para ${data.sku}:`, dbErr.message);
        }
      }
    } catch (err) {
      console.error(`Erro ao atualizar ${file}:`, err.message);
    }
  }
  console.log(`✅ ${updatedJsonCount} produtos pai atualizados no disco e sincronizados no Supabase!\n`);

  // 4. Recompilar relatório HTML
  console.log("Regenerando dashboard HTML relatorio.html...");
  await generateReport(PRODUTOS_DIR, DOWNLOADS_DIR, CSV_PATH);
  console.log("✅ Dashboard HTML atualizado com sucesso!\n");

  // 5. Salvar cópia atualizada do Excel
  console.log("Gerando planilha Excel atualizada com coluna de conferência...");
  try {
    const updatedSheetData = sheetData.map((row, idx) => {
      if (idx === 0) {
        return [...row, "STATUS SHOPEE AUTOMAÇÃO"];
      }
      const sku = String(row[1] || "").trim();
      const match = targetSkuMap.get(sku);
      const statusText = match ? `CONCLUÍDO (${match.color})` : (row[4] || "");
      return [...row, statusText];
    });

    const newWs = XLSX.utils.aoa_to_sheet(updatedSheetData);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, newWs, "Estoque Conferido");
    
    const exportPath = "C:/Users/marke/Downloads/Estoque Douglas IMP - Conferido.xlsx";
    XLSX.writeFile(newWb, exportPath);
    console.log(`✅ Cópia do Excel gerada em: ${exportPath}`);
  } catch (err) {
    console.warn("Aviso ao salvar cópia do Excel:", err.message);
  }

  console.log("\n🎉 Processo de conferência e marcação de concluídos 100% finalizado!");
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
