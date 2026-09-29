/**
 * Mapeador e normalizador de atributos para a Ficha Técnica da Shopee.
 * Implementa as diretrizes do `shopee-brk-agro` e traduz os campos do JSON
 * para os rótulos e valores aceitos pela interface do Shopee Seller Center.
 */

/**
 * Normaliza e consolida todos os atributos de um produto para a Shopee.
 * @param {object} product - Dados brutos do JSON (agent2-enricher/produtos/*.json)
 * @returns {object} Atributos consolidados e regras de preenchimento
 */
export function buildProductAttributes(product) {
  const title = (product.titulo_shopee || product.titulo || product.name || '').toLowerCase();
  const sku = (product.sku || '').toUpperCase();
  const rawAttrs = product.atributos || {};

  // Detecção de tipo de produto
  const isBandana = title.includes('bandana') || title.includes('tubeneck') || title.includes('balaclava') || title.includes('touca');
  const isBone = title.includes('boné') || title.includes('bone') || sku.startsWith('BA') || sku.startsWith('700');
  const isCamisa = !isBandana && !isBone && (title.includes('camisa') || title.includes('camiseta') || title.includes('jaleco') || sku.startsWith('C0') || sku.startsWith('CAX') || sku.startsWith('FUSION'));
  const isCopo = title.includes('copo') || title.includes('garrafa') || sku.startsWith('CPT');
  const isIsca = title.includes('isca') || sku.startsWith('ISCA') || title.includes('popper') || title.includes('minnow');
  const isCalcado = title.includes('sandalia') || title.includes('sandália') || title.includes('chinelo') || title.includes('bota') || title.includes('botina') || sku.startsWith('BT') || sku.startsWith('EVA');

  // Gênero
  let genero = rawAttrs.genero || '';
  if (!genero) {
    if (isBandana) {
      genero = 'Unissex';
    } else if (sku.endsWith('BL') || title.includes('feminina') || title.includes('baby look') || title.includes('fem')) {
      genero = 'Feminino';
    } else if (sku.endsWith('I') || title.includes('infantil') || title.includes('kids') || title.includes('juvenil')) {
      genero = 'Meninos'; // ou Unissex infantil
    } else if (title.includes('masculina') || isCamisa || isCalcado) {
      genero = 'Masculino';
    } else {
      genero = 'Unissex';
    }
  }

  // Material
  let material = rawAttrs.material || '';
  if (!material) {
    if (isBandana) material = 'Poliéster';
    else if (isCamisa) material = 'XTechPro';
    else if (isCopo) material = 'Aço Inoxidável';
    else if (isCalcado) material = 'EVA';
    else if (isIsca) material = 'Plástico ABS';
    else material = 'XTechPro';
  }

  // Comprimento da manga
  let comprimentoManga = rawAttrs.comprimento_da_manga || rawAttrs.compimento_da_manga || '';
  if (isCamisa && !comprimentoManga) {
    comprimentoManga = title.includes('curta') ? 'Manga Curta' : 'Manga Comprida';
  }

  // Gola / Colarinho
  let gola = rawAttrs.gola || rawAttrs.tipo_de_colarinho || '';
  if (isCamisa && !gola) {
    if (title.includes('padre')) gola = 'Gola Padre';
    else if (title.includes('redonda')) gola = 'Gola Redonda';
    else if (title.includes('polo')) gola = 'Polo';
    else gola = 'Gola Alta';
  }

  // Ocasião e Estilo
  let ocasiao = rawAttrs.ocasiao || (title.includes('pesca') ? 'Pesca' : 'Fazenda');
  let estilo = rawAttrs.estilo || (title.includes('pesca') ? 'Esportivo' : 'Agro');

  // Estampa
  let estampa = rawAttrs.estampa || '';
  if (!estampa) {
    if (title.includes('são bento') || title.includes('sao bento')) estampa = 'São Bento';
    else if (title.includes('brasil')) estampa = 'Bandeira do Brasil';
    else if (title.includes('camuflad')) estampa = 'Camuflada';
    else if (title.includes('tucunaré') || title.includes('tucunare')) estampa = 'Tucunaré';
    else estampa = 'Estampada';
  }

  // Marca oficial
  let marca = product.marca || 'BRK';
  if (isIsca) {
    if (title.includes('marine')) marca = 'Marine Sports';
    else if (title.includes('sumax')) marca = 'Sumax';
    else if (title.includes('jackall')) marca = 'Jackall';
    else if (title.includes('albatroz')) marca = 'Albatroz';
    else if (title.includes('nelson')) marca = 'Nelson Nakamura';
  }

  // Modelo comercial amigável (NUNCA expor SKU)
  let modelo = product.modelo || '';
  if (!modelo || modelo === sku) {
    if (title.includes('são bento')) modelo = 'BRK SÃO BENTO';
    else if (sku.startsWith('FUSION')) modelo = 'BRK FUSION';
    else if (title.includes('jesus')) modelo = 'BRK AGRO JESUS';
    else modelo = (product.titulo_shopee || product.titulo || 'BRK OFICIAL').substring(0, 30);
  }

  // Mapa estruturado de mapeamento para os campos na interface do Shopee Seller Center
  const fieldRules = [
    {
      labelRegex: /marca/i,
      value: marca,
      alternatives: ['Brk Agro', 'BRK', 'BRK Fishing', 'Sem Marca', 'No Brand'],
      required: true
    },
    {
      labelRegex: /material/i,
      value: material,
      alternatives: [material, 'XTechPro', 'Sintético', 'Malha', 'Têxtil', 'Poliéster', 'Outros'],
      required: true
    },
    {
      labelRegex: /g[eê]nero/i,
      value: genero,
      alternatives: ['Unissex', 'Masculino', 'Feminino', 'Meninos', 'Meninas'],
      required: true
    },
    {
      labelRegex: /pa[ií]s de origem/i,
      value: 'Brasil',
      alternatives: ['Brasil', 'Nacional'],
      required: false
    },
    {
      labelRegex: /condi[cç][aã]o/i,
      value: 'Novo',
      alternatives: ['Novo'],
      required: false
    },
    {
      labelRegex: /quantidade (por|da) embalagem|quantidade por pacote/i,
      value: '1',
      alternatives: ['1', '1 unidade', '1 peça'],
      required: false
    },
    {
      labelRegex: /produto personalizado/i,
      value: 'Não',
      alternatives: ['Não', 'No'],
      required: false
    },
    {
      labelRegex: /^modelo$/i,
      value: modelo,
      alternatives: [modelo],
      required: false
    }
  ];

  if (isCamisa) {
    fieldRules.push(
      {
        labelRegex: /compimento da manga|comprimento da manga|manga/i,
        value: comprimentoManga,
        alternatives: ['Manga Comprida', 'Manga Longa', 'Manga Curta'],
        required: true
      },
      {
        labelRegex: /^gola$/i,
        value: gola,
        alternatives: ['Gola Alta', 'Gola Padre', 'Gola Redonda', 'Gola V', 'Polo', 'Outros'],
        required: false
      },
      {
        labelRegex: /ocasi[aã]o/i,
        value: 'Casual',
        alternatives: ['Casual', 'Fazenda', 'Trabalho', 'Esporte', 'Ao ar livre', 'Outros'],
        required: false
      },
      {
        labelRegex: /^estilo$/i,
        value: 'Casual',
        alternatives: ['Casual', 'Básico', 'Esportivo', 'Agro', 'Country', 'Outros'],
        required: false
      },
      {
        labelRegex: /estampa/i,
        value: 'Outros',
        alternatives: ['Estampada', 'Estampa', 'Impressão', 'Camuflada', 'Outros'],
        required: false
      },
      {
        labelRegex: /tipo de colarinho/i,
        value: 'Colarinho Clássico',
        alternatives: ['Colarinho Clássico', 'Gola Padre', 'Gola Redonda', 'Gola Olímpica', 'Outros'],
        required: false
      }
    );
  }

  if (isBandana) {
    fieldRules.push(
      {
        labelRegex: /estilo de chap[eé]u|tipo de chap[eé]u/i,
        value: 'Bandana',
        alternatives: ['Bandana', 'Faixa de Cabeça', 'Touca'],
        required: false
      },
      {
        labelRegex: /estampa/i,
        value: estampa,
        alternatives: ['Estampada', 'Camuflada', 'Bandeira', 'Outros'],
        required: false
      }
    );
  }

  if (isCopo) {
    fieldRules.push(
      {
        labelRegex: /volume|capacidade/i,
        value: '473ml',
        alternatives: ['473ml', '500ml', '470ml'],
        required: false
      },
      {
        labelRegex: /caracter[ií]stica do material|t[eé]rmico/i,
        value: 'Térmico',
        alternatives: ['Isolamento a Vácuo', 'Térmico', 'Inox'],
        required: false
      }
    );
  }

  return {
    sku,
    title,
    isBandana,
    isCamisa,
    isBone,
    isCopo,
    isIsca,
    isCalcado,
    resolvedValues: {
      marca,
      modelo,
      genero,
      material,
      comprimentoManga,
      gola,
      ocasiao,
      estilo,
      estampa,
      origem: 'Brasil',
      condicao: 'Novo'
    },
    fieldRules
  };
}
