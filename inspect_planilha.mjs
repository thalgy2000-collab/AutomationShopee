import XLSX from './agent0-sankhya/node_modules/xlsx/xlsx.mjs';
import fs from 'fs';
import path from 'path';

const filePath = path.resolve('uploads/planilha_sankhya_1789676061110.xlsx');
console.log('Existe?', fs.existsSync(filePath));
if (fs.existsSync(filePath)) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);
  console.log('Total de linhas:', data.length);
  data.forEach((r, i) => console.log(i + 1, r['SKU'], r['Código Sankhya'] || r['cod_sankhya'], r['Descrição'] || r['descricao']));
}
