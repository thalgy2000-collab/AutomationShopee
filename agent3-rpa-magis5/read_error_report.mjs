import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function readPublicationErrorReport() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
    
    // Procura o link de relatório de erros do primeiro card com erro
    const errLink = page.locator('a:has-text("relatório de erros"), a:has-text("possíveis soluções"), a:has-text("Veja o relatório")').first();
    console.log("Clicando no relatório de erros...");
    await errLink.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "screenshots/error_report_modal.png", fullPage: false });
    console.log("Screenshot do modal de erro salvo!");

    // Inspeciona textos do modal aberto
    const modalTexts = await page.locator('.modal.show, [role="dialog"], .swal2-modal').evaluateAll(els => 
      els.map(e => e.innerText.trim()).filter(Boolean)
    );
    console.log("Detalhes do Relatório de Erros:\n", modalTexts.join("\n---\n"));

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

readPublicationErrorReport();
