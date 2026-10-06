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

