/**
 * category_rules.mjs — Registro Único e Orientado a Dados para Categorização
 * e Atributos da Ficha Técnica por Tipo de Produto (Magis5 / Shopee).
 *
 * Princípios de Design:
 * 1. FONTE ÚNICA DA VERDADE: Elimina lógica e regex duplicados entre
 *    agent2-enricher/schemas.mjs, agent3-rpa-magis5/src/publisher.mjs e agent4-diagnostician/rules.mjs.
 * 2. DETERMINAÇÃO ESTRITA: Detecção baseia-se exclusivamente em TÍTULO e MODELO (com/sem acento),
 *    NUNCA na descrição ou nome da marca, evitando falso-positivos causados por "BRK Agro".
 * 3. PRIORIDADE ORDENADA: Regras específicas (almofadas, malas, óculos, manguitos, calçados,
 *    bonés/bandanas, varas, iscas, anzóis) são avaliadas ANTES do fallback de camisa/pesca.
 * 4. CONFIGURABILIDADE: Valores de ficha técnica (fixos, em branco, gerados por produto)
 *    estão centralizados nas definições de regra.
 */

// Helper para normalizar texto removendo acentos e convertendo para minúsculas
export function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Catálogo Oficial de Categorias Shopee / Magis5
 */
export const CATEGORIAS_OFICIAIS = {
  almofadas: "Casa e Decoração > Móveis > Almofadas",
  capas_mala: "Viagens e Bagagens > Acessórios de Viagem > Protetores e Capas de Bagagem",
  oculos_sol: "Acessórios de Moda > Óculos > Óculos de sol",
  camisas_masculinas: "Roupas Masculinas > Blusas > Camisas",
  camisas_femininas: "Roupas Femininas > Blusas > Camisas e Blusas",
  camisas_infantis: "Moda Infantil > Roupas Infantis > Blusas",
  botas_masculinas: "Sapatos Masculinos > Botas",
  sandalias_masculinas: "Sapatos Masculinos > Sandalia e Chinelos > Chinelos",
  bones_chapeus: "Acessórios de Moda > Bonés, Chapéus e Toucas",
  varas_pesca: "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Varas e Molinetes de Pesca",
  linhas_pesca: "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Linhas de Pesca",
  iscas_artificiais: "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Iscas",
  anzois_pesca: "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Anzóis de Pesca",
  acessorios_pesca: "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Acessórios de Pesca",
  copos_termicos: "Esportes e Atividades ao Ar Livre > Acessórios Esportivos e Atividades ao Ar Livre > Garrafas e Copos Térmicos",
  pet_caes_coleiras: "Animais Domésticos > Cães > Coleiras, Guias e Peitorais",
};

/**
 * REGISTRO CENTRAL DE REGRAS POR TIPO DE PRODUTO
 * Ordem de avaliação: prioridade decrescente.
 */
export const CATEGORY_RULES = [
  // ───────────────────────────────────────────────────────────────────────────
  // 1. CAPA DE ALMOFADA (DEFINIDA) — Prioridade 100
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "almofada",
    nome: "Capa de Almofada",
    prioridade: 100,
    status: "definida",
    categoria: CATEGORIAS_OFICIAIS.almofadas,
    match: (textHeader, sku) => {
      // Detecção: apenas título e modelo normalizados
      // Casos com capa: "capa(s) de/para almofada(s)", "capa almofada", "almofada decorativa"
      const hasCapaAlmofada =
        /\bcapas?\s*(?:de|para)?\s*almofadas?\b/i.test(textHeader) ||
        /\balmofadas?\s+decorativas?\b/i.test(textHeader) ||
        /\balmofadas?\b/i.test(textHeader);
      return hasCapaAlmofada;
    },
    // Avaliação de flags especiais como revisao_categoria
    evaluateFlags: (textHeader, sku) => {
      const isApenasAlmofada =
        /\balmofadas?\b/i.test(textHeader) &&
        !/\bcapas?\b/i.test(textHeader);
      if (isApenasAlmofada) {
        return {
          revisao_categoria: true,
          motivo_revisao_categoria: "Produto identificado como 'Almofada' sem o termo explícito 'Capa'. Verificar se inclui enchimento.",
        };
      }
      return { revisao_categoria: false, motivo_revisao_categoria: null };
    },
    // Regras de atributos da Ficha Técnica na Magis5 / Shopee
    atributos: {
      // Valores fixos configuráveis
      comprimento: 45, // em cm
      duracao_da_garantia: "1 Mês",
      quantidade_da_embalagem: 4,
      material: "XTechPro",
      condicao: "Novo",
      pais_de_origem: "Brasil",

      // Atributos explicitamente EM BRANCO para Almofada
      // IMPORTANTE: quantidade_por_pacote DEVE ficar em branco para almofadas
      estofado: "",
      tamanho_do_pacote: "",
      funcionalidades: "",
      estilo: "",
      produto_personalizado: "Não",
      instrucoes_de_cuidados: "",
      quantidade_por_pacote: "",
      weave: "",
      cushion_set: "",
      id_montagem: "",
    },
    // Lista de campos que DEVEM permanecer em branco no RPA da Magis5
    blankFields: [
      "estofado",
      "tamanhodopacote",
      "tamanhopacote",
      "funcionalidades",
      "estilo",
      "produtopersonalizado",
      "instrucoesdecuidados",
      "quantidadeporpacote",
      "quantidadepacote",
      "weave",
      "cushionset",
      "cushion/set",
      "idmontagem",
    ],
    // Atributos gerados por produto (ex: estampa)
    perProductAttributes: {
      estampa: (product) => {
        // Gera estampa curta em pt-BR (1 a 3 palavras) extraída do título/modelo
        const header = `${product.titulo_shopee || ""} ${product.modelo || ""}`;
        const norm = normalizeText(header);

        // Remove menções de marca, medidas e tipos de produto
        let candidate = norm
          .replace(/\bbrk(?:\s*agro|\s*fishing|\s*motors)?\b/gi, "")
          .replace(/\bcapas?\s*(?:de|para)?\s*almofadas?\b/gi, "")
          .replace(/\balmofadas?\s*decorativas?\b/gi, "")
          .replace(/\balmofadas?\b/gi, "")
          .replace(/\bcapas?\b/gi, "")
          .replace(/\b\d+\s*x\s*\d+\s*(?:cm)?\b/gi, "")
          .replace(/\b\d+\s*cm\b/gi, "")
          .replace(/\bkit\s*\d*\b/gi, "")
          .replace(/\b(?:com|sem)\s*z[ií]per\b/gi, "")
          .replace(/[^a-z0-9\s]/gi, " ")
          .replace(/\s+/g, " ")
          .trim();

        // Padrões conhecidos de estampas
        if (/folha|folhagem/i.test(candidate)) return { value: "Folhas", needsReview: false };
        if (/floral|flores/i.test(candidate)) return { value: "Floral", needsReview: false };
        if (/geometric|formas/i.test(candidate)) return { value: "Geométrica", needsReview: false };
        if (/listrad|listras/i.test(candidate)) return { value: "Listrada", needsReview: false };
        if (/abstrata|abstrato/i.test(candidate)) return { value: "Abstrata", needsReview: false };
        if (/madeira|rustica/i.test(candidate)) return { value: "Rústica", needsReview: false };
        if (/mandala/i.test(candidate)) return { value: "Mandala", needsReview: false };
        if (/lisa|liso/i.test(candidate)) return { value: "Lisa", needsReview: false };

        const words = candidate.split(" ").filter((w) => w.length > 2);
        if (words.length >= 1 && words.length <= 3) {
          // Capitalizar primeiras letras
          const estampaStr = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          return { value: estampaStr, needsReview: false };
        }

        // Se não conseguir determinar com segurança, deixa em branco e marca para revisão
        return {
          value: "",
          needsReview: true,
          motivo: "Não foi possível determinar a estampa da almofada com segurança a partir do título/imagens.",
        };
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. CAPA DE MALA (DEFINIDA) — Prioridade 90
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "capa_mala",
    nome: "Capa de Mala",
    prioridade: 90,
    status: "definida",
    categoria: CATEGORIAS_OFICIAIS.capas_mala,
    match: (textHeader, sku) => {
      // Exclui colisões como capa de chuva, capa de celular, capa de moto
      if (/capa\s*(?:de|para)?\s*(?:chuva|celular|moto|carro|almofada|sofa|banco)/i.test(textHeader)) {
        return false;
      }
      return /\bcapas?\s*(?:de|para|protetora\s*de)?\s*malas?\b/i.test(textHeader);
    },
    evaluateFlags: () => ({
      revisao_categoria: false,
      motivo_revisao_categoria: null,
    }),
    atributos: {
      pais_de_origem: "Brasil",
      condicao: "Novo",
      material: "Poliéster",
      quantidade_da_embalagem: 1,
      quantidade_por_pacote: 1,
      tamanho_do_pacote: "",
      produto_personalizado: "Não",
    },
    blankFields: ["tamanhodopacote", "tamanhopacote"],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. ÓCULOS DE SOL (DEFINIDA) — Prioridade 85
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "oculos",
    nome: "Óculos de Sol / Polarizado",
    prioridade: 85,
    status: "definida",
    categoria: CATEGORIAS_OFICIAIS.oculos_sol,
    match: (textHeader, sku) => {
      // Exclui óculos de natação, mergulho, solda, grau
      if (/oculos\s*(?:de)?\s*(?:natacao|mergulho|solda|grau|leitura)/i.test(textHeader)) {
        return false;
      }
      return /\b[oó]culos\b/i.test(textHeader) || /^OC\d+/i.test(sku || "");
    },
    evaluateFlags: () => ({
      revisao_categoria: false,
      motivo_revisao_categoria: null,
    }),
    atributos: {
      pais_de_origem: "Brasil",
      condicao: "Novo",
      duracao_da_garantia: "1 Mês",
      quantidade_da_embalagem: 1,
      quantidade_por_pacote: 1,
      tamanho_do_pacote: "",
      produto_personalizado: "Não",
    },
    blankFields: ["tamanhodopacote", "tamanhopacote"],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. MANGUITO (PENDENTE) — Prioridade 80
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "manguito",
    nome: "Manguito / Manguitos",
    prioridade: 80,
    status: "pendente",
    categoria: CATEGORIAS_OFICIAIS.bones_chapeus,
    match: (textHeader, sku) => {
      return /\bmanguitos?\b/i.test(textHeader) || /^MANG\d+/i.test(sku || "");
    },
    evaluateFlags: () => ({
      revisao_categoria: true,
      motivo_revisao_categoria: "Definição de categoria pendente para Manguito. Produto mantido em RASCUNHO para revisão manual.",
    }),
    atributos: {},
    blankFields: [],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 5. CALÇADOS (Sandálias, Chinelos, Botas) — Prioridade 70
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "calcados",
    nome: "Calçados / Sandálias / Botas",
    prioridade: 70,
    status: "definida",
    categoria: CATEGORIAS_OFICIAIS.sandalias_masculinas,
    match: (textHeader, sku) => {
      return (
        /bota|botina|coturno|calcado|calçado|sapato|sand[aá]lia|chinelo|babuche|croc|clog|tamanco|\bslides?\b/i.test(textHeader) ||
        /^(BT|COLT|BRAVE|BOAONDA)/i.test(sku || "")
      );
    },
    resolveCategory: (textHeader, sku) => {
      const isBota = /bota|botina|coturno|country|trabalho|couro/i.test(textHeader) || /^BT/i.test(sku || "");
      return isBota ? CATEGORIAS_OFICIAIS.botas_masculinas : CATEGORIAS_OFICIAIS.sandalias_masculinas;
    },
    atributos: {
      pais_de_origem: "Brasil",
      material: "Sintético",
      condicao: "Novo",
      quantidade_da_embalagem: 1,
      quantidade_por_pacote: 1,
      tamanho_do_pacote: "",
      produto_personalizado: "Não",
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 6. BONÉS, CHAPÉUS E BANDANAS / TUBENECK — Prioridade 65
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "bandanas_bones",
    nome: "Bonés, Toucas e Bandanas",
    prioridade: 65,
    status: "definida",
    categoria: CATEGORIAS_OFICIAIS.bones_chapeus,
    match: (textHeader, sku) => {
      return (
        /bon[eé]|bone|trucker|snapback|strapback|aba\s*curva|chap[eé]u|chapeu|gorro|boina|bandana|tubeneck|tube\s*neck|balaclava|pescoceira|\bbuff\b/i.test(textHeader) ||
        /^(BA\d|T\d{2,4}|BM\d|CAMU_T|LISAS_T)/i.test(sku || "")
      );
    },
    atributos: {
      genero: "Unissex",
      pais_de_origem: "Brasil",
      material: "Poliéster",
      estilo_de_chapeu: "Bandana",
      tipo_de_couro: "",
      condicao: "Novo",
      numero_de_registro_da_fda: "",
      quantidade_da_embalagem: 1,
      tamanho_do_pacote: "",
      produto_personalizado: "Não",
      quantidade_por_pacote: 1,
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 7. VARAS E MOLINETES DE PESCA — Prioridade 60
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "varas_pesca",
    nome: "Varas de Pesca",
    prioridade: 60,
    status: "definida",
    categoria: CATEGORIAS_OFICIAIS.varas_pesca,
    match: (textHeader, sku) => {
      if (/suporte|salva\s*vara|porta\s*vara/i.test(textHeader)) return false;
      return /\bvara\b|blank|\bvaras\b|molinete|carretilha/i.test(textHeader) || /^VP/i.test(sku || "");
    },
    atributos: {
      duracao_da_garantia: "1 Mês",
      quantidade_da_embalagem: 1,
      pais_de_origem: "China",
      material: "Fibra de Carbono",
      condicao: "Novo",
      tamanho_do_pacote: "",
      produto_personalizado: "Não",
      quantidade_por_pacote: 1,
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 8. ISCAS ARTIFICIAIS — Prioridade 55
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "iscas",
    nome: "Iscas Artificiais",
    prioridade: 55,
    status: "definida",
    categoria: CATEGORIAS_OFICIAIS.iscas_artificiais,
    match: (textHeader, sku) => {
      return (
        /isca|popper|minnow|zara|stick|crank|shad|frog|sapo|jumping|is-f009|crayfish/i.test(textHeader) ||
        /^IS-/i.test(sku || "")
      );
    },
    atributos: {
      pais_de_origem: "Brasil",
      condicao: "Novo",
      duracao_da_garantia: "1 Mês",
      quantidade_da_embalagem: 1,
      quantidade_por_pacote: 1,
      produto_personalizado: "Não",
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 9. ANZÓIS E LINHAS DE PESCA — Prioridade 50
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "anzois",
    nome: "Anzóis de Pesca",
    prioridade: 50,
    status: "definida",
    categoria: CATEGORIAS_OFICIAIS.anzois_pesca,
    match: (textHeader, sku) => {
      return /anzol|encastoado|garat[eé]ia|hook/i.test(textHeader);
    },
    atributos: {
      duracao_da_garantia: "1 Mês",
      condicao: "Novo",
      quantidade_da_embalagem: 1,
      quantidade_por_pacote: 1,
      produto_personalizado: "Não",
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 10. CAMISAS E VESTUÁRIO (REFINADA) — Prioridade 30
  // Deve casar apenas com termos explícitos de vestuário no título/modelo ou
  // prefixos conhecidos de SKU de camisa (C0, CAX, FUSION, CBT, CMB, APC, ADV).
  // NUNCA casar por "BL" avulso em outros produtos nem por "agro" na descrição!
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "camisas",
    nome: "Camisas e Vestuário",
    prioridade: 30,
    status: "definida",
    categoria: CATEGORIAS_OFICIAIS.camisas_masculinas,
    match: (textHeader, sku) => {
      const skuUpper = (sku || "").toUpperCase();
      const isKnownShirtSku = /^(C0\d|CAX|FUSION|CBT|CMB|APC|ADV)/i.test(skuUpper);
      const isShirtTerm = /\b(?:camisa|camisetas?|baby\s*look|manga\s*(?:longa|curta)|regata|polo|jaleco)\b/i.test(textHeader);
      return isKnownShirtSku || isShirtTerm;
    },
    resolveCategory: (textHeader, sku) => {
      const skuUpper = (sku || "").toUpperCase();
      const isInfantil =
        (/\binfantil\b|\binfantis\b|\bcrian[çc]a\b|\bkids\b|\bjuvenil\b/i.test(textHeader) || /_inf$|-inf$/i.test(skuUpper)) &&
        !/masculin|adulto|homem/i.test(textHeader);
      if (isInfantil) return CATEGORIAS_OFICIAIS.camisas_infantis;

      const isFem =
        /\bfeminina?\b|\bmulher\b|\bstarfem\b|\bflowf\b|\bbaby\s*look\b|\bbabylook\b/i.test(textHeader) ||
        /_BL$|-BL$|BL$/i.test(skuUpper);
      if (isFem) return CATEGORIAS_OFICIAIS.camisas_femininas;

      return CATEGORIAS_OFICIAIS.camisas_masculinas;
    },
    atributos: {
      pais_de_origem: "Brasil",
      material: "XTech-Pro",
      ocasiao: "Fazenda",
      condicao: "Novo",
      quantidade_da_embalagem: 1,
      quantidade_por_pacote: 1,
      tamanho_do_pacote: "",
      produto_personalizado: "Não",
    },
  },
];

/**
 * Identifica a regra aplicável a um determinado produto.
 * Avalia estritamente TÍTULO, MODELO e SKU (nunca descrição ou marca).
 *
 * @param {object} product - Produto a ser avaliado ({ titulo_shopee, modelo, sku })
 * @returns {object|null} Regra correspondente ou null se nenhuma casar
 */
export function getCategoryRule(product = {}) {
  const textHeader = normalizeText(`${product.titulo_shopee || ""} ${product.modelo || ""}`);
  const sku = (product.sku || "").trim();

  for (const rule of CATEGORY_RULES) {
    if (rule.match(textHeader, sku)) {
      return rule;
    }
  }

  return null;
}

/**
 * Determina a categoria oficial Shopee e avalia eventuais pendências (D3).
 * Substitui o método resolveCorrectShopeeCategory espalhado pelo sistema.
 *
 * @param {object} product - Dados do produto
 * @returns {string} Caminho completo da categoria Shopee
 */
export function resolveShopeeCategoryWithRule(product = {}) {
  const textHeader = normalizeText(`${product.titulo_shopee || ""} ${product.modelo || ""}`);
  const sku = (product.sku || "").trim();
  const rule = getCategoryRule(product);

  if (rule) {
    let resolvedCat = rule.categoria;
    if (typeof rule.resolveCategory === "function") {
      resolvedCat = rule.resolveCategory(textHeader, sku);
    }

    if (typeof rule.evaluateFlags === "function") {
      const flags = rule.evaluateFlags(textHeader, sku);
      if (flags.revisao_categoria) {
        product.revisao_categoria = true;
        product.motivo_revisao_categoria = flags.motivo_revisao_categoria || "Revisão necessária para esta categoria.";
      } else {
        product.revisao_categoria = false;
      }
    }

    return resolvedCat;
  }

  // D3 Fallback para casos sem regra correspondente
  product.revisao_categoria = true;
  product.motivo_revisao_categoria = "Classificador não encontrou correspondência exata de categoria. Requer revisão manual em rascunho.";
  return CATEGORIAS_OFICIAIS.acessorios_pesca;
}
