import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function openGeneralErrorReport() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    const reportUrl = "https://app.magis5.com.br/v2/admin/reports/generalReport.php?id=43";
    console.log("Navegando para:", reportUrl);
    await page.goto(reportUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "screenshots/magis5_general_error_report.png", fullPage: true });
    console.log("Screenshot do relatório de erros salvo!");

    // Coleta as linhas da tabela de erros
    const rows = await page.locator('table tr').evaluateAll(trs => 
      trs.map(tr => Array.from(tr.querySelectorAll('th, td')).map(c => c.innerText.trim()).filter(Boolean))
    );
    console.log("Linhas do relatório de erros (primeiras 10):", JSON.stringify(rows.slice(0, 10), null, 2));

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

openGeneralErrorReport();
