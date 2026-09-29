import pw from './agent3-rpa-magis5/node_modules/playwright/index.js';
const { chromium } = pw;
import path from 'node:path';
import fs from 'node:fs';

const USER = '34984263630';
const PASS = 'meli01@BRK2023';
const USER_DATA_DIR = path.resolve('./browser_profile_shopee');

async function testAutoLogin() {
  console.log('🤖 Testando login 100% automatizado na Shopee...');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true, // Roda headless sem precisar de tela
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,900'
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  });

  const page = context.pages()[0] || await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  console.log('1. Acessando tela de login da Shopee...');
  await page.goto('https://seller.shopee.com.br/account/signin', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  await page.screenshot({ path: 'screenshots/login_step1_initial.png' });
  console.log('📸 Screenshot 1 salvo: screenshots/login_step1_initial.png');

  // Verifica se há modais bloqueando a tela e fecha
  const closeBtns = page.locator('#modal button, .shopee-modal button, [class*="modal"] button, [class*="dialog"] button, button:has-text("Fechar"), button:has-text("Entendi")');
  const count = await closeBtns.count().catch(() => 0);
  console.log(`Encontrados ${count} possíveis botões de modal.`);
  for (let i = 0; i < count; i++) {
    try {
      const btn = closeBtns.nth(i);
      if (await btn.isVisible()) {
        const text = await btn.innerText();
        console.log(`Clicando em botão de fechar modal: "${text}"`);
        await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    } catch {}
  }

  // Preenche usuário
  console.log('2. Preenchendo credenciais...');
  const userInput = page.locator('input[name="loginKey"], input[type="text"]').first();
  await userInput.waitFor({ state: 'visible', timeout: 10000 });
  await userInput.fill('');
  await userInput.fill(USER);
  await page.waitForTimeout(500);

  // Preenche senha
  const passInput = page.locator('input[name="password"], input[type="password"]').first();
  await passInput.waitFor({ state: 'visible', timeout: 10000 });
  await passInput.fill('');
  await passInput.fill(PASS);
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'screenshots/login_step2_filled.png' });
  console.log('📸 Screenshot 2 salvo: screenshots/login_step2_filled.png');

  // Submete via Enter no campo de senha (evita ser interceptado por overlays)
  console.log('3. Submetendo formulário (Pressionando Enter)...');
  await passInput.press('Enter');
  await page.waitForTimeout(3000);

  // Se ainda estiver na mesma tela, tenta clicar com force: true no botão Entrar
  const loginBtn = page.locator('button:has-text("Entre"), button:has-text("Entrar")').first();
  if (await loginBtn.isVisible().catch(() => false)) {
    console.log('Tentando clique forçado no botão Entrar...');
    await loginBtn.click({ force: true }).catch(() => {});
  }

  console.log('4. Aguardando 10 segundos para transição...');
  await page.waitForTimeout(10000);

  const currentUrl = page.url();
  console.log('URL atual após tentativa:', currentUrl);

  await page.screenshot({ path: 'screenshots/login_step3_result.png' });
  console.log('📸 Screenshot 3 salvo: screenshots/login_step3_result.png');

  const pageText = await page.locator('body').innerText().catch(() => '');
  console.log('Trecho do texto na página:', pageText.substring(0, 300).replace(/[\r\n]+/g, ' '));

  await context.close();
}

testAutoLogin().catch(console.error);
