import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function getEditHref() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
    
    // Procura o botão Editar do primeiro card
    const editBtn = page.locator('div:has-text("C02825I") a:has-text("Editar")').first();
    const href = await editBtn.getAttribute("href");
    console.log("Link de edição do C02825I:", href);

    if (href) {
      const fullUrl = `https://app.magis5.com.br${href}`;
      console.log("Navegando diretamente para:", fullUrl);
      await page.goto(fullUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "screenshots/edit_page_c02825i.png", fullPage: true });
      console.log("Screenshot da tela de edição salvo!");

      // Mensagens de alerta/erro
      const alerts = await page.locator('.alert, .invalid-feedback, .text-danger, .badge-danger, .label-danger, [class*="error"]').evaluateAll(els => 
        els.map(e => e.innerText?.trim()).filter(Boolean)
      );
      console.log("Alertas na tela de edição:", JSON.stringify(alerts, null, 2));
    }

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

getEditHref();
