import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function inspectCardsDetailed() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
    
    // Procura todos os spans ou badges com texto Não publicado
    const badges = page.locator('span, div, label').filter({ hasText: /^Não publicado$/i });
    const count = await badges.count();
    console.log(`Badges 'Não publicado' exatos encontrados: ${count}`);

    for (let i = 0; i < count; i++) {
      const b = badges.nth(i);
      // Pega o card pai
      const card = b.locator('xpath=ancestor::div[contains(@class, "m-portlet") or contains(@class, "card") or contains(@class, "border")][1]');
      const cardText = await card.innerText().catch(() => "");
      console.log(`Card ${i + 1}: ${cardText.substring(0, 100).replace(/\n/g, ' ')}`);
      
      const pubBtn = card.locator('button:has-text("Publicar"), a:has-text("Publicar")').first();
      console.log(`  Botão Publicar visível? ${await pubBtn.isVisible().catch(() => false)}`);
    }

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

inspectCardsDetailed();
