import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
  MAGIS5_LOGIN_URL,
  MAGIS5_BASE_URL,
  MAGIS5_EMAIL,
  MAGIS5_PASSWORD,
  SESSION_FILE,
  NAVIGATION_TIMEOUT_MS,
  ACTION_TIMEOUT_MS,
} from "./config.mjs";

/**
 * Obtém ou cria um contexto de navegador autenticado na Magis5.
 * Reutiliza `session.json` se existir para economizar tempo e evitar rate-limit.
 *
 * @param {import('playwright').Browser} browser
 * @returns {Promise<{ context: import('playwright').BrowserContext, page: import('playwright').Page }>}
 */
export async function getAuthenticatedContext(browser) {
  const hasSession = existsSync(SESSION_FILE);

  let context;
  if (hasSession) {
    try {
      context = await browser.newContext({ storageState: SESSION_FILE });
      const page = await context.newPage();
      page.setDefaultTimeout(ACTION_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

      // Testa se a sessão ainda está ativa navegando para a tela de produtos
      let isUnauthorized = false;
      page.on("response", (res) => {
        if (res.status() === 401 && res.url().includes("magis5.com.br")) {
          isUnauthorized = true;
        }
      });

      await page.goto("https://app.magis5.com.br/v2/admin/product/variations/variation.php", { waitUntil: "networkidle" });
      const currentUrl = page.url();

      if (!isUnauthorized && !currentUrl.includes("login") && !currentUrl.includes("autenticacao")) {
        console.log("🔑 Sessão existente reutilizada com sucesso (session.json).");
        return { context, page };
      }
      console.log("⚠️ Sessão salva expirada ou retornou 401. Realizando novo login...");
      await page.close();
      await context.close();
    } catch (err) {
      console.log(`⚠️ Falha ao reutilizar sessão: ${err.message}. Criando nova...`);
    }
  }

  // Cria novo contexto e realiza login
  context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

  if (!MAGIS5_EMAIL || !MAGIS5_PASSWORD) {
    console.log("\n⚠️ Credenciais da Magis5 não encontradas no arquivo .env.");
    console.log("👉 Por favor, faça login manualmente na janela do navegador que se abriu.");
    console.log("⏳ Aguardando autenticação manual (você tem até 5 minutos para logar)...");
    
    page.setDefaultTimeout(300000);
    await page.goto(MAGIS5_LOGIN_URL, { waitUntil: "domcontentloaded" });
    
    // Aguarda até 5 minutos para o usuário logar e a URL mudar
    await page.waitForURL((url) => !url.href.includes("/login"), { timeout: 300000 });

    // Aguarda carregar o painel
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(2000);
    await context.storageState({ path: SESSION_FILE });
    console.log(`\n✅ Login manual concluído com sucesso! Sessão salva em: ${SESSION_FILE}`);
    
    // Restaura timeouts normais
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    return { context, page };
  }

  console.log(`🔐 Acessando tela de login: ${MAGIS5_LOGIN_URL}`);
  await page.goto(MAGIS5_LOGIN_URL, { waitUntil: "networkidle" });

  const emailInput = page.locator('#login, input[type="email"], input[name="username"], input[name="email"], input[placeholder*="Email"]').first();
  const passInput = page.locator('#password, input[type="password"], input[name="password"], input[placeholder*="Senha"]').first();
  const submitBtn = page.locator('#kt_login_signin_submit, button[type="submit"]:has-text("Entrar"), button:has-text("Entrar")').first();

  await emailInput.waitFor({ state: "visible", timeout: ACTION_TIMEOUT_MS });
  await emailInput.fill(MAGIS5_EMAIL);

  await passInput.waitFor({ state: "visible", timeout: ACTION_TIMEOUT_MS });
  await passInput.fill(MAGIS5_PASSWORD);

  console.log("Submetendo formulário de login...");
  await submitBtn.click();

  // Aguarda confirmação de saída da página de login e entrada no dashboard
  await page.waitForURL(
    (url) => !url.href.includes("autenticacao") && !url.href.includes("login.php"),
    { timeout: NAVIGATION_TIMEOUT_MS }
  );

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(2000);

  // Salva o estado da sessão para próximos usos
  await context.storageState({ path: SESSION_FILE });
  console.log(`✅ Login concluído e sessão salva em: ${SESSION_FILE}`);

  return { context, page };
}
