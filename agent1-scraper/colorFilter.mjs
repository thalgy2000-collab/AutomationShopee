import cfb from "cfb";
import XLSX from "xlsx";

/**
 * Normaliza uma string de cor hex (adiciona '#' se faltar e coloca em maiúsculas).
 */
export function normalizeHexColor(hex) {
  if (!hex) return "";
  let clean = hex.trim().toUpperCase();
  if (!clean.startsWith("#")) {
    clean = "#" + clean;
  }
  return clean;
}

/**
 * Lê uma planilha Excel BIFF8 (.xls) e extrai os produtos junto com as cores
 * hexadecimais reais de preenchimento de cada linha (via registros XFEXT).
 *
 * @param {string} filePath - Caminho do arquivo .xls
 * @param {string} [targetColor] - Cor hexadecimal para filtrar (ex: '#D1FAE5')
 * @returns {Array<{ sku: string, titulo_bruto: string, status: string, cor: string, classificacao: string, linha: number }>}
 */
export function extractProductsFromXls(filePath, targetColor = null) {
  const rowColors = {};
  const isXlsx = filePath.toLowerCase().endsWith(".xlsx");

  if (!isXlsx) {
    try {
      const c = cfb.read(filePath, { type: "file" });
      const wbEntry = cfb.find(c, "/Workbook");
      if (wbEntry) {
        const buf = Buffer.from(wbEntry.content);

        // 1. Mapear cores dos registros XFEXT (código 0x87d)
        const xfColors = {};
        let offset = 0;
        while (offset < buf.length - 4) {
          const code = buf.readUInt16LE(offset);
          const length = buf.readUInt16LE(offset + 2);
          if (code === 0x87d) {
            const xfId = buf.readUInt32LE(offset + 18);
            const recSlice = buf.slice(offset + 4, offset + 4 + length);
            // Tag de cor de preenchimento (fill color RGBA)
            const tagIdx = recSlice.indexOf(Buffer.from([0x04, 0x00, 0x14, 0x00, 0x02, 0x00, 0x00, 0x00]));
            if (tagIdx !== -1 && tagIdx + 11 <= recSlice.length) {
              const r = recSlice[tagIdx + 8];
              const g = recSlice[tagIdx + 9];
              const b = recSlice[tagIdx + 10];
              const hex = "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
              xfColors[xfId] = hex;
            }
          }
          offset += 4 + length;
        }

        // 2. Mapear cores de cada linha com base nas células
        offset = 0;
        while (offset < buf.length - 4) {
          const code = buf.readUInt16LE(offset);
          const length = buf.readUInt16LE(offset + 2);
          if (code === 0x027e || code === 0x00fd || code === 0x0203) {
            // RK, LABELSST ou NUMBER
            const row = buf.readUInt16LE(offset + 4);
            const xf = buf.readUInt16LE(offset + 8);
            if (!rowColors[row] && xfColors[xf]) {
              rowColors[row] = xfColors[xf];
            }
          } else if (code === 0x00bd) {
            // MULRK
            const row = buf.readUInt16LE(offset + 4);
            const xf = buf.readUInt16LE(offset + 8);
            if (!rowColors[row] && xfColors[xf]) {
              rowColors[row] = xfColors[xf];
            }
          }
          offset += 4 + length;
        }
      }
    } catch (cfbErr) {
      // Arquivo sem streams BIFF8 legados, segue com SheetJS
    }
  }

  // 3. Ler dados da planilha usando SheetJS
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const normTarget = targetColor ? normalizeHexColor(targetColor) : null;
  const hasRowColors = Object.keys(rowColors).length > 0;
  const items = [];

  // Detecta dinamicamente a linha de cabeçalho e os índices das colunas
  let headerRowIdx = -1;
  let colSku = -1;
  let colSankhya = -1;
  let colDesc = -1;
  let colClass = -1;

  for (let r = 0; r < Math.min(sheetData.length, 10); r++) {
    const row = sheetData[r] || [];
    const rowStr = row.map((c) => String(c || "").toLowerCase().trim());
    const hasDesc = rowStr.some((c) => c.includes("descri") || c.includes("produto") || c.includes("titulo"));
    const hasCode = rowStr.some((c) => c.includes("código") || c.includes("codigo") || c.includes("sku") || c.includes("referência") || c.includes("referencia"));

    if (hasDesc && hasCode) {
      headerRowIdx = r;
      for (let c = 0; c < row.length; c++) {
        const h = String(row[c] || "").toLowerCase().trim();
        if (h.includes("sku") || h.includes("referência") || h.includes("referencia") || h.includes("anterior 2") || h.includes("sistema anterior")) {
          if (colSku === -1 || h.includes("sku") || h.includes("referência") || h.includes("referencia")) {
            colSku = c;
          }
        }
        if (h.includes("sankhya") || h === "código" || h === "codigo" || h === "cod_sankhya" || h === "cód. sankhya") {
          colSankhya = c;
        }
        if (h.includes("descri") || h.includes("descricao") || h.includes("título") || h.includes("titulo")) {
          colDesc = c;
        }
        if (h.includes("categoria") || h.includes("classifica") || h.includes("grupo")) {
          colClass = c;
        }
      }
      break;
    }
  }

  // Fallbacks para formato Douglas caso não localize os nomes
  if (colSku === -1) colSku = 1;
  if (colSankhya === -1) colSankhya = 2;
  if (colDesc === -1) colDesc = 3;
  if (colClass === -1) colClass = 6;
  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 1;

  for (let r = startRow; r < sheetData.length; r++) {
    const row = sheetData[r];
    if (!row) continue;

    const rawSku = String(row[colSku] || "").trim();
    const rawSankhya = String(row[colSankhya] || "").trim();
    const rawDesc = String(row[colDesc] || "").trim();

    // Se SKU estiver vazio ou for string genérica de sistema, tenta extrair da descrição ou do código
    let finalSku = rawSku;
    if (!finalSku || finalSku.toLowerCase().includes("venda") || finalSku.toLowerCase().includes("fabricação")) {
      const match = rawDesc.match(/^([A-Z0-9_-]+)\s*-\s*/i);
      if (match) {
        finalSku = match[1].trim();
      } else if (rawSankhya && /^\d+$/.test(rawSankhya)) {
        finalSku = rawSankhya;
      }
    }

    if (!finalSku && !rawDesc) continue;

    const rowColor = rowColors[r] || "SEM_COR";
    if (hasRowColors && normTarget && rowColor !== normTarget) {
      continue;
    }

    items.push({
      linha: r,
      sku: finalSku || rawSankhya,
      cod_sankhya: rawSankhya,
      titulo_bruto: rawDesc,
      status: "pendente",
      cor: rowColor,
      classificacao: String(row[colClass] || "").trim(),
    });
  }

  return items;
}
