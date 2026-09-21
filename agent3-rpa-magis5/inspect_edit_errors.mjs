import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function inspectProductValidationErrors() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
    
    // Procura o botão "Editar" do primeiro card com "Erros de publicação"
    const card = page.locator('div:has-text("C02825I")').first();
    const editBtn = card.locator('a:has-text("Editar"), button:has-text("Editar")').first();
    console.log("Clicando em Editar no produto C02825I...");
    await editBtn.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    console.log("URL de edição:", page.url());
    await page.screenshot({ path: "screenshots/edit_c02825i_errors.png", fullPage: true });

    // Inspeciona mensagens de erro ou campos inválidos na tela de edição
    const errors = await page.locator('.is-invalid, .has-danger, .invalid-feedback, [class*="error"], [class*="danger"], .text-danger').evaluateAll(els => 
      els.map(e => ({ tag: e.tagName, id: e.id, class: e.className, text: e.innerText.trim() })).filter(e => e.text && !e.text.includes("Excluir"))
    );
    console.log("Erros detectados no formulário de edição:", JSON.stringify(errors, null, 2));

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

inspectProductValidationErrors();
