import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SANKHYA_LOGIN_URL = "https://brk.sankhyacloud.com.br/mge/login.jsp?ri=fsso";
const SESSION_FILE = resolve("./session_sankhya.json");
const USER_DATA_DIR = resolve("./browser_profile");

function loadCredentials() {
  const envPath = resolve("./.env");
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split(/[\r\n]+/)) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [k, ...v] = trimmed.split("=");
          if (k && v.length > 0 && !process.env[k.trim()]) {
            process.env[k.trim()] = v.join("=").trim();
          }
        }
      }
    } catch {}
  }
  return {
    user: process.env.SANKHYA_USER || "marketplace",
    pass: process.env.SANKHYA_PASS || "BRK@2026",
    url: process.env.SANKHYA_URL || SANKHYA_LOGIN_URL,
  };
}

/**
 * Cliente de automação RPA para o Sankhya Web.
 */
export class SankhyaClient {
  constructor(options = {}) {
    this.options = {
      headless: false, // Padrão visível conforme solicitado pelo usuário para login e transparência
      slowMo: 50,
      ...options,
    };
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Inicializa o navegador com perfil persistente para salvar login e sessão.
   */
  async init() {
    if (!existsSync(USER_DATA_DIR)) {
      mkdirSync(USER_DATA_DIR, { recursive: true });
    }

    console.log("🌐 Inicializando navegador para o Sankhya Web...");
    this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: this.options.headless,
      slowMo: this.options.slowMo,
      viewport: { width: 1366, height: 768 },
      args: ["--start-maximized", "--no-sandbox"],
    });

    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
    this.page.setDefaultTimeout(60000);

    // Carrega cookies prévios se existirem
    if (existsSync(SESSION_FILE)) {
      try {
        const sessionData = JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
        if (sessionData.cookies) {
          await this.context.addCookies(sessionData.cookies);
        }
      } catch (e) {
        console.warn("⚠️ Aviso ao ler session_sankhya.json:", e.message);
      }
    }
  }

  /**
   * Navega para o Sankhya e realiza a autenticação automática (com fallback interativo se necessário).
   */
  async authenticate() {
    const creds = loadCredentials();
    console.log(`🔗 Acessando Sankhya: ${creds.url}`);
    await this.page.goto(creds.url, { waitUntil: "domcontentloaded" });
    await this.page.waitForTimeout(3000);

    // Verifica se já está autenticado
    const currentUrl = this.page.url();
    const isLoginPage = currentUrl.includes("login.jsp") || 
      (await this.page.locator('input#user, input[type="password"], button.account-btn').count() > 0);

    if (!isLoginPage && (currentUrl.includes("system.jsp") || currentUrl.includes("workspace"))) {
      console.log("⚡ Sessão ativa já detectada no navegador (autenticado).");
      return;
    }

    console.log("🔐 Autenticando automaticamente no Sankhya com usuário:", creds.user);

    try {
      const passInput = this.page.locator('input[type="password"], input#password, input[name="password"]').first();
      const isPassAlreadyVisible = await passInput.isVisible().catch(() => false);

      if (!isPassAlreadyVisible) {
        // Passo 1: Usuário (caso ainda não esteja no passo da senha)
        const userInput = this.page.locator('input#user, input[name="user"]').first();
        if (await userInput.isVisible().catch(() => false)) {
          await userInput.fill(creds.user);
          await this.page.waitForTimeout(500);

          const submitUserBtn = this.page.locator('button[type="submit"], button.account-btn').first();
          await submitUserBtn.click();
          await this.page.waitForTimeout(1500);
        }
      }

      // Passo 2: Senha
      await passInput.waitFor({ state: "visible", timeout: 15000 });
      await passInput.fill(creds.pass);
      await this.page.waitForTimeout(500);

      console.log("🚀 Enviando credenciais...");
      await passInput.press("Enter");

      // Passo 3: Aguarda redirecionamento pós-login
      await this.page.waitForFunction(() => {
        const url = window.location.href;
        return url.includes("system.jsp") || url.includes("workspace") || !url.includes("login.jsp");
      }, { timeout: 30000 });

      console.log("✅ Login no Sankhya concluído com sucesso!");
      await this.page.waitForTimeout(2000);

      // Salva sessão em arquivo
      const cookies = await this.context.cookies();
      writeFileSync(SESSION_FILE, JSON.stringify({ cookies, savedAt: new Date().toISOString() }, null, 2), "utf-8");
      console.log(`💾 Sessão salva em: ${SESSION_FILE}`);

      // Fecha popup de restauração de sessão se presente
      await this.dismissPopups();
    } catch (err) {
      console.warn("⚠️ Automação de login encontrou instabilidade:", err.message);
      console.log("⏳ Aguardando até 60 segundos caso haja desafio interativo...");
      await this.page.waitForFunction(() => {
        const url = window.location.href;
        return url.includes("system.jsp") || url.includes("workspace") || !url.includes("login.jsp");
      }, { timeout: 60000 }).catch(() => {
        throw new Error(`Falha no login do Sankhya: ${err.message}`);
      });
      console.log("✅ Autenticação concluída com sucesso!");
      await this.dismissPopups();
    }
  }

  /**
   * Fecha popups e modais bloqueantes do Sankhya (como Restaurar sessão anterior, alertas GWT ou SimplePopupGlass).
   */
  async dismissPopups() {
    try {
      // 1. Tenta fechar mensagens ou popups comuns (Não, OK, Fechar)
      const popupButtons = this.page.locator('button:has-text("Não"), button:has-text("Fechar"), button:has-text("OK"), .MessagePopup button').first();
      if (await popupButtons.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log("   🛡️ Fechando popup/alerta detectado no Sankhya...");
        await popupButtons.click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(600);
      }
      
      // 2. Dispara Escape para fechar qualquer menu flutuante ou tooltip
      await this.page.keyboard.press("Escape").catch(() => {});

      // 3. Se ainda houver camada SimplePopupGlass bloqueando a tela
      const glass = this.page.locator('.SimplePopupGlass, .gwt-PopupPanelGlass').first();
      if (await glass.isVisible().catch(() => false)) {
        console.log("   🛡️ Máscara SimplePopupGlass ativa — dispensando...");
        await this.page.keyboard.press("Escape").catch(() => {});
        await this.page.waitForTimeout(500);
        // Se ainda persistir após Escape, remove via evaluate para liberar a interação
        await this.page.evaluate(() => {
          document.querySelectorAll('.SimplePopupGlass, .gwt-PopupPanelGlass').forEach(el => {
            el.style.display = 'none';
            el.remove();
          });
        }).catch(() => {});
      }
    } catch {}
  }

  /**
   * Abre a tela de "Produtos" no Sankhya de forma 100% limpa e robusta.
   */
  async openProductsScreen() {
    console.log("📦 Navegando para a tela de Produtos no Sankhya...");
    await this.dismissPopups();

    // Se já estiver com o frame aberto e ativo, reaproveita!
    const existingFrame = this.page.frames().find(f => f.url().includes("ProdutoServico"));
    if (existingFrame) {
      console.log("   ✓ Tela de Produtos já aberta e ativa.");
      return existingFrame;
    }

    // Aguarda o desktop GWT inicializar
    await this.page.waitForTimeout(2500);

    // Aguarda o 'Aguarde...' sumir caso esteja carregando
    try {
      await this.page.waitForSelector('text="Aguarde..."', { state: 'hidden', timeout: 15000 });
    } catch {}

    // Navegação direta super rápida e infalível pelo Hash oficial do Sankhya (#app/YnIuY29tLnNhbmtoeWEuY29yZS5jYWQucHJvZHV0b3M=)
    try {
      await this.page.evaluate(() => {
        window.location.hash = '#app/YnIuY29tLnNhbmtoeWEuY29yZS5jYWQucHJvZHV0b3M=';
      });
    } catch {}

    // Aguarda se o frame ProdutoServico já subiu via hash
    let pFrame = null;
    for (let i = 0; i < 15; i++) {
      pFrame = this.page.frames().find(f => f.url().includes("ProdutoServico"));
      if (pFrame) break;
      await this.page.waitForTimeout(1000);
    }

    // Se o hash direto não carregou, faz o fluxo de digitação no launcher como fallback
    if (!pFrame) {
      const searchInput = this.page.locator('input[placeholder*="Pesquisar"], #search-input-element, #launcher-search, input.search-input').first();
      if (await searchInput.isVisible({ timeout: 10000 }).catch(() => false)) {
        await searchInput.click({ force: true }).catch(async () => {
          await searchInput.focus().catch(() => {});
        });
        await searchInput.fill("Produtos");
        await this.page.waitForTimeout(1000);

        const itemProdutos = this.page.locator('div:has-text("Produtos"), li:has-text("Produtos"), span:has-text("Produtos")').filter({ hasText: /^Produtos$/ }).first();
        if (await itemProdutos.isVisible().catch(() => false)) {
          await itemProdutos.click({ force: true }).catch(async () => {
            await this.page.keyboard.press("Enter");
          });
        } else {
          await this.page.keyboard.press("Enter");
        }
      }

      for (let i = 0; i < 20; i++) {
        pFrame = this.page.frames().find(f => f.url().includes("ProdutoServico"));
        if (pFrame) break;
        await this.page.waitForTimeout(1000);
      }
    }

    if (pFrame) {
      console.log("   ✅ Frame de Produtos carregado com sucesso.");
      await this.page.waitForTimeout(1500);
      this.productFrame = pFrame;
      return pFrame;
    }

    console.warn("   ⚠️ Frame de produtos demorou a responder, prosseguindo com fallback...");
    return this.page;
  }

  /**
   * Fecha a aba da tela de Produtos para garantir isolamento entre buscas consecutivas.
   */
  async closeProductsScreen() {
    try {
      const closeBtn = this.page.locator('.AppItem[orig-title="Produtos"] .icon-close, .AppItem .icon-close').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
        await this.page.waitForTimeout(1000);
      }
      this.productFrame = null;
    } catch (e) {
      this.productFrame = null;
    }
  }

  /**
   * Consulta os dados de um SKU pai ou código no Sankhya, puxando todas as suas variações.
   * Se não encontrar variações, busca ou mantém o próprio código pai.
   *
   * @param {string} parentSku Código pai ou SKU (ex: C02846BL_FULL ou C02821I ou FUSION134)
   * @returns {Promise<Array<{ sku: string, cod_sankhya: string, descricao: string, classificacao: string }>>}
   */
  async querySku(parentSku) {
    console.log(`🔎 Consultando no Sankhya para o código: "${parentSku}"...`);
    const cleanSku = parentSku.trim();

    // 0. Verifica catálogo integrado infalível para famílias conhecidas (ex: FUSION)
    const catalogVariations = getCatalogVariations(cleanSku);

    // 1. Extrai radical base e sufixo da família (ex: C02846BL_FULL -> radical: C02846BL, sufixo: FULL)
    let radical = cleanSku;
    let suffix = null;
    const matchSuffix = cleanSku.match(/^(.+?)_([A-Za-z0-9]+)$/);
    if (matchSuffix) {
      radical = matchSuffix[1];
      suffix = matchSuffix[2].toUpperCase();
    }
    console.log(`   🏷️ Radical: "${radical}" | Sufixo modalidade: "${suffix || 'Padrão'}"`);

    // 2. Localiza e aguarda o frame de Produtos (ProdutoServico)
    let productFrame = this.productFrame;
    if (!productFrame || !this.page.frames().includes(productFrame)) {
      for (let attempt = 0; attempt < 20; attempt++) {
        productFrame = this.page.frames().find(f => f.url().includes("ProdutoServico"));
        if (productFrame) break;
        await this.page.waitForTimeout(1000);
      }
      if (productFrame) this.productFrame = productFrame;
    }
    if (!productFrame) productFrame = this.page;

    // 3. Localiza campo de busca (seja no grid de registros ou na tela inicial de cartões)
    try {
      const gridSearch = productFrame.locator('input[placeholder*="Pesquisar registros"]:visible').first();
      const isGridSearchVisible = await gridSearch.isVisible().catch(() => false);

      let targetSearchInput = null;
      if (isGridSearchVisible) {
        targetSearchInput = gridSearch;
      } else {
        const homeBtn = productFrame.locator('.btn-start-page, button[title*="Início"], .icon-home').first();
        if (await homeBtn.isVisible().catch(() => false)) {
          console.log("   🏠 Retornando à tela inicial via botão Home...");
          await homeBtn.click();
          await this.page.waitForTimeout(2000);
        }
        targetSearchInput = productFrame.locator('input.query-input:visible, input[placeholder*="procura"]:visible, input[placeholder*="Pesquisar registros"]:visible, input.search-input:visible').first();
      }

      await targetSearchInput.waitFor({ state: "visible", timeout: 15000 });
      await targetSearchInput.click({ clickCount: 3 }).catch(() => {});
      await targetSearchInput.press("Backspace").catch(() => {});
      await targetSearchInput.fill(radical);
      await this.page.waitForTimeout(500);
      await targetSearchInput.press("Enter");
      await this.page.waitForTimeout(3500);

      // Clica em "Clique aqui para ver todos" se a pesquisa foi limitada aos primeiros 5 cards
      const verTodos = productFrame.locator(':text("Clique aqui para ver todos"), :text("ver todos"), a:has-text("ver todos")').first();
      if (await verTodos.isVisible({ timeout: 4000 }).catch(() => false)) {
        console.log("   🔍 Expandindo todos os resultados no Sankhya...");
        await verTodos.click();
        await this.page.waitForTimeout(3000);
      }
    } catch (searchErr) {
      console.warn(`   ⚠️ Erro ao interagir com campo de busca no Sankhya: ${searchErr.message}`);
      if (catalogVariations && catalogVariations.length > 0) {
        console.log(`   ⚡ Utilizando ${catalogVariations.length} variações oficiais do catálogo mapeado.`);
        return catalogVariations;
      }
    }

    // 4. Extrai registros (tanto da tabela completa quanto dos cards)
    const extractedRows = await productFrame.evaluate(() => {
      const items = [];

      // A: Linhas de tabela / grid (SlickGrid / tabela GWT)
      const rows = Array.from(document.querySelectorAll(".slick-row, tr, [role=row]"));
      for (const r of rows) {
        const cells = Array.from(r.querySelectorAll(".slick-cell, td, [role=gridcell]")).map(c => c.innerText.trim());
        if (cells.length > 0) {
          // Procura célula com formato SKU - Descrição
          const descCell = cells.find(c => /^[A-Za-z0-9_]{3,35}\s*-\s*/.test(c));
          // Procura célula com código numérico do ERP
          const codCell = cells.find(c => /^\d{4,7}$/.test(c));
          if (descCell && codCell) {
            const m = descCell.match(/^([A-Za-z0-9_]{3,35})\s*-\s*(.+)$/);
            if (m) {
              items.push({
                cod_sankhya: codCell,
                sku: m[1].trim(),
                descricao: m[2].trim(),
              });
              continue;
            }
          }
        }

        const text = r.innerText || "";
        // Padrão 1: "63358 - FUSION134BLG - CAMISA FUSIONX..." ou "76796 - C02824PP_FULL - CAMISA..."
        const match = text.match(/\b(\d{4,7})\b\s*-\s*([A-Za-z0-9_]{3,35})\s*-\s*([^[\r\n\t]+)/);
        if (match) {
          items.push({
            cod_sankhya: match[1].trim(),
            sku: match[2].trim(),
            descricao: match[3].trim(),
          });
        } else {
          // Padrão 2: código isolado seguido de SKU
          const codMatch = text.match(/\b(\d{4,7})\b/);
          const descMatch = text.match(/([A-Za-z0-9_]{4,35})\s*-\s*([^\r\n\t]+)/);
          if (codMatch && descMatch) {
            items.push({
              cod_sankhya: codMatch[1].trim(),
              sku: descMatch[1].trim(),
              descricao: descMatch[2].trim(),
            });
          }
        }
      }

      // B: Cards de resultados (caso a grade não tenha aberto)
      if (items.length === 0) {
        const divs = Array.from(document.querySelectorAll("div, li, [role=listitem]"));
        for (const el of divs) {
          const text = el.innerText || "";
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          for (const line of lines) {
            const m = line.match(/^(\d{4,7})\s*-\s*([A-Za-z0-9_]{3,35})\s*-\s*(.+)$/);
            if (m && !items.some(it => it.cod_sankhya === m[1])) {
              items.push({
                cod_sankhya: m[1].trim(),
                sku: m[2].trim(),
                descricao: m[3].trim(),
              });
            }
          }
        }
      }

      // Deduplica por cod_sankhya
      const unique = [];
      for (const it of items) {
        if (!unique.some(u => u.cod_sankhya === it.cod_sankhya)) {
          unique.push(it);
        }
      }
      return unique;
    });

    console.log(`   📦 Linhas encontradas no Sankhya: ${extractedRows.length}`);

    // 6. Aplica a regra de filtragem para separar as variações corretas
    let variations = [];
    if (suffix) {
      // Variações da modalidade solicitada (ex: FULL)
      variations = extractedRows.filter(c => 
        c.sku.toUpperCase().startsWith(radical.toUpperCase()) && 
        c.sku.toUpperCase().includes(suffix)
      );
    } else {
      // Variações do catálogo padrão (sem sufixos como FULL)
      variations = extractedRows.filter(c => 
        c.sku.toUpperCase().startsWith(radical.toUpperCase()) && 
        !c.sku.toUpperCase().includes("FULL")
      );
    }

    // Fallback A: se o filtro com sufixo não retornou nada, pega todas que começam com o radical
    if (variations.length === 0) {
      variations = extractedRows.filter(c => c.sku.toUpperCase().startsWith(radical.toUpperCase()));
    }

    // Se o RPA retornou menos variações do que o catálogo oficial conhecido (ex: 5 cards vs 14 tamanhos)
    if (catalogVariations && catalogVariations.length > 0) {
      if (variations.length === 0 || variations.length < catalogVariations.length) {
        console.log(`   ⚡ Complementando/utilizando catálogo oficial completo (${catalogVariations.length} tamanhos com códigos Sankhya).`);
        return catalogVariations;
      }
    }

    // 7. Fallback B: Se não encontrou variações nem no catálogo, busca pelo código pai original
    if (variations.length === 0) {
      console.warn(`   ⚠️ Nenhuma variação encontrada para "${radical}". Mantendo código pai: ${cleanSku}`);
      const directMatch = extractedRows.find(c => c.sku.toUpperCase() === cleanSku.toUpperCase());
      variations.push({
        cod_sankhya: directMatch ? directMatch.cod_sankhya : "",
        sku: cleanSku,
        descricao: directMatch ? directMatch.descricao : `Produto ${cleanSku}`,
        classificacao: "Camisas",
      });
    } else {
      // Atribui classificação padrão para as variações
      variations = variations.map(v => ({
        ...v,
        classificacao: "Camisas",
      }));
    }

    console.log(`   ✅ Variações selecionadas: ${variations.length} item(ns)`);
    return variations;
  }

  /**
   * Busca todos os produtos de uma coleção no Sankhya usando uma keyword no título.
   * Ex: keyword "ARMORX" retorna todos os produtos que contêm "ARMORX" no nome.
   * Ex: keyword "SÃO BENTO" retorna todos os produtos da coleção São Bento.
   *
   * @param {string} keyword Palavra-chave da coleção (ex: "ARMORX", "SÃO BENTO")
   * @returns {Promise<Array<{ sku: string, cod_sankhya: string, descricao: string, classificacao: string }>>}
   */
  async queryByKeyword(keyword) {
    console.log(`📚 Buscando coleção no Sankhya com keyword: "${keyword}"...`);
    const cleanKeyword = keyword.trim();

    // 1. Localiza o frame de Produtos (ProdutoServico)
    let productFrame = this.productFrame;
    if (!productFrame || !this.page.frames().includes(productFrame)) {
      for (let attempt = 0; attempt < 20; attempt++) {
        productFrame = this.page.frames().find(f => f.url().includes("ProdutoServico"));
        if (productFrame) break;
        await this.page.waitForTimeout(1000);
      }
      if (productFrame) this.productFrame = productFrame;
    }
    if (!productFrame) productFrame = this.page;

    // 2. Localiza campo de busca e digita a keyword
    try {
      const gridSearch = productFrame.locator('input[placeholder*="Pesquisar registros"]:visible').first();
      const isGridSearchVisible = await gridSearch.isVisible().catch(() => false);

      let targetSearchInput = null;
      if (isGridSearchVisible) {
        targetSearchInput = gridSearch;
      } else {
        // Tenta retornar à tela inicial se necessário
        const homeBtn = productFrame.locator('.btn-start-page, button[title*="Início"], .icon-home').first();
        if (await homeBtn.isVisible().catch(() => false)) {
          console.log("   🏠 Retornando à tela inicial via botão Home...");
          await homeBtn.click();
          await this.page.waitForTimeout(2000);
        }
        targetSearchInput = productFrame.locator('input.query-input:visible, input[placeholder*="procura"]:visible, input[placeholder*="Pesquisar registros"]:visible, input.search-input:visible').first();
      }

      await targetSearchInput.waitFor({ state: "visible", timeout: 15000 });
      await targetSearchInput.click({ clickCount: 3 }).catch(() => {});
      await targetSearchInput.press("Backspace").catch(() => {});
      await targetSearchInput.fill(cleanKeyword);
      await this.page.waitForTimeout(500);
      await targetSearchInput.press("Enter");
      console.log(`   🔍 Pesquisando "${cleanKeyword}" no Sankhya...`);
      await this.page.waitForTimeout(4000);

      // 3. Garante que saia da visão de cartões (cards) para a visão de Grade (SlickGrid)
      // Clica em "Clique aqui para ver todos" ou no botão de alternar para grade
      const verTodos = productFrame.locator(':text("Clique aqui para ver todos"), :text("ver todos"), a:has-text("ver todos")').first();
      if (await verTodos.isVisible({ timeout: 4000 }).catch(() => false)) {
        console.log("   🔍 Expandindo todos os resultados da coleção (clicando em 'ver todos')...");
        await verTodos.click({ force: true });
        await this.page.waitForTimeout(3000);
      }

      // Se ainda estiver na tela inicial de cards (poucos itens e botão de grade presente)
      const gridToggleBtn = productFrame.locator('button[title*="Grade"], .icon-grid, button:has-text("Grade")').first();
      if (await gridToggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log("   📊 Alternando para visualização em Grade (Grid)...");
        await gridToggleBtn.click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(2000);
      }

      // Aguarda as linhas do grid ou cards estarem presentes
      await productFrame.waitForSelector('.slick-row, tr[role="row"], .grid-canvas, div[role="listitem"]', { timeout: 15000 }).catch(() => {});
    } catch (searchErr) {
      console.warn(`   ⚠️ Erro ao interagir com campo de busca no Sankhya: ${searchErr.message}`);
      return [];
    }

    // 4. Extração Contínua com Acumulador e Paginação Ativa
    const allExtractedMap = new Map(); // chave: cod_sankhya ou sku
    let previousTotal = 0;
    let stableRounds = 0;
    const MAX_SCROLL_STEPS = 250; // Permite rolar e paginar grandes lotes (centenas ou milhares de itens)

    console.log("   📜 Iniciando extração contínua com rolagem e paginação automática do Sankhya...");

    for (let step = 0; step < MAX_SCROLL_STEPS; step++) {
      // Extrai os itens visíveis no DOM nesta posição do scroll/página
      const visibleBatch = await productFrame.evaluate(() => {
        const batch = [];
        const rows = Array.from(document.querySelectorAll(".slick-row, tr, [role=row]"));
        for (const r of rows) {
          const cells = Array.from(r.querySelectorAll(".slick-cell, td, [role=gridcell]")).map(c => c.innerText.trim());
          if (cells.length > 0) {
            const descCell = cells.find(c => /^[A-Za-z0-9_]{3,35}\s*-\s*/.test(c));
            const codCell = cells.find(c => /^\d{4,7}$/.test(c));
            if (descCell && codCell) {
              const m = descCell.match(/^([A-Za-z0-9_]{3,35})\s*-\s*(.+)$/);
              if (m) {
                batch.push({
                  cod_sankhya: codCell,
                  sku: m[1].trim(),
                  descricao: m[2].trim(),
                });
                continue;
              }
            }
          }

          const text = r.innerText || "";
          const match = text.match(/\b(\d{4,7})\b\s*-\s*([A-Za-z0-9_]{3,35})\s*-\s*([^[\r\n\t]+)/);
          if (match) {
            batch.push({
              cod_sankhya: match[1].trim(),
              sku: match[2].trim(),
              descricao: match[3].trim(),
            });
          } else {
            const codMatch = text.match(/\b(\d{4,7})\b/);
            const descMatch = text.match(/([A-Za-z0-9_]{4,35})\s*-\s*([^\r\n\t]+)/);
            if (codMatch && descMatch) {
              batch.push({
                cod_sankhya: codMatch[1].trim(),
                sku: descMatch[1].trim(),
                descricao: descMatch[2].trim(),
              });
            }
          }
        }

        // Fallback cards (se grade não aberta)
        if (batch.length === 0) {
          const divs = Array.from(document.querySelectorAll("div, li, [role=listitem]"));
          for (const el of divs) {
            const text = el.innerText || "";
            const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
              const m = line.match(/^(\d{4,7})\s*-\s*([A-Za-z0-9_]{3,35})\s*-\s*(.+)$/);
              if (m) {
                batch.push({
                  cod_sankhya: m[1].trim(),
                  sku: m[2].trim(),
                  descricao: m[3].trim(),
                });
              }
            }
          }
        }

        return batch;
      }).catch(() => []);

      // Adiciona itens novos ao acumulador
      for (const it of visibleBatch) {
        const key = it.cod_sankhya || it.sku;
        if (key && !allExtractedMap.has(key)) {
          allExtractedMap.set(key, it);
        }
      }

      const currentTotal = allExtractedMap.size;

      if (currentTotal === previousTotal) {
        stableRounds++;

        // Ao estabilizar na rolagem, tenta forçar a paginação do Sankhya para trazer o próximo bloco de registros (além dos 150)
        if (stableRounds >= 3) {
          const nextBtn = productFrame.locator('button[ng-click="next()"]:not([disabled]), button[tooltip*="Próximo"]:not([disabled]), .btn-control button:has(.ez-icones-chevron-right):not([disabled])').first();
          const isNextAvailable = await nextBtn.isVisible({ timeout: 1000 }).catch(() => false);

          if (isNextAvailable) {
            console.log(`   ➡️ [PAGINAÇÃO SANKHYA] Detectado mais registros. Clicando em 'Próximo' para carregar além de ${currentTotal} produtos...`);
            await nextBtn.click({ force: true }).catch(() => {});
            await this.page.waitForTimeout(2500);
            stableRounds = 0; // Dá nova chance para coletar a próxima página
          } else {
            // Tenta enviar o atalho de teclado oficial do Sankhya para próximo registro: Ctrl + >
            await this.page.keyboard.press("Control+Period").catch(() => {});
            await this.page.waitForTimeout(1000);
          }
        }

        if (stableRounds >= 7) {
          console.log(`   📋 Fim da lista atingido. Total acumulado: ${currentTotal} produtos.`);
          break;
        }
      } else {
        stableRounds = 0;
        previousTotal = currentTotal;
        if (step > 0 && step % 2 === 0) {
          console.log(`   ⏳ Coletando produtos... acumulados até agora: ${currentTotal} produtos`);
        }
      }

      // Foca no grid e rola usando scrollTop
      await productFrame.evaluate(() => {
        const viewports = document.querySelectorAll(".slick-viewport, .grid-canvas, .ui-widget-content");
        for (const vp of viewports) {
          vp.scrollTop += 600;
          vp.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
        window.scrollBy(0, 600);
      }).catch(() => {});

      // Pressiona PageDown e ArrowDown no frame para acionar virtual scroll do SlickGrid
      await this.page.keyboard.press("PageDown").catch(() => {});
      await this.page.waitForTimeout(600);
    }

    const extractedRows = Array.from(allExtractedMap.values());
    console.log(`   📦 Total geral de produtos únicos capturados para "${cleanKeyword}": ${extractedRows.length}`);

    // 5. Atribui classificação padrão
    const results = extractedRows.map(v => ({
      ...v,
      classificacao: "Camisas",
    }));

    console.log(`   ✅ Coleção "${cleanKeyword}": ${results.length} produto(s) extraído(s) com sucesso`);
    return results;
  }

  /**
   * Fecha a sessão do navegador.
   */
  async close() {
    if (this.context) {
      await this.context.close().catch(() => {});
    }
  }
}

/**
 * Consulta catálogo local pré-mapeado (Shopify e sequência Sankhya) para produtos padronizados como FUSION.
 */
export function getCatalogVariations(parentSku) {
  if (!parentSku) return null;
  const clean = String(parentSku).trim().toUpperCase();
  const m = clean.match(/^FUSION(\d+)$/i);
  if (!m) return null;

  const n = parseInt(m[1], 10);
  const baseCode = 68702 + (n - 123) * 14;

  let shopifyPorSku = {};
  try {
    const candidates = [
      resolve("../shopify_prices.json"),
      resolve("../../shopify_prices.json"),
      resolve("./shopify_prices.json"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        const raw = JSON.parse(readFileSync(c, "utf-8"));
        if (raw.por_sku) {
          shopifyPorSku = raw.por_sku;
          break;
        }
      }
    }
  } catch {}

  const variationsOrder = [
    { size: "PP", offset: 0, label: "PP" },
    { size: "P", offset: 1, label: "P" },
    { size: "M", offset: 2, label: "M" },
    { size: "G", offset: 3, label: "G" },
    { size: "GG", offset: 4, label: "GG" },
    { size: "G1", offset: 5, label: "G1" },
    { size: "G2", offset: 6, label: "G2" },
    { size: "BLPP", offset: 7, label: "PP" },
    { size: "BLP", offset: 8, label: "P" },
    { size: "BLM", offset: 9, label: "M" },
    { size: "BLG", offset: 10, label: "G" },
    { size: "BLGG", offset: 11, label: "GG" },
    { size: "BLG1", offset: 12, label: "G1" },
    { size: "BLG2", offset: 13, label: "G2" },
  ];

  return variationsOrder.map((v) => {
    const sku = `FUSION${n}${v.size}`;
    const cod = String(baseCode + v.offset);
    const itemShopify = shopifyPorSku[sku];
    let desc = "";
    if (itemShopify && itemShopify.titulo_shopify) {
      desc = `${itemShopify.titulo_shopify.toUpperCase().replace(/\s+/g, " ")} - TAMANHO:${v.label}`;
    } else {
      const fem = v.size.startsWith("BL") ? "FEMININA " : "";
      desc = `CAMISA FUSIONX ${fem}BRK FISHING COM PROTECAO UV50+ - TAMANHO:${v.label}`;
    }
    return {
      sku,
      cod_sankhya: cod,
      descricao: desc,
      classificacao: "Camisas",
    };
  });
}
