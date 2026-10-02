import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

const csvPath = 'agent1-scraper/lote_d1fae5.csv';
const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);
const header = lines[0];

const sankhyaMap = JSON.parse(fs.readFileSync('agent2-enricher/sankhya_map.json', 'utf8'));

// Carrega uploads
const uploadsDir = 'uploads';
const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
const skuToSankhyaFromUploads = new Map();

for (const f of files) {
  try {
    const wb = xlsx.readFile(path.join(uploadsDir, f));
    for (const sheetName of wb.SheetNames) {
      const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
      for (const row of rows) {
        if (!row || !Array.isArray(row)) continue;
        let skuFound = null;
        let sankhyaFound = null;
        for (const cell of row) {
          if (!cell) continue;
          const s = String(cell).trim();
          if (/^[A-Z0-9_\-]{3,25}$/i.test(s) && /[A-Z]/i.test(s) && !skuFound) {
            skuFound = s.toUpperCase();
          }
          if (/^\d{3,10}$/.test(s) && !sankhyaFound) {
            sankhyaFound = s;
          }
        }
        if (skuFound && sankhyaFound) {
          skuToSankhyaFromUploads.set(skuFound, sankhyaFound);
          skuToSankhyaFromUploads.set(skuFound.replace(/_FULL$/i, ''), sankhyaFound);
        }
      }
    }
  } catch {}
}

const newLines = [header];
let recoveredCount = 0;
let blankedCount = 0;
let unchangedCount = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const cols = line.split(',');
  const sku = cols[0];
  const sankhya = cols[1] !== undefined ? cols[1].trim() : '';
  const cleanSku = (sku || '').replace(/_FULL$/i, '').toUpperCase();

  // Verifica se é conforme
  if (/^\d{1,16}$/.test(sankhya)) {
    // Conforme - NÃO TOCA
    newLines.push(line);
    unchangedCount++;
  } else {
    // Não conforme (texto descritivo ou vazio)
    const fromMap = sankhyaMap[sku] || sankhyaMap[cleanSku];
    const fromUploads = skuToSankhyaFromUploads.get(sku.toUpperCase()) || skuToSankhyaFromUploads.get(cleanSku);
    const recovered = fromMap || fromUploads || '';

    cols[1] = recovered;
    newLines.push(cols.join(','));

    if (recovered) {
      recoveredCount++;
    } else {
      blankedCount++;
    }
  }
}

fs.writeFileSync(csvPath, newLines.join('\n') + '\n', 'utf8');

console.log(JSON.stringify({
  status: 'SUCESSO',
  linhasOriginais: lines.length - 1,
  linhasProcessadas: newLines.length - 1,
  inalteradas: unchangedCount,
  recuperadasComCodigoReal: recoveredCount,
  esvaziadasSemCorrespondencia: blankedCount
}, null, 2));
