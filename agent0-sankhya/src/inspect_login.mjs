import { SankhyaClient } from "../src/sankhya_client.mjs";

async function inspectPostLogin() {
  const client = new SankhyaClient({ headless: true });
  try {
    await client.init();
    await client.authenticate();
    await client.page.waitForTimeout(3000);
    await client.page.screenshot({ path: "./scratch_post_login.png" });
    console.log("Screenshot pós login salvo.");

    // Avalia o que é o SimplePopupGlass
    const info = await client.page.evaluate(() => {
      const glasses = Array.from(document.querySelectorAll('.SimplePopupGlass'));
      const popups = Array.from(document.querySelectorAll('.gwt-PopupPanel, .popupContent, [role="dialog"], .dialogMiddleCenter')).map(p => ({
        className: p.className,
        text: p.innerText?.slice(0, 300)
      }));
      const frames = Array.from(document.querySelectorAll('iframe')).map(f => f.src);
      const tabs = Array.from(document.querySelectorAll('.AppItem, [orig-title], .tab-item')).map(t => t.innerText || t.getAttribute('orig-title'));
      return {
        glassesCount: glasses.length,
        popups,
        frames,
        tabs
      };
    });
    console.log("DOM Info:", JSON.stringify(info, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}
inspectPostLogin();
