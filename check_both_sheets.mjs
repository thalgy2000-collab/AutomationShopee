import fs from 'node:fs';
import XLSX from './agent3-rpa-magis5/node_modules/xlsx/xlsx.js';

function inspectFile(label, xmlPath, filePath) {
  if (!fs.existsSync(xmlPath)) {
    console.log(`[${label}] Arquivo não existe: ${xmlPath}`);
    return;
  }
  const xml = fs.readFileSync(xmlPath, 'utf-8');
  const stylesPath = xmlPath.replace('worksheets/sheet1.xml', 'styles.xml');
  const stylesXml = fs.existsSync(stylesPath) ? fs.readFileSync(stylesPath, 'utf-8') : '';

  console.log(`\n=================== [${label}] ===================`);
  console.log(`Fills no styles.xml:`, stylesXml.match(/<fill>.*?<\/fill>/g) || 'Nenhum');

  const regex = /<c\s+r="([A-Z]+)(\d+)"[^>]*s="(\d+)"/g;
  const coloredRows = new Set();
  const stylesCount = {};
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const s = match[3];
    stylesCount[s] = (stylesCount[s] || 0) + 1;
    if (s !== "0") {
      coloredRows.add(parseInt(match[2], 10));
    }
  }

  console.log(`Estilos usados nas células:`, stylesCount);
  console.log(`Total de linhas com estilo especial (!= 0): ${coloredRows.size}`);

  if (fs.existsSync(filePath)) {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const products = [];
    for (const r of Array.from(coloredRows).sort((a,b) => a - b)) {
      const rowData = data[r - 1];
      if (rowData) {
        products.push({ linha: r, id: rowData[0], sku: rowData[1], nome: rowData[2] });
      }
    }
    console.log(`Exemplos de produtos com cor (Total: ${products.length}):`);
    console.log(products.slice(0, 10));
  }
}

inspectFile('Relatorio_Produtos_Sem_Venda_2026 (1).xlsx', 'scratch/xlsx_1/xl/worksheets/sheet1.xml', 'scratch/locked_copy.xlsx');
inspectFile('Relatorio_Produtos_Sem_Venda_2026.xlsx', 'scratch/xlsx_orig/xl/worksheets/sheet1.xml', 'C:/Users/marke/Downloads/Relatorio_Produtos_Sem_Venda_2026.xlsx');
