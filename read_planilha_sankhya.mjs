import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const XLSX = require('./agent0-sankhya/node_modules/xlsx');

const file = resolve('uploads/planilha_sankhya_1789739640747.xlsx');
const wb = XLSX.readFile(file);
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log("Linhas da planilha gerada pelo Agente 0:");
console.dir(data, { depth: null });
