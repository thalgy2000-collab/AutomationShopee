/**
 * schemas.mjs — Validação e normalização do JSON de saída do Gemini
 *
 * Garante que o JSON retornado pelo LLM contenha todos os campos
 * obrigatórios e esteja no formato correto para o pipeline.
 */

// Medidas fixas de embalagem (definidas no plano original)
const MEDIDAS_FIXAS = {
  altura_cm: 3,
  largura_cm: 20,
  comprimento_cm: 30,
  peso_kg: 0.250,
};

const MAX_TITULO_CHARS = 120;
const MIN_DESCRICAO_CHARS = 50; // Relaxado para não rejeitar produtos válidos
const MAX_DESCRICAO_CHARS = 3000;

/**
 * Campos obrigatórios no JSON de saída.
 */
const REQUIRED_FIELDS = [
  "sku",
  "titulo_shopee",
  "marca",
  "modelo",
  "categoria_sugerida",
  "descricao",
  "atributos",
  "palavras_chave",
];

/**
 * Remove códigos SKU e referências alfanuméricas de títulos da Shopee.
 * Garante que títulos sejam puramente comerciais e otimizados para SEO.
 */
export function stripSkusFromTitle(title, skus = []) {
  if (!title || typeof title !== "string") return "";

  let cleaned = title;

  // Lista de SKUs a remover (passados explicitamente ou detectados)
  const skuList = (Array.isArray(skus) ? skus : [skus]).filter(Boolean);
  for (const s of skuList) {
    if (!s || typeof s !== "string") continue;
    const cleanS = s.trim();
    if (cleanS.length >= 2) {
      const baseS = cleanS.replace(/_FULL$/i, "");
      const esc1 = cleanS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const esc2 = baseS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      cleaned = cleaned.replace(new RegExp(`\\b${esc1}\\b`, "gi"), "");
      if (esc2.length >= 2) {
        cleaned = cleaned.replace(new RegExp(`\\b${esc2}\\b`, "gi"), "");
      }
    }
  }

  // Remove códigos que parecem SKU soltos (ex: T346, C02820, BM001, etc.)
  cleaned = cleaned.replace(/\b[A-Z]{1,3}\d{2,5}(?:[A-Z]{1,3})?\b/g, (match) => {
    if (/^(UV50|UV50\+|4K|3D|2D|80LBS|50LBS|30LBS|100M|200M|300M|10X|20X|3X|P|M|G|GG|XG)$/i.test(match)) {
      return match;
    }
    return "";
  });

  // Limpa múltiplos pipes, espaços duplos e pontuação sobrando
  cleaned = cleaned
    .replace(/\s*\|\s*\|\s*/g, " | ")
    .replace(/^\s*\|\s*/, "")
    .replace(/\s*\|\s*$/, "")
    .replace(/\s*-\s*-\s*/g, " - ")
    .replace(/^\s*-\s*/, "")
    .replace(/\s*-\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned;
}

/**
 * Gera um modelo comercial amigável baseado nas características do produto (linha + cor/estampa/tema),
 * garantindo expressamente que o campo modelo NUNCA contenha o código SKU.
 *
 * @param {string} sku - Código SKU do produto
 * @param {string} title - Título do produto na Shopee
 * @param {string} estampa - Atributo de estampa se disponível
 * @param {string} currentModel - Valor atual do modelo (se houver)
 * @returns {string} Modelo comercial padronizado (ex: "FUSION AZUL", "FUSION CAMUFLADA DEGRADÊ")
 */
export function generateFriendlyModel(sku = "", title = "", estampa = "", currentModel = "") {
  const cleanSku = (sku || "").trim().toUpperCase();
  const fullText = `${title || ""} ${estampa || ""} ${currentModel || ""}`.toUpperCase();

  // 1. Linha FUSION (Camisas com Capuz e Máscara UV50+)
  if (/^FUSION/i.test(cleanSku) || /fusion/i.test(title || "")) {
    if (fullText.includes("DEGRADÊ") || fullText.includes("DEGRADE")) return "FUSION CAMUFLADA DEGRADÊ";
    if (fullText.includes("DIGITAL")) return "FUSION CAMUFLADA DIGITAL";
    if (fullText.includes("GRAFITE")) return "FUSION GRAFITE";
    if (fullText.includes("AZUL")) return "FUSION AZUL";
    if (fullText.includes("VERDE")) return "FUSION VERDE";
    if (fullText.includes("CINZA")) return "FUSION CINZA";
    if (fullText.includes("CRÂNIO") || fullText.includes("CRANIO") || fullText.includes("CAVEIRA")) return "FUSION CAVEIRA";
    if (fullText.includes("CAMUFLADA") || fullText.includes("CAMU")) return "FUSION CAMUFLADA";
    if (fullText.includes("ESPORTIVA") || fullText.includes("GELADO")) return "FUSION ESPORTIVA";
    return "FUSION UV50+";
  }

  // 2. Verifica se o modelo atual parece um SKU técnico (ex: C02820, FUSION127, BM001, etc.)
  const isSkuLike =
    !currentModel ||
    currentModel.trim() === "" ||
    currentModel.toUpperCase() === cleanSku ||
    /^[A-Z]{1,4}\d{2,6}(?:[A-Z0-9_\-]+)?$/i.test(currentModel.trim()) ||
    (cleanSku && currentModel.toUpperCase().includes(cleanSku));

  if (!isSkuLike) {
    // Se o modelo já é amigável e não contém SKU, apenas sanitiza e retorna
    return currentModel.replace(new RegExp(cleanSku, "gi"), "").trim();
  }

  // 3. Fallback inteligente para produtos BRK Agro / Pesca / etc.
  if (/agro|campo|fazenda|western/i.test(fullText)) {
    if (estampa && estampa.length > 2 && !/^[A-Z0-9_\-]+$/i.test(estampa)) {
      return `BRK AGRO ${estampa.toUpperCase()}`;
    }
    // Procura cores comuns no título
    const matchCor = fullText.match(/\b(VERDE|AZUL|PRETO|PRETA|BRANCO|BRANCA|MARROM|BEGE|CINZA|AMARELO|LARANJA)\b/);
    if (matchCor) return `BRK AGRO ${matchCor[1]}`;
    return "BRK AGRO MANGA LONGA";
  }

  if (estampa && estampa.length > 2 && !/^[A-Z0-9_\-]+$/i.test(estampa)) {
    return estampa.toUpperCase();
  }

  // Extrai 2 ou 3 palavras chave do título limpo
  const cleanTitle = (title || "").replace(new RegExp(cleanSku, "gi"), "").replace(/\s+/g, " ").trim();
  const words = cleanTitle.split(" ").slice(0, 3).join(" ");
  return words.toUpperCase() || "BRK ESPORTIVO";
}

/**
 * Regex abrangente para remoção de todos os emojis e pictogramas Unicode.
 */
const EMOJI_REGEX = /[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FAFF}\u{200D}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{203C}\u{2049}\u{2122}\u{2139}\u{2194}-\u{21AA}\u{2934}\u{2935}\u{3030}\u{303D}\u{3297}\u{3299}]/gu;

/**
 * Sanitiza a descrição para o padrão estrito exigido na Shopee:
 * 1. NUNCA colocar emojis (zero emojis na descrição).
 * 2. NUNCA colocar asteriscos (*) ou negrito markdown (**).
 * 3. NUNCA colocar SKU ou códigos de produto internos.
 * 4. Para camisas/camisetas/baby look: SEMPRE colocar tabela de medidas.
 *
 * @param {string} desc - Texto da descrição
 * @param {object} context - Contexto opcional { sku, parentSku, skus, title, modelo, categoria, isCamisa, isBabyLook }
 * @returns {string} Descrição limpa e padronizada
 */
export function sanitizeDescription(desc, context = {}) {
  if (!desc || typeof desc !== "string") return "";

  let cleaned = desc;

  // 1. REGRA 1: NUNCA colocar emojis
  cleaned = cleaned.replace(EMOJI_REGEX, "");

  // 2. REGRA 2: NUNCA colocar * (ou **)
  // Converte marcadores markdown de lista '*' ou '•' em traço limpo '-'
  cleaned = cleaned.replace(/^(\s*)[*•]\s+/gm, "$1- ");
  // Remove todos os asteriscos restantes (negrito ** ou ênfase *)
  cleaned = cleaned.replace(/\*/g, "");

  // 3. REGRA 3: NUNCA colocar SKU
  // Remove menções diretas de SKUs conhecidos passados no contexto
  const rawSkus = [
    ...(Array.isArray(context.skus) ? context.skus : []),
    context.sku,
    context.parentSku,
  ].filter(Boolean);

  for (const s of rawSkus) {
    if (!s || typeof s !== "string") continue;
    const cleanS = s.trim();
    if (cleanS.length >= 2) {
      const baseS = cleanS.replace(/_FULL$/i, "");
      const esc1 = cleanS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const esc2 = baseS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      cleaned = cleaned.replace(new RegExp(`\\b${esc1}\\b`, "gi"), "");
      if (esc2.length >= 2) {
        cleaned = cleaned.replace(new RegExp(`\\b${esc2}\\b`, "gi"), "");
      }
    }
  }

  // Remove rótulos explícitos de SKU (ex: "SKU: ADV256BL", "Código: T346", "Ref: C02820")
  cleaned = cleaned.replace(/\b(?:SKU|C[oó]digo|C[oó]d\.?|Ref\.?)\s*:\s*[A-Z0-9_\-]+\b/gi, "");
  // Remove linhas residuais de SKU vazias (ex: "- SKU:", "- Código:")
  cleaned = cleaned.replace(/^\s*[-•]?\s*(?:SKU|C[oó]digo|C[oó]d\.?|Ref\.?)\s*:\s*$/gm, "");

  // Remove código de modelo solto se colocado como "Modelo: <SKU>"
  cleaned = cleaned.replace(/(Modelo\s*:\s*)[A-Z]{1,4}\d{2,5}(?:[A-Z0-9_\-]+)?/gi, "$1Técnico");
  cleaned = cleaned.replace(/\bModelo\s+[A-Z]{1,4}\d{2,5}(?:[A-Z0-9_\-]+)?\s*:/gi, "Modelo:");

  // REGRA: NUNCA COLOCAR TAMANHO NAS DESCRIÇÕES
  // Remove linhas de tamanho (ex: "- Tamanho: P", "- Tamanho: Variado (P ao G2)", "Tamanho: M")
  cleaned = cleaned.replace(/^\s*[-•]?\s*Tamanho\s*:[^\r\n]*/gmi, "");
  cleaned = cleaned.replace(/\bTamanho\s*:\s*(?:Variado|[A-Z0-9\s,\/()\-]+(?=\n|$))/gmi, "");

  // 4. REGRA 4: Para camisas: SEMPRE colocar estrutura padrão completa BRK
  const fullCtx = `${context.title || ""} ${context.modelo || ""} ${cleaned} ${context.categoria || ""} ${context.sku || ""}`.toLowerCase();
  const isCamisa =
    context.isCamisa !== undefined
      ? context.isCamisa
      : (
          /camisa|camiseta|baby\s*look|manga\s*longa|manga\s*curta|vestu[aá]rio/i.test(fullCtx) ||
          /^[Cc]0\d|^CBT|^CMB|^APC|^ADV/i.test(context.sku || "") ||
          /BL/i.test(context.sku || "")
        );

  if (isCamisa) {
    // 4.1. Cuidados para Conservação
    if (!/cuidados\s*para\s*conserva[çc][ãa]o/i.test(cleaned)) {
      cleaned += `\n\nCuidados para Conservação:\n` +
        `As Camisas Brk são uma inovação no segmento, unindo qualidade, estilo e performance em um só produto. Confeccionadas com o tecido exclusivo XTech Pro®, proporcionam conforto, proteção solar UV50+.\n` +
        `Para preservar as propriedades do tecido e a eficácia da tecnologia utilizada, atente-se aos seguintes cuidados:\n` +
        `- Lave em água fria com detergente líquido.\n` +
        `- Após a lavagem, deixe secar na sombra.\n` +
        `- Não utilize máquina de secar e nem lavagem a seco.\n` +
        `- Não passe sua camisa com ferro elétrico.`;
    }

    // 4.2. Diferenciais da Camisa Brk
    if (!/diferenciais\s*da\s*camisa\s*brk|diferenciais\s*da\s*linha\s*brk/i.test(cleaned)) {
      cleaned += `\n\nDiferenciais da Camisa Brk:\n` +
        `- Costura reforçada com tecnologia.\n` +
        `- Tecido XTech Pro® exclusivo.\n` +
        `- Proteção solar UV50+ homologada.\n` +
        `- Estampas exclusivas.\n` +
        `- Garantia de 1 ano contra defeitos de fábrica.\n` +
        `- Troca fácil.`;
    }

    // 4.3. Tabela de Medidas Total (Masculino, Feminino Baby Look, Infantil)
    const hasTotalTable = /tabela\s*de\s*medidas\s*total/i.test(cleaned) &&
      /infantil\s*tamanho\s*pp/i.test(cleaned);

    if (!hasTotalTable) {
      // Remove qualquer tabela de medidas legada parcial anterior
      cleaned = cleaned.replace(/\n*TABELA\s*DE\s*MEDIDAS(?:\s*BABY\s*LOOK)?\s*\(TORAX\s*x\s*ALTURA\s*x\s*MANGA\)[\s\S]*?(?=(?:Dica\s*de\s*Medida|Nossa\s*Estampa|$))/gi, "");
      cleaned = cleaned.replace(/\n*Dica\s*de\s*Medida:[\s\S]*?(?=(?:Nossa\s*Estampa|$))/gi, "");

      const tabelaTotal = `\n\nTabela de Medidas Total:\n\n` +
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
        `Infantil Tamanho G2: Tórax: 95cm - Altura: 61,5cm - Manga: 51,5cm.`;

      cleaned = cleaned.trim() + tabelaTotal;
    }

    // 4.4. Aviso Legal de Direitos Autorais
    if (!/lei\s*de\s*direitos\s*autorais|lei\s*9\.610/i.test(cleaned)) {
      cleaned += `\n\nNossa Estampa é protegida pela Lei de Direitos Autorais (Lei 9.610/98) e Reprodução não autorizada está sujeita às penalidades legais. Copiar é crime!`;
    }
  }

  // Normalização de espaçamentos limpos
  cleaned = cleaned
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

/**
 * Valida e normaliza o JSON retornado pelo Gemini.
 *
 * @param {object} data - JSON parseado do Gemini
 * @param {string} sku - SKU esperado (para garantir consistência)
 * @param {string} parentSku - SKU Pai opcional
 * @returns {{ valid: boolean, data: object|null, errors: string[] }}
 */
export function validateAndNormalize(data, sku, parentSku = null) {
  const errors = [];

  // Normalizações pré-validação
  if (!data.palavras_chave) {
    if (Array.isArray(data.keywords)) data.palavras_chave = data.keywords;
    else if (Array.isArray(data.tags)) data.palavras_chave = data.tags;
    else if (data.titulo_shopee) {
      data.palavras_chave = data.titulo_shopee
        .toLowerCase()
        .replace(/[^a-z0-9áéíóúâêîôûãõç\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 6);
    }
  }

  // Normalizar Categoria Padrão Shopee (Bandanas, Iscas, Anzóis, Sandálias, Varas)
  const CATEGORIA_PADRAO_BANDANAS =
    "Acessórios de Moda > Bonés, Chapéus e Toucas";
  const CATEGORIA_PADRAO_ISCAS =
    "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Iscas";
  const CATEGORIA_PADRAO_ANZOIS =
    "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Anzóis";
  const CATEGORIA_PADRAO_SANDALIAS_MASC =
    "Sapatos Masculinos > Sandalia e Chinelos > Chinelos";
  const CATEGORIA_PADRAO_VARAS =
    "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Varas e Molinetes de Pesca";

  const fullTextNorm = `${data.titulo_shopee || ""} ${data.modelo || ""} ${data.descricao || ""} ${data.categoria_sugerida || ""} ${data.sku || ""}`.toLowerCase();

  const isBandana =
    /bandana|tubeneck|tube\s*neck|balaclava|pescoceira|faixa\s*de\s*pesco[çc]o|len[çc]o|\bbuff\b/i.test(fullTextNorm) ||
    /^[Tt]\d{2,4}/i.test(data.sku || "") ||
    /^BM\d+/i.test(data.sku || "") ||
    /^(CAMU_T|LISAS_T)/i.test(data.sku || "") ||
    (Array.isArray(data.skus_componentes) &&
      data.skus_componentes.some((s) => /^[Tt]\d{2,4}|^BM|^(CAMU_T|LISAS_T)/i.test(s)));

  const isAnzol =
    !isBandana && (
      /anzol|encastoado|hook/i.test(data.titulo_shopee || "") ||
      /anzol|encastoado|hook/i.test(data.modelo || "")
    );

  const isSandaliaOuChinelo =
    !isBandana && (
      /sand[aá]lia|chinelo|babuche|croc|clog|tamanco|\bslides?\b/i.test(data.titulo_shopee || "") ||
      /sand[aá]lia|chinelo|babuche|croc|clog|tamanco|\bslides?\b/i.test(data.modelo || "") ||
      /sand[aá]lia|chinelo|babuche|croc|clog|tamanco|\bslides?\b/i.test(data.categoria_sugerida || "") ||
      /colt|brave|boaonda/i.test(data.sku || "")
    );

  const isFeminina =
    /feminin|mulher|starfem|flowf/i.test(data.titulo_shopee || "") ||
    /feminin|mulher|starfem|flowf/i.test(data.sku || "");

  const isSandaliaMasculina = isSandaliaOuChinelo && !isFeminina;

  const isVara =
    !isBandana &&
    !isSandaliaOuChinelo &&
    !/suporte|salva\s*vara|porta\s*vara/i.test(data.titulo_shopee || "") &&
    !/suporte|salva\s*vara|porta\s*vara/i.test(data.modelo || "") &&
    (
      /\bvara\b|blank|\bvaras\b/i.test(data.titulo_shopee || "") ||
      /\bvara\b|blank|\bvaras\b/i.test(data.modelo || "") ||
      /varas/i.test(data.categoria_sugerida || "") ||
      /^VP/i.test(data.sku || "")
    );

  const isIsca =
    !isBandana &&
    !isAnzol &&
    !isSandaliaOuChinelo &&
    !isVara && (
      /isca/i.test(data.categoria_sugerida || "") ||
      /isca/i.test(data.titulo_shopee || "") ||
      /popper|minnow|zara|stick|crank|shad|frog|sapo|jumping/i.test(data.titulo_shopee || "") ||
      /popper|minnow|zara|stick|crank|shad|frog|sapo|jumping/i.test(data.modelo || "")
    );

  const isCamisa =
    !isBandana &&
    !isSandaliaOuChinelo &&
    !isVara &&
    (
      /camisa|camiseta|vestu[aá]rio|baby\s*look|infantil|manga\s*longa|manga\s*curta|agro/i.test(fullTextNorm) ||
      (data.categoria_sugerida && /camisa|roupa|vestu[aá]rio/i.test(data.categoria_sugerida)) ||
      /^[Cc]0\d+/i.test(data.sku || "") ||
      /^CAX/i.test(data.sku || "") ||
      /^FUSION/i.test(data.sku || "") ||
      /^CBT/i.test(data.sku || "") ||
      /^CMB/i.test(data.sku || "") ||
      /^APC/i.test(data.sku || "") ||
      /^ADV/i.test(data.sku || "") ||
      /BL/i.test(data.sku || "")
    );

  if (isBandana) {
    data.categoria_sugerida = CATEGORIA_PADRAO_BANDANAS;
  } else if (isSandaliaMasculina) {
    data.categoria_sugerida = CATEGORIA_PADRAO_SANDALIAS_MASC;
  } else if (isVara) {
    data.categoria_sugerida = CATEGORIA_PADRAO_VARAS;
  } else if (isAnzol) {
    data.categoria_sugerida = CATEGORIA_PADRAO_ANZOIS;
  } else if (isIsca) {
    data.categoria_sugerida = CATEGORIA_PADRAO_ISCAS;
  } else if (isCamisa) {
    const isFem = /feminin|mulher|starfem|flowf|baby\s*look/i.test(data.titulo_shopee || "") || /bl$/i.test(data.sku || "") || /bl_/i.test(data.sku || "") || /bl/i.test(data.sku || "");
    const isInfantil = (/\binfantil\b|\binfantis\b|\bcrian[çc]a\b|\bkids\b|\bjuvenil\b/i.test(data.titulo_shopee || "") || /inf$/i.test(data.sku || "") || /i$/i.test(data.sku || "")) && !isFem && !/masculin/i.test(data.titulo_shopee || "");
    if (isInfantil) {
      data.categoria_sugerida = "Moda Infantil > Roupas Infantis > Blusas";
    } else if (isFem) {
      data.categoria_sugerida = "Roupas Femininas > Blusas > Camisas e Blusas";
    } else {
      data.categoria_sugerida = "Roupas Masculinas > Blusas > Camisas";
    }
  }

  // 1. Verificar campos obrigatórios
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      errors.push(`Campo obrigatório ausente: "${field}"`);
    }
  }

  // Se faltam campos críticos, retorna erro
  if (errors.length > 3) {
    return { valid: false, data: null, errors };
  }

  // 2. Normalizar SKU
  data.sku = sku; // Sempre sobrescrever com o SKU real (LLM pode ter alterado)

  // 3. Validar e limpar SKU do título (REGRA: Nunca colocar SKU no título)
  const allSkus = [
    sku,
    parentSku,
    data.sku,
    data.parent_sku,
    ...(Array.isArray(data.skus_componentes) ? data.skus_componentes : []),
  ].filter(Boolean);

  if (data.titulo_shopee) {
    data.titulo_shopee = stripSkusFromTitle(data.titulo_shopee, allSkus);
    data.titulo_shopee = data.titulo_shopee.trim();
    if (data.titulo_shopee.length > MAX_TITULO_CHARS) {
      // Trunca no último espaço antes do limite
      const truncated = data.titulo_shopee.substring(0, MAX_TITULO_CHARS);
      const lastSpace = truncated.lastIndexOf(" ");
      data.titulo_shopee = lastSpace > 80 ? truncated.substring(0, lastSpace) : truncated;
      errors.push(`Título truncado para ${MAX_TITULO_CHARS} chars (era ${data.titulo_shopee.length})`);
    }
  }

  // 4. Validar e sanitizar descrição (REGRAS: Nunca emojis, Nunca *, Nunca SKU, Para camisas: Sempre medidas)
  if (data.descricao) {
    data.descricao = sanitizeDescription(data.descricao, {
      sku: data.sku,
      parentSku: data.parent_sku || parentSku,
      skus: allSkus,
      title: data.titulo_shopee,
      modelo: data.modelo,
      categoria: data.categoria_sugerida,
      isCamisa,
      isBabyLook: /baby\s*look|feminina/i.test(`${data.titulo_shopee || ""} ${data.modelo || ""} ${data.sku || ""}`),
    });
    data.descricao = data.descricao.trim();
    if (data.descricao.length < MIN_DESCRICAO_CHARS) {
      errors.push(`Descrição muito curta: ${data.descricao.length} chars (mín: ${MIN_DESCRICAO_CHARS})`);
    }
    if (data.descricao.length > MAX_DESCRICAO_CHARS) {
      data.descricao = data.descricao.substring(0, MAX_DESCRICAO_CHARS);
    }
  }

  // 5. Garantir que marca não está vazia
  if (!data.marca || data.marca.trim() === "") {
    data.marca = "Genérica";
    errors.push("Marca não identificada, usando 'Genérica'");
  }

  // 5b. Normalizar Modelo (REGRA: NUNCA colocar SKU no modelo - usar características como 'FUSION AZUL', etc.)
  data.modelo = generateFriendlyModel(data.sku, data.titulo_shopee, data.atributos?.estampa, data.modelo);

  // 6. Sobrescrever medidas com valores fixos (SEMPRE — LLM pode alucinar)
  data.medidas = { ...MEDIDAS_FIXAS };

  // 7. Garantir que variações é um array
  if (!Array.isArray(data.variacoes)) {
    data.variacoes = [];
  }

  // 8. Garantir que palavras_chave é um array
  if (!Array.isArray(data.palavras_chave)) {
    data.palavras_chave = [];
  }

  // 9. Garantir que atributos é um objeto e normalizar campos da Ficha Técnica Shopee
  if (typeof data.atributos !== "object" || data.atributos === null) {
    data.atributos = {};
  }
  normalizeShopeeAttributes(data);

  // 10. Validar títulos alternativos (para testes A/B) - NUNCA colocar SKU
  if (Array.isArray(data.titulos_alternativos)) {
    data.titulos_alternativos = data.titulos_alternativos
      .map((t) => (typeof t === "string" ? stripSkusFromTitle(t.trim(), allSkus) : ""))
      .filter(Boolean)
      .map((t) => (t.length > MAX_TITULO_CHARS ? t.substring(0, MAX_TITULO_CHARS) : t));
  } else {
    data.titulos_alternativos = [];
  }

  // 11. Auditoria e Score SEO Automático
  const seoAudit = calculateSeoAudit(data);
  data.seo_score = seoAudit.score;
  data.seo_checklist = seoAudit.checklist;

  // Resultado
  const hasCriticalErrors = errors.some(
    (e) => e.startsWith("Campo obrigatório ausente") && !e.includes("marca")
  );

  return {
    valid: !hasCriticalErrors,
    data,
    errors,
  };
}

/**
 * Calcula auditoria e pontuação de SEO (0-100) baseada nos princípios do seo-content-writer.
 */
export function calculateSeoAudit(data) {
  const checklist = [];
  let score = 0;

  // 1. Título SEO (0-25 pontos)
  const titleLen = (data.titulo_shopee || "").length;
  if (titleLen >= 60 && titleLen <= 120) {
    score += 25;
    checklist.push({
      item: "Tamanho do Título",
      passed: true,
      score: 25,
      maxScore: 25,
      reason: `${titleLen}/120 caracteres (faixa ideal: 60-120)`,
    });
  } else if (titleLen > 0 && titleLen < 60) {
    score += 15;
    checklist.push({
      item: "Tamanho do Título",
      passed: false,
      score: 15,
      maxScore: 25,
      reason: `${titleLen}/120 caracteres (muito curto, adicione termos)`,
    });
  } else {
    checklist.push({
      item: "Tamanho do Título",
      passed: false,
      score: 0,
      maxScore: 25,
      reason: "Título ausente ou inválido",
    });
  }

  // 2. Estrutura Persuasiva da Descrição (0-25 pontos)
  const desc = data.descricao || "";
  const hasIntro = desc.length >= 100;
  const hasWhy = /por que escolher/i.test(desc);
  const hasSpecs = /especificaç|especificac/i.test(desc);
  const hasTips = /dicas de uso|modo de usar|recomendaç/i.test(desc);
  const hasTargets = /indicado para/i.test(desc);

  let descScore = 0;
  if (hasIntro) descScore += 5;
  if (hasWhy) descScore += 5;
  if (hasTargets) descScore += 5;
  if (hasSpecs) descScore += 5;
  if (hasTips) descScore += 5;
  score += descScore;

  checklist.push({
    item: "Estrutura Persuasiva",
    passed: descScore >= 20,
    score: descScore,
    maxScore: 25,
    reason: `${descScore}/25 pts (Intro: ${hasIntro ? "✅" : "❌"}, Benefícios: ${hasWhy ? "✅" : "❌"}, Indicado: ${hasTargets ? "✅" : "❌"}, Especificações: ${hasSpecs ? "✅" : "❌"}, Dicas: ${hasTips ? "✅" : "❌"})`,
  });

  // 3. Atributos Técnicos Extraídos (0-20 pontos)
  const attrs = Object.keys(data.atributos || {}).length;
  const attrScore = Math.min(20, attrs * 4);
  score += attrScore;
  checklist.push({
    item: "Atributos Técnicos",
    passed: attrs >= 3,
    score: attrScore,
    maxScore: 20,
    reason: `${attrs} atributos mapeados (meta: 3+)`,
  });

  // 4. Palavras-chave e Relevância (0-15 pontos)
  const kws = (data.palavras_chave || []).length;
  const kwScore = Math.min(15, kws * 3);
  score += kwScore;
  checklist.push({
    item: "Palavras-chave SEO",
    passed: kws >= 4,
    score: kwScore,
    maxScore: 15,
    reason: `${kws} palavras-chave identificadas (meta: 4+)`,
  });

  // 5. Escaneabilidade e Formatação (0-15 pontos)
  const bulletCount = (desc.match(/[-•]/g) || []).length;
  let formatScore = 0;
  if (bulletCount >= 4) formatScore += 10;
  else if (bulletCount >= 1) formatScore += 5;
  if (desc.includes("\n")) formatScore += 5;
  score += formatScore;

  checklist.push({
    item: "Escaneabilidade & E-E-A-T",
    passed: formatScore >= 12,
    score: formatScore,
    maxScore: 15,
    reason: `${bulletCount} marcadores/bullet points com quebras de linha`,
  });

  return {
    score: Math.min(100, Math.round(score)),
    checklist,
  };
}

/**
 * Tenta parsear a resposta do Gemini como JSON.
 * Lida com respostas que podem conter markdown code blocks.
 *
 * @param {string} text - Texto bruto da resposta do Gemini
 * @returns {object|null} JSON parseado ou null se falhar
 */
export function parseGeminiResponse(text) {
  if (!text || typeof text !== "string") return null;

  let cleaned = text.trim();

  // Remove markdown code blocks se presentes
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }

  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Tenta extrair JSON de dentro do texto (busca primeiro { até último })
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Normaliza os atributos técnicos da categoria de Iscas conforme a Ficha Técnica da Shopee.
 * Atributos padronizados da foto:
 * - País de Origem (pais_de_origem)
 * - Peso do Produto (peso_do_produto)
 * - Duração da Garantia (duracao_da_garantia)
 * - Material (material)
 * - Estampa (estampa)
 * - Condição (condicao)
 * - Comprimento (comprimento)
 * - Dimensões do Produto (A x L x C), sem a caixa de embalagem (dimensoes_do_produto)
 * - Quantidade da embalagem (quantidade_da_embalagem)
 * - Tamanho Do Pacote (tamanho_do_pacote)
 * - Produto personalizado (produto_personalizado)
 * - Quantidade por Pacote (quantidade_por_pacote)
 */
export function normalizeShopeeAttributes(data) {
  if (!data.atributos || typeof data.atributos !== "object") {
    data.atributos = {};
  }

  const attrs = data.atributos;
  const isAnzol =
    /anzol|encastoado|hook/i.test(data.titulo_shopee || "") ||
    /anzol|encastoado|hook/i.test(data.modelo || "");

  const isIsca =
    !isAnzol && (
      /isca/i.test(data.categoria_sugerida || "") ||
      /isca/i.test(data.titulo_shopee || "") ||
      /popper|minnow|zara|stick|crank|shad|frog|sapo|jumping/i.test(data.titulo_shopee || "") ||
      /popper|minnow|zara|stick|crank|shad|frog|sapo|jumping/i.test(data.modelo || "")
    );

  if (isIsca) {
    const fullText = `${data.titulo_shopee || ""} ${data.modelo || ""} ${data.descricao || ""}`;

    // 1. País de Origem
    if (!attrs.pais_de_origem) {
      if (/jackall|megabass|duo|yo-zuri|shimano|daiwa/i.test(data.marca || "") || /jackall|megabass/i.test(fullText)) {
        attrs.pais_de_origem = "Japão";
      } else {
        attrs.pais_de_origem = "Brasil";
      }
    }

    // 2. Peso do Produto (ex: "10g", "12.8g", "8g")
    if (!attrs.peso_do_produto) {
      const pesoFound = attrs.peso_produto || attrs.peso;
      if (pesoFound) {
        attrs.peso_do_produto = String(pesoFound).includes("g") ? String(pesoFound) : `${pesoFound}g`;
      } else {
        const matchPeso = fullText.match(/(\d+(?:[.,]\d+)?)\s*g(?:ramas)?\b/i);
        if (matchPeso) {
          attrs.peso_do_produto = `${matchPeso[1].replace(',', '.')}g`;
        } else {
          attrs.peso_do_produto = "10g";
        }
      }
    }

    // 3. Duração da Garantia
    if (!attrs.duracao_da_garantia) {
      attrs.duracao_da_garantia = attrs.garantia || "1 Mês";
    }

    // 4. Material
    if (!attrs.material) {
      if (/soft|frog|sapo|silicone|borracha/i.test(fullText)) {
        attrs.material = "Silicone / Borracha Macia";
      } else if (/jig|chumbo/i.test(fullText)) {
        attrs.material = "Chumbo e Aço Carbono";
      } else {
        attrs.material = "Plástico ABS";
      }
    }

    // 5. Estampa
    if (!attrs.estampa) {
      if (/hologr[aá]fic/i.test(fullText) || /laser/i.test(fullText)) {
        attrs.estampa = "Holográfica / Pintura Laser";
      } else {
        attrs.estampa = "Pintura Realista";
      }
    }

    // 6. Condição
    attrs.condicao = "Novo";

    // 7. Comprimento (ex: "9 cm", "9.5 cm", "8 cm")
    if (!attrs.comprimento) {
      const tamFound = attrs.tamanho || attrs.comprimento_cm;
      if (tamFound) {
        attrs.comprimento = String(tamFound).includes("cm") ? String(tamFound) : `${tamFound} cm`;
      } else {
        const matchCm = fullText.match(/(\d+(?:[.,]\d+)?)\s*cm\b/i);
        if (matchCm) {
          attrs.comprimento = `${matchCm[1].replace(',', '.')} cm`;
        } else {
          const numModel = (data.modelo || data.sku || "").match(/(\d+)/);
          if (numModel) {
            const val = parseInt(numModel[1], 10);
            if (val >= 50 && val <= 200) {
              attrs.comprimento = `${(val / 10).toFixed(1).replace('.0', '')} cm`;
            } else if (val >= 5 && val <= 25) {
              attrs.comprimento = `${val} cm`;
            } else {
              attrs.comprimento = "9 cm";
            }
          } else {
            attrs.comprimento = "9 cm";
          }
        }
      }
    }

    // 8. Dimensões do Produto (A x L x C), sem a caixa de embalagem
    if (!attrs.dimensoes_do_produto) {
      const compNum = parseFloat(String(attrs.comprimento).replace(/[^\d.,]/g, '').replace(',', '.')) || 9;
      const altLarg = compNum > 10 ? "2.5" : "2";
      attrs.dimensoes_do_produto = `${altLarg} x ${altLarg} x ${compNum} cm`;
    }

    // 9. Quantidade da embalagem (sempre número inteiro)
    const rawQtdEmb = attrs.quantidade_da_embalagem || attrs.quantidade || 1;
    attrs.quantidade_da_embalagem = parseInt(String(rawQtdEmb).replace(/\D/g, ""), 10) || 1;

    // 10. Tamanho Do Pacote
    if (!attrs.tamanho_do_pacote) {
      attrs.tamanho_do_pacote = "3 x 20 x 30 cm";
    }

    // 11. Produto personalizado
    attrs.produto_personalizado = "Não";

    // 12. Quantidade por Pacote (sempre número inteiro, nunca string)
    const rawQtdPacote = attrs.quantidade_por_pacote || attrs.quantidade_da_embalagem || attrs.quantidade || 1;
    attrs.quantidade_por_pacote = parseInt(String(rawQtdPacote).replace(/\D/g, ""), 10) || 1;

    // Ação e Nado
    if (!attrs.tipo_isca) {
      if (/superf[ií]cie|zara|stick|popper|prop/i.test(fullText)) {
        attrs.tipo_isca = "Superfície (Zara / Stick / Popper)";
      } else if (/fundo|sinking|deep/i.test(fullText)) {
        attrs.tipo_isca = "Fundo / Sinking";
      } else {
        attrs.tipo_isca = "Meia-Água (Minnow / Twitch)";
      }
    }

    if (!attrs.flutuabilidade) {
      if (/floating|flutuante/i.test(fullText)) {
        attrs.flutuabilidade = "Floating (Flutuante)";
      } else if (/sinking|afundante/i.test(fullText)) {
        attrs.flutuabilidade = "Sinking (Afundante)";
      } else if (/suspending|suspensa/i.test(fullText)) {
        attrs.flutuabilidade = "Suspending (Neutra)";
      }
    }
  }

  // Normalização específica para Sandálias e Chinelos Masculinos (conforme Ficha Técnica da Shopee)
  const fullTextCalcado = `${data.titulo_shopee || ""} ${data.modelo || ""} ${data.descricao || ""} ${data.sku || ""}`.toLowerCase();
  const isFootwear = /sand[aá]lia|chinelo|babuche|croc|clog|tamanco|\bslides?\b|colt|brave|adventure|flow|star/i.test(fullTextCalcado);
  const isFem = /feminin|mulher|starfem|flowf/i.test(fullTextCalcado);
  const isSandaliaMasculina = (data.categoria_sugerida && data.categoria_sugerida.includes("Sapatos Masculinos")) || (isFootwear && !isFem);

  if (isSandaliaMasculina) {
    attrs.pais_de_origem = "Brasil";
    attrs.material = "Sintético";
    attrs.calcado_de_caminhada = attrs.calcado_de_caminhada || "";
    attrs.acabamento_do_couro = attrs.acabamento_do_couro || "";
    attrs.estilo_do_sapato = attrs.estilo_do_sapato || (
      /chinelo/i.test(data.titulo_shopee || "") ? "Chinelo" :
      /babuche/i.test(data.titulo_shopee || "") ? "Babuche" : "Sandália"
    );
    attrs.ajuste_amplo = attrs.ajuste_amplo || "Não";
    attrs.condicao = "Novo";
    attrs.quantidade_da_embalagem = 1;
    attrs.quantidade_por_pacote = 1;
    attrs.tamanho_do_pacote = "";
    attrs.produto_personalizado = "Não";
    attrs.modelo = attrs.modelo || data.modelo || "Boaonda";
  }

  // Normalização específica para Varas de Pesca (conforme Ficha Técnica da Shopee)
  const isVara =
    !/suporte|salva\s*vara|porta\s*vara/i.test(data.titulo_shopee || "") &&
    !/suporte|salva\s*vara|porta\s*vara/i.test(data.modelo || "") &&
    ((data.categoria_sugerida && data.categoria_sugerida.includes("Varas e Molinetes de Pesca")) ||
    (!isSandaliaMasculina && (
      /\bvara\b|blank|\bvaras\b/i.test(data.titulo_shopee || "") ||
      /\bvara\b|blank|\bvaras\b/i.test(data.modelo || "") ||
      /^VP/i.test(data.sku || "")
    )));

  if (isVara) {
    const fullText = `${data.titulo_shopee || ""} ${data.modelo || ""} ${data.descricao || ""}`.toLowerCase();

    attrs.tipo_de_pesca = attrs.tipo_de_pesca || "";

    if (!attrs.peso_do_produto) {
      const matchPeso = fullText.match(/(\d+(?:[.,]\d+)?)\s*g(?:ramas)?\b/i);
      attrs.peso_do_produto = matchPeso ? `${matchPeso[1].replace(',', '.')}g` : "150g";
    }

    if (!attrs.comprimento) {
      const matchMetros = fullText.match(/(\d+[.,]\d+)\s*m\b/i);
      if (matchMetros) {
        attrs.comprimento = matchMetros[1].replace(',', '.');
      } else {
        attrs.comprimento = "1.73";
      }
    } else {
      attrs.comprimento = String(attrs.comprimento).replace(/[^\d.,]/g, '').replace(',', '.').trim() || "1.73";
    }

    attrs.duracao_da_garantia = "1 Mês";
    attrs.tipo_de_garantia = attrs.tipo_de_garantia || "";
    attrs.quantidade_da_embalagem = 1;
    attrs.pais_de_origem = "China";
    attrs.material = "Fibra de Carbono";
    attrs.condicao = "Novo";
    attrs.tamanho_do_pacote = "";
    attrs.produto_personalizado = "Não";
    attrs.quantidade_por_pacote = 1;
    attrs.modelo = attrs.modelo || data.modelo || "Carbon";
  }

  // Normalização específica para Bandanas / Tubenecks / Toucas (conforme Ficha Técnica da Shopee - Foto 2)
  const fullTextBandana = `${data.titulo_shopee || ""} ${data.modelo || ""} ${data.descricao || ""} ${data.categoria_sugerida || ""} ${data.sku || ""}`.toLowerCase();
  const isBandana =
    (data.categoria_sugerida && data.categoria_sugerida.includes("Bonés, Chapéus e Toucas")) ||
    /bandana|tubeneck|tube\s*neck|balaclava|pescoceira|faixa\s*de\s*pesco[çc]o|len[çc]o|\bbuff\b/i.test(fullTextBandana) ||
    /^[Tt]\d{2,4}/i.test(data.sku || "") ||
    /^BM\d+/i.test(data.sku || "") ||
    /^(CAMU_T|LISAS_T)/i.test(data.sku || "") ||
    (Array.isArray(data.skus_componentes) &&
      data.skus_componentes.some((s) => /^[Tt]\d{2,4}|^BM|^(CAMU_T|LISAS_T)/i.test(s)));

  if (isBandana) {
    // Remove atributos de outros nichos
    delete attrs.tipo_isca;
    delete attrs.flutuabilidade;
    delete attrs.tipo_vara;
    delete attrs.libragem;
    delete attrs.partes;
    delete attrs.calcado_de_caminhada;
    delete attrs.acabamento_do_couro;
    delete attrs.estilo_do_sapato;
    delete attrs.ajuste_amplo;
    delete attrs.gola;
    delete attrs.comprimento_da_manga;
    delete attrs.compimento_da_manga;
    delete attrs.comprimento_da_parte_de_cima;
    delete attrs.tipo_de_colarinho;
    delete attrs.tipos_de_punho;
    delete attrs.tipo_de_roupas_da_parte_de_cima;
    delete attrs.plus_size;
    delete attrs.blusa_cropped;

    // Atributos oficiais da Ficha Técnica Shopee para Bandana (Foto 2):
    // 1. Gênero
    attrs.genero = attrs.genero || "Unissex";
    // 2. País de Origem
    attrs.pais_de_origem = "Brasil";
    // 3. Material
    attrs.material = attrs.material || "Poliéster";
    // 4. Estampa
    if (!attrs.estampa || attrs.estampa === "Estampada") {
      if (/brasil|bandeira/i.test(fullTextBandana)) {
        attrs.estampa = "Bandeira do Brasil";
      } else if (/camuflad|camu/i.test(fullTextBandana)) {
        attrs.estampa = "Camuflada";
      } else if (/caveira/i.test(fullTextBandana)) {
        attrs.estampa = "Caveira";
      } else if (/real\s*tree/i.test(fullTextBandana)) {
        attrs.estampa = "Real Tree";
      } else if (/lisa|liso/i.test(fullTextBandana)) {
        attrs.estampa = "Lisa";
      } else if (/rio|amazon|tucunar[eé]/i.test(fullTextBandana)) {
        attrs.estampa = "Amazon";
      } else {
        attrs.estampa = "Estampada";
      }
    }
    // 5. Estilo de Chapéu
    attrs.estilo_de_chapeu = "Bandana";
    // 6. Tipo de Couro (deixar em branco)
    attrs.tipo_de_couro = "";
    // 7. Condição
    attrs.condicao = "Novo";
    // 8. Número de Registro da FDA (deixar em branco)
    attrs.numero_de_registro_da_fda = "";
    // 9. Quantidade da embalagem (número inteiro)
    const rawQtd = attrs.quantidade_da_embalagem ?? (data.is_kit && Array.isArray(data.skus_componentes) ? data.skus_componentes.length : 1);
    const qtdInt = parseInt(String(rawQtd).replace(/\D/g, ""), 10) || 1;
    attrs.quantidade_da_embalagem = qtdInt;
    attrs.quantidade_por_pacote = qtdInt;
    // 10. Tamanho Do Pacote (sempre em branco)
    attrs.tamanho_do_pacote = "";
    // 11. Produto personalizado
    attrs.produto_personalizado = "Não";
  }

  // Normalização específica para Camisas / Vestuário (conforme Ficha Técnica da Shopee na Magis5)
  const fullTextCamisa = `${data.titulo_shopee || ""} ${data.modelo || ""} ${data.descricao || ""} ${data.categoria_sugerida || ""} ${data.sku || ""}`.toLowerCase();
  const isCamisa =
    !isBandana &&
    !isFootwear &&
    !isVara &&
    (
      /camisa|camiseta|vestu[aá]rio|baby\s*look|infantil|manga\s*longa|manga\s*curta|agro/i.test(fullTextCamisa) ||
      (data.categoria_sugerida && /camisa|roupa|vestu[aá]rio/i.test(data.categoria_sugerida)) ||
      /^[Cc]0\d+/i.test(data.sku || "") ||
      /^CAX/i.test(data.sku || "") ||
      /^FUSION/i.test(data.sku || "") ||
      /^CBT/i.test(data.sku || "") ||
      /^CMB/i.test(data.sku || "") ||
      /^APC/i.test(data.sku || "") ||
      /^ADV/i.test(data.sku || "")
    );

  if (isCamisa) {
    // Remove atributos irrelevantes de pesca se presentes
    delete attrs.tipo_isca;
    delete attrs.flutuabilidade;
    delete attrs.tipo_vara;
    delete attrs.libragem;
    delete attrs.partes;
    delete attrs.calcado_de_caminhada;
    delete attrs.acabamento_do_couro;
    delete attrs.estilo_do_sapato;
    delete attrs.ajuste_amplo;

    // Ficha Técnica oficial da Shopee para Camisas (padrão XTech-Pro para tecidos):
    attrs.pais_de_origem = "Brasil";
    attrs.material = "XTech-Pro";
    attrs.gola = attrs.gola || (
      /gola\s*padre/i.test(fullTextCamisa) ? "Gola Padre" :
      /gola\s*v/i.test(fullTextCamisa) ? "Gola V" :
      /gola\s*redonda/i.test(fullTextCamisa) ? "Gola Redonda" :
      "Gola Alta"
    );
    attrs.ocasiao = attrs.ocasiao || "Fazenda";
    attrs.estampa = attrs.estampa || (
      /s[aã]o\s*bento/i.test(fullTextCamisa) ? "São Bento" :
      /camuflad/i.test(fullTextCamisa) ? "Camuflada Brasil" :
      /nossa\s*senhora/i.test(fullTextCamisa) ? "Nossa Senhora" :
      /apache/i.test(fullTextCamisa) ? "Apache Longhorn" :
      /anjos/i.test(fullTextCamisa) ? "Anjos" :
      /vitral/i.test(fullTextCamisa) ? "Vitral" :
      "Estampada"
    );
    attrs.comprimento_da_manga = attrs.comprimento_da_manga || (
      /manga\s*curta/i.test(fullTextCamisa) ? "Manga Curta" : "Manga Comprida"
    );
    attrs.compimento_da_manga = attrs.comprimento_da_manga;
    attrs.estilo = attrs.estilo || (
      /agro|campo|fazenda|western/i.test(fullTextCamisa) ? "Agro" : "Esportivo"
    );
    attrs.comprimento_da_parte_de_cima = attrs.comprimento_da_parte_de_cima || "";
    attrs.tipo_de_colarinho = attrs.tipo_de_colarinho || "";
    attrs.tipos_de_punho = attrs.tipos_de_punho || "";
    attrs.tipo_de_roupas_da_parte_de_cima = attrs.tipo_de_roupas_da_parte_de_cima || "";
    attrs.tamanho_grande = attrs.tamanho_grande || "";
    attrs.condicao = "Novo";
    attrs.quantidade_da_embalagem = 1;
    attrs.quantidade_por_pacote = 1;
    attrs.plus_size = attrs.plus_size || "";
    attrs.tamanho_do_pacote = "";
    attrs.produto_personalizado = "Não";
    attrs.modelo = generateFriendlyModel(data.sku, data.titulo_shopee, attrs.estampa, attrs.modelo || data.modelo);
    data.modelo = attrs.modelo;
    if (data.variacoes && data.variacoes.length > 0) {
      attrs.tamanho = "Selecione nas variações";
    }
  }

  return data;
}

