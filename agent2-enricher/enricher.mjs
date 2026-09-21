/**
 * Agente 2 — Enriquecedor IA de Produtos BRK Fishing
 *
 * Lê os SKUs processados pelo Agente 1 (status "scraped"), envia as imagens
 * para o Gemini (visão multimodal) e gera JSONs estruturados com título SEO,
 * marca, modelo, descrição, atributos e variações para cadastro na Shopee.
 *
 * Uso:
 *   node enricher.mjs                          # processa todos os scraped
 *   node enricher.mjs --limit 3                # processa apenas 3
 *   node enricher.mjs --model gemini-3.7-flash  # usa modelo específico
 *   node enricher.mjs --input ../agent1-scraper/lote_d1fae5.csv
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import sharp from "sharp";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSystemPrompt, getUserPrompt } from "./prompt.mjs";
import { validateAndNormalize, parseGeminiResponse } from "./schemas.mjs";
import {
  groupRecordsByParent,
  extractParentSku,
  extractVariationSuffix,
  extractBaseTitle,
} from "./grouping.mjs";
import { fetchAndCacheShopifyPrices, getProductPrices } from "./shopify_prices.mjs";
import { fetchProductFromAnyStore, downloadProductImages } from "./shopify_fetcher.mjs";
import { resolveCorrectShopeeCategory } from "../agent4-diagnostician/rules.mjs";
import {
  isModelBlocked,
  blockModelUntilNextDay,
  resetAllQuotas,
  getQuotaData,
  formatResetTime,
} from "./quota_manager.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// Carrega variáveis de ambiente (prioriza agent2-enricher/.env e depois raiz)
dotenv.config({ path: resolve(SCRIPT_DIR, ".env") });
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Configuração
// ─────────────────────────────────────────────────────────────────────────────

const DOWNLOADS_DIR = resolve(SCRIPT_DIR, "../agent1-scraper/downloads");
const PRODUTOS_DIR = resolve(SCRIPT_DIR, "./produtos");
const MAX_IMAGES_PER_REQUEST = 4; // Imagens enviadas ao Gemini por produto
const IMAGE_RESIZE_PX = 512; // Redimensiona para economia de tokens
const REQUEST_DELAY_MS = 1500; // Delay entre requests (respeita rate limits)
const MAX_RETRIES = 2; // Retries por SKU antes de desistir

// Cadeia de fallback de modelos Gemini (prioriza modelos estáveis e testados)
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
];

// Cache em memória de modelos Gemini com cota diária esgotada
const exhaustedGeminiModels = new Set();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
  const now = new Date().toLocaleTimeString("pt-BR", { hour12: false });
  console.log(`[${now}] ${msg}`);
}

function logError(msg) {
  const now = new Date().toLocaleTimeString("pt-BR", { hour12: false });
  console.error(`[${now}] ❌ ${msg}`);
}

function logSuccess(msg) {
  const now = new Date().toLocaleTimeString("pt-BR", { hour12: false });
  console.log(`[${now}] ✅ ${msg}`);
}

/**
 * Parse de argumentos CLI.
 * Suporta: --input <caminho> [--limit <num>] [--model <nome>] [--sku <sku>] [--force]
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let inputFile = null;
  let limit = null;
  let model = null;
  let targetSku = null;
  let force = false;
  let startLine = null;
  let offset = null;
  let batchSize = null;
  let batchPause = 5; // 5 segundos entre lotes por padrão

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputFile = args[i + 1];
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--model" && args[i + 1]) {
      model = args[i + 1];
      i++;
    } else if (args[i] === "--sku" && args[i + 1]) {
      targetSku = args[i + 1].trim();
      i++;
    } else if (args[i] === "--start-line" && args[i + 1]) {
      startLine = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--offset" && args[i + 1]) {
      offset = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--batch" && args[i + 1]) {
      batchSize = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--batch-pause" && args[i + 1]) {
      batchPause = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--groq" || args[i] === "--llama") {
      model = "groq";
    } else if (args[i] === "--reset-quota" || args[i] === "--reset-quotas") {
      resetAllQuotas();
      log("🔄 Limites de quota diária resetados com sucesso.");
    } else if (args[i] === "--force") {
      force = true;
    }
  }

  // Fallback inteligente para o CSV do Agente 1
  if (!inputFile) {
    const candidates = [
      resolve(SCRIPT_DIR, "../agent1-scraper/lote_d1fae5.csv"),
      resolve(SCRIPT_DIR, "../agent1-scraper/lote_teste.csv"),
      resolve(SCRIPT_DIR, "../agent1-scraper/sample_input.csv"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        inputFile = candidate;
        break;
      }
    }
  } else if (!existsSync(inputFile)) {
    const candidates = [
      resolve(SCRIPT_DIR, inputFile),
      resolve(SCRIPT_DIR, "..", inputFile),
      resolve(process.cwd(), inputFile),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        inputFile = c;
        break;
      }
    }
  }

  let preferredModel = model || process.env.GEMINI_MODEL || MODEL_CHAIN[0];
  const qCheck = isModelBlocked(preferredModel);
  if (qCheck.blocked) {
    const fallback = MODEL_CHAIN.find((m) => !isModelBlocked(m).blocked) || "groq";
    log(`⚠️ O modelo solicitado '${preferredModel}' atingiu o limite de cota diária até ${formatResetTime(qCheck.resetAt)}.`);
    log(`🔄 Redirecionando automaticamente para '${fallback}' para não desperdiçar requisições.`);
    preferredModel = fallback;
  }

  return {
    inputFile: inputFile ? resolve(inputFile) : null,
    limit,
    targetSku,
    force,
    startLine,
    offset,
    batchSize,
    batchPause,
    preferredModel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV I/O
// ─────────────────────────────────────────────────────────────────────────────

async function readCsv(filePath) {
  const content = await readFile(filePath, "utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

async function writeCsv(filePath, records) {
  const output = stringify(records, {
    header: true,
    columns: Object.keys(records[0]),
  });
  await writeFile(filePath, output, "utf-8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Preparação de Imagens
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca caminhos completos de imagens JPG para um SKU ou variação.
 * Prioriza a estrutura hierárquica downloads/{parentSku}/{variationSuffix},
 * com fallback para downloads/{sku}.
 */
async function getVariationImages(sku, parentSku = null, variationName = null) {
  const pSku = parentSku || extractParentSku(sku);
  const suffix = variationName || extractVariationSuffix(sku);

  // Lista diretórios raiz para busca: DOWNLOADS_DIR e suas subpastas (coleções como SaoBento)
  const searchRoots = [DOWNLOADS_DIR];
  try {
    const entries = await readdir(DOWNLOADS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        searchRoots.push(join(DOWNLOADS_DIR, entry.name));
      }
    }
  } catch {}

  for (const root of searchRoots) {
    let targetDir = null;

    // 1. Hierarquia organizada: root/{parentSku}/{variationSuffix}
    if (suffix && pSku) {
      const hierarchicalDir = join(root, pSku, suffix);
      if (existsSync(hierarchicalDir)) {
        targetDir = hierarchicalDir;
      }
    }

    // 1b. Hierarquia com subpastas divididas por underscore (ex: SANDALIASTARFEM_ROSA_35 -> root/SANDALIASTARFEM/ROSA/35)
    if (!targetDir && sku && sku.includes("_")) {
      const parts = sku.split("_");
      const nestedDir = join(root, ...parts);
      if (existsSync(nestedDir)) {
        targetDir = nestedDir;
      }
    }

    // 1c. Hierarquia se parentSku tiver underscore: root/{...parts(pSku)}/{suffix}
    if (!targetDir && pSku && pSku.includes("_") && suffix) {
      const parts = pSku.split("_");
      const nestedDir = join(root, ...parts, suffix);
      if (existsSync(nestedDir)) {
        targetDir = nestedDir;
      }
    }

    // 2. Pasta direta: root/{sku}
    if (!targetDir) {
      const directDir = join(root, sku);
      if (existsSync(directDir)) {
        targetDir = directDir;
      }
    }

    // 3. Pasta do pai direto (se produto simples): root/{pSku}
    if (!targetDir && pSku) {
      const parentDir = join(root, pSku);
      if (existsSync(parentDir)) {
        targetDir = parentDir;
      }
    }

    // 3b. Pasta do pai se tiver underscore: root/{parts[0]}
    if (!targetDir && pSku && pSku.includes("_")) {
      const parts = pSku.split("_");
      const parentDir = join(root, ...parts);
      if (existsSync(parentDir)) {
        targetDir = parentDir;
      }
    }

    if (targetDir) {
      try {
        const files = (await readdir(targetDir))
          .filter((f) => f.toLowerCase().endsWith(".jpg") || f.toLowerCase().endsWith(".png") || f.toLowerCase().endsWith(".webp"))
          .sort()
          .map((f) => join(targetDir, f));
        if (files.length > 0) return files;
      } catch {}
    }
  }

  return [];
}

/**
 * Prepara imagens para envio ao Gemini para um grupo de produtos (Pai + Variações).
 * Seleciona amostras representativas (1 foto de capa por variação até o limite de 4).
 *
 * @param {object} group - Grupo gerado por groupRecordsByParent
 * @returns {Promise<Array<{ inlineData: { data: string, mimeType: string } }>>}
 */
async function prepareImagesForGroup(group) {
  // 1. Carrega todas as imagens de cada variação
  for (const item of group.items) {
    item.imagens = await getVariationImages(item.sku, group.parentSku, item.variationName);
  }

  // Se alguma variação do mesmo produto pai ficou sem fotos, herda das outras variações do grupo
  const groupSampleImgs = group.items.find((it) => it.imagens && it.imagens.length > 0)?.imagens || [];
  for (const item of group.items) {
    if (!item.imagens || item.imagens.length === 0) {
      item.imagens = [...groupSampleImgs];
    }
  }

  // Se existe pasta direta com o parentSku
  const directParentImgs = await getVariationImages(group.parentSku);

  // 2. Coleta imagens candidatas para enviar à IA
  const candidates = [];

  if (directParentImgs.length > 0) {
    candidates.push(...directParentImgs);
  } else {
    // Pega a capa (1ª foto) de cada variação
    for (const item of group.items) {
      if (item.imagens.length > 0 && !candidates.includes(item.imagens[0])) {
        candidates.push(item.imagens[0]);
      }
      if (candidates.length >= MAX_IMAGES_PER_REQUEST) break;
    }
    // Se sobrar vaga, completa com fotos subsequentes
    if (candidates.length < MAX_IMAGES_PER_REQUEST) {
      for (const item of group.items) {
        for (let idx = 1; idx < item.imagens.length; idx++) {
          if (!candidates.includes(item.imagens[idx])) {
            candidates.push(item.imagens[idx]);
          }
          if (candidates.length >= MAX_IMAGES_PER_REQUEST) break;
        }
        if (candidates.length >= MAX_IMAGES_PER_REQUEST) break;
      }
    }
  }

  if (candidates.length === 0) return [];

  const selected = selectBestImages(candidates, MAX_IMAGES_PER_REQUEST);
  const images = [];

  for (const filePath of selected) {
    try {
      const resized = await sharp(filePath)
        .resize(IMAGE_RESIZE_PX, IMAGE_RESIZE_PX, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      images.push({
        inlineData: {
          data: resized.toString("base64"),
          mimeType: "image/jpeg",
        },
      });
    } catch (err) {
      logError(`Erro ao processar imagem ${filePath}: ${err.message}`);
    }
  }

  return images;
}

/**
 * Seleciona as melhores imagens de uma lista.
 * Sempre inclui a primeira (capa) e distribui as demais uniformemente.
 */
function selectBestImages(files, maxCount) {
  if (files.length <= maxCount) return files;

  const selected = [files[0]]; // Sempre inclui a capa

  // Distribui as restantes uniformemente
  const step = (files.length - 1) / (maxCount - 1);
  for (let i = 1; i < maxCount; i++) {
    const idx = Math.round(i * step);
    if (idx < files.length && !selected.includes(files[idx])) {
      selected.push(files[idx]);
    }
  }

  return selected;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini API — Enriquecimento com Fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria o client Gemini.
 */
function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logError("GEMINI_API_KEY não encontrada no .env!");
    logError("Crie o arquivo .env com: GEMINI_API_KEY=sua_chave_aqui");
    process.exit(1);
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Enriquece um produto usando o Gemini com fallback entre modelos.
 *
 * @param {GoogleGenerativeAI} genAI - Client Gemini
 * @param {string} sku - SKU do produto ou Código Pai
 * @param {string} tituloBruto - Título original base
 * @param {Array} images - Imagens preparadas (base64)
 * @param {string} preferredModel - Modelo preferido
 * @param {Array<string>} variacoesList - Lista com nomes dos sufixos de variações
 * @returns {{ success: boolean, data: object|null, model: string, errors: string[] }}
 */
async function enrichProduct(genAI, sku, tituloBruto, images, preferredModel, variacoesList = []) {
  if (preferredModel === "groq" || preferredModel === "llama") {
    return await enrichProductWithGroq(sku, tituloBruto, images, variacoesList);
  }

  // Monta a cadeia de modelos começando pelo preferido
  const preferredIdx = MODEL_CHAIN.indexOf(preferredModel);
  const chain =
    preferredIdx >= 0
      ? MODEL_CHAIN.slice(preferredIdx)
      : [preferredModel, ...MODEL_CHAIN];

  const systemPrompt = getSystemPrompt();
  const userPrompt = getUserPrompt(sku, tituloBruto, images.length, variacoesList);

  // Monta as partes do request: imagens + texto
  const parts = [...images, { text: userPrompt }];

  for (const modelName of chain) {
    const quotaCheck = isModelBlocked(modelName);
    if (quotaCheck.blocked) {
      log(`  ⏭️ Modelo ${modelName} ignorado (limite de cota diária atingido até ${formatResetTime(quotaCheck.resetAt)}).`);
      continue;
    }
    if (exhaustedGeminiModels.has(modelName)) {
      continue;
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        log(`  Tentando ${modelName} (tentativa ${attempt + 1})...`);

        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
        });

        const result = await model.generateContent({
          contents: [{ role: "user", parts }],
        });

        const response = result.response;
        const text = response.text();

        if (!text) {
          throw new Error("Resposta vazia do Gemini");
        }

        // Parseia o JSON da resposta
        const parsed = parseGeminiResponse(text);
        if (!parsed) {
          throw new Error("Não foi possível parsear JSON da resposta");
        }

        // Valida e normaliza
        const validation = validateAndNormalize(parsed, sku);

        if (validation.valid) {
          const isIsca = /isca/i.test(validation.data.categoria_sugerida || "");
          const attrs = validation.data.atributos || {};
          if (isIsca && (!attrs.comprimento || !attrs.peso_do_produto || attrs.peso_do_produto === "10g")) {
            try {
              const { searchLureSpecsWeb } = await import("./web_specs_search.mjs");
              const webSpecs = await searchLureSpecsWeb(
                validation.data.marca,
                validation.data.modelo || validation.data.titulo_shopee
              );
              if (webSpecs) {
                if (webSpecs.comprimento) attrs.comprimento = webSpecs.comprimento;
                if (webSpecs.peso) attrs.peso_do_produto = webSpecs.peso;
                if (webSpecs.material && !attrs.material) attrs.material = webSpecs.material;
                if (webSpecs.acao && !attrs.tipo_isca) attrs.tipo_isca = webSpecs.acao;
                log(`  🔍 Especificações validadas via pesquisa web: ${attrs.comprimento || ""} | ${attrs.peso_do_produto || ""}`);
              }
            } catch {}
          }

          return {
            success: true,
            data: validation.data,
            model: modelName,
            errors: validation.errors,
          };
        } else {
          logError(`  Validação falhou: ${validation.errors.join(", ")}`);
          // Não faz retry de validação, tenta próximo modelo
          break;
        }
      } catch (err) {
        const isRateLimit = err.status === 429 || err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED");
        const isUnavailable = err.status === 503 || err.message?.includes("503") || err.message?.includes("experiencing high demand");
        const isModelNotFound = err.status === 404 || err.message?.includes("not found") || err.message?.includes("no longer available");

        if (isModelNotFound) {
          log(`  Modelo ${modelName} não disponível (404), pulando para próximo modelo...`);
          exhaustedGeminiModels.add(modelName);
          break; // Pula para o próximo modelo
        }

        if (isUnavailable) {
          if (attempt < MAX_RETRIES) {
            const waitMs = (attempt + 1) * 3000;
            log(`  ⚠️ Demanda temporária em ${modelName} (503). Aguardando ${waitMs / 1000}s para retentar...`);
            await sleep(waitMs);
            continue;
          }
          log(`  ⚠️ Modelo ${modelName} com alta demanda após tentativas. Alternando para o próximo modelo...`);
          break;
        }

        if (isRateLimit) {
          const retryMatch = err.message?.match(/retry in ([\d\.]+)s/i);
          if (retryMatch) {
            const waitSec = Math.ceil(parseFloat(retryMatch[1])) + 2;
            if (waitSec > 15 || attempt >= 1) {
              log(`  ⏳ Rate limit em ${modelName} (${waitSec}s). Alternando imediatamente para o próximo modelo da esteira...`);
              break;
            }
            log(`  ⏳ Rate limit temporário por minuto em ${modelName}. Aguardando ${waitSec}s para retentar...`);
            await sleep(waitSec * 1000);
            continue;
          }

          const isDailyQuota =
            err.message?.includes("PerDay") ||
            err.message?.includes("per_day") ||
            (err.message?.includes("Quota exceeded") && !err.message?.includes("retry in"));

          if (isDailyQuota && attempt >= MAX_RETRIES) {
            const { resetAt } = blockModelUntilNextDay(modelName, err.message);
            log(`  🚫 Limite diário de cota atingido no modelo ${modelName}!`);
            log(`  ⏳ Modelo bloqueado até o próximo dia (${formatResetTime(resetAt)}). Pulando para o próximo modelo...`);
            exhaustedGeminiModels.add(modelName);
            break;
          }
          if (attempt < MAX_RETRIES) {
            const waitMs = (attempt + 1) * 3000;
            log(`  Rate limit em ${modelName}. Aguardando ${waitMs / 1000}s...`);
            await sleep(waitMs);
            continue; // Retry no mesmo modelo
          }
          log(`  Esgotou retries em ${modelName}, tentando próximo modelo...`);
          break; // Próximo modelo
        }

        // Erro genérico
        logError(`  Erro em ${modelName}: ${err.message}`);
        if (attempt < MAX_RETRIES) {
          await sleep(2000);
          continue;
        }
        break;
      }
    }
  }

  // Fallback automático para Groq / LLaMA se configurada a chave
  const groqKey = process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY;
  if (groqKey) {
    log(`  🦙 Modelos Gemini esgotados/indisponíveis. Migrando automaticamente para Groq / LLaMA...`);
    const groqRes = await enrichProductWithGroq(sku, tituloBruto, images, variacoesList);
    if (groqRes && groqRes.success) {
      return groqRes;
    }
  }

  return {
    success: false,
    data: null,
    model: null,
    errors: ["Todos os modelos falharam para este SKU"],
  };
}

/**
 * Enriquece o produto usando a API da Groq (LLaMA / Qwen Vision)
 */
async function enrichProductWithGroq(sku, tituloBruto, images, variacoesList = []) {
  const groqKey = process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY;
  if (!groqKey) {
    return { success: false, data: null, model: null, errors: ["GROQ_API_KEY não configurada"] };
  }

  const modelName = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  log(`  🦙 Processando via Groq (${modelName})...`);

  const systemPrompt = getSystemPrompt() + "\n\nIMPORTANTE: Retorne APENAS o JSON válido no formato solicitado, sem blocos markdown.";
  const userPrompt = getUserPrompt(sku, tituloBruto, images.length, variacoesList);

  // Groq tier gratuito tem limite de 7000 ITPM: 1 foto de capa é ideal e consome ~2500 tokens no total
  const maxGroqImages = images.slice(0, 1);
  const contentParts = [{ type: "text", text: userPrompt }];
  for (const img of maxGroqImages) {
    if (img.inlineData?.data) {
      const mime = img.inlineData.mimeType || "image/jpeg";
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${img.inlineData.data}` }
      });
    }
  }

  const MAX_GROQ_RETRIES = 4;
  for (let attempt = 0; attempt < MAX_GROQ_RETRIES; attempt++) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contentParts }
          ],
          response_format: { type: "json_object" },
          max_tokens: 850,
          temperature: 0.2
        })
      });

      const jsonRes = await res.json();
      if (!res.ok || jsonRes.error) {
        const errMsg = jsonRes.error?.message || `HTTP ${res.status}`;
        if (res.status === 429 || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("please try again in")) {
          const waitMatch = errMsg.match(/try again in ([\d\.]+)s/i);
          const waitSec = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) + 2 : 25;
          log(`  ⏳ Groq Rate Limit (tentativa ${attempt + 1}/${MAX_GROQ_RETRIES}). Aguardando ${waitSec}s...`);
          await sleep(waitSec * 1000);
          continue;
        }
        throw new Error(errMsg);
      }

      const rawContent = jsonRes.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error("Resposta vazia da Groq");
      }

      const parsed = parseGeminiResponse(rawContent);
      if (!parsed) {
        throw new Error("Não foi possível parsear JSON retornado pela Groq");
      }

      const validation = validateAndNormalize(parsed, sku);
      if (!validation.valid) {
        logError(`  Validação falhou (Groq): ${validation.errors.join(", ")}`);
        return { success: false, data: null, model: modelName, errors: validation.errors };
      }

      // Marca com a etiqueta solicitada pelo usuário para comparação!
      validation.data.ia_provedor = "Groq / LLaMA";
      validation.data.ia_etiqueta = "🦙 Gerado com LLaMA / Groq";
      validation.data.ia_modelo = `${modelName} (Groq)`;
      validation.data.ia_data = new Date().toISOString();

      const isIsca = /isca/i.test(validation.data.categoria_sugerida || "");
      const attrs = validation.data.atributos || {};
      if (isIsca && (!attrs.comprimento || !attrs.peso_do_produto || attrs.peso_do_produto === "10g")) {
        try {
          const { searchLureSpecsWeb } = await import("./web_specs_search.mjs");
          const webSpecs = await searchLureSpecsWeb(
            validation.data.marca,
            validation.data.modelo || validation.data.titulo_shopee
          );
          if (webSpecs) {
            if (webSpecs.comprimento) attrs.comprimento = webSpecs.comprimento;
            if (webSpecs.peso) attrs.peso_do_produto = webSpecs.peso;
            if (webSpecs.material && !attrs.material) attrs.material = webSpecs.material;
            if (webSpecs.acao && !attrs.tipo_isca) attrs.tipo_isca = webSpecs.acao;
            log(`  🔍 Especificações validadas via web: ${attrs.comprimento || ""} | ${attrs.peso_do_produto || ""}`);
          }
        } catch {}
      }

      return {
        success: true,
        data: validation.data,
        model: `${modelName} (Groq)`,
        errors: validation.errors
      };
    } catch (err) {
      logError(`  Erro ao processar na Groq (tentativa ${attempt + 1}): ${err.message}`);
      if (attempt < MAX_GROQ_RETRIES - 1) {
        await sleep(5000);
        continue;
      }
      return { success: false, data: null, model: modelName, errors: [err.message] };
    }
  }

  return { success: false, data: null, model: null, errors: ["Tentativas na Groq esgotadas"] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orquestrador Principal
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const { inputFile, limit, targetSku, force, startLine, offset, batchSize, batchPause, preferredModel } = parseArgs();

  log(`═══════════════════════════════════════════════════`);
  log(`  Agente 2 — Enriquecedor IA BRK Fishing`);
  log(`  Modelo: ${preferredModel}`);
  if (targetSku) log(`  Modo Teste SKU: ${targetSku}`);
  if (inputFile) log(`  CSV: ${inputFile}`);
  if (limit) log(`  Limite: ${limit} produtos`);
  if (batchSize) log(`  Modo Lote: ${batchSize} produtos por lote (pausa de ${batchPause}s)`);
  log(`  Downloads: ${DOWNLOADS_DIR}`);
  log(`  Saída JSONs: ${PRODUTOS_DIR}`);
  const quotaData = getQuotaData();
  const blockedKeys = Object.keys(quotaData);
  if (blockedKeys.length > 0) {
    log(`  ⚠️ Modelos bloqueados por cota diária até amanhã:`);
    for (const bKey of blockedKeys) {
      log(`     • ${bKey}: bloqueado até ${formatResetTime(quotaData[bKey].resetAt)}`);
    }
  }
  log(`═══════════════════════════════════════════════════`);

  // Validações e Leitura de dados (suporta CSV direto ou mapeia Excel para lote CSV)
  let activeCsvFile = inputFile;
  let records;

  if (inputFile && /\.(xlsx?)$/i.test(inputFile)) {
    log(`💡 Arquivo Excel informado: ${basename(inputFile)}. Extraindo produtos...`);
    const loteCsv = resolve("../agent1-scraper/lote_d1fae5.csv");
    const { extractProductsFromXls } = await import("../agent1-scraper/colorFilter.mjs");
    const items = extractProductsFromXls(inputFile, null);
    records = items.map((item) => ({
      sku: item.sku,
      cod_sankhya: item.cod_sankhya,
      titulo_bruto: item.titulo_bruto,
      status: "scraped",
      cor: item.cor,
      classificacao: item.classificacao,
    }));
    activeCsvFile = loteCsv;
    await writeCsv(activeCsvFile, records);
    logSuccess(`${records.length} produtos carregados da planilha ${basename(inputFile)}`);
  } else {
    if (!inputFile || !existsSync(inputFile)) {
      logError(`CSV não encontrado: ${inputFile || "(nenhum)"}`);
      logError(`Verifique se o Agente 1 já foi executado.`);
      logError(`Use: node enricher.mjs --input <caminho_do_csv>`);
      process.exit(1);
    }
    records = await readCsv(activeCsvFile);
  }

  // Agrupa os registros pelo Código Pai
  const allGroups = groupRecordsByParent(records);

  let pendentesGroups;
  if (targetSku) {
    const targetParent = extractParentSku(targetSku).toLowerCase();
    pendentesGroups = allGroups.filter(
      (g) =>
        g.parentSku.toLowerCase() === targetSku.toLowerCase() ||
        g.parentSku.toLowerCase() === targetParent ||
        g.items.some((it) => it.sku.toLowerCase() === targetSku.toLowerCase())
    );

    if (pendentesGroups.length === 0) {
      log(`🔍 SKU ou Código Pai "${targetSku}" não consta no CSV local.`);
      log(`🌐 Buscando diretamente nos sites oficiais (BRK Fishing, BRK Agro, BRK Motors)...`);
      const webProd = await fetchProductFromAnyStore(targetSku);

      if (!webProd) {
        logError(`SKU "${targetSku}" não foi localizado em nenhum dos 3 sites oficiais (BRK Fishing, BRK Agro, BRK Motors).`);
        return;
      }

      logSuccess(`Produto localizado na loja ${webProd._sourceName}: "${webProd.title}"`);
      const parentSku = extractParentSku(targetSku);
      const destDir = join(DOWNLOADS_DIR, parentSku);
      log(`Baixando fotos oficiais para ${destDir}...`);
      const downloadedImages = await downloadProductImages(webProd, destDir);
      logSuccess(`${downloadedImages.length} fotos salvas com sucesso.`);

      // Variações do produto se houver
      const syntheticItems = (webProd.variants && webProd.variants.length > 1)
        ? webProd.variants.map((v) => ({
            sku: v.sku || `${parentSku}_${String(v.title).replace(/\s+/g, '')}`,
            record: {
              sku: v.sku || `${parentSku}_${String(v.title).replace(/\s+/g, '')}`,
              titulo_bruto: webProd.title,
              status: "scraped",
              cod_sankhya: "",
            },
            variationName: v.title !== "Default Title" ? String(v.title) : "",
            imagens: downloadedImages,
          }))
        : [{
            sku: targetSku,
            record: {
              sku: targetSku,
              titulo_bruto: webProd.title,
              status: "scraped",
              cod_sankhya: "",
            },
            variationName: "",
            imagens: downloadedImages,
          }];

      const syntheticGroup = {
        parentSku: parentSku,
        baseTitle: webProd.title,
        isGroup: syntheticItems.length > 1,
        items: syntheticItems,
      };

      pendentesGroups = [syntheticGroup];

      if (activeCsvFile && existsSync(activeCsvFile)) {
        try {
          for (const it of syntheticItems) {
            if (!records.some((r) => r.sku === it.record.sku)) {
              records.push(it.record);
            }
          }
          await writeCsv(activeCsvFile, records);
        } catch {}
      }
    }

    log(`Processando Código Pai: ${pendentesGroups[0].parentSku} (${pendentesGroups[0].items.length} variação/ões)`);
  } else {
    let sourceGroups = allGroups;

    if (startLine && startLine > 1) {
      const startRecordIdx = Math.max(0, startLine - 2);
      const startSku = records[startRecordIdx]?.sku;
      const startParent = startSku ? extractParentSku(startSku) : null;
      let groupIdx = allGroups.findIndex((g) => g.parentSku === startParent);
      if (groupIdx !== -1) {
        sourceGroups = allGroups.slice(groupIdx);
        log(`Iniciando a partir da linha ${startLine} (SKU: ${startSku}, Código Pai: ${startParent}, Grupo #${groupIdx + 1})`);
      }
    } else if (offset && offset > 0) {
      sourceGroups = allGroups.slice(offset);
      log(`Iniciando a partir do offset ${offset} de grupos pai`);
    }

    if (force) {
      pendentesGroups = sourceGroups;
    } else {
      // Filtra grupos que ainda não possuem JSON gerado ou que possuem itens com status não enriquecido
      pendentesGroups = sourceGroups.filter((g) => {
        const jsonPath = join(PRODUTOS_DIR, `${g.parentSku}.json`);
        if (!existsSync(jsonPath)) return true;
        return g.items.some((it) => it.status !== "enriched");
      });
    }

    const totalVariacoes = records.length;
    const enrichedVariacoes = records.filter((r) => r.status === "enriched").length;
    log(`Total de SKUs no CSV: ${totalVariacoes} (${allGroups.length} anúncios pai agrupados)`);
    log(`SKUs já enriquecidos: ${enrichedVariacoes}`);
    log(`Grupos selecionados para processar: ${pendentesGroups.length}`);

    if (pendentesGroups.length === 0) {
      log(`Nenhum produto pendente para enriquecer.`);
      return;
    }

    if (limit && limit > 0 && limit < pendentesGroups.length) {
      log(`Limitando aos primeiros ${limit} grupos pai.`);
      pendentesGroups = pendentesGroups.slice(0, limit);
    }
  }

  // Cria diretório de saída
  await mkdir(PRODUTOS_DIR, { recursive: true });

  // Carrega catálogo de preços da Shopify
  log(`Carregando catálogo de preços da Shopify BRK Fishing...`);
  const priceCache = await fetchAndCacheShopifyPrices();
  logSuccess(`Preços carregados (${Object.keys(priceCache?.por_sku || {}).length} SKUs no catálogo)`);

  // Inicializa Gemini
  const genAI = createGeminiClient();

  // Contadores para relatório
  const report = {
    processados: 0,
    sucesso: [],
    erros: [],
    modelosUsados: {},
  };

  // Processa cada Grupo de Código Pai
  for (let i = 0; i < pendentesGroups.length; i++) {
    const group = pendentesGroups[i];
    const { parentSku, baseTitle, isGroup, items } = group;
    const progresso = `[${i + 1}/${pendentesGroups.length}]`;
    const varSuffixes = isGroup ? items.map((it) => it.variationName) : [];

    log(`\n${progresso} 📦 Produto Pai: ${parentSku}${isGroup ? ` (${items.length} variações: ${varSuffixes.join(", ")})` : ""}`);
    log(`${progresso} Título Base: "${baseTitle}"`);
    report.processados++;

    // Verifica se já existe JSON do Pai (idempotência)
    const jsonPath = join(PRODUTOS_DIR, `${parentSku}.json`);
    if (existsSync(jsonPath) && !force && !targetSku) {
      logSuccess(`${progresso} JSON do pai ${parentSku} já existe, pulando.`);
      for (const it of items) {
        it.record.status = "enriched";
      }
      await writeCsv(inputFile, records);
      report.sucesso.push({ sku: parentSku, model: "cache" });
      continue;
    }

    // 1. Preparar imagens representativas (amostras das variações)
    log(`${progresso} Preparando imagens das variações...`);
    let images = await prepareImagesForGroup(group);

    if (images.length === 0) {
      log(`🔍 Nenhuma imagem local para ${parentSku}. Buscando online nos 3 sites (BRK Fishing, BRK Agro, BRK Motors)...`);
      const webProd = await fetchProductFromAnyStore(parentSku);
      if (webProd) {
        logSuccess(`Produto localizado na loja ${webProd._sourceName}: "${webProd.title}"`);
        const destDir = join(DOWNLOADS_DIR, parentSku);
        const downloadedImages = await downloadProductImages(webProd, destDir);
        if (downloadedImages.length > 0) {
          logSuccess(`${downloadedImages.length} fotos baixadas com sucesso.`);
          images = await prepareImagesForGroup(group);
        }
      }
    }

    if (images.length === 0) {
      const motivo = "Nenhuma imagem encontrada nas pastas das variações ou nos sites da BRK";
      logError(`${progresso} ${motivo}`);
      for (const it of items) {
        it.record.status = `erro: ${motivo}`;
      }
      report.erros.push({ sku: parentSku, motivo });
      await writeCsv(inputFile, records);
      continue;
    }

    log(`${progresso} ${images.length} imagens preparadas (${IMAGE_RESIZE_PX}px)`);

    // 2. Enriquecer via Gemini (apenas o produto Pai)
    log(`${progresso} Enviando ao Gemini...`);
    const result = await enrichProduct(genAI, parentSku, baseTitle, images, preferredModel, varSuffixes);

    if (!result.success) {
      const motivo = result.errors.join("; ");
      logError(`${progresso} Falha: ${motivo}`);
      for (const it of items) {
        it.record.status = `erro: ${motivo}`;
      }
      report.erros.push({ sku: parentSku, motivo });
      await writeCsv(inputFile, records);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    // 3. Obter Preços da Shopify (preço normal e promocional)
    const parentPrice = getProductPrices(priceCache, parentSku);
    result.data.preco = parentPrice
      ? {
          preco_sem_promocao: parentPrice.preco_sem_promocao ?? null,
          preco_com_promocao: parentPrice.preco_com_promocao ?? null,
          preco_atual: parentPrice.preco_atual ?? null,
          em_promocao: Boolean(parentPrice.em_promocao),
          desconto_percentual: parentPrice.desconto_percentual || 0,
        }
      : null;

    result.data.sku = parentSku;
    result.data.parent_sku = parentSku;
    result.data.is_parent = isGroup;

    const sankhyaCodes = items.map((it) => it.record?.cod_sankhya).filter(Boolean);
    result.data.cod_sankhya = items[0]?.record?.cod_sankhya || (sankhyaCodes.length > 0 ? sankhyaCodes.join(", ") : "");

    if (isGroup) {
      result.data.variacoes = items.map((it) => {
        const vPrice = getProductPrices(priceCache, it.sku);
        return {
          sku: it.sku,
          cod_sankhya: it.record?.cod_sankhya || "",
          nome: it.variationName, // Apenas o nome do sufixo! (ex: SAKURAP, MATT, A, B)
          preco_sem_promocao: vPrice?.preco_sem_promocao ?? parentPrice?.preco_sem_promocao ?? null,
          preco_com_promocao: vPrice?.preco_com_promocao ?? parentPrice?.preco_com_promocao ?? null,
          preco_atual: vPrice?.preco_atual ?? parentPrice?.preco_atual ?? null,
          em_promocao: Boolean(vPrice?.em_promocao ?? parentPrice?.em_promocao),
          desconto_percentual: vPrice?.desconto_percentual ?? parentPrice?.desconto_percentual ?? 0,
          imagens: it.imagens || [],
        };
      });
    } else {
      result.data.variacoes = [];
    }

    // Coleta todas as imagens originais de todas as variações
    const allImages = [];
    for (const it of items) {
      if (Array.isArray(it.imagens)) {
        for (const img of it.imagens) {
          if (!allImages.includes(img)) allImages.push(img);
        }
      }
    }
    if (allImages.length === 0) {
      const directImgs = await getVariationImages(parentSku);
      allImages.push(...directImgs);
    }
    result.data.imagens = allImages;

    // 3.5. Sanitização com Regras Oficiais da Shopee (Agente 4)
    if (result.data) {
      result.data.categoria_sugerida = resolveCorrectShopeeCategory(result.data);
    }

    // 4. Salvar JSON do Produto Pai
    await writeFile(jsonPath, JSON.stringify(result.data, null, 2), "utf-8");
    logSuccess(`${progresso} JSON salvo: ${jsonPath}`);
    logSuccess(`${progresso} Título Shopee (Pai): "${result.data.titulo_shopee}"`);
    if (result.data.variacoes.length > 0) {
      logSuccess(`${progresso} Variações (${result.data.variacoes.length}): ${result.data.variacoes.map((v) => v.nome).join(", ")}`);
    }
    if (result.data.preco) {
      logSuccess(`${progresso} Preço Shopify: Sem promo R$ ${result.data.preco.preco_sem_promocao?.toFixed(2) || 'N/A'} | Com promo R$ ${result.data.preco.preco_com_promocao ? result.data.preco.preco_com_promocao.toFixed(2) : 'N/A'}${result.data.preco.em_promocao ? ` (${result.data.preco.desconto_percentual}% OFF)` : ''}`);
    }
    logSuccess(`${progresso} Marca: ${result.data.marca} | Modelo: ${result.data.modelo}`);
    log(`${progresso} Modelo IA usado: ${result.model}`);

    if (result.errors.length > 0) {
      log(`${progresso} Avisos: ${result.errors.join(", ")}`);
    }

    // 5. Atualizar status de TODAS as variações filhas no CSV
    for (const it of items) {
      it.record.status = "enriched";
    }
    report.sucesso.push({ sku: parentSku, model: result.model });
    report.modelosUsados[result.model] = (report.modelosUsados[result.model] || 0) + 1;
    await writeCsv(activeCsvFile, records);

    // Rate limiting e controle de lotes (batches)
    if (batchSize && (i + 1) % batchSize === 0 && i < pendentesGroups.length - 1) {
      log(`\n☕ Lote de ${batchSize} produtos concluído! [${i + 1}/${pendentesGroups.length}]`);
      log(`   Pausando ${batchPause}s para liberar taxa da API Gemini...`);
      try {
        const { generateReport } = await import("./report.mjs");
        await generateReport(PRODUTOS_DIR, DOWNLOADS_DIR, inputFile);
      } catch {}
      await sleep(batchPause * 1000);
    } else if (i < pendentesGroups.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Relatório Final
  // ─────────────────────────────────────────────────────────────────────────

  log(`\n═══════════════════════════════════════════════════`);
  log(`  RELATÓRIO DE EXECUÇÃO — Agente 2`);
  log(`═══════════════════════════════════════════════════`);
  log(`  Total processados: ${report.processados}`);
  log(`  ✅ Sucesso:        ${report.sucesso.length}`);

  for (const s of report.sucesso) {
    log(`     • ${s.sku} (${s.model})`);
  }

  log(`  ❌ Erros:          ${report.erros.length}`);

  for (const e of report.erros) {
    log(`     • ${e.sku} — ${e.motivo}`);
  }

  if (Object.keys(report.modelosUsados).length > 0) {
    log(`  🤖 Modelos usados:`);
    for (const [model, count] of Object.entries(report.modelosUsados)) {
      log(`     • ${model}: ${count} produtos`);
    }
  }

  log(`═══════════════════════════════════════════════════`);

  // Gera relatório HTML automaticamente
  log(`\nGerando relatório HTML...`);
  try {
    const { generateReport } = await import("./report.mjs");
    await generateReport(PRODUTOS_DIR, DOWNLOADS_DIR, activeCsvFile);
    logSuccess(`Relatório gerado: ./relatorio.html`);
    log(`Abra com: start relatorio.html`);
  } catch (err) {
    logError(`Erro ao gerar relatório HTML: ${err.message}`);
  }
}

// Execução
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch((err) => {
    logError(`Erro fatal: ${err.message}`);
    console.error(err);
    process.exit(1);
  });
}
