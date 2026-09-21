import { chromium } from "playwright";

async function testShopee() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1440,900"
    ]
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const url = "https://shopee.com.br/product/1111622900/58252031133/";
  console.log("Acessando com stealth:", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  // Clica em Português se aparecer
  const langBtn = page.locator('button:has-text("Português (BR)")').first();
  if (await langBtn.isVisible().catch(() => false)) {
    console.log("Clicando em Português (BR)...");
    await langBtn.click();
    await page.waitForTimeout(3000);
  }

  const title = await page.title();
  console.log("Page Title:", title);

  const bodyText = await page.locator("body").innerText();
  console.log("Body snippet:", bodyText.substring(0, 400));

  await page.screenshot({ path: "screenshots/stealth_test_58252031133.png", fullPage: false });
  console.log("Screenshot salvo em screenshots/stealth_test_58252031133.png");

  await browser.close();
}

testShopee().catch(console.error);
