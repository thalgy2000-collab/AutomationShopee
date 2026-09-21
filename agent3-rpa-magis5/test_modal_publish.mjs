import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function testModalPublishFlow() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
    
    // Pega apenas cards de produtos reais (que contém 'SKU Principal' e 'Não publicado')
    const prodCards = page.locator('div.border, .m-portlet').filter({ hasText: "SKU Principal" }).filter({ hasText: "Não publicado" });
    const count = await prodCards.count();
    console.log(`Encontrados ${count} produtos com status 'Não publicado'.`);
    if (count === 0) return;

    const card = prodCards.first();
    const skuText = await card.locator('div:has-text("SKU Principal") + div, span, div').evaluate(el => el.innerText).catch(() => "");
    console.log(`Card selecionado: ${skuText.substring(0, 80)}`);

    const pubBtn = card.locator('button:has-text("Publicar"), a:has-text("Publicar")').first();
    await pubBtn.click();
    console.log("Botão 'Publicar' do card clicado!");

    // Aguarda o modal visível
    const modal = page.locator('.modal.show, #modal_publish_product.show').first();
    await modal.waitFor({ state: "visible", timeout: 8000 });
    console.log("Modal de publicação visível!");

    // Clica no checkbox 'Selecionar todos'
    const selectAllLabel = modal.locator('label:has-text("Selecionar todos")').first();
    await selectAllLabel.click();
    console.log("Checkbox 'Selecionar todos' clicado.");
    await page.waitForTimeout(600);

    // Tira screenshot do modal configurado
    await page.screenshot({ path: "screenshots/modal_ready_to_publish.png" });
    console.log("Screenshot do modal salvo!");

    // Clica no botão final de 'Publicar' do modal
    const confirmBtn = modal.locator('.modal-footer button:has-text("Publicar")').first();
    await confirmBtn.click();
    console.log("🚀 Botão final 'Publicar' do modal clicado!");

    // Aguarda feedback da publicação (até 8s)
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "screenshots/after_modal_published.png", fullPage: false });
    console.log("Screenshot pós-publicação salvo: screenshots/after_modal_published.png");

    // Coleta toasts ou mensagens
    const messages = await page.locator('.toast, .alert, .swal2-modal, .swal-modal, .notification, [class*="alert"], [class*="toast"]').evaluateAll(els => els.map(e => e.innerText.trim()).filter(Boolean));
    console.log("Mensagens na tela pós-publicação:", JSON.stringify(messages));

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

testModalPublishFlow();
