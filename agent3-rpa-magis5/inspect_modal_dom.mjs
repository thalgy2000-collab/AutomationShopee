import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function inspectModalDom() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
    
    // Pega o primeiro botão Publicar de um item "Não publicado"
    const card = page.locator('div:has-text("Não publicado")').filter({ hasText: "Publicar" }).first();
    const pubBtn = card.locator('button:has-text("Publicar"), a:has-text("Publicar")').first();
    await pubBtn.click();
    await page.waitForTimeout(2000);

    // Inspeciona os elementos dentro do modal visível
    const modalHtml = await page.locator('.modal.show').evaluate(el => el.outerHTML);
    console.log("Modal HTML:");
    console.log(modalHtml.substring(0, 2000));

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

inspectModalDom();
