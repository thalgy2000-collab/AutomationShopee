/**
 * multi_model_generator.mjs — Gerador de Anúncios Multi-Modelo (Estrutura 1)
 *
 * Cria anúncios com múltiplos modelos/estampas e grade completa de tamanhos
 * sob um único SKU PAI unificado para o campo "Dados Gerais > SKU" da Magis5.
 *
 * Exemplo:
 * Modelos: [ADV256BL, ADV257BL, ADV341BL]
 * Tamanhos: [PP, P, M, G, GG, G1, G2]
 * Total: 3 x 7 = 21 variações vinculadas ao SKU Pai mestre.
 */

import { writeFile, readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { stripSkusFromTitle, sanitizeDescription } from "./schemas.mjs";
import { getProductPrices } from "./shopify_prices.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(SCRIPT_DIR, ".env") });
dotenv.config();

const DOWNLOADS_DIR = resolve(SCRIPT_DIR, "../agent1-scraper/downloads");
const PRODUTOS_DIR = resolve(SCRIPT_DIR, "./produtos");

export const DEFAULT_SIZES = ["PP", "P", "M", "G", "GG", "G1", "G2"];

/**
 * Encontra fotos de um SKU no diretório local de downloads
 */
function findLocalPhotos(sku) {
  const clean = sku.trim();
  const candidates = [
    join(DOWNLOADS_DIR, clean),
    join(DOWNLOADS_DIR, clean.replace(/BL$/i, "")),
    join(DOWNLOADS_DIR, clean.replace(/_FULL$/i, "")),
  ];

  for (const dir of candidates) {
    if (existsSync(dir)) {
      const files = readdirSync(dir).filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i));
      if (files.length > 0) {
        return files.sort().map(f => join(dir, f));
      }
    }
  }
  return [];
}

/**
 * Gera um anúncio de Estrutura 1 (Multi-Modelo com Grade de Tamanhos)
 *
 * @param {object} params
 * @param {string} params.parentSku - SKU Pai mestre (vai no campo Dados Gerais > SKU da Magis5)
 * @param {string[]} params.modelos - Array de códigos de modelo (ex: ['ADV256BL', 'ADV257BL', 'ADV341BL'])
 * @param {string[]} [params.tamanhos] - Grade de tamanhos (padrão: PP, P, M, G, GG, G1, G2)
 * @param {number} [params.preco] - Preço sem promoção
 * @param {string} [params.titulo] - Título personalizado (opcional, será sanitizado para não conter SKUs)
 * @param {string} [params.genero] - 'Feminino', 'Masculino' ou 'Unissex' (padrão detectado por BL)
 */
/**
 * Resolve o nome comercial do modelo (ex: "Peru Machu Picchu Verde") via Shopify ou objeto
 */
export async function resolveModelCommercialName(skuOrObj) {
  if (typeof skuOrObj === "object" && skuOrObj !== null) {
    if (skuOrObj.nome) return { sku: String(skuOrObj.sku || "").toUpperCase(), nome: skuOrObj.nome };
  }
  const str = String(skuOrObj || "").trim();
  if (str.includes(":")) {
    const [skuPart, ...rest] = str.split(":");
    return { sku: skuPart.trim().toUpperCase(), nome: rest.join(":").trim() };
  }

  const cleanSku = str.toUpperCase();
  const domains = [
    "https://www.brkmotors.com.br",
    "https://brkfishing.com.br",
    "https://www.brkagro.com.br"
  ];

  for (const d of domains) {
    try {
      const url = `${d}/search/suggest.json?q=${encodeURIComponent(cleanSku)}&resources[type]=product`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const data = await res.json();
      const prods = data?.resources?.results?.products || [];
      if (prods.length > 0) {
        const title = prods[0].title;
        let name = title
          .replace(/camisa(?:\s+de\s+motociclismo)?(?:\s+feminina|\s+masculina)?(?:\s+baby\s+look)?/gi, "")
          .replace(/\bbrk\b/gi, "")
          .replace(/com\s+prote[çc][aã]o\s+solar.*$/gi, "")
          .replace(/com\s+prote[çc][aã]o.*$/gi, "")
          .replace(/prote[çc][aã]o\s+uv\d*\+?/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        name = stripSkusFromTitle(name);
        name = name.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ").trim();
        if (name.length >= 3) {
          return { sku: cleanSku, nome: name };
        }
      }
    } catch {}
  }

  // Fallback 1: Verifica se existe JSON em produtos/
  try {
    const candidates = [
      join(PRODUTOS_DIR, `${cleanSku}.json`),
      join(PRODUTOS_DIR, `${cleanSku.replace(/BL$/i, '')}.json`),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        const j = JSON.parse(await readFile(p, 'utf-8'));
        let rawName = j.modelo || j.titulo_shopee || j.titulo || '';
        rawName = stripSkusFromTitle(rawName)
          .replace(/camisa(?:\s+de\s+motociclismo)?(?:\s+feminina|\s+masculina)?(?:\s+baby\s+look)?/gi, "")
          .replace(/\bbrk\b/gi, "")
          .replace(/com\s+prote[çc][aã]o.*$/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        if (rawName.length >= 3) {
          return { sku: cleanSku, nome: rawName };
        }
      }
    }
  } catch {}

  // Fallback 2: Nome comercial limpo baseado na estampa/cor sem SKU
  const cleaned = cleanSku.replace(/^(?:ADV|CAM|BABY|T\d+|C0\d+|KIT)/i, "").replace(/BL$/i, "").trim();
  const fallbackNome = cleaned.length >= 3 ? `Modelo ${cleaned}` : `Modelo ${cleanSku}`;
  return { sku: cleanSku, nome: fallbackNome };
}

/**
 * Gera os dados de um anúncio Multi-Modelo (Estrutura 1).
 *
 * @param {object} params
 * @param {string} params.parentSku - SKU Pai Mestre (ex: 'KIT_PERU_FEM' ou 'ADV256_257_341BL')
 * @param {string[]} params.modelos - Códigos dos modelos (ex: ['ADV256BL', 'ADV257BL', 'ADV341BL'])
 * @param {string[]} [params.tamanhos] - Grade de tamanhos (padrão: PP ao G2)
 * @param {number} [params.preco] - Preço sem promoção (opcional)
 * @param {string} [params.titulo] - Título personalizado (opcional, será sanitizado para não conter SKUs)
 * @param {string} [params.genero] - 'Feminino', 'Masculino' ou 'Unissex' (padrão detectado por BL)
 */
export async function generateMultiModelProduct(params) {
  const {
    parentSku,
    modelos,
    tamanhos = DEFAULT_SIZES,
    preco: customPrice = null,
    titulo: customTitle = "",
    genero: customGender = null,
  } = params;

  if (!parentSku || !parentSku.trim()) {
    throw new Error("O campo 'parentSku' (SKU Pai Mestre) é obrigatório.");
  }

  if (!modelos || !Array.isArray(modelos) || modelos.length === 0) {
    throw new Error("Informe pelo menos 1 código de modelo base.");
  }

  const cleanParentSku = parentSku.trim().toUpperCase();

  // Resolve nomes comerciais de cada modelo (que não seja o SKU)
  const modelosInfo = [];
  for (const m of modelos) {
    const info = await resolveModelCommercialName(m);
    const photos = findLocalPhotos(info.sku);
    info.foto = photos[0] || "";
    info.fotos = photos;
    modelosInfo.push(info);
  }

  const cleanModelos = modelosInfo.map(m => m.sku);
  const cleanModelosNomes = modelosInfo.map(m => m.nome);

  // Detecta características gerais pelos modelos
  const isBabyLook = cleanModelos.some(m => m.includes("BL"));
  const genero = customGender || (isBabyLook ? "Feminino" : "Masculino");
  const categoria = isBabyLook
    ? "Roupas Femininas > Blusas > Camisas e Blusas"
    : "Roupas Masculinas > Blusas > Camisas";

  // Resolve preços
  let precoSemPromo = customPrice || 139.90;
  for (const m of cleanModelos) {
    const pInfo = getProductPrices(m);
    if (pInfo && pInfo.preco_sem_promocao) {
      precoSemPromo = pInfo.preco_sem_promocao;
      break;
    }
  }

  // Coleta fotos de todos os modelos
  const allImages = [];
  for (const modInfo of modelosInfo) {
    if (modInfo.fotos && modInfo.fotos.length > 0) {
      allImages.push(...modInfo.fotos);
    }
  }

  // Gera as variações filhas na ordem exata combinada de Magis5 (Modelos x Tamanhos = Ex: 3 x 7 = 21)
  const variacoes = [];
  for (const modInfo of modelosInfo) {
    const modSku = modInfo.sku;
    const modNome = modInfo.nome;
    const mainPhoto = modInfo.foto || "";

    for (const tam of tamanhos) {
      const childSku = `${modSku}${tam}`; // Ex: ADV256BLPP
      variacoes.push({
        sku: childSku,
        cod_sankhya: childSku,
        parent_sku: cleanParentSku,
        nome: `${modNome} - ${tam}`,
        modelo: modSku,
        modelo_nome: modNome,
        tamanho: tam,
        preco: precoSemPromo,
        preco_sem_promocao: precoSemPromo,
        preco_com_promocao: null,
        preco_atual: precoSemPromo,
        em_promocao: false,
        desconto_percentual: 0,
        imagens: mainPhoto ? [mainPhoto] : [],
      });
    }
  }

  // Gera título persuasivo de SEO SEM SKU
  let finalTitle = customTitle;
  if (!finalTitle) {
    const tipoVestuario = isBabyLook ? "Camisa Baby Look Feminina" : "Camisa Manga Longa Masculina";
    finalTitle = `${tipoVestuario} Proteção Solar UV50+ Térmica Várias Estampas BRK Agro`;
  }
  // Aplica estritamente a remoção de SKUs
  finalTitle = stripSkusFromTitle(finalTitle);

  // Descrição estruturada (Regras Shopee: 0 emojis, 0 *, 0 SKU, com tabela de medidas)
  const descModelos = modelosInfo
    .map((m) => `- Modelo: ${m.nome}`)
    .join("\n");

  const rawDescricao = `${finalTitle}\n\n` +
    `Alta performance em um só produto. Confeccionadas com o tecido exclusivo XTech Pro®, proporcionam conforto, proteção solar UV50+.\n\n` +
    `Vista-se com as vibrantes Camisas Brk, que não desbotam, não precisam ser passadas, possuem costura reforçada e secagem ultra rápida.\n\n` +
    `Escolha o seu modelo favorito e o seu tamanho ideal no seletor de variações acima.\n\n` +
    `Modelos disponíveis neste anúncio:\n` +
    `${descModelos}\n\n` +
    `Cuidados para Conservação:\n` +
    `As Camisas Brk são uma inovação no segmento, unindo qualidade, estilo e performance em um só produto. Confeccionadas com o tecido exclusivo XTech Pro®, proporcionam conforto, proteção solar UV50+.\n` +
    `Para preservar as propriedades do tecido e a eficácia da tecnologia utilizada, atente-se aos seguintes cuidados:\n` +
    `- Lave em água fria com detergente líquido.\n` +
    `- Após a lavagem, deixe secar na sombra.\n` +
    `- Não utilize máquina de secar e nem lavagem a seco.\n` +
    `- Não passe sua camisa com ferro elétrico.\n\n` +
    `Diferenciais da Camisa Brk:\n` +
    `- Costura reforçada com tecnologia.\n` +
    `- Tecido XTech Pro® exclusivo.\n` +
    `- Proteção solar UV50+ homologada.\n` +
    `- Estampas exclusivas.\n` +
    `- Garantia de 1 ano contra defeitos de fábrica.\n` +
    `- Troca fácil.\n\n` +
    `Tabela de Medidas Total:\n\n` +
    `Masculino Tamanho PP: Tórax: 99cm - Altura: 67cm - Manga: 56cm.\n` +
    `Masculino Tamanho P: Tórax: 103cm - Altura: 69cm - Manga: 59,5cm.\n` +
    `Masculino Tamanho M: Tórax: 108cm - Altura: 71cm - Manga: 62cm.\n` +
    `Masculino Tamanho G: Tórax: 112cm - Altura: 72cm - Manga: 64cm.\n` +
    `Masculino Tamanho GG: Tórax: 118cm - Altura: 74cm - Manga: 64,5cm.\n` +
    `Masculino Tamanho G1: Tórax: 124cm - Altura: 75cm - Manga: 66cm.\n` +
    `Masculino Tamanho G2: Tórax: 130cm - Altura: 76,5cm - Manga: 66,5cm.\n\n` +
    `Feminino Tamanho Baby Look PP: Tórax: 81cm - Altura: 54cm - Manga: 61cm.\n` +
    `Feminino Tamanho Baby Look P: Tórax: 86cm - Altura: 56cm - Manga: 62cm.\n` +
    `Feminino Tamanho Baby Look M: Tórax: 94cm - Altura: 58cm - Manga: 63cm.\n` +
    `Feminino Tamanho Baby Look G: Tórax: 97cm - Altura: 60cm - Manga: 65,5cm.\n` +
    `Feminino Tamanho Baby Look GG: Tórax: 102cm - Altura: 62cm - Manga: 66,5cm.\n` +
    `Feminino Tamanho Baby Look G1: Tórax: 110cm - Altura: 65cm - Manga: 67cm.\n` +
    `Feminino Tamanho Baby Look G2: Tórax: 118cm - Altura: 66cm - Manga: 69cm.\n\n` +
    `Infantil Tamanho PP: Tórax: 59cm - Altura: 38,5cm - Manga: 35,5cm.\n` +
    `Infantil Tamanho P: Tórax: 63cm - Altura: 42cm - Manga: 38cm.\n` +
    `Infantil Tamanho M: Tórax: 70cm - Altura: 43,5cm - Manga: 39,5cm.\n` +
    `Infantil Tamanho G: Tórax: 73cm - Altura: 47,5cm - Manga: 41,5cm.\n` +
    `Infantil Tamanho GG: Tórax: 79cm - Altura: 53cm - Manga: 46cm.\n` +
    `Infantil Tamanho G1: Tórax: 88cm - Altura: 58,5cm - Manga: 49,5cm.\n` +
    `Infantil Tamanho G2: Tórax: 95cm - Altura: 61,5cm - Manga: 51,5cm.\n\n` +
    `Nossa Estampa é protegida pela Lei de Direitos Autorais (Lei 9.610/98) e Reprodução não autorizada está sujeita às penalidades legais. Copiar é crime!`;

  const descricao = sanitizeDescription(rawDescricao, {
    sku: cleanParentSku,
    skus: [...cleanModelos, cleanParentSku],
    title: finalTitle,
    isCamisa: true,
    isBabyLook,
  });

  const productData = {
    sku: cleanParentSku,          // VAI NO CAMPO "Dados gerais > SKU" da Magis5
    parent_sku: cleanParentSku,
    cod_sankhya: cleanParentSku,
    is_multi_model: true,
    modelos_inclusos: cleanModelos,
    modelos_info: modelosInfo,
    atributos_magis5: [
      {
        nome: "Modelo",
        valores: cleanModelosNomes,
      },
      {
        nome: "Tamanho",
        valores: tamanhos,
      },
    ],
    total_variacoes: variacoes.length,
    titulo_shopee: finalTitle,
    titulos_alternativos: [
      stripSkusFromTitle(`Camiseta ${genero} Manga Longa UV50+ Vários Modelos e Estampas BRK`),
      stripSkusFromTitle(`Camisa Térmica Solar UV50+ ${genero} Estampada BRK Agro e Pesca`),
    ],
    marca: "BRK",
    modelo: "Multi-Modelos",
    categoria_sugerida: categoria,
    preco: {
      preco_sem_promocao: precoSemPromo,
      preco_com_promocao: null,
      preco_atual: precoSemPromo,
      em_promocao: false,
      desconto_percentual: 0,
    },
    descricao,
    atributos: {
      genero,
      pais_de_origem: "Brasil",
      material: "Poliéster",
      manga_comprida: "Manga Longa",
      estilo: "Esportivo / Country / Pesca",
      protecao_uv: "UV50+",
      quantidade_da_embalagem: 1,
      quantidade_por_pacote: 1,
      blusa_cropped: "Não",
      plus_size: "Não",
      condicao: "Novo",
      produto_personalizado: "Não",
    },
    variacoes,
    imagens: allImages,
    medidas: {
      altura_cm: 3,
      largura_cm: 20,
      comprimento_cm: 30,
      peso_kg: 0.25,
    },
    seo_score: 95,
    data_criacao: new Date().toISOString(),
  };

  // Salva no diretório de produtos
  const filePath = resolve(PRODUTOS_DIR, `${cleanParentSku}.json`);
  await writeFile(filePath, JSON.stringify(productData, null, 2), "utf-8");
  console.log(`\n✅ Produto Estrutura 1 criado com sucesso: ${filePath}`);
  console.log(`   SKU Pai: ${cleanParentSku}`);
  console.log(`   Modelos: ${cleanModelos.join(", ")}`);
  console.log(`   Total de Variações: ${variacoes.length} (${cleanModelos.length} modelos x ${tamanhos.length} tamanhos)`);

  // Atualiza relatório HTML em background (não bloqueia a resposta da API)
  import("./report.mjs")
    .then(({ generateReport }) => generateReport(PRODUTOS_DIR, DOWNLOADS_DIR))
    .then(() => console.log("✅ Relatório HTML atualizado com o produto Estrutura 1."))
    .catch((err) => console.error("Erro ao atualizar relatório:", err));

  return productData;
}

