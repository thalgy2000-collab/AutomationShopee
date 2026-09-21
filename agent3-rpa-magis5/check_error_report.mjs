import { chromium } from "playwright";
import { resolve } from "node:path";

async function main() {
  const sessionPath = resolve("agent3-rpa-magis5", "session.json");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: sessionPath });
  const page = await context.newPage();

  await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const skuInput = page.locator('input[placeholder="Insira o sku"]').first();
  await skuInput.fill("C02846BL");
  await page.click('button:has-text("Buscar")');
  await page.waitForTimeout(2000);

  const errorLink = page.locator('a:has-text("Veja o relatório de erros")').first();
  if (await errorLink.isVisible()) {
    console.log("Clicando no relatório de erros...");
    await errorLink.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: resolve("agent3-rpa-magis5", "screenshots", "modal-error-report-C02846BL.png") });
    
    // Captura o texto do modal/dialogo
    const modalText = await page.locator('.modal.show, .swal2-modal, [role="dialog"]').innerText().catch(() => "N/A");
    console.log("Texto do relatório de erros:\n", modalText);
  }

  await browser.close();
}

main().catch(console.error);
