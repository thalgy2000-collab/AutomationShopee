import pw from './agent3-rpa-magis5/node_modules/playwright/index.js';
const { chromium } = pw;
import path from 'node:path';

const USER = '34984263630';
const PASS = 'meli01@BRK2023';
const USER_DATA_DIR = path.resolve('./browser_profile_shopee');

async function checkOptions() {
  console.log('🔍 Inspecionando métodos de verificação disponíveis na Shopee...');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,900'
    ]
  });

  const page = context.pages()[0] || await context.newPage();

  await page.goto('https://seller.shopee.com.br/account/signin', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (page.url().includes('/account/signin') || page.url().includes('/seller/login')) {
    const userInput = page.locator('input[name="loginKey"], input[type="text"]').first();
    await userInput.waitFor({ state: 'visible', timeout: 10000 });
    await userInput.fill(USER);
    const passInput = page.locator('input[name="password"], input[type="password"]').first();
    await passInput.fill(PASS);
    await passInput.press('Enter');
    await page.waitForTimeout(5000);
  }

  console.log('URL na tela de verificação:', page.url());
  await page.screenshot({ path: 'screenshots/verify_methods_initial.png' });

  // Tenta ver todos os métodos ou links presentes
  const links = page.locator('button, a, [role="button"], div[class*="method"]');
  const count = await links.count().catch(() => 0);
  console.log(`Encontrados ${count} elementos clicáveis.`);

  for (let i = 0; i < count; i++) {
    const text = (await links.nth(i).innerText().catch(() => '')).trim();
    if (text) {
      console.log(` - Elemento [${i}]: "${text.replace(/[\r\n]+/g, ' ')}"`);
    }
  }

  await context.close();
}

checkOptions().catch(console.error);
