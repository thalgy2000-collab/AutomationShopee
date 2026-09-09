/**
 * sync_to_supabase.mjs — Sincroniza todos os JSONs de produtos enriquecidos para o Supabase
 */

import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { initTables, upsertProduct } from "./supabase_db.mjs";

async function main() {
  console.log("Iniciando sincronização com o Supabase...");
  await initTables();

  const PRODUTOS_DIR = resolve("./produtos");
  const files = (await readdir(PRODUTOS_DIR)).filter((f) => f.endsWith(".json"));

  console.log(`Encontrados ${files.length} produtos para sincronizar.`);
  let successCount = 0;
  let promoCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = join(PRODUTOS_DIR, file);
    try {
      const data = JSON.parse(await readFile(filePath, "utf-8"));
      await upsertProduct(data);
      successCount++;
      if (data.preco?.em_promocao) promoCount++;
      process.stdout.write(`\r[${i + 1}/${files.length}] Sincronizando ${data.sku}...`);
    } catch (err) {
      console.error(`\nErro ao sincronizar ${file}:`, err.message);
    }
  }

  console.log(`\n\n🎉 Concluído com sucesso!`);
  console.log(`✅ ${successCount} produtos salvos na tabela "produtos_shopee" no Supabase!`);
  console.log(`🔥 ${promoCount} produtos com promoção ativa.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
