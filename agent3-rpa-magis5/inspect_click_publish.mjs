import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function inspectPublishButtonClick() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
    
    // Procura o card com C02825
    const card = page.locator('div:has-text("C02825")').filter({ hasText: "Não publicado" }).first();
    const pubBtn = card.locator('button:has-text("Publicar"), a:has-text("Publicar")').first();
    
    console.log("Clicando no botão 'Publicar' do card C02825...");
    await pubBtn.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "screenshots/after_click_publicar.png", fullPage: false });
    console.log("Screenshot salvo: screenshots/after_click_publicar.png");

    // Verifica se abriu algum modal ou redirecionou
    console.log("URL após clique:", page.url());

    // Se houver modal ou formulário visível
    const modalTexts = await page.locator('.modal.show, .swal2-modal, .swal-modal, [role="dialog"]').evaluateAll(els => 
      els.map(e => e.innerText.trim()).filter(Boolean)
    );
    console.log("Modais visíveis:", JSON.stringify(modalTexts, null, 2));

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

inspectPublishButtonClick();
