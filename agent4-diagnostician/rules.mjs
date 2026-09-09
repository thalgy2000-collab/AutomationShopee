/**
 * Regras de Diagnóstico e Catálogo de Soluções para Rejeições na Magis5/Shopee.
 */

// Catálogo oficial de categorias válidas da Shopee para Pesca e Pet
export const SHOPEE_OFFICIAL_CATEGORIES = {
  iscas: "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Iscas",
  linhas: "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Linhas de Pesca",
  varas: "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Varas e Molinetes de Pesca",
  anzois: "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Anzóis de Pesca",
  acessorios_pesca: "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Acessórios de Pesca",
  pet_caes_coleiras: "Animais Domésticos > Cães > Coleiras, Guias e Peitorais",
  pet_geral: "Animais Domésticos > Cães > Acessórios para Cães",
  copos_termicos: "Esportes e Atividades ao Ar Livre > Acessórios Esportivos e Atividades ao Ar Livre > Garrafas e Copos Térmicos",
};

/**
 * Identifica a categoria oficial exata com base nas palavras-chave do produto.
 */
export function resolveCorrectShopeeCategory(product) {
  const fullText = `${product.titulo_shopee || ""} ${product.modelo || ""} ${product.descricao || ""} ${product.marca || ""}`.toLowerCase();

  // 1. Linhas de Pesca
  if (/linha|monofilamento|multifilamento|fluorocarbono|fluorcarbon/i.test(fullText)) {
    return SHOPEE_OFFICIAL_CATEGORIES.linhas;
  }

  // 2. Iscas Artificiais
  if (/isca|popper|minnow|zara|stick|crank|shad|frog|sapo|jumping|is-f009|crayfish/i.test(fullText)) {
    return SHOPEE_OFFICIAL_CATEGORIES.iscas;
  }

  // 3. Varas e Molinetes
  if (/vara|carretilha|molinete|blank/i.test(fullText)) {
    return SHOPEE_OFFICIAL_CATEGORIES.varas;
  }

  // 4. Anzóis
  if (/anzol|encastoado|garat[eé]ia|hook/i.test(fullText)) {
    return SHOPEE_OFFICIAL_CATEGORIES.anzois;
  }

  // 5. Acessórios de Pesca (alicates, canivetes, suportes, bolsas, estojos)
  if (/alicate|canivete|suporte|porta isca|fita de prote|estojo|tesoura|boga/i.test(fullText)) {
    return SHOPEE_OFFICIAL_CATEGORIES.acessorios_pesca;
  }

  // 6. Artigos Pet (coleiras, peitorais, guias)
  if (/coleira|peitoral|guia|c[aã]o|c[aã]es|pet|cachorro|ezydog/i.test(fullText)) {
    return SHOPEE_OFFICIAL_CATEGORIES.pet_caes_coleiras;
  }

  // 7. Copos Térmicos
  if (/copo|t[eé]rmico|garrafa|caneca/i.test(fullText)) {
    return SHOPEE_OFFICIAL_CATEGORIES.copos_termicos;
  }

  return SHOPEE_OFFICIAL_CATEGORIES.acessorios_pesca;
}

/**
 * Classifica o erro capturado e gera uma proposta de solução estruturada.
 *
 * @param {string} rawError - Mensagem de erro capturada da tela ou log
 * @param {object} product - JSON enriquecido do produto
 * @returns {object} Diagnóstico e Proposta de Solução
 */
export function classifyErrorAndProposeSolution(rawError, product = {}) {
  const err = (rawError || "").toLowerCase();

  // 1. Erro de Categoria Incompleta / Incompatível
  if (err.includes("finalize a seleção de categorias") || err.includes("categoria") || err.includes("subcategoria")) {
    const correctCat = resolveCorrectShopeeCategory(product);
    return {
      codigo: "CATEGORIA_INCOMPATIVEL",
      tipo: "Categoria Incompatível",
      gravidade: "ALTA",
      badgeClass: "badge-danger",
      icone: "📂",
      diagnostico: `A categoria sugerida pela IA (${product.categoria_sugerida || "indefinida"}) não correspondeu à árvore oficial exigida pela Shopee na Magis5. O formulário não encontrou os níveis filhos e bloqueou o salvamento.`,
      proposta: {
        acao: "Atualizar para a categoria oficial padronizada da Shopee",
        categoria_correta: correctCat,
        explicacao: `Ajustar o campo "categoria_sugerida" para "${correctCat}", garantindo seleção automática e sem travas no seletor da Magis5.`,
        autoFixAvailable: true,
        fixType: "UPDATE_CATEGORY",
      },
    };
  }

  // 2. Erro de SKU Duplicado
  if (err.includes("sku já cadastrado") || err.includes("já existe um produto com este sku") || err.includes("sku duplicado")) {
    return {
      codigo: "SKU_DUPLICADO",
      tipo: "SKU Já Existente na Magis5",
      gravidade: "MEDIA",
      badgeClass: "badge-warning",
      icone: "⚠️",
      diagnostico: `O SKU principal "${product.sku}" já está cadastrado em outro anúncio dentro da sua conta da Magis5 (produto criado anteriormente).`,
      proposta: {
        acao: "Marcar como Concluído ou Gerar Variação / Sufixo",
        explicacao: `Se este anúncio já foi criado manualmente no passado, a ação recomendada é marcar como "publicado" na planilha. Se for um produto novo que colidiu com SKU antigo, pode-se adicionar um sufixo (ex: "${product.sku}-V2").`,
        autoFixAvailable: true,
        fixType: "RESOLVE_DUPLICATE_SKU",
      },
    };
  }

  // 3. Erro de Limite de Fotos por Variação da Shopee
  if (err.includes("/1 imagens de variação") || err.includes("imagens de variação") || err.includes("limite de fotos")) {
    return {
      codigo: "LIMITE_FOTOS_VARIACAO",
      tipo: "Excesso de Fotos na Variação",
      gravidade: "ALTA",
      badgeClass: "badge-danger",
      icone: "📸",
      diagnostico: `A Shopee impõe um limite estrito de exatamente 1 foto por variação (1/1). Ao puxar fotos automáticas do ERP Sankhya, a variação acumulou mais de 1 foto e a Magis5 rejeitou o envio.`,
      proposta: {
        acao: "Executar Limpeza Prévia de Fotos na Variação",
        explicacao: `O Agente 3 agora expande a seção de variações e limpa todas as fotos pré-carregadas pelo ERP antes de subir a foto oficial individual, garantindo a proporção 1/1.`,
        autoFixAvailable: true,
        fixType: "CLEAN_VARIATION_IMAGES",
      },
    };
  }

  // 4. Erro de EAN Inválido / Campo Vazio
  if (err.includes("ean desse produto é inválido") || err.includes("ean") || err.includes("16 caracteres")) {
    return {
      codigo: "EAN_OU_SANKHYA_INVALIDO",
      tipo: "Código ERP / EAN Inválido",
      gravidade: "ALTA",
      badgeClass: "badge-danger",
      icone: "🔢",
      diagnostico: `O campo de código de barras ou SKU da variação recebeu um valor fora do padrão (ex: SKU com mais de 16 dígitos ou campo vazio sem código Sankhya).`,
      proposta: {
        acao: "Vincular Código Sankhya correto da Planilha",
        explicacao: `Mapear o código Sankhya exato do produto (5 dígitos) para o campo SKU da variação, permitindo a sincronização automática do EAN sem erros.`,
        autoFixAvailable: true,
        fixType: "SYNC_SANKHYA_CODE",
      },
    };
  }

  // 5. Erro Genérico ou Validação de Tela
  return {
    codigo: "VALIDACAO_FORMULARIO",
    tipo: "Validação Pendente no Formulário",
    gravidade: "MEDIA",
    badgeClass: "badge-info",
    icone: "📋",
    diagnostico: `O formulário da Magis5 não concluiu o salvamento devido à validação pendente na página. Detalhe capturado: "${rawError || "Sem mensagem explícita"}"`,
    proposta: {
      acao: "Re-processar com Modo Visível (Headed)",
      explicacao: `Executar o Agente 3 com a opção "Modo Visível" ativa no painel para inspecionar visualmente qual campo específico está exigindo preenchimento.`,
      autoFixAvailable: false,
      fixType: "MANUAL_INSPECTION",
    },
  };
}
