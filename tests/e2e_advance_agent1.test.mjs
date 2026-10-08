import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("../agent0-sankhya/node_modules/playwright");

test("E2E FRONTEND: Clicar em 'Avançar e Baixar Fotos (Agente 1)' dispara transição e start request com sucesso", async () => {
  const panelHtml = fs.readFileSync(path.resolve("painel.html"), "utf8");

  let startRequestReceived = null;
  let activeBatchReceived = null;

  // Servidor mock que simula as rotas consumidas pelo front sem requisições reais
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/" || url.pathname === "/painel.html" || url.pathname === "/agent0.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(panelHtml);
      return;
    }

    if (url.pathname === "/api/active-batch") {
      if (req.method === "POST") {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
          activeBatchReceived = JSON.parse(body || "{}");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, activeSpreadsheet: activeBatchReceived.path }));
        });
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ activeSpreadsheet: null, filename: null }));
      return;
    }

    if (url.pathname === "/api/agents/start") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        startRequestReceived = JSON.parse(body || "{}");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, agentId: startRequestReceived.agent }));
      });
      return;
    }

    if (url.pathname === "/api/agents/logs") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ logs: [] }));
      return;
    }

    if (url.pathname === "/api/stats") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        totalFiles: 0,
        pendingPrices: 0,
        runningAgent: null,
        activeSpreadsheet: null,
        telemetry: { currentAgent: null, status: "idle" }
      }));
      return;
    }

    if (url.pathname === "/api/files") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ files: [] }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/painel.html`);

    // Injeta a simulação do resultado do Agente 0 gerando o card de planilha pronta
    await page.evaluate(() => {
      window.showSpreadsheetReadyCard({
        path: "uploads/planilha_sankhya_teste.xlsx",
        name: "planilha_sankhya_teste.xlsx",
        downloadUrl: "/uploads/planilha_sankhya_teste.xlsx",
        metrics: { total: 10, comCodigo: 10, semCodigo: 0, naoEncontrados: [] }
      });
    });

    // Localiza e clica no botão "Avançar e Baixar Fotos (Agente 1)"
    const advanceBtn = page.locator("button:has-text('Avançar e Baixar Fotos (Agente 1)')");
    await advanceBtn.waitFor({ state: "visible", timeout: 3000 });
    await advanceBtn.click();

    // Aguarda processamento da navegação e disparo da requisição POST /api/agents/start
    await page.waitForTimeout(1000);

    // Valida que o Agente 1 foi selecionado
    const currentAgent = await page.evaluate(() => window.currentAgent);
    assert.strictEqual(currentAgent, "agent1", "O painel deve comutar para o Agente 1");

    // Valida que active-batch recebeu o arquivo da planilha
    assert.ok(activeBatchReceived, "Deveria ter chamado /api/active-batch");
    assert.strictEqual(activeBatchReceived.path, "uploads/planilha_sankhya_teste.xlsx");

    // Valida que start request foi enviado com agente correto e opções adequadas
    assert.ok(startRequestReceived, "Deveria ter enviado POST /api/agents/start");
    assert.strictEqual(startRequestReceived.agent, "agent1", "Start request deve ser para agent1");
    assert.strictEqual(startRequestReceived.options.action, "auto");
    assert.strictEqual(startRequestReceived.options.inputFile, "planilha_sankhya_teste.xlsx");

  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("E2E FRONTEND: Tratamento resiliente de erro 401 e 409 em sendAgentStartRequest exibe orientação clara no chat", async () => {
  const panelHtml = fs.readFileSync(path.resolve("painel.html"), "utf8");

  let simulateStatusCode = 401;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");

    if (url.pathname === "/" || url.pathname === "/painel.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(panelHtml);
      return;
    }

    if (url.pathname === "/api/agents/start") {
      res.writeHead(simulateStatusCode, { "Content-Type": "application/json" });
      if (simulateStatusCode === 401) {
        res.end(JSON.stringify({ error: "Não autorizado. Token ausente ou inválido." }));
      } else {
        res.end(JSON.stringify({ error: "Um agente já está em execução (agent0). Aguarde a finalização." }));
      }
      return;
    }

    if (url.pathname === "/api/agents/logs") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ logs: [] }));
      return;
    }

    if (url.pathname === "/api/stats") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ telemetry: { currentAgent: null, status: "idle" } }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({}));
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/painel.html`);

    // Cenário 1: 401 não autorizado -> deve exibir mensagem com orientação de Token
    simulateStatusCode = 401;
    await page.evaluate(() => {
      window.executeChipAction("runAgent1Auto");
    });
    await page.waitForTimeout(600);

    const chatText401 = await page.locator("#chat-feed-agent1").innerText();
    assert.ok(
      chatText401.includes("Acesso Não Autorizado") || chatText401.includes("Token"),
      "Deve renderizar card ou aviso instruindo sobre Token de Acesso em erro 401"
    );

    // Cenário 2: 409 agente ocupado -> deve exibir mensagem orientando aguardar ou interromper
    simulateStatusCode = 409;
    await page.evaluate(() => {
      window.executeChipAction("runAgent1Auto");
    });
    await page.waitForTimeout(600);

    const chatText409 = await page.locator("#chat-feed-agent1").innerText();
    assert.ok(
      chatText409.includes("Robô Ocupado") || chatText409.includes("já está em execução"),
      "Deve renderizar orientação no chat quando o robô estiver ocupado"
    );

  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("E2E FRONTEND: Painel exibe cards fiéis nos três cenários do Agente 1 (100% sucesso, parcial e zero)", async () => {
  const panelHtml = fs.readFileSync(path.resolve("painel.html"), "utf8");

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");

    if (url.pathname === "/" || url.pathname === "/painel.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(panelHtml);
      return;
    }

    if (url.pathname === "/api/agents/logs") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ logs: [] }));
      return;
    }

    if (url.pathname === "/api/stats") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ telemetry: { currentAgent: null, status: "idle" } }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({}));
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/painel.html`);

    // Cenário 1: 100% com foto
    await page.evaluate(() => {
      window.showAgent1ResultCard({
        totalLote: 5,
        processados: 5,
        comFotos: 5,
        reutilizados: 0,
        naoEncontrados: [],
        semFotos: [],
        errosRede: [],
        pendentesRestantes: 0
      }, "lote_teste.csv");
    });
    await page.waitForTimeout(300);

    const chat100 = await page.locator("#chat-feed-agent1").innerText();
    assert.ok(
      chat100.includes("Download Concluído! 100% dos SKUs com Fotos") || chat100.includes("100%"),
      "Deve mostrar sucesso total"
    );
    const advanceBtn100 = page.locator('button:has-text("Avançar e Enriquecer com Agente 2")');
    assert.ok(await advanceBtn100.count() > 0, "Botão Avançar e Enriquecer com Agente 2 deve existir em 100% sucesso");

    // Cenário 2: Parcial (parte com foto, parte sem)
    await page.evaluate(() => {
      window.showAgent1ResultCard({
        totalLote: 5,
        processados: 5,
        comFotos: 3,
        erros: 2,
        reutilizados: 0,
        naoEncontrados: ["SKU_FALHA_1"],
        semFotos: ["SKU_FALHA_2"],
        errosRede: [],
        pendentesRestantes: 0
      }, "lote_teste.csv");
    });
    await page.waitForTimeout(300);

    const chatParcial = await page.locator("#chat-feed-agent1").innerText();
    assert.ok(
      chatParcial.includes("Coleta Parcial") || chatParcial.includes("3 de 5 SKUs com fotos"),
      "Deve mostrar card parcial com contagem"
    );
    const partialBtn = page.locator('button:has-text("Avançar apenas com os SKUs que têm fotos")');
    assert.ok(await partialBtn.count() > 0, "Deve oferecer botão de avançar apenas com SKUs que têm fotos");
    const retryBtn = page.locator('button:has-text("Reprocessar erros")');
    assert.ok(await retryBtn.count() > 0, "Deve oferecer botão para reprocessar erros");

    // Cenário 3: Zero com foto
    await page.evaluate(() => {
      // Limpa as mensagens anteriores do chat-feed-agent1 para validar especificamente o card de zero
      const feed = document.getElementById("chat-feed-agent1");
      if (feed) feed.innerHTML = "";
      window.showAgent1ResultCard({
        totalLote: 4,
        processados: 4,
        comFotos: 0,
        reutilizados: 0,
        naoEncontrados: ["SKU_1", "SKU_2"],
        semFotos: ["SKU_3", "SKU_4"],
        errosRede: [],
        pendentesRestantes: 0
      }, "lote_teste.csv");
    });
    await page.waitForTimeout(300);

    const chatZero = await page.locator("#chat-feed-agent1").innerText();
    assert.ok(
      chatZero.includes("Nenhum SKU Obteve Fotos") || chatZero.includes("Nenhum SKU"),
      "Deve exibir erro informando que nenhum obteve fotos"
    );
    const advanceBtnZero = page.locator('#chat-feed-agent1 button:has-text("Avançar e Enriquecer com Agente 2")');
    // Em zero fotos, o botão de avançar para Agente 2 NÃO deve ser liberado no card
    assert.equal(await advanceBtnZero.count(), 0, "NÃO deve ter botão de avançar com Agente 2 no card de zero fotos");

  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});


