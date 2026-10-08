import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TEST_DIR = path.resolve("tests/tmp_agent1_contract");

test.beforeEach(async () => {
  await fs.promises.mkdir(TEST_DIR, { recursive: true });
});

test.afterEach(async () => {
  try {
    await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
  } catch {}
});

test("CONTRATO AGENTE 1: Retorna exit code 2 quando 0 SKUs obtêm fotos (zero sucesso)", async () => {
  const csvPath = path.join(TEST_DIR, "lote_zero.csv");
  const csvContent = `sku,cod_sankhya,titulo_bruto,status\nSKU_INEXISTENTE_9999,12345,Produto Inexistente Teste,pendente\n`;
  await fs.promises.writeFile(csvPath, csvContent, "utf8");

  const downloadsDir = path.join(TEST_DIR, "downloads");
  await fs.promises.mkdir(downloadsDir, { recursive: true });

  const scraperScript = path.resolve("agent1-scraper/scraper.mjs");

  let exitCode = 0;
  let stdout = "";
  let stderr = "";

  try {
    const res = await execFileAsync(
      process.execPath,
      [scraperScript, "--input", csvPath, "--dest", downloadsDir, "--max-retries", "1"],
      { timeout: 30000 }
    );
    stdout = res.stdout;
    stderr = res.stderr;
  } catch (err) {
    exitCode = err.code;
    stdout = err.stdout || "";
    stderr = err.stderr || "";
  }

  assert.equal(exitCode, 2, `Deveria retornar exit code 2 para zero fotos baixadas, mas retornou ${exitCode}`);
  assert.ok(stdout.includes("AGENT1_RESULT"), "Stdout deve conter JSON AGENT1_RESULT");
  
  const match = stdout.match(/AGENT1_RESULT\s+(\{[^\n\r]+\})/);
  assert.ok(match, "Deve emitir AGENT1_RESULT formatado");
  const result = JSON.parse(match[1]);
  assert.equal(result.comFotos, 0, "comFotos deve ser 0");
  assert.equal(result.totalLote, 1, "totalLote deve ser 1");
  assert.ok(result.erros > 0 || result.naoEncontrados.length > 0, "Deve reportar erro ou naoEncontrados");
});

test("CONTRATO AGENTE 1: Retomada após interrupção pula SKUs já baixados (idempotência)", async () => {
  const csvPath = path.join(TEST_DIR, "lote_retomada.csv");
  const downloadsDir = path.join(TEST_DIR, "downloads");
  const sku1Dir = path.join(downloadsDir, "SKU_JA_BAIXADO");
  await fs.promises.mkdir(sku1Dir, { recursive: true });
  await fs.promises.writeFile(path.join(sku1Dir, "foto_01.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  // CSV onde SKU 1 já está como scraped e SKU 2 está pendente
  const csvContent = `sku,cod_sankhya,titulo_bruto,status\nSKU_JA_BAIXADO,11111,Camisa Já Baixada,scraped\nSKU_INEXISTENTE_8888,22222,Produto Sem Foto,pendente\n`;
  await fs.promises.writeFile(csvPath, csvContent, "utf8");

  const scraperScript = path.resolve("agent1-scraper/scraper.mjs");

  let exitCode = 0;
  let stdout = "";
  try {
    const res = await execFileAsync(
      process.execPath,
      [scraperScript, "--input", csvPath, "--dest", downloadsDir, "--max-retries", "1"],
      { timeout: 30000 }
    );
    stdout = res.stdout;
  } catch (err) {
    exitCode = err.code;
    stdout = err.stdout || "";
  }

  // SKU_JA_BAIXADO deve ter sido reutilizado/pulado e mantido com status scraped
  const updatedCsv = await fs.promises.readFile(csvPath, "utf8");
  assert.ok(updatedCsv.includes("SKU_JA_BAIXADO,11111,Camisa Já Baixada,scraped"), "SKU já baixado deve permanecer intacto");
  assert.ok(stdout.includes("já possui imagens salvas") || stdout.includes("reutilizados") || stdout.includes("Reaproveitadas"), "Deve logar reaproveitamento");
});

test("CONTRATO AGENTE 2: Ignora produtos pai sem fotos em disco e relata no log e CSV", async () => {
  const csvPath = path.join(TEST_DIR, "lote_agent2.csv");
  // 1 SKU com status scraped mas sem pasta de fotos em downloads/
  const csvContent = `sku,cod_sankhya,titulo_bruto,status\nSEM_FOTO_100,55555,Bone Sem Foto Teste,scraped\n`;
  await fs.promises.writeFile(csvPath, csvContent, "utf8");

  const enricherScript = path.resolve("agent2-enricher/enricher.mjs");

  let exitCode = 0;
  let stdout = "";
  try {
    const res = await execFileAsync(
      process.execPath,
      [enricherScript, "--input", csvPath],
      { timeout: 30000 }
    );
    stdout = res.stdout;
  } catch (err) {
    exitCode = err.code;
    stdout = err.stdout || "";
  }

  // O Agente 2 deve detectar que não há fotos e ignorar
  assert.ok(
    stdout.includes("sem fotos em disco ignorados") || stdout.includes("Nenhum produto pendente com fotos"),
    "Agente 2 deve logar que ignorou produto sem fotos em disco"
  );

  const updatedCsv = await fs.promises.readFile(csvPath, "utf8");
  assert.ok(
    updatedCsv.includes("ignorado") || updatedCsv.includes("sem fotos baixadas em disco"),
    "CSV deve registrar que SKU foi ignorado por falta de fotos"
  );
});
