/**
 * pipeline_agent1.mjs — Fluxo Automático Completo do Agente 1
 * 
 * Se o arquivo for Excel (.xls, .xlsx):
 *   1. Executa extração de produtos (create_lote.mjs)
 *   2. Executa o scraper de imagens (scraper.mjs) no lote gerado
 * 
 * Se o arquivo for CSV (.csv):
 *   1. Executa diretamente o scraper de imagens (scraper.mjs)
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

import { getCollectionNameFromFilename } from "./scraper.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  let inputFile = null;
  let color = null;
  let limit = null;
  let sku = null;
  let collection = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input") {
      const parts = [];
      i++;
      while (i < args.length && !args[i].startsWith("--")) {
        parts.push(args[i]);
        i++;
      }
      inputFile = parts.join(" ").replace(/^["']|["']$/g, "");
      i--;
    } else if (args[i] === "--color" && args[i + 1]) {
      color = args[i + 1].replace(/^["']|["']$/g, "");
      i++;
    } else if (args[i] === "--collection" && args[i + 1]) {
      collection = args[i + 1].replace(/^["']|["']$/g, "").trim();
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = args[i + 1];
      i++;
    } else if (args[i] === "--sku" && args[i + 1]) {
      sku = args[i + 1];
      i++;
    }
  }

  return { inputFile, color, limit, sku, collection };
}

function runScript(scriptName, scriptArgs) {
  return new Promise((resolvePromise, reject) => {
    const fullScriptPath = resolve(SCRIPT_DIR, scriptName);
    console.log(`\n=============================================================`);
    console.log(`🚀 Executando: node ${scriptName} ${scriptArgs.join(" ")}`);
    console.log(`=============================================================\n`);

    const child = spawn(process.execPath, [fullScriptPath, ...scriptArgs], {
      stdio: "inherit",
      cwd: SCRIPT_DIR,
      shell: false,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${scriptName} encerrou com código de erro ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  let { inputFile, color, limit, sku, collection } = parseArgs();
  const resolvedInput = inputFile ? resolve(process.cwd(), inputFile) : null;
  const isExcel = resolvedInput && /\.(xlsx?)$/i.test(resolvedInput);

  if (!collection && resolvedInput) {
    collection = getCollectionNameFromFilename(resolvedInput);
  }

  let loteCsv = resolve(SCRIPT_DIR, "lote_d1fae5.csv");

  if (isExcel) {
    console.log("📌 Etapa 1/2: Extraindo produtos da planilha Excel...");
    const extractArgs = ["--input", resolvedInput, "--output", loteCsv];
    if (color && color !== "TODAS") extractArgs.push("--color", color);
    if (limit) extractArgs.push("--limit", limit);
    if (collection) extractArgs.push("--collection", collection);

    await runScript("create_lote.mjs", extractArgs);

    console.log("\n📌 Etapa 2/2: Baixando imagens oficiais da Shopify / BRK Agro...");
    const scraperArgs = ["--input", loteCsv];
    if (limit) scraperArgs.push("--limit", limit);
    if (sku) scraperArgs.push("--sku", sku);
    if (collection) scraperArgs.push("--collection", collection);

    await runScript("scraper.mjs", scraperArgs);
  } else {
    // É CSV ou sem arquivo fornecido: vai direto para o scraper
    const scraperArgs = [];
    if (inputFile) scraperArgs.push("--input", inputFile);
    if (limit) scraperArgs.push("--limit", limit);
    if (sku) scraperArgs.push("--sku", sku);
    if (collection) scraperArgs.push("--collection", collection);

    await runScript("scraper.mjs", scraperArgs);
  }

  console.log("\n🎉 Pipeline do Agente 1 finalizado com sucesso!\n");
}

main().catch((err) => {
  console.error("\n❌ Erro no pipeline do Agente 1:", err.message);
  process.exit(1);
});
