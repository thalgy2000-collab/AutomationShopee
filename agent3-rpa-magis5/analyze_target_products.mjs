import xlsx from "xlsx";
import { resolve } from "node:path";
import { readdirSync, readFileSync, existsSync } from "node:fs";

const TARGET_IDS = ["58252031133", "23694437282", "22498158007", "23993590640", "23998922043", "23297692074"];

console.log("=== LENDO PLANILHA analise_rejeicao_produtos (1).xlsx ===");
const wbPath = resolve("../analise_rejeicao_produtos (1).xlsx");
const wb = xlsx.readFile(wbPath);

for (const sheetName of wb.SheetNames) {
  console.log(`\n--- Aba: ${sheetName} ---`);
  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws);
  console.log(`Total de linhas: ${rows.length}`);

  const found = rows.filter(r => {
    const str = JSON.stringify(r);
    return TARGET_IDS.some(id => str.includes(id));
  });

  console.log(`Linhas encontradas para os alvos: ${found.length}`);
  for (const item of found) {
    console.log("\nPRODUTO ENCONTRADO:");
    console.log(JSON.stringify(item, null, 2));
  }
}

// Também procura nos JSONs locais de produtos se existirem
console.log("\n=== PROCURANDO NOS JSONS LOCAIS (agent2-enricher/produtos) ===");
const produtosDir = resolve("../agent2-enricher/produtos");
if (existsSync(produtosDir)) {
  const files = readdirSync(produtosDir).filter(f => f.endsWith(".json"));
  console.log(`Total de arquivos em produtos: ${files.length}`);
  
  const targetSkus = ["C02362", "C02350", "CORINTHIAS", "TIMAO", "C01076", "C01946", "BT000"];
  const matchedFiles = files.filter(f => targetSkus.some(sku => f.toUpperCase().includes(sku.toUpperCase())));
  console.log("Arquivos correspondentes aos SKUs:", matchedFiles);
  
  for (const mf of matchedFiles) {
    console.log(`\n--- Conteúdo resumido de ${mf} ---`);
    try {
      const data = JSON.parse(readFileSync(resolve(produtosDir, mf), "utf-8"));
      console.log({
        sku: data.sku || data.parent_sku,
        titulo_shopee: data.titulo_shopee,
        categoria: data.categoria_sugerida,
        preco: data.preco,
        atributos_qtd: Object.keys(data.atributos || {}).length,
        variacoes_qtd: (data.variacoes || []).length,
        descricao_preview: (data.descricao || "").substring(0, 200) + "..."
      });
    } catch (e) {
      console.error("Erro ao ler:", mf, e.message);
    }
  }
}
