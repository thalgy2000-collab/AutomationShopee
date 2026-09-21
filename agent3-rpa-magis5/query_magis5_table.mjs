import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

const TARGETS = ["C02362", "C01076", "C01946", "BT000", "C02350"];

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });

    for (const sku of TARGETS) {
      console.log(`\n========================================\nBuscando SKU no Magis5: ${sku}`);
      const skuInput = page.locator('input[name="sku"], #sku').first();
      await skuInput.fill(sku);
      
      // Clica em Buscar
      await page.locator('button:has-text("Buscar")').first().click();
      await page.waitForTimeout(4000);

      // Extrai dados da tabela
      const rows = await page.locator("table tbody tr").evaluateAll(trs => {
        return trs.map(tr => {
          const cells = Array.from(tr.querySelectorAll("td")).map(td => td.innerText.trim().replace(/\n+/g, " "));
          const links = Array.from(tr.querySelectorAll("a")).map(a => ({ text: a.innerText.trim(), href: a.href }));
          return { cells, links };
        });
      });

      console.log(`Linhas retornadas para ${sku}:`, rows.length);
      if (rows.length > 0) {
        console.log("Primeira linha:", JSON.stringify(rows[0], null, 2));
      } else {
        const noData = await page.locator("body").innerText();
        if (noData.includes("Nenhum registro encontrado") || noData.includes("Nenhum produto")) {
          console.log("Aviso: Nenhum registro encontrado para este SKU no Magis5.");
        }
      }
    }
  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

main();
