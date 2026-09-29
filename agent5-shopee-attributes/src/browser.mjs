import fs from 'node:fs';
import path from 'node:path';
import {
  USER_DATA_DIR,
  ACTION_TIMEOUT_MS,
  NAVIGATION_TIMEOUT_MS,
  SHOPEE_BASE_URL,
  SHOPEE_PRODUCT_LIST_URL
} from './config.mjs';

/**
 * Carrega a biblioteca Playwright de forma resiliente
 */
async function loadPlaywrightChromium() {
  const attempts = [
    'playwright',
    '../../agent3-rpa-magis5/node_modules/playwright/index.js',
    '../agent3-rpa-magis5/node_modules/playwright/index.js',
    './agent3-rpa-magis5/node_modules/playwright/index.js'
  ];

  for (const pkg of attempts) {
    try {
      const pw = await import(pkg);
      if (pw && pw.chromium) return pw.chromium;
      if (pw && pw.default && pw.default.chromium) return pw.default.chromium;
    } catch {}
  }
  throw new Error('Não foi possível carregar o módulo Playwright. Certifique-se de que o Playwright está instalado.');
}

/**
 * Cria ou recupera o contexto de navegador persistente para o Shopee Seller Center.
 * @param {object} options
 * @param {boolean} [options.headless=false]
 * @param {number} [options.slowMo=30]
 * @returns {Promise<{ context: import('playwright').BrowserContext, page: import('playwright').Page }>}
 */
export async function getShopeeBrowserContext(options = {}) {
  const chromium = await loadPlaywrightChromium();

  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  const headless = options.headless !== undefined ? options.headless : false;
  const slowMo = options.slowMo || 30;

  console.log(`🌐 [Agente 5] Inicializando Chromium com perfil persistente: ${USER_DATA_DIR}`);
  console.log(`   Modo: ${headless ? 'Headless (invisível)' : 'Headed (visível)'}`);

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    slowMo,
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars'
    ]
  });

  // Remove marcações de automação para evitar bloqueios anti-bot
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

  return { context, page };
}

/**
 * Verifica se a sessão atual do Shopee Seller Center está autenticada.
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
export async function checkShopeeAuth(page) {
  try {
    console.log('🔍 [Agente 5] Verificando autenticação no Shopee Seller Center...');
    await page.goto(SHOPEE_PRODUCT_LIST_URL, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (currentUrl.includes('/account/signin') || currentUrl.includes('/login') || currentUrl.includes('verify')) {
      console.log('⚠️ [Agente 5] Redirecionado para tela de login ou verificação.');
      return false;
    }

    // Procura por elementos característicos da interface de vendedor autenticado
    const portalIndicators = [
      '.shopee-sidebar',
      '.seller-header',
      '.header-user-name',
      '.nav-item',
      '.shopee-menu'
    ];

    for (const selector of portalIndicators) {
      if (await page.locator(selector).isVisible().catch(() => false)) {
        console.log(`✅ [Agente 5] Sessão autenticada ativa detectada via seletor "${selector}".`);
        return true;
      }
    }

    if (currentUrl.includes('/portal/')) {
      console.log('✅ [Agente 5] URL dentro do portal logado do Seller Center (/portal/).');
      return true;
    }

    return false;
  } catch (error) {
    console.warn(`⚠️ [Agente 5] Erro ao checar autenticação: ${error.message}`);
    return false;
  }
}
