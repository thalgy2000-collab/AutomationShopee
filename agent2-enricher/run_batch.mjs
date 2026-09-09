import { spawn } from "node:child_process";
import { resolve } from "node:path";

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    console.log(`\n======================================================`);
    console.log(`🚀 Executando: ${command} ${args.join(" ")}`);
    console.log(`======================================================\n`);
    const proc = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: true,
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        console.warn(`⚠️ Processo finalizou com código ${code}`);
        resolvePromise(); // Continua para atualizar relatório e Supabase mesmo se algum item falhar
      }
    });
    proc.on("error", reject);
  });
}

async function main() {
  const cwd = resolve(".");

  // 1. Executa o enriquecedor para processar todos os pendentes
  console.log("Iniciando enriquecimento dos produtos pendentes...");
  await run("node", ["enricher.mjs"], cwd);

  // 2. Atualiza o relatório HTML com todos os produtos
  console.log("Atualizando relatório HTML...");
  await run("node", ["report.mjs"], cwd);

  // 3. Sincroniza com a tabela do Supabase
  console.log("Sincronizando produtos atualizados com o Supabase...");
  await run("node", ["sync_to_supabase.mjs"], cwd);

  console.log("\n🎉 Processo de enriquecimento em lote concluído!");
}

main().catch((err) => {
  console.error("Erro fatal na execução do lote:", err);
  process.exit(1);
});
