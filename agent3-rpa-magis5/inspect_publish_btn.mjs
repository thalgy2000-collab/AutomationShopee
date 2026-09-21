import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function checkPublishAction() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    console.log("Navegando para a lista de produtos com variações...");
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/index.php", { waitUntil: "networkidle" });
    
    // Pesquisa pelo SKU C02821BL no filtro
    const skuInput = page.locator('input[name="sku"], #sku, input[placeholder*="sku" i]').first();
    if (await skuInput.isVisible().catch(() => false)) {
      console.log("Filtrando pelo SKU C02821BL...");
      await skuInput.fill("C02821BL");
      const searchBtn = page.locator('button:has-text("Buscar"), button:has-text("Filtrar")').first();
      await searchBtn.click();
      await page.waitForTimeout(3000);
    }
    
    await page.screenshot({ path: "screenshots/inspect_c02821bl_list.png", fullPage: true });
    console.log("Screenshot da lista salvo: screenshots/inspect_c02821bl_list.png");

    // Verifica botões disponíveis no primeiro card
    const buttons = await page.locator('.m-portlet, .card, [class*="product"]').first().locator('button, a').evaluateAll(els => 
      els.map(e => ({ text: e.innerText.trim(), href: e.getAttribute('href'), class: e.className, onclick: e.getAttribute('onclick') })).filter(b => b.text)
    );
    console.log("Botões encontrados no card:", JSON.stringify(buttons, null, 2));

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

checkPublishAction();
