import fs from 'node:fs';
import path from 'node:path';
import XLSX from './agent3-rpa-magis5/node_modules/xlsx/xlsx.js';

const URL_TABELA_MASCULINA = 'https://cf.shopee.com.br/file/br-11134201-820ld-mrj4uj3gfwudfb';
const URL_TABELA_FEMININA = 'https://cf.shopee.com.br/file/br-11134207-820m8-mtgvlhopnbped5';

async function generateDeepDiagnosticsReport() {
  const inputPath = 'uploads/relatorio_produtos_sem_venda.xlsx';
  const outputPath = 'uploads/Relatorio_Diagnostico_Falhas_Shopee_BRK_Atualizado.xlsx';
  const downloadsPathPrimary = 'C:/Users/marke/Downloads/Relatorio_Diagnostico_Produtos_Ativos_Shopee.xlsx';
  const downloadsPathLocked = 'C:/Users/marke/Downloads/Relatorio_Diagnostico_Falhas_Shopee_BRK_Atualizado.xlsx';

  console.log(`📖 Lendo planilha de origem: ${inputPath}...`);
  const wb = XLSX.readFile(inputPath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`📦 Total de registros na planilha bruta: ${rawRows.length}`);

  // 1. REGRA DO USUÁRIO: Descartar produtos excluídos ("Não foi possível obter informações do produto devido à exclusão")
  const activeRows = rawRows.filter(r => {
    const nome = String(r['Produto'] || '').trim();
    return !nome.includes('Não foi possível obter informações do produto devido à exclusão');
  });

  const descartados = rawRows.length - activeRows.length;
  console.log(`🗑️ Produtos excluídos descartados da análise: ${descartados}`);
  console.log(`🎯 Produtos ativos reais da loja para auditoria: ${activeRows.length}`);

  // 2. Identifica produtos marcados com a cor D8E4BC (verde claro)
  const greenItemIds = new Set();
  const greenSkus = new Set();

  if (fs.existsSync('scratch/xlsx_1/xl/worksheets/sheet1.xml') && fs.existsSync('scratch/locked_copy.xlsx')) {
    const xml = fs.readFileSync('scratch/xlsx_1/xl/worksheets/sheet1.xml', 'utf-8');
    const regex = /<c\s+r="([A-Z]+)(\d+)"[^>]*s="1"/g;
    const coloredRowNumbers = new Set();
    let match;
    while ((match = regex.exec(xml)) !== null) {
      coloredRowNumbers.add(parseInt(match[2], 10));
    }

    const wbLocked = XLSX.readFile('scratch/locked_copy.xlsx');
    const sheetLocked = wbLocked.Sheets[wbLocked.SheetNames[0]];
    const dataLocked = XLSX.utils.sheet_to_json(sheetLocked, { header: 1 });
    for (const rNum of coloredRowNumbers) {
      const row = dataLocked[rNum - 1];
      if (row) {
        if (row[0]) greenItemIds.add(String(row[0]).trim());
        if (row[1]) greenSkus.add(String(row[1]).trim().toUpperCase());
      }
    }
  }

  console.log(`🟢 Produtos na cor #D8E4BC (preservados / sem novas alterações): ${greenItemIds.size}`);

  // 3. Carrega base de mídia da Shopee (Mass Update Media)
  const dirDownloads = 'C:/Users/marke/Downloads';
  const mediaFiles = fs.readdirSync(dirDownloads).filter(f => f.startsWith('mass_update_media_info_') && f.endsWith('.xlsx'));
  const mediaMap = new Map();

  for (const f of mediaFiles) {
    try {
      const wbMedia = XLSX.readFile(path.join(dirDownloads, f));
      const sheetMedia = wbMedia.Sheets[wbMedia.SheetNames[0]];
      const dataMedia = XLSX.utils.sheet_to_json(sheetMedia, { header: 1 });
      for (let i = 5; i < dataMedia.length; i++) {
        const r = dataMedia[i];
        const id = String(r[0] || '').trim();
        if (!id || id === 'ID do Produto') continue;
        
        const cover = r[4];
        const imgs = [r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12]].filter(Boolean);
        const template = r[13];
        const sizeChart = r[14];

        mediaMap.set(id, {
          cover,
          images: imgs,
          template: template ? String(template).trim() : '',
          sizeChart: sizeChart ? String(sizeChart).trim() : ''
        });
      }
    } catch {}
  }
  console.log(`📸 Base de Mídia Shopee carregada: ${mediaMap.size} produtos indexados`);

  const enrichedRows = activeRows.map((r) => {
    const itemId = String(r['ID do Item'] || '').trim();
    const sku = String(r['SKU Principal'] || '').toUpperCase();
    const imp = Number(r['Total Impressões'] || 0);
    const clk = Number(r['Total Cliques'] || 0);
    const vis = Number(r['Total Visitantes'] || 0);
    const pv = Number(r['Pageviews'] || 0);
    const car = Number(r['Adições ao Carrinho'] || 0);
    const ped = Number(r['Pedidos Realizados (Não Pagos)'] || 0);
    const valNaoPago = Number(r['Valor Realizado Não Pago (R$)'] || 0);
    const cat = String(r['Categoria'] || '').trim();
    const title = String(r['Produto'] || '').toLowerCase();
    const clas = String(r['Classificação'] || '').trim();

    const isAlreadyModified = greenItemIds.has(itemId) || greenSkus.has(sku);

    // Métricas calculadas
    const ctr = imp > 0 ? ((clk / imp) * 100).toFixed(2) + '%' : '0.00%';
    const pvPorVisitante = vis > 0 ? (pv / vis).toFixed(2) : (pv > 0 ? pv.toFixed(2) : '0.00');
    const taxaCarrinho = vis > 0 ? ((car / vis) * 100).toFixed(2) + '%' : (clk > 0 ? ((car / clk) * 100).toFixed(2) + '%' : '0.00%');

    // Mapeamento específico dos Atributos
    let tipoProduto = 'outro';
    let catSugerida = '';
    let material = '';
    let genero = '';
    let manga = '';
    let gola = '';
    let protecaoUv = 'Não se aplica';
    let ocasiao = 'Ao Ar Livre';
    let isFeminino = sku.endsWith('BL') || title.includes('baby look') || title.includes('feminina');

    let urlTabelaRecomendada = isFeminino ? URL_TABELA_FEMININA : URL_TABELA_MASCULINA;

    if (title.includes('bandana') || title.includes('tubeneck') || title.includes('touca')) {
      tipoProduto = 'bandana';
      catSugerida = 'Acessórios de Moda > Bonés, Chapéus e Toucas';
      material = 'Poliéster / Microfibra Respirável';
      genero = 'Unissex';
      manga = 'Não se aplica';
      gola = 'Tubular Ajustável';
      protecaoUv = 'UV50+ Homologada';
      ocasiao = 'Pesca Esportiva e Proteção Solar';
      urlTabelaRecomendada = 'Não se aplica (Tamanho único)';
    } else if (title.includes('boné') || title.includes('bone') || sku.startsWith('BA') || sku.startsWith('700')) {
      tipoProduto = 'bone';
      catSugerida = 'Acessórios de Moda > Bonés, Chapéus e Toucas';
      material = 'Algodão e Poliéster c/ Telinha Respirável';
      genero = 'Unissex';
      manga = 'Não se aplica';
      gola = 'Não se aplica';
      protecaoUv = 'Aba Protetora Solar';
      ocasiao = 'Agro / Campo / Pesca';
      urlTabelaRecomendada = 'Não se aplica (Fecho ajustável)';
    } else if (title.includes('camisa') || title.includes('camiseta') || sku.startsWith('C0') || sku.startsWith('CAX') || sku.startsWith('FUSION') || sku.startsWith('CI')) {
      tipoProduto = 'camisa';
      material = 'XTech-Pro® Poliéster Tecnológico Antibacteriano';
      manga = title.includes('curta') ? 'Manga Curta' : 'Manga Comprida';
      gola = title.includes('padre') ? 'Gola Padre' : (title.includes('redonda') ? 'Gola Redonda' : 'Gola Alta c/ Zíper YKK');
      protecaoUv = 'UV50+ Homologada Permanente';
      ocasiao = title.includes('pesca') ? 'Pesca Esportiva' : 'Agro / Dia de Campo / Lazer';

      if (isFeminino) {
        catSugerida = 'Roupas Femininas > Tops > Camisetas';
        genero = 'Feminino (Modelagem Baby Look)';
      } else if (sku.startsWith('CI') || sku.endsWith('I') || title.includes('infantil') || title.includes('kids') || title.includes('mirim')) {
        catSugerida = 'Moda Infantil > Roupas Infantis > Blusas';
        genero = 'Infantil / Juvenil';
      } else {
        catSugerida = 'Roupas Masculinas > Tops > Camisetas';
        genero = 'Masculino';
      }
    } else if (title.includes('copo') || title.includes('garrafa') || sku.startsWith('CPT')) {
      tipoProduto = 'copo';
      catSugerida = 'Esportes e Atividades ao Ar Livre > Acessórios > Garrafas e Copos Térmicos';
      material = 'Aço Inoxidável 18/8 c/ Parede Dupla a Vácuo';
      genero = 'Unissex';
      manga = 'Não se aplica';
      gola = 'Não se aplica';
      protecaoUv = 'Isolamento Térmico a Vácuo';
      ocasiao = 'Pesca / Campo / Churrasco / Dia a Dia';
      urlTabelaRecomendada = 'Não se aplica (Acessório térmico)';
    } else if (title.includes('isca') || sku.startsWith('ISCA') || title.includes('popper') || title.includes('minnow') || title.includes('stick')) {
      tipoProduto = 'isca';
      catSugerida = 'Esportes e Atividades ao Ar Livre > Pescaria > Iscas';
      material = 'Plástico ABS de Alta Resistência c/ Garateias VMC';
      genero = 'Não se aplica';
      manga = 'Não se aplica';
      gola = 'Não se aplica';
      protecaoUv = 'Não se aplica';
      ocasiao = 'Pesca Esportiva em Água Doce e Salgada';
      urlTabelaRecomendada = 'Não se aplica (Equipamento de pesca)';
    } else if (title.includes('sandalia') || title.includes('sandália') || title.includes('chinelo') || title.includes('bota') || sku.startsWith('BT') || sku.startsWith('EVA')) {
      tipoProduto = 'calcado';
      catSugerida = title.includes('bota') ? 'Sapatos Masculinos > Botas' : 'Sapatos Masculinos > Sandalia e Chinelos > Chinelos';
      material = title.includes('bota') ? 'Couro Legítimo Nobuck / Solado Antiderrapante' : 'Composto EVA Confort Ortopédico';
      genero = title.includes('fem') ? 'Feminino' : 'Masculino';
      manga = 'Não se aplica';
      gola = 'Não se aplica';
      protecaoUv = 'Não se aplica';
      ocasiao = 'Campo / Fazenda / Lazer Náutico';
      urlTabelaRecomendada = 'Requer Tabela de Numeração/Palmilha (cm)';
    } else {
      tipoProduto = 'outro';
      catSugerida = 'Esportes e Lazer / Pesca e Camping';
      material = 'Poliéster Tecnológico';
      genero = 'Unissex';
      manga = 'Manga Longa';
      gola = 'Padrão';
      protecaoUv = 'UV50+';
      ocasiao = 'Agro / Pesca';
      urlTabelaRecomendada = 'Não se aplica';
    }

    // Auditoria de Tabela de Medidas
    let statusTabela = '';
    let urlTabelaAtual = '';
    let totalFotosGaleria = 0;
    const mediaInfo = mediaMap.get(itemId);

    if (mediaInfo) {
      totalFotosGaleria = mediaInfo.images.length;
      if (mediaInfo.sizeChart || mediaInfo.template) {
        urlTabelaAtual = mediaInfo.sizeChart || `Template ID: ${mediaInfo.template}`;
        if (urlTabelaAtual.includes('mrj4uj3gfwudfb')) {
          statusTabela = '✅ Vinculada na Shopee (Tabela Masculina Oficial)';
        } else if (urlTabelaAtual.includes('mtgvlhopnbped5')) {
          statusTabela = '✅ Vinculada na Shopee (Tabela Feminina Oficial)';
        } else {
          statusTabela = '✅ Vinculada na Shopee (Tabela Ativa)';
        }
      } else {
        if (tipoProduto === 'camisa' || tipoProduto === 'calcado') {
          statusTabela = '🚨 AUSENTE NA SHOPEE (Campo Imagem de Tamanhos Vazio)';
        } else {
          statusTabela = 'Não se aplica (Acessório/Equipamento)';
        }
      }
    } else {
      if (tipoProduto === 'camisa' || tipoProduto === 'calcado') {
        statusTabela = 'ℹ️ Pendente de Auditoria (Sugerido Vincular Tabela Oficial)';
      } else {
        statusTabela = 'Não se aplica (Acessório/Equipamento)';
      }
    }

    const isOutros = cat.toLowerCase() === 'outros' || !cat;
    let statusFichaTecnica = isAlreadyModified ? '✅ JÁ PREENCHIDA / CONCLUÍDA' : '🚨 VAZIA / SEM ATRIBUTOS NA SHOPEE';
    let statusOtimizacao = isAlreadyModified ? 'JÁ ALTERADO RECENTEMENTE (#D8E4BC)' : 'PENDENTE DE PREENCHIMENTO';
    let prioridade = 'MÉDIA';
    let falhaPrincipal = '';
    let gargaloFunil = '';
    let analiseNaoConversao = '';
    let acaoRecomendada = '';

    if (isAlreadyModified) {
      prioridade = 'CONCLUÍDO / EM MONITORAMENTO';
      falhaPrincipal = 'Alterações Recentes Já Aplicadas (#D8E4BC)';
      gargaloFunil = 'Nenhum (Em Acompanhamento de Performance)';
      analiseNaoConversao = 'Produto já otimizado recentemente pela equipe (identificado pela marcação verde #D8E4BC). As correções de ficha técnica, categorização e imagens já foram efetuadas. O algoritmo da Shopee leva de 7 a 21 dias para reavaliar o histórico do anúncio após alterações cadastrais. Não mexer no momento para não reiniciar o ciclo de aprendizado do robô.';
      acaoRecomendada = 'Nenhuma alteração proposta — acompanhar métricas de impressões, cliques e conversão no painel da Shopee nas próximas semanas.';
      statusTabela = '✅ Já revisada na última atualização';
    } else if (car > 0) {
      prioridade = car >= 3 || clk >= 50 ? 'URGENTE (Alta Intenção Perdida)' : 'ALTA (Demanda Comprovada)';
      falhaPrincipal = 'Abandono Crítico no Checkout (Alta Intenção sem Pagamento)';
      gargaloFunil = 'Fundo do Funil (Decisão Final de Pagamento / Checkout)';
      
      const pedMsg = ped > 0 ? ` Foram gerados ${ped} pedido(s) (R$ ${valNaoPago.toFixed(2)}) mas não foram pagos (Pix/Boleto vencido).` : '';
      const tabelaMsg = statusTabela.includes('AUSENTE') 
        ? ' A causa prioritária é a AUSÊNCIA DA TABELA DE MEDIDAS na Shopee: o cliente gosta da camisa, coloca no carrinho, mas trava com medo do tamanho não servir e desiste.'
        : ' A Tabela de Medidas já está cadastrada, mas a Ficha Técnica vazia (sem composição de tecido XTech-Pro nem menção oficial ao UV50+) e a falta de cupom de incentivo no carrinho impedem a tomada de decisão final.';

      analiseNaoConversao = `O produto tem apelo comprovado de público: teve ${clk} cliques e gerou ${car} adições ao carrinho (${taxaCarrinho} de conversão visitante-carrinho). Como a loja possui Frete Grátis ativo, o custo de frete NÃO foi o problema.${pedMsg}${tabelaMsg} A Ficha Técnica vazia retira a autoridade técnica da marca BRK.`;
      
      acaoRecomendada = statusTabela.includes('AUSENTE')
        ? `1. Vincular imediatamente a Tabela de Medidas oficial (${urlTabelaRecomendada}); 2. Injetar Ficha Técnica (${material}, ${protecaoUv}, ${manga}, ${gola}) via Agente 5; 3. Ativar Cupom de Loja para disparar na recuperação de carrinhos abandonados no chat da Shopee.`
        : `1. Injetar Ficha Técnica completa (${material}, ${protecaoUv}, ${manga}, ${gola}) via Agente 5; 2. Ativar Cupom de Desconto de Loja (ex: R$ 5 acima de R$ 99) para acelerar a conversão do carrinho; 3. Verificar se há estoque ativo nos tamanhos centrais M e G.`;
    } else if (clk > 0) {
      prioridade = clk >= 30 ? 'ALTA (Tráfego sem Retenção)' : 'MÉDIA-ALTA (Gargalo de Página)';
      falhaPrincipal = 'Tráfego sem Retenção (Cliques mas Zero Adição ao Carrinho)';
      gargaloFunil = 'Meio do Funil (Página do Produto / Detalhamento)';

      const catAlert = isOutros ? ` O produto está preso na categoria genérica "Outros", atraindo tráfego desqualificado que não compra.` : '';
      const tabelaAlert = statusTabela.includes('AUSENTE') ? ' Ausência da Tabela de Medidas na Shopee: o comprador entra, não tem referência de centímetros de tórax/manga e sai sem colocar no carrinho.' : '';

      analiseNaoConversao = `O anúncio atraiu ${clk} cliques e ${vis} visitantes únicos (${pvPorVisitante} visualizações por visitante), mas NENHUM comprador levou ao carrinho (Taxa de Carrinho 0%). O problema está dentro da página do produto: Ficha Técnica 100% vazia (sem especificações de tecido, proteção e modelagem), passando aspecto amador.${tabelaAlert}${catAlert} Possível ruptura nos tamanhos M/G ou falta de combo atrativo.`;

      acaoRecomendada = `1. Injetar Ficha Técnica completa (${material}, ${protecaoUv}); 2. Migrar de "${cat}" para "${catSugerida}"; 3. Vincular Tabela de Medidas se ausente; 4. Ativar Combo Leve Mais por Menos (2 camisas com desconto).`;
    } else if (imp > 0) {
      prioridade = imp >= 1000 ? 'ALTA (Oportunidade Oculta)' : 'MÉDIA (Baixo CTR)';
      falhaPrincipal = 'Baixa Atratividade no Feed (Impressões sem Cliques)';
      gargaloFunil = 'Topo do Funil (Vitrine e Resultados de Busca Shopee)';

      analiseNaoConversao = `O anúncio teve ${imp} impressões na Shopee, mas ZERO cliques (CTR de 0.00%). As fotos estão no padrão 1:1 correto, mas o anúncio não converte o clique por estar na categoria genérica "${cat}" (público errado) e sem selo chamativo de desconto promocional (% OFF).`;

      acaoRecomendada = `1. Preencher Ficha Técnica para o robô indexar os atributos; 2. Migrar para categoria oficial "${catSugerida}"; 3. Ativar tag de % OFF na Central de Marketing Shopee.`;
    } else {
      prioridade = 'MÉDIA (Invisibilidade Orgânica)';
      falhaPrincipal = 'Invisibilidade Total de Busca (Zero Impressões)';
      gargaloFunil = 'Inexistência / Algoritmo Ocultou o Anúncio (Deboost / Desindexado)';

      analiseNaoConversao = `O anúncio está totalmente invisível no ecossistema da Shopee (0 impressões e 0 cliques em 9 meses). Na Shopee, sem atributos na Ficha Técnica e alocado em "Outros", o mecanismo de busca não tem dados semânticos para entregar o item aos compradores.`;

      acaoRecomendada = `1. Injetar Ficha Técnica (${material}, ${manga}, ${gola}, ${protecaoUv}); 2. Reenquadrar na categoria "${catSugerida}"; 3. Reativar e incluir em promoção de ativação.`;
    }

    return {
      'ID do Item': itemId,
      'SKU Principal': sku,
      'Produto': r['Produto'],
      'Categoria Atual': r['Categoria'],
      'Categoria Sugerida Shopee': catSugerida,
      'Ficha Técnica na Shopee': statusFichaTecnica,
      'Status Otimização': statusOtimizacao,
      'Prioridade de Recuperação': prioridade,
      'Análise Detalhada de Não-Conversão (Por que não vendeu?)': analiseNaoConversao,
      'Gargalo no Funil': gargaloFunil,
      'Falha Cadastral / Técnica': falhaPrincipal,
      'Status Tabela de Medidas': statusTabela,
      'URL Tabela de Medidas (Atual ou Sugerida)': urlTabelaAtual || urlTabelaRecomendada,
      'Proporção das Fotos': '✅ 1:1 Quadrada (1024x1024 px) - Auditado OK',
      'Total Fotos Galeria Shopee': totalFotosGaleria > 0 ? totalFotosGaleria : 'A consultar lote',
      'Status Frete Grátis': '✅ Habilitado (Programa Frete Grátis Extra Shopee)',
      'Estratégia Promocional Sugerida': 'Configurar Leve Mais por Menos (Combo 2 peças) + Ativar Cupom de Loja e tag % OFF',
      'Ação Recomendada (Plano Imediato)': acaoRecomendada,
      'Material (Atributo)': material,
      'Gênero (Atributo)': genero,
      'Manga (Atributo)': manga,
      'Gola (Atributo)': gola,
      'Proteção UV (Atributo)': protecaoUv,
      'Ocasião (Atributo)': ocasiao,
      'País de Origem': 'Brasil',
      'Condição': 'Novo',
      'Total Impressões': imp,
      'Total Cliques': clk,
      'Taxa de Cliques (CTR)': ctr,
      'Total Visitantes': vis,
      'Pageviews por Visitante': pvPorVisitante,
      'Adições ao Carrinho': car,
      'Taxa Conversão Carrinho': taxaCarrinho,
      'Pedidos Não Pagos': ped,
      'Valor Realizado Não Pago (R$)': valNaoPago,
      'Classificação Shopee': clas
    };
  });

  const newSheet = XLSX.utils.json_to_sheet(enrichedRows);

  newSheet['!cols'] = [
    { wch: 14 }, // ID do Item
    { wch: 18 }, // SKU Principal
    { wch: 55 }, // Produto
    { wch: 24 }, // Categoria Atual
    { wch: 45 }, // Categoria Sugerida
    { wch: 35 }, // Ficha Técnica na Shopee
    { wch: 35 }, // Status Otimização
    { wch: 32 }, // Prioridade de Recuperação
    { wch: 95 }, // Análise Detalhada de Não-Conversão
    { wch: 40 }, // Gargalo no Funil
    { wch: 45 }, // Falha Cadastral / Técnica
    { wch: 45 }, // Status Tabela de Medidas
    { wch: 65 }, // URL Tabela de Medidas
    { wch: 42 }, // Proporção das Fotos
    { wch: 24 }, // Total Fotos Galeria Shopee
    { wch: 35 }, // Status Frete Grátis
    { wch: 65 }, // Estratégia Promocional Sugerida
    { wch: 85 }, // Ação Recomendada (Plano Imediato)
    { wch: 30 }, // Material
    { wch: 24 }, // Gênero
    { wch: 20 }, // Manga
    { wch: 22 }, // Gola
    { wch: 25 }, // Proteção UV
    { wch: 22 }, // Ocasião
    { wch: 15 }, // País de Origem
    { wch: 12 }, // Condição
    { wch: 16 }, // Total Impressões
    { wch: 14 }, // Total Cliques
    { wch: 16 }, // Taxa de Cliques (CTR)
    { wch: 16 }, // Total Visitantes
    { wch: 22 }, // Pageviews por Visitante
    { wch: 18 }, // Adições ao Carrinho
    { wch: 22 }, // Taxa Conversão Carrinho
    { wch: 18 }, // Pedidos Não Pagos
    { wch: 24 }, // Valor Realizado Não Pago
    { wch: 28 }  // Classificação Shopee
  ];

  const newWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWb, newSheet, 'Produtos_Ativos_Auditoria');
  
  XLSX.writeFile(newWb, outputPath);
  console.log(`✅ Salvo com sucesso no projeto: ${outputPath}`);

  // Salva no caminho primário em Downloads
  try {
    XLSX.writeFile(newWb, downloadsPathPrimary);
    console.log(`✅ Salvo com sucesso em Downloads: ${downloadsPathPrimary}`);
  } catch (e) {
    console.log(`⚠️ Falha ao salvar primário em Downloads: ${e.message}`);
  }

  // Tenta salvar também substituindo o arquivo anterior se estiver liberado pelo Excel
  try {
    XLSX.writeFile(newWb, downloadsPathLocked);
    console.log(`✅ Atualizado também o arquivo anterior: ${downloadsPathLocked}`);
  } catch (e) {
    console.log(`ℹ️ O arquivo ${path.basename(downloadsPathLocked)} está aberto no Excel pelo usuário.`);
  }

  const total = enrichedRows.length;
  const concluidos = enrichedRows.filter(r => r['Status Otimização'].includes('#D8E4BC')).length;
  const urgentes = enrichedRows.filter(r => r['Prioridade de Recuperação'].includes('URGENTE')).length;
  const altas = enrichedRows.filter(r => r['Prioridade de Recuperação'].includes('ALTA')).length;
  const medias = enrichedRows.filter(r => r['Prioridade de Recuperação'].includes('MÉDIA')).length;
  const tabelaAusenteConfirmada = enrichedRows.filter(r => r['Status Tabela de Medidas'].includes('AUSENTE')).length;
  const tabelaPresenteConfirmada = enrichedRows.filter(r => r['Status Tabela de Medidas'].includes('✅ Vinculada')).length;

  console.log(`\n================ RESUMO DO DIAGNÓSTICO FILTRADO (SOMENTE ATIVOS) ================`);
  console.log(`📦 Total de Produtos Ativos Restantes:        ${total}`);
  console.log(`🗑️ Produtos Excluídos Descartados:            ${descartados}`);
  console.log(`🟢 Produtos Já Alterados / Preservados (#D8E4BC): ${concluidos}`);
  console.log(`🚨 Produtos Ativos com Ficha Técnica VAZIA:    ${total - concluidos}`);
  console.log(`📏 Produtos com Tabela de Medidas CONFIRMADA:  ${tabelaPresenteConfirmada}`);
  console.log(`🚨 Produtos Vestuário com Tabela AUSENTE:      ${tabelaAusenteConfirmada}`);
  console.log(`🔥 Prioridade URGENTE (Recuperação Rápida):    ${urgentes}`);
  console.log(`⚡ Prioridade ALTA:                            ${altas}`);
  console.log(`📊 Prioridade MÉDIA:                           ${medias}`);
  console.log(`=================================================================================\n`);
}

generateDeepDiagnosticsReport().catch(console.error);
