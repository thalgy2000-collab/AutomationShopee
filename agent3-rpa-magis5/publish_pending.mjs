import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function publishPendingProduct() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
    
    // Pega o primeiro botão "Publicar" visível de produto não publicado
    const visiblePubButtons = page.locator('button:has-text("Publicar"):visible, a:has-text("Publicar"):visible');
    const totalVis = await visiblePubButtons.count();
    console.log(`Botões 'Publicar' visíveis: ${totalVis}`);
    
    if (totalVis === 0) return;

    const firstBtn = visiblePubButtons.first();
    console.log("Clicando no primeiro botão Publicar visível...");
    await firstBtn.click();
    await page.waitForTimeout(2000);

    // Modal visível
    const modal = page.locator('.modal.show, #modal_publish_product.show').first();
    await modal.waitFor({ state: "visible", timeout: 8000 });
    console.log("Modal aberto!");

    // Clica no label 'Selecionar todos'
    const selectAll = modal.locator('label:has-text("Selecionar todos")').first();
    await selectAll.click();
    console.log("Selecionado: 'Selecionar todos'");
    await page.waitForTimeout(600);

    // Clica no botão final de 'Publicar' via evaluate (100% instantâneo e sem risco de lock do Playwright)
    const submitBtn = modal.locator('.modal-footer button:has-text("Publicar")').first();
    await submitBtn.evaluate(b => b.click());
    console.log("🚀 Botão 'Publicar' do modal acionado via DOM click!");

    // Aguarda o processamento do Magis5
    await page.waitForTimeout(6000);
    await page.screenshot({ path: "screenshots/modal_published_success.png", fullPage: true });
    console.log("Screenshot do resultado salvo: screenshots/modal_published_success.png");

    // Coleta toasts ou mensagens
    const alerts = await page.locator('.toast, .alert, .swal2-modal, .swal-modal, .notification, [class*="alert"], [class*="toast"]').evaluateAll(els => els.map(e => e.innerText.trim()).filter(Boolean));
    console.log("Alertas capturados:", JSON.stringify(alerts));

  } catch (err) {
    console.error("Erro na publicação:", err);
  } finally {
    await browser.close();
  }
}

publishPendingProduct();
