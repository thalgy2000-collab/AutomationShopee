import { getShopeeBrowserContext, checkShopeeAuth } from './browser.mjs';
import { SHOPEE_LOGIN_URL, SHOPEE_PRODUCT_LIST_URL } from './config.mjs';

/**
 * Script de autenticação no Shopee Seller Center.
 * Abre o navegador visível e, caso configurado com SHOPEE_USER e SHOPEE_PASS,
 * preenche automaticamente as credenciais e aguarda a confirmação de 2FA.
 */
async function runInteractiveLogin() {
  console.log('\n=============================================================');
  console.log('  🔐 AUTENTICAÇÃO NO SHOPEE SELLER CENTER — AGENTE 5');
  console.log('=============================================================');

  const user = process.env.SHOPEE_USER || '';
  const pass = process.env.SHOPEE_PASS || '';

  if (user && pass) {
    console.log(`👤 Credenciais detectadas para o usuário: ${user}`);
    console.log('O robô irá preencher o login e senha automaticamente!');
  } else {
    console.log('ℹ️ Credenciais automáticas não configuradas no .env (SHOPEE_USER / SHOPEE_PASS).');
    console.log('Você poderá digitar diretamente no navegador aberto.');
  }

  console.log('\nAbrindo navegador visível para autenticação...\n');
  const { context, page } = await getShopeeBrowserContext({ headless: false, slowMo: 50 });

  try {
    const isAlreadyLogged = await checkShopeeAuth(page);
    if (isAlreadyLogged) {
      console.log('🎉 Sessão existente já está conectada e válida!');
      console.log('Você pode iniciar a automação diretamente com:');
      console.log('   node agent5-shopee-attributes/src/runner.mjs\n');
      await context.close();
      return;
    }

    console.log(`➡️ Navegando para: ${SHOPEE_LOGIN_URL}`);
    await page.goto(SHOPEE_LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Se temos credenciais, preenche os campos automaticamente
    if (user && pass) {
      console.log('✍️ Preenchendo campos de login e senha...');
      try {
        const userInput = page.locator('input[name="loginKey"], input[type="text"], input[placeholder*="Telefone"], input[placeholder*="E-mail"]').first();
        if (await userInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await userInput.fill('');
          await userInput.fill(user);
          await page.waitForTimeout(500);
        }

        const passInput = page.locator('input[name="password"], input[type="password"]').first();
        if (await passInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await passInput.fill('');
          await passInput.fill(pass);
          await page.waitForTimeout(500);
        }

        const loginBtn = page.locator('button:has-text("Entre"), button:has-text("Entrar"), button:has-text("Log In"), button[type="submit"]').first();
        if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log('🚀 Clicando no botão de Entrar...');
          await loginBtn.click();
          await page.waitForTimeout(3000);
        }
      } catch (err) {
        console.warn('⚠️ Não foi possível preencher automaticamente:', err.message);
      }
    }

    console.log('\n-------------------------------------------------------------');
    console.log('👉 ETAPA DE VERIFICAÇÃO / 2FA:');
    console.log('Se a Shopee solicitou verificação (WhatsApp, SMS, QR Code ou Biometria):');
    console.log('1. Confirme o código no seu celular ou na tela do navegador.');
    console.log('2. Assim que o painel principal for carregado, o robô detectará a sessão.');
    console.log('-------------------------------------------------------------\n');

    // Aguarda até 10 minutos pelo login do usuário
    const maxWaitMs = 600000;
    const startTime = Date.now();
    let loggedIn = false;

    while (Date.now() - startTime < maxWaitMs) {
      await page.waitForTimeout(3000);
      const url = page.url();

      if (url.includes('/portal/') && !url.includes('/account/signin') && !url.includes('/login')) {
        loggedIn = true;
        break;
      }
    }

    if (loggedIn) {
      console.log('\n🎉 LOGIN DETECTADO COM SUCESSO!');
      console.log('Os cookies e credenciais foram armazenados no perfil persistente.');
      console.log('Navegando para confirmação da lista de produtos...');
      await page.goto(SHOPEE_PRODUCT_LIST_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      console.log('✅ Pronto! A sessão está salva e pronta para o robô de atributos.');
    } else {
      console.log('\n⚠️ Tempo limite atingido (10 minutos). Se você concluiu o login, execute novamente.');
    }
  } catch (error) {
    console.error('\n❌ Erro durante o processo de login:', error.message);
  } finally {
    await context.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('login.mjs')) {
  runInteractiveLogin().catch(console.error);
}
