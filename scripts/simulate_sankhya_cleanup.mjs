import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

const csvPath = 'agent1-scraper/lote_d1fae5.csv';
const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);
const header = lines[0];

const sankhyaMap = JSON.parse(fs.readFileSync('agent2-enricher/sankhya_map.json', 'utf8'));

// Carrega dados de uploads
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

let emptyCount = 0;
let validCount = 0;
let nonConformCount = 0;
let recoverableCount = 0;
let blankedCount = 0;

const simExamples = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const cols = line.split(',');
  const sku = cols[0];
  const sankhya = cols[1] !== undefined ? cols[1].trim() : '';
  const cleanSku = (sku || '').replace(/_FULL$/i, '').toUpperCase();

  if (!sankhya) {
    emptyCount++;
  } else if (/^\d{1,16}$/.test(sankhya)) {
    validCount++;
  } else {
    nonConformCount++;
    const fromMap = sankhyaMap[sku] || sankhyaMap[cleanSku];
    const fromUploads = skuToSankhyaFromUploads.get(sku.toUpperCase()) || skuToSankhyaFromUploads.get(cleanSku);
    const recovered = fromMap || fromUploads || null;

    if (recovered) {
      recoverableCount++;
    } else {
      blankedCount++;
    }

    if (simExamples.length < 10) {
      simExamples.push({
        line: i + 1,
        sku,
        texto_atual: sankhya.slice(0, 45) + '...',
        recuperavel_de: fromMap ? 'sankhya_map.json' : (fromUploads ? 'uploads/*.xlsx' : 'NENHUM (deixar vazio)'),
        codigo_recuperado: recovered
      });
    }
  }
}

console.log(JSON.stringify({
  totalLinhasDados: lines.length - 1,
  jaValidosNumericos: validCount,
  jaVazios: emptyCount,
  naoConformesComTexto: nonConformCount,
  recuperaveisComCodigoReal: recoverableCount,
  irrecuperaveisFicamVazios: blankedCount,
  exemplos: simExamples
}, null, 2));
