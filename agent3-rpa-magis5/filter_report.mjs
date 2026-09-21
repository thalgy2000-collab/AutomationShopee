import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function filterErrorReport() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/reports/generalReport.php?id=43", { waitUntil: "networkidle" });
    
    // Pesquisa pelo SKU ou código
    const searchInput = page.locator('input[type="search"], input[name*="search" i], input[placeholder*="buscar" i], input[placeholder*="pesquisar" i]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      console.log("Filtrando relatório por C02825...");
      await searchInput.fill("C02825");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: "screenshots/error_report_c02825.png", fullPage: true });

    const rows = await page.locator('table tr').evaluateAll(trs => 
      trs.map(tr => Array.from(tr.querySelectorAll('th, td')).map(c => c.innerText.trim()).filter(Boolean))
    );
    console.log("Erros encontrados para C02825:", JSON.stringify(rows, null, 2));

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

filterErrorReport();
