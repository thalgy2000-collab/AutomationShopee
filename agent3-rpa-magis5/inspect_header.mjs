import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function inspectHeader() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    await page.goto("https://app.magis5.com.br/v2/admin/product/variations/variation.php", { waitUntil: "networkidle" });
    console.log("URL atual:", page.url());
    
    // Inspeciona os links no topo (navbar / header)
    const headerLinks = await page.locator('header a, nav a, .m-header a, .m-menu__nav a').evaluateAll(els => 
      els.map(e => ({ text: e.innerText.trim(), href: e.getAttribute('href') })).filter(e => e.text || e.href)
    );
    console.log("Header links:", JSON.stringify(headerLinks, null, 2));

    // Inspeciona os links de breadcrumb
    const breadcrumbLinks = await page.locator('.m-subheader a, .breadcrumb a, ul.m-subheader__breadcrumbs a').evaluateAll(els => 
      els.map(e => ({ text: e.innerText.trim(), href: e.getAttribute('href') }))
    );
    console.log("Breadcrumbs links:", JSON.stringify(breadcrumbLinks, null, 2));

  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await browser.close();
  }
}

inspectHeader();
