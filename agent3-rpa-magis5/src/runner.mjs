import { chromium } from "playwright";
import { join, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import {
  HEADLESS,
  SCREENSHOTS_DIR,
  PRODUTOS_DIR,
  CSV_PATH,
  COLOR_PUBLISHED,
  COLOR_TO_PUBLISH,
} from "./config.mjs";
import { loadAndValidateAll } from "./checkpoint.mjs";
import { getAuthenticatedContext } from "./auth.mjs";
import { publishProductToMagis5 } from "./publisher.mjs";

/**
 * Parsing de argumentos CLI:
 *   --sku <sku>         Processa um único SKU
 *   --limit <num>       Limita a quantidade de produtos a processar
 *   --headed            Executa com navegador visível na tela
 *   --publish           Executa ação de publicação real (padrão é dry-run)
 *   --dry-run           Garante modo seguro sem salvar
 */
function parseCliArgs() {
  const args = process.argv.slice(2);
  let targetSku = null;
  let limit = null;
  let headed = !HEADLESS;
  let publish = false;
  let inputFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--sku" && args[i + 1]) {
      targetSku = args[i + 1];
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--input" && args[i + 1]) {
      inputFile = args[i + 1];
      i++;
    } else if (args[i] === "--headed") {
      headed = true;
    } else if (args[i] === "--headless") {
      headed = false;
    } else if (args[i] === "--publish") {
      publish = true;
    } else if (args[i] === "--dry-run") {
      publish = false;
    }
  }

  return {
    targetSku,
    limit,
    headed,
    dryRun: !publish,
    inputFile,
  };
}

async function main() {
  const { targetSku, limit, headed, dryRun, inputFile } = parseCliArgs();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🤖 Agente 3 — RPA de Publicação Magis5 / Shopee");
  console.log(`  Modo:         ${dryRun ? "🛡️ DRY-RUN (Simulação Segura)" : "🚀 PRODUÇÃO (Salvamento Real)"}`);
  console.log(`  Navegador:    ${headed ? "Visível (Headed)" : "Headless"}`);
  if (targetSku) console.log(`  Filtro SKU:   ${targetSku}`);
  if (limit) console.log(`  Limite:       ${limit} produtos`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // 1. Executar Checkpoint de Pré-Voo
  console.log("🔍 Carregando produtos e executando checkpoint de pré-voo...");
  const checkpoint = await loadAndValidateAll();

  if (checkpoint.total === 0) {
    console.error("❌ Nenhum produto encontrado em: " + PRODUTOS_DIR);
    process.exit(1);
  }

  // Carrega status da planilha de lote
  const activeCsvPath = inputFile ? resolve(inputFile) : CSV_PATH;
  let csvRecords = [];
  const csvMap = {};
  if (existsSync(activeCsvPath)) {
    const csvContent = await readFile(activeCsvPath, "utf-8");
    csvRecords = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    csvRecords.forEach((r) => { csvMap[r.sku] = r; });
  }

  // Filtrar apenas produtos válidos
  let candidates = checkpoint.items.filter((i) => i.valid);

  // Filtra descartando quem já estiver publicado (Status "publicado" ou Cor #83E28E)
  const toProcess = [];
  let jaPublicadosCount = 0;

  for (const item of candidates) {
    const csvRow = csvMap[item.sku] || {};
    const isPublished =
      item.product.is_published === true ||
      item.product.status === "concluido" ||
      item.product.status === "publicado" ||
      csvRow.status === "publicado" ||
      csvRow.status === "concluido" ||
      csvRow.cor === COLOR_PUBLISHED ||
      csvRow.cor === "#47D359";

    if (isPublished) {
      jaPublicadosCount++;
    } else {
      toProcess.push(item);
    }
  }

  if (jaPublicadosCount > 0) {
    console.log(`⏩ ${jaPublicadosCount} produto(s) ignorados pois já estão publicados (Cor ${COLOR_PUBLISHED} ou status 'publicado').`);
  }

  let finalCandidates = toProcess;
  if (targetSku) {
    finalCandidates = toProcess.filter((i) => i.sku === targetSku);
    if (finalCandidates.length === 0) {
      console.error(`❌ O SKU '${targetSku}' não está pendente de publicação ou já foi publicado.`);
      process.exit(1);
    }
  }

  if (limit && limit > 0) {
    finalCandidates = finalCandidates.slice(0, limit);
  }

  console.log(`📋 Total de produtos aptos à publicar (Cor ${COLOR_TO_PUBLISH}): ${finalCandidates.length}`);

  if (finalCandidates.length === 0) {
    console.log("🎉 Nenhum produto pendente de publicação no lote!");
    return;
  }

  // 2. Inicializar o Navegador Playwright
  console.log("\n🚀 Inicializando navegador Chromium via Playwright...");
  const browser = await chromium.launch({
    headless: !headed,
    args: ["--start-maximized", "--no-sandbox"],
  });

  const results = {
    sucesso: [],
    erros: [],
  };

  try {
    // 3. Autenticação na Magis5
    const { context, page } = await getAuthenticatedContext(browser);

    // 4. Execução do RPA para cada produto
    for (let i = 0; i < finalCandidates.length; i++) {
      const item = finalCandidates[i];
      const progresso = `[${i + 1}/${finalCandidates.length}]`;
      console.log(`\n${progresso} Iniciando processamento do produto ${item.sku}...`);

      try {
        const res = await publishProductToMagis5(page, item.product, { dryRun });
        results.sucesso.push(res);

        // Se foi publicação real, atualiza na planilha com a cor #83E28E e status 'publicado'
        if (!dryRun) {
          let updatedCount = 0;
          for (const r of csvRecords) {
            if (r.sku === item.sku || r.sku?.startsWith(item.sku + "_")) {
              r.status = "publicado";
              r.cor = COLOR_PUBLISHED;
              updatedCount++;
            }
          }
          if (updatedCount > 0) {
            await writeFile(activeCsvPath, stringify(csvRecords, { header: true }), "utf-8");
            console.log(`📝 Status atualizado no lote: ${updatedCount} linha(s) do SKU ${item.sku} marcadas como 'publicado' (Cor ${COLOR_PUBLISHED}).`);
          }

          // Notifica servidor local de dashboard se estiver ativo
          try {
            await fetch("http://localhost:3000/api/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sku: item.sku, status: "publicado" }),
            });
          } catch {
            // Dashboard pode não estar rodando em background, segue normalmente
          }
        }
      } catch (err) {
        console.error(`❌ ${progresso} Erro ao processar SKU ${item.sku}: ${err.message}`);
        const errScreenshot = join(SCREENSHOTS_DIR, `erro-${item.sku}-${Date.now()}.png`);
        await page.screenshot({ path: errScreenshot, fullPage: true }).catch(() => {});
        results.erros.push({ sku: item.sku, erro: err.message, screenshot: errScreenshot });
      }
    }

    await context.close();
  } catch (globalErr) {
    console.error("❌ Erro fatal durante a execução do RPA:", globalErr.message);
  } finally {
    await browser.close();
  }

  // 5. Relatório de Encerramento
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  📊 Resumo da Execução do Agente 3");
  console.log(`  Sucessos:   ${results.sucesso.length}`);
  console.log(`  Falhas:     ${results.erros.length}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (results.sucesso.length > 0) {
    console.log("✅ Produtos processados:");
    results.sucesso.forEach((s) => console.log(`  • SKU: ${s.sku} | Screenshot: ${s.screenshot}`));
  }

  if (results.erros.length > 0) {
    console.log("\n❌ Produtos com erro:");
    results.erros.forEach((e) => console.log(`  • SKU: ${e.sku} | Motivo: ${e.erro} (Screenshot: ${e.screenshot})`));
  }
}

main().catch((err) => {
  console.error("❌ Falha inesperada:", err);
  process.exit(1);
});
