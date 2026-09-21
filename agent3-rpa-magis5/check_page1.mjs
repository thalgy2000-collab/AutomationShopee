import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function checkCurrentListStatus() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
    
    // Pega os cards de produtos
    const cards = await page.locator('h4, h5, .font-weight-bold').evaluateAll(els => 
      els.map(e => e.innerText.trim()).filter(Boolean)
    );
    console.log("Títulos encontrados na página 1:", JSON.stringify(cards.slice(0, 15), null, 2));

    await page.screenshot({ path: "screenshots/current_page1.png", fullPage: true });
    console.log("Screenshot salvo: screenshots/current_page1.png");

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

checkCurrentListStatus();
