import { SankhyaClient } from "./agent0-sankhya/src/sankhya_client.mjs";
import { resolve } from "node:path";

async function test() {
  const client = new SankhyaClient({ headless: true });
  try {
    await client.init();
    await client.authenticate();
    await client.page.waitForTimeout(3000);

    const screenshotLogin = resolve("agent0-sankhya", "scratch_screen_opened.png");
    await client.page.screenshot({ path: screenshotLogin });
    console.log("Screenshot inicial salvo:", screenshotLogin);

    console.log("Tentando abrir tela de Produtos...");
    const frame = await client.openProductsScreen();
    console.log("Frame retornado:", frame === client.page ? "PAGE (FALLBACK)" : "IFRAME SUCESSO");

    const screenshotAfterOpen = resolve("agent0-sankhya", "scratch_after_open.png");
    await client.page.screenshot({ path: screenshotAfterOpen });
    console.log("Screenshot após abrir Produtos:", screenshotAfterOpen);

    // Listar iframes atuais
    const frames = client.page.frames().map(f => f.url());
    console.log("URLs de todos os iframes ativos:", frames);

  } catch (e) {
    console.error("Erro no teste:", e);
  } finally {
    await client.close().catch(() => {});
  }
}

test();
