import pw from './agent3-rpa-magis5/node_modules/playwright/index.js';
const { chromium } = pw;
import path from 'node:path';

const USER = '34984263630';
const PASS = 'meli01@BRK2023';
const USER_DATA_DIR = path.resolve('./browser_profile_shopee');

async function triggerEmailVerification() {
  console.log('🤖 Disparando envio do link de verificação por e-mail...');

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

  // Faz o login novamente se necessário para estar na tela de verificação
  console.log('1. Acessando página de verificação...');
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

  console.log('URL após login:', page.url());

  // Procura pelo botão ou opção "Verificar via link por E-mail"
  const emailSelectors = [
    'button:has-text("Verificar via link por E-mail")',
    'div:has-text("Verificar via link por E-mail")',
    'button:has-text("E-mail")',
    'text=/Verificar via link por E-mail/i',
    'text=/por E-mail/i'
  ];

  let clicked = false;
  for (const sel of emailSelectors) {
    const el = page.locator(sel).last();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`✉️ Clicando em "${sel}"...`);
      await el.click().catch(() => {});
      clicked = true;
      await page.waitForTimeout(3000);
      break;
    }
  }

  // Se houver um botão de confirmação secundário como "Enviar", "Continuar" ou "Avançar", clica nele
  const confirmBtn = page.locator('button:has-text("Enviar"), button:has-text("Continuar"), button:has-text("Próximo")').first();
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('📨 Clicando no botão de confirmação/envio...');
    await confirmBtn.click().catch(() => {});
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: 'screenshots/verify_email_sent.png' });
  console.log('📸 Screenshot salvo: screenshots/verify_email_sent.png');

  const pageText = await page.locator('body').innerText().catch(() => '');
  console.log('-------------------------------------------------------------');
  console.log('STATUS NA TELA DA SHOPEE:');
  console.log(pageText.replace(/[\r\n]+/g, ' ').substring(0, 400));
  console.log('-------------------------------------------------------------');

  console.log('\n⏳ E-MAIL DISPARADO! Aguardando até 10 minutos pela aprovação do link no seu e-mail...');
  const maxWait = 600000;
  const start = Date.now();
  let approved = false;

  while (Date.now() - start < maxWait) {
    await page.waitForTimeout(3000);
    const url = page.url();
    if (url.includes('/portal/') && !url.includes('/verify') && !url.includes('/login') && !url.includes('/account/signin')) {
      approved = true;
      break;
    }
  }

  if (approved) {
    console.log('\n🎉 SUCESSO ABSOLUTO! Link aprovado e sessão conectada com sucesso no Shopee Seller Center!');
    await page.screenshot({ path: 'screenshots/seller_portal_logged.png' });
  } else {
    console.log('\n⚠️ Tempo de espera expirado (10 minutos).');
  }

  await context.close();
}

triggerEmailVerification().catch(console.error);
