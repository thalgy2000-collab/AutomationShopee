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
 * Valida e normaliza o JSON retornado pelo Gemini.
 *
 * @param {object} data - JSON parseado do Gemini
 * @param {string} sku - SKU esperado (para garantir consistência)
 * @returns {{ valid: boolean, data: object|null, errors: string[] }}
 */
export function validateAndNormalize(data, sku) {
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

  // 3. Validar e truncar título
  if (data.titulo_shopee) {
    data.titulo_shopee = data.titulo_shopee.trim();
    if (data.titulo_shopee.length > MAX_TITULO_CHARS) {
      // Trunca no último espaço antes do limite
      const truncated = data.titulo_shopee.substring(0, MAX_TITULO_CHARS);
      const lastSpace = truncated.lastIndexOf(" ");
      data.titulo_shopee = lastSpace > 80 ? truncated.substring(0, lastSpace) : truncated;
      errors.push(`Título truncado para ${MAX_TITULO_CHARS} chars (era ${data.titulo_shopee.length})`);
    }
  }

  // 4. Validar descrição
  if (data.descricao) {
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

  // 5b. Normalizar Categoria Padrão Shopee para Iscas, Anzóis e Sandálias Masculinas
  const CATEGORIA_PADRAO_ISCAS =
    "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Iscas";
  const CATEGORIA_PADRAO_ANZOIS =
    "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Anzóis";
  const CATEGORIA_PADRAO_SANDALIAS_MASC =
    "Sapatos Masculinos > Sandalia e Chinelos > Chinelos";

  const isAnzol =
    /anzol|encastoado|hook/i.test(data.titulo_shopee || "") ||
    /anzol|encastoado|hook/i.test(data.modelo || "");

  const isSandaliaOuChinelo =
    /sand[aá]lia|chinelo|babuche|croc|clog|tamanco|\bslides?\b/i.test(data.titulo_shopee || "") ||
    /sand[aá]lia|chinelo|babuche|croc|clog|tamanco|\bslides?\b/i.test(data.modelo || "") ||
    /sand[aá]lia|chinelo|babuche|croc|clog|tamanco|\bslides?\b/i.test(data.categoria_sugerida || "") ||
    /colt|brave|boaonda/i.test(data.sku || "");

  const isFeminina =
    /feminin|mulher|starfem|flowf/i.test(data.titulo_shopee || "") ||
    /feminin|mulher|starfem|flowf/i.test(data.sku || "");

  const isSandaliaMasculina = isSandaliaOuChinelo && !isFeminina;

  const isIsca =
    !isAnzol && !isSandaliaOuChinelo && (
      /isca/i.test(data.categoria_sugerida || "") ||
      /isca/i.test(data.titulo_shopee || "") ||
      /popper|minnow|zara|stick|crank|shad|frog|sapo|jumping/i.test(data.titulo_shopee || "") ||
      /popper|minnow|zara|stick|crank|shad|frog|sapo|jumping/i.test(data.modelo || "")
    );

  if (isSandaliaMasculina) {
    data.categoria_sugerida = CATEGORIA_PADRAO_SANDALIAS_MASC;
  } else if (isAnzol) {
    data.categoria_sugerida = CATEGORIA_PADRAO_ANZOIS;
  } else if (isIsca) {
    data.categoria_sugerida = CATEGORIA_PADRAO_ISCAS;
  }

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

  // 10. Validar títulos alternativos (para testes A/B)
  if (Array.isArray(data.titulos_alternativos)) {
    data.titulos_alternativos = data.titulos_alternativos
      .map((t) => (typeof t === "string" ? t.trim() : ""))
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

  return data;
}

