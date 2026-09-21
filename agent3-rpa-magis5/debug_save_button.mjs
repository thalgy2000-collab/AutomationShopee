import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAuthenticatedContext } from "./src/auth.mjs";
import { publishProductToMagis5 } from "./src/publisher.mjs";

async function debugSaveButtonClick() {
  console.log("Iniciando debug detalhado do botão Salvar...");
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);

    const consoleLogs = [];
    page.on("console", msg => consoleLogs.push(`[CONSOLE ${msg.type()}]: ${msg.text()}`));
    page.on("pageerror", err => consoleLogs.push(`[PAGE ERROR]: ${err.message}`));
    page.on("response", resp => {
      const url = resp.url();
      if (url.includes("variation") || url.includes("save") || url.includes("product") || url.includes("ajax")) {
        consoleLogs.push(`[HTTP ${resp.status()}]: ${url}`);
      }
    });

    const jsonPath = resolve("../agent2-enricher/produtos/C02820.json");
    const raw = await readFile(jsonPath, "utf-8");
    const product = JSON.parse(raw);

    // Ajusta título para <= 60 caracteres para testar se é validação de tamanho de título
    console.log(`Original title (${product.titulo_shopee.length} chars): ${product.titulo_shopee}`);
    if (product.titulo_shopee.length > 60) {
      product.titulo_shopee = product.titulo_shopee.substring(0, 60).trim();
      console.log(`Truncated title to 60 chars: ${product.titulo_shopee}`);
    }

    const result = await publishProductToMagis5(page, product, { dryRun: false });
    console.log("Resultado:", JSON.stringify(result, null, 2));

    console.log("\n--- Logs capturados da página ---");
    consoleLogs.slice(-30).forEach(l => console.log(l));

  } catch (err) {
    console.error("Erro capturado:", err);
  } finally {
    await browser.close();
  }
}

debugSaveButtonClick();
