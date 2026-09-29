import fs from 'node:fs';

const xml = fs.readFileSync('scratch/xlsx_1/xl/worksheets/sheet1.xml', 'utf-8');
const regex = /<c\s+r="([A-Z]+)(\d+)"[^>]*s="1"/g;

const coloredRows = new Set();
let match;
while ((match = regex.exec(xml)) !== null) {
  coloredRows.add(parseInt(match[2], 10));
}

console.log('Total de linhas coloridas com D8E4BC (estilo s=1):', coloredRows.size);
console.log('Linhas:', Array.from(coloredRows).slice(0, 20));

// Mapeia essas linhas para os IDs de Item ou SKUs
import XLSX from './agent3-rpa-magis5/node_modules/xlsx/xlsx.js';
const wb = XLSX.readFile('scratch/locked_copy.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // array de arrays, linha 1 é índice 0

const greenProducts = [];
for (const rowNum of coloredRows) {
  const rowData = data[rowNum - 1]; // linha 1 do excel é índice 0
  if (rowData) {
    greenProducts.push({
      rowNum,
      itemId: rowData[0], // ID do Item
      sku: rowData[1],    // SKU Principal
      nome: rowData[2]    // Produto
    });
  }
}

console.log(`\nProdutos mapeados na cor D8E4BC: ${greenProducts.length}`);
console.log('Primeiros 5 exemplos:');
console.log(greenProducts.slice(0, 5));
