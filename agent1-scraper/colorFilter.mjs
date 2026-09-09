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
  const c = cfb.read(filePath, { type: "file" });
  const wbEntry = cfb.find(c, "/Workbook");
  if (!wbEntry) {
    throw new Error("Não foi possível encontrar a stream do Workbook no arquivo Excel.");
  }
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
  const rowColors = {};
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

  // 3. Ler dados da planilha usando SheetJS
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const normTarget = targetColor ? normalizeHexColor(targetColor) : null;
  const items = [];

  for (let r = 1; r < sheetData.length; r++) {
    const row = sheetData[r];
    if (!row || !row[1]) continue;

    const rowColor = rowColors[r] || "SEM_COR";
    if (normTarget && rowColor !== normTarget) {
      continue;
    }

    items.push({
      linha: r,
      sku: String(row[1]).trim(),
      cod_sankhya: String(row[2] || "").trim(),
      titulo_bruto: String(row[3] || "").trim(),
      status: "pendente",
      cor: rowColor,
      classificacao: String(row[6] || "").trim(),
    });
  }

  return items;
}
