import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function inspectPublishButtonSelector() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
    
    // Procura todos os botões que tem texto "Publicar"
    const pubButtons = page.locator('button:has-text("Publicar"), a:has-text("Publicar")');
    const total = await pubButtons.count();
    console.log(`Total de botões 'Publicar' na página: ${total}`);

    for (let i = 0; i < Math.min(total, 5); i++) {
      const btn = pubButtons.nth(i);
      const isVis = await btn.isVisible();
      const parentText = await btn.evaluate(el => {
        let p = el.parentElement;
        while (p && !p.innerText.includes("SKU Principal")) {
          p = p.parentElement;
        }
        return p ? p.innerText.substring(0, 100).replace(/\n/g, " ") : "Sem pai SKU";
      });
      console.log(`Botão ${i + 1}: Visível=${isVis} | Contexto: ${parentText}`);
    }

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

inspectPublishButtonSelector();
