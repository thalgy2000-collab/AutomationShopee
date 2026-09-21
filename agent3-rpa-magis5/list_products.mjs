import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function listProducts() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
    
    // Pega os cards de produtos
    const productItems = await page.locator('.m-portlet, .card, div.border').evaluateAll(els => 
      els.map(el => {
        const title = el.querySelector('h5, h4, .font-weight-bold, a')?.innerText?.trim();
        const fullText = el.innerText?.trim();
        return { title, snippet: fullText?.substring(0, 150) };
      }).filter(p => p.snippet && p.snippet.includes('SKU'))
    );
    console.log("Produtos encontrados na lista inicial:", JSON.stringify(productItems.slice(0, 5), null, 2));

    await page.screenshot({ path: "screenshots/consult_initial_list.png", fullPage: false });
  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

listProducts();
