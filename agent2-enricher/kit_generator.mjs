/**
 * kit_generator.mjs — Gerador Inteligente de Kits & Combos para a Shopee
 *
 * Recebe 2 ou mais SKUs (ex: C02820 + C02820BL), localiza produtos nos 3 sites
 * oficiais da BRK (Fishing, Agro, Motors), compila imagens representativas,
 * calcula preços consolidados e utiliza IA multimodal para gerar anúncio completo:
 * - Título comercial Shopee (estratégia de Kit/Casal)
 * - Títulos alternativos para testes A/B
 * - Descrição detalhada e estruturada com todas as peças e benefícios
 * - Atributos técnicos consolidados para a Shopee
 * - Salva em produtos/KIT_{SKU1}_{SKU2}.json e atualiza o Dashboard
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getKitSystemPrompt, getKitUserPrompt } from "./prompt.mjs";
import { parseGeminiResponse, validateAndNormalize, stripSkusFromTitle } from "./schemas.mjs";
import { resolveCorrectShopeeCategory } from "../agent4-diagnostician/rules.mjs";
import { fetchProductFromAnyStore, downloadProductImages } from "./shopify_fetcher.mjs";
import { fetchAndCacheShopifyPrices, getProductPrices } from "./shopify_prices.mjs";
import { extractParentSku } from "./grouping.mjs";
import {
  isModelBlocked,
  blockModelUntilNextDay,
  formatResetTime,
} from "./quota_manager.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(SCRIPT_DIR, ".env") });
dotenv.config();

const DOWNLOADS_DIR = resolve(SCRIPT_DIR, "../agent1-scraper/downloads");
const PRODUTOS_DIR = resolve(SCRIPT_DIR, "./produtos");
const IMAGE_RESIZE_PX = 512;

const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-3.1-pro-preview",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada no .env");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Coleta fotos locais existentes de um SKU ou código pai
 */
function getLocalImagesForSku(sku) {
  const parent = extractParentSku(sku);
  const candidatesDirs = [
    join(DOWNLOADS_DIR, sku),
    join(DOWNLOADS_DIR, parent),
  ];

  for (const dir of candidatesDirs) {
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir)
          .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
          .sort()
          .map((f) => join(dir, f));
        if (files.length > 0) return files;
      } catch {}
    }
  }
  return [];
}

/**
 * Prepara produtos componentes do Kit
 */
async function resolveKitComponents(skus, priceCache) {
  const components = [];

  for (const rawSku of skus) {
    const cleanSku = String(rawSku).trim().toUpperCase();
    const parentSku = extractParentSku(cleanSku);

    let productData = null;
    const jsonPath = join(PRODUTOS_DIR, `${parentSku}.json`);
    const directJsonPath = join(PRODUTOS_DIR, `${cleanSku}.json`);

    if (existsSync(directJsonPath)) {
      try {
        productData = JSON.parse(await readFile(directJsonPath, "utf-8"));
      } catch {}
    } else if (existsSync(jsonPath)) {
      try {
        productData = JSON.parse(await readFile(jsonPath, "utf-8"));
      } catch {}
    }

    let images = getLocalImagesForSku(cleanSku);

    // Se faltarem dados ou fotos, busca online nos 3 sites
    if (!productData || images.length === 0) {
      console.log(`🔍 Buscando componente "${cleanSku}" nos sites BRK (Fishing, Agro, Motors)...`);
      const webProd = await fetchProductFromAnyStore(cleanSku);
      if (webProd) {
        const destDir = join(DOWNLOADS_DIR, parentSku);
        const downloaded = await downloadProductImages(webProd, destDir);
        if (downloaded.length > 0) images = downloaded;

        if (!productData) {
          productData = {
            sku: cleanSku,
            titulo_shopee: webProd.title,
            titulo_bruto: webProd.title,
            marca: "BRK",
            modelo: cleanSku,
            descricao: webProd.description || "",
            variacoes: (webProd.variants || []).map((v) => ({
              sku: v.sku || `${cleanSku}_${v.title}`,
              nome: v.title,
              preco_atual: v.price ? parseFloat(v.price) : null,
            })),
          };
        }
      }
    }

    // Preços da Shopify
    const priceInfo = getProductPrices(priceCache, cleanSku) || getProductPrices(priceCache, parentSku);
    const precoAtual = priceInfo?.preco_atual || priceInfo?.preco_sem_promocao || (productData?.preco?.preco_atual ?? 99.9);

    components.push({
      sku: cleanSku,
      parentSku,
      titulo: productData?.titulo_shopee || productData?.titulo_bruto || cleanSku,
      marca: productData?.marca || "BRK",
      modelo: productData?.modelo || cleanSku,
      preco: precoAtual,
      priceInfo,
      images,
      productData,
    });
  }

  return components;
}

/**
 * Prepara até 4 imagens combinadas do Kit para o Gemini
 */
async function prepareKitImages(components) {
  const selectedFiles = [];

  // Pega até 2 imagens representativas de cada produto do kit
  for (const comp of components) {
    if (comp.images && comp.images.length > 0) {
      selectedFiles.push(comp.images[0]);
      if (comp.images.length > 1 && selectedFiles.length < 4) {
        selectedFiles.push(comp.images[1]);
      }
    }
    if (selectedFiles.length >= 4) break;
  }

  const inlineImages = [];
  for (const filePath of selectedFiles) {
    try {
      const resized = await sharp(filePath)
        .resize(IMAGE_RESIZE_PX, IMAGE_RESIZE_PX, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      inlineImages.push({
        inlineData: {
          data: resized.toString("base64"),
          mimeType: "image/jpeg",
        },
      });
    } catch (err) {
      console.error(`Erro ao processar imagem ${filePath}:`, err.message);
    }
  }

  return { inlineImages, selectedFiles };
}

/**
 * Função principal para gerar um Kit
 */
export async function generateKit({ skus, orientacao = "", model = null, discountPercent = 0 }) {
  if (!skus || !Array.isArray(skus) || skus.length < 2) {
    throw new Error("É necessário fornecer pelo menos 2 SKUs para formar um Kit.");
  }

  const cleanSkus = skus.map((s) => s.trim().toUpperCase());
  const kitSku = `KIT_${cleanSkus.join("_")}`;

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`📦 GERADOR DE KITS & COMBOS — AGENTE 2`);
  console.log(`  SKUs do Kit: ${cleanSkus.join(" + ")}`);
  console.log(`  Código Gerado: ${kitSku}`);
  if (orientacao) console.log(`  Orientação: "${orientacao}"`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  // Carrega catálogo de preços da Shopify
  const priceCache = await fetchAndCacheShopifyPrices();

  // Resolve componentes e fotos
  const components = await resolveKitComponents(cleanSkus, priceCache);

  // Prepara imagens combinadas
  const { inlineImages, selectedFiles } = await prepareKitImages(components);
  if (inlineImages.length === 0) {
    throw new Error(`Não foram encontradas imagens para os produtos do kit (${cleanSkus.join(", ")}).`);
  }

  // Preço total somado dos itens
  const precoTotalOriginal = components.reduce((acc, c) => acc + (c.preco || 0), 0);
  const fatorDesconto = discountPercent > 0 ? (100 - discountPercent) / 100 : 1;
  const precoFinalKit = parseFloat((precoTotalOriginal * fatorDesconto).toFixed(2));

  // Inicializa Gemini
  const genAI = createGeminiClient();
  const systemPrompt = getKitSystemPrompt();
  const userPrompt = getKitUserPrompt(cleanSkus, components, orientacao);

  // Modelos para tentar
  const modelsToTry = model ? [model, ...MODEL_CHAIN.filter((m) => m !== model)] : [...MODEL_CHAIN];

  let resultData = null;
  let modelUsed = null;

  for (const modelName of modelsToTry) {
    const qCheck = isModelBlocked(modelName);
    if (qCheck.blocked) {
      console.log(`⚠️ Modelo ${modelName} bloqueado por cota até ${formatResetTime(qCheck.resetAt)}. Pulando...`);
      continue;
    }

    const MAX_RETRIES = 1;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🤖 Enviando ao modelo ${modelName} (tentativa ${attempt})...`);
        const generativeModel = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2500,
            responseMimeType: "application/json",
          },
        });

        const contents = [userPrompt, ...inlineImages];
        const res = await generativeModel.generateContent(contents);
        const text = res.response.text();

        const parsed = parseGeminiResponse(text);
        if (parsed && parsed.titulo_shopee && parsed.descricao) {
          resultData = parsed;
          modelUsed = modelName;
          break;
        }
      } catch (err) {
        const isUnavailable = err.status === 503 || err.message?.includes("503") || err.message?.includes("high demand");
        const retryMatch = err.message?.match(/retry in ([\d\.]+)s/i);
        if (retryMatch) {
          const waitSec = Math.ceil(parseFloat(retryMatch[1])) + 2;
          console.log(`⏳ Rate limit temporário em ${modelName}. Aguardando ${waitSec}s...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }

        const isQuota = (err.message?.includes("PerDay") || err.message?.includes("per_day")) && !retryMatch;

        if (isQuota) {
          blockModelUntilNextDay(modelName, err.message);
          console.error(`🚫 Limite de cota diária em ${modelName}. Pulando para próximo modelo...`);
          break;
        }

        if (isUnavailable) {
          console.log(`⚠️ Demanda temporária em ${modelName} (503). Alternando para próximo modelo...`);
          break;
        }

        console.error(`Falha no modelo ${modelName}:`, err.message);
        break;
      }
    }

    if (resultData) break;
  }

  // Se Gemini falhar, recorre ao Groq / LLaMA
  if (!resultData) {
    const groqResult = await enrichKitWithGroq(cleanSkus, components, orientacao, selectedFiles);
    if (groqResult) {
      resultData = groqResult.data;
      modelUsed = groqResult.model;
    }
  }

  if (!resultData) {
    throw new Error("Não foi possível gerar os textos do Kit com a IA. Tente novamente em instantes.");
  }

  // Todas as imagens de todos os componentes
  const allKitImages = [];
  for (const comp of components) {
    for (const img of comp.images || []) {
      if (!allKitImages.includes(img)) allKitImages.push(img);
    }
  }

  // Identifica se os componentes do Kit são bandanas / tubenecks
  const allComponentsText = components
    .map((c) => `${c.sku} ${c.titulo} ${c.modelo}`)
    .join(" ")
    .toLowerCase();

  const isBandanaKit =
    /bandana|tubeneck|tube\s*neck|balaclava|pescoceira|faixa\s*de\s*pesco[çc]o|len[çc]o|\bbuff\b/i.test(allComponentsText) ||
    /bandana|tubeneck|tube\s*neck|balaclava/i.test(orientacao) ||
    cleanSkus.some((s) => /^[Tt]\d{2,4}|^BM|^(CAMU_T|LISAS_T)/i.test(s));

  // Remove rigorosamente qualquer SKU dos títulos gerados
  const cleanTitle = stripSkusFromTitle(resultData.titulo_shopee, cleanSkus);
  const cleanAlts = (resultData.titulos_alternativos || []).map((t) => stripSkusFromTitle(t, cleanSkus));

  const categoriaInicial = isBandanaKit
    ? "Acessórios de Moda > Bonés, Chapéus e Toucas"
    : (resultData.categoria_sugerida || "Roupas Masculinas > Tops > Camisetas");

  const atributosIniciais = isBandanaKit
    ? {
        genero: "Unissex",
        pais_de_origem: "Brasil",
        material: "Poliéster",
        estampa: /brasil|bandeira/i.test(allComponentsText)
          ? "Bandeira do Brasil"
          : /camuflad/i.test(allComponentsText)
          ? "Camuflada"
          : "Estampada",
        estilo_de_chapeu: "Bandana",
        tipo_de_couro: "",
        condicao: "Novo",
        numero_de_registro_da_fda: "",
        quantidade_da_embalagem: cleanSkus.length,
        tamanho_do_pacote: "",
        produto_personalizado: "Não",
        quantidade_por_pacote: cleanSkus.length,
        ...(resultData.atributos || {}),
      }
    : {
        pais_de_origem: "Brasil",
        quantidade_por_pacote: cleanSkus.length,
        quantidade_da_embalagem: cleanSkus.length,
        produto_personalizado: "Não",
        condicao: "Novo",
        material: "XTech-Pro",
        estilo: "Agro / Esportivo",
        ocasiao: "Fazenda / Pesca",
        ...(resultData.atributos || {}),
      };

  // Monta objeto consolidado do Kit
  const kitObject = {
    sku: kitSku,
    parent_sku: kitSku,
    is_kit: true,
    skus_componentes: cleanSkus,
    titulo_shopee: cleanTitle,
    titulos_alternativos: cleanAlts,
    marca: resultData.marca || "BRK",
    modelo: resultData.modelo || "Kit / Combo",
    categoria_sugerida: categoriaInicial,
    descricao: resultData.descricao,
    atributos: atributosIniciais,
    preco: {
      preco_sem_promocao: precoTotalOriginal,
      preco_com_promocao: discountPercent > 0 ? precoFinalKit : null,
      preco_atual: precoFinalKit,
      em_promocao: discountPercent > 0,
      desconto_percentual: discountPercent,
    },
    itens_inclusos: components.map((c) => ({
      sku: c.sku,
      titulo: c.titulo,
      marca: c.marca,
      preco_unitario: c.preco,
      fotos_count: (c.images || []).length,
    })),
    variacoes: [],
    palavras_chave: resultData.palavras_chave || ["kit", "combo", "brk"],
    imagens: allKitImages,
    modelo_ia: modelUsed,
    data_criacao: new Date().toISOString(),
  };

  // Normaliza e valida com schemas.mjs e rules.mjs
  validateAndNormalize(kitObject, kitSku, kitSku);
  kitObject.categoria_sugerida = resolveCorrectShopeeCategory(kitObject);

  // Garante diretório e salva JSON do Kit
  await mkdir(PRODUTOS_DIR, { recursive: true });
  const savePath = join(PRODUTOS_DIR, `${kitSku}.json`);
  await writeFile(savePath, JSON.stringify(kitObject, null, 2), "utf-8");
  console.log(`✅ Kit salvo com sucesso em: ${savePath}`);

  // Atualiza relatório HTML em background (não bloqueia a resposta da API)
  import("./report.mjs")
    .then(({ generateReport }) => generateReport(PRODUTOS_DIR, DOWNLOADS_DIR))
    .then(() => console.log("✅ Relatório HTML atualizado com o novo kit."))
    .catch((err) => console.error("Erro ao atualizar relatório:", err));

  return kitObject;
}

/**
 * Fallback de alta velocidade para Kits via Groq / LLaMA / Qwen
 */
async function enrichKitWithGroq(skus, components, orientacao, imageFiles) {
  const groqKey = process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY;
  if (!groqKey) return null;

  const modelName = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  console.log(`🦙 Alternando para Groq (${modelName}) para o Kit...`);

  const systemPrompt = getKitSystemPrompt() + "\n\nIMPORTANTE: Retorne APENAS o JSON puro sem formatação markdown ou código adicional.";
  const userPrompt = getKitUserPrompt(skus, components, orientacao);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    const json = await res.json();
    const rawContent = json?.choices?.[0]?.message?.content;
    if (rawContent) {
      const parsed = parseGeminiResponse(rawContent);
      if (parsed?.titulo_shopee && parsed?.descricao) {
        return { data: parsed, model: `groq/${modelName}` };
      }
    }
  } catch (err) {
    console.error("Erro no Groq para Kit:", err.message);
  }
  return null;
}
