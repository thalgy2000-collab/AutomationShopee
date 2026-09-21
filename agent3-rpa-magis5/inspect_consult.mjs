import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function inspectConsultPage() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    const consultUrl = "https://app.magis5.com.br/v2/admin/product/variations/consult.php";
    console.log("Navegando para:", consultUrl);
    await page.goto(consultUrl, { waitUntil: "networkidle" });
    
    // Pesquisa por C02821BL
    const skuInput = page.locator('input[placeholder*="sku" i], #sku, input[name="sku"]').first();
    if (await skuInput.isVisible().catch(() => false)) {
      console.log("Preenchendo SKU no filtro: C02821BL");
      await skuInput.fill("C02821BL");
      const searchBtn = page.locator('button:has-text("Buscar")').first();
      await searchBtn.click();
      await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: "screenshots/consult_search_c02821bl.png", fullPage: true });
    console.log("Screenshot salvo: screenshots/consult_search_c02821bl.png");

    // Inspeciona os botões e texto do produto encontrado
    const cards = await page.locator('.m-portlet, .card, [class*="product"]').evaluateAll(els => 
      els.map(el => {
        const text = el.innerText;
        const buttons = Array.from(el.querySelectorAll('button, a')).map(b => ({
          text: b.innerText.trim(),
          class: b.className,
          href: b.getAttribute('href'),
          onclick: b.getAttribute('onclick')
        }));
        return { textSnippet: text.substring(0, 150), buttons };
      })
    );
    console.log("Cards encontrados:", JSON.stringify(cards.slice(0, 3), null, 2));

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

inspectConsultPage();
