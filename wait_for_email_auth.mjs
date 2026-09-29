import pw from './agent3-rpa-magis5/node_modules/playwright/index.js';
const { chromium } = pw;
import path from 'node:path';

const USER = '34984263630';
const PASS = 'meli01@BRK2023';
const USER_DATA_DIR = path.resolve('./browser_profile_shopee');

async function waitForEmailAuth() {
  console.log('🤖 Conectando à Shopee e disparando verificação por e-mail...');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,900'
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  });

  const page = context.pages()[0] || await context.newPage();

  console.log('1. Acessando tela de login...');
  await page.goto('https://seller.shopee.com.br/account/signin', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Se estiver na tela de login, preenche
  if (page.url().includes('/account/signin') || page.url().includes('/seller/login')) {
    const userInput = page.locator('input[name="loginKey"], input[type="text"]').first();
    await userInput.waitFor({ state: 'visible', timeout: 10000 });
    await userInput.fill(USER);
    const passInput = page.locator('input[name="password"], input[type="password"]').first();
    await passInput.fill(PASS);
    await passInput.press('Enter');
    await page.waitForTimeout(5000);
  }

  console.log('URL atual:', page.url());

  // Clica no botão de verificar por e-mail
  const emailBtn = page.locator('button:has-text("Verificar via link por E-mail"), div:has-text("Verificar via link por E-mail")').last();
  if (await emailBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('✉️ Disparando link de verificação para o e-mail cadastrado...');
    await emailBtn.click();
    await page.waitForTimeout(4000);
  }

  await page.screenshot({ path: 'screenshots/verify_email_waiting.png' });
  console.log('📸 Tela de confirmação capturada: screenshots/verify_email_waiting.png');

  console.log('\n⏳ O robô está ouvindo ativamente a aprovação do link (tempo limite: 10 minutos)...');
  console.log('👉 Por favor, abra seu e-mail (m********k@gmail.com) e clique no link de autorização da Shopee.');

  const maxWait = 600000; // 10 minutos
  const start = Date.now();
  let approved = false;

  while (Date.now() - start < maxWait) {
    await page.waitForTimeout(3000);
    const currentUrl = page.url();

    // Se saiu da tela de verificação e entrou no portal
    if (currentUrl.includes('/portal/') && !currentUrl.includes('/verify') && !currentUrl.includes('/login')) {
      approved = true;
      break;
    }
  }

  if (approved) {
    console.log('\n🎉 SUCESSO TOTAL! Sessão autenticada e aprovada com sucesso na Shopee Central do Vendedor!');
    console.log('A sessão persistente foi gravada em: ' + USER_DATA_DIR);
    await page.screenshot({ path: 'screenshots/seller_portal_approved.png' });
  } else {
    console.log('⚠️ Tempo de 10 minutos expirado.');
  }

  await context.close();
}

waitForEmailAuth().catch(console.error);
