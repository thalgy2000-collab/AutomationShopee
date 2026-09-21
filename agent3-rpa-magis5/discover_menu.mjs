import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function discoverVariationsListUrl() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    console.log("Acessando dashboard do Magis5...");
    await page.goto("https://app.magis5.com.br/v2/admin/index.php", { waitUntil: "networkidle" });
    
    // Procura todos os links que contém "varia" ou "produto" no href ou texto
    const links = await page.locator('a').evaluateAll(els => 
      els.map(e => ({ text: e.innerText.trim(), href: e.getAttribute('href') })).filter(l => l.href && (l.href.includes('product') || l.href.includes('var') || l.text.toLowerCase().includes('produto') || l.text.toLowerCase().includes('varia')))
    );
    console.log("Links encontrados:", JSON.stringify(links, null, 2));

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

discoverVariationsListUrl();
