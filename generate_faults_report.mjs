import fs from 'node:fs';
import path from 'node:path';
import XLSX from './agent3-rpa-magis5/node_modules/xlsx/xlsx.js';

async function generateFaultsReport() {
  const inputPath = 'uploads/relatorio_produtos_sem_venda.xlsx';
  const outputPath = 'uploads/Relatorio_Diagnostico_Falhas_Shopee_BRK_Atualizado.xlsx';
  const downloadsPath = 'C:/Users/marke/Downloads/Relatorio_Diagnostico_Falhas_Shopee_BRK_Atualizado.xlsx';

  console.log(`📖 Lendo planilha de origem: ${inputPath}...`);
  const wb = XLSX.readFile(inputPath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  // 1. Identifica produtos marcados com a cor D8E4BC (verde claro)
  const greenItemIds = new Set();
  const greenSkus = new Set();

  if (fs.existsSync('scratch/xlsx_1/xl/worksheets/sheet1.xml')) {
    const xml = fs.readFileSync('scratch/xlsx_1/xl/worksheets/sheet1.xml', 'utf-8');
    const regex = /<c\s+r="([A-Z]+)(\d+)"[^>]*s="1"/g;
    const coloredRowNumbers = new Set();
    let match;
    while ((match = regex.exec(xml)) !== null) {
      coloredRowNumbers.add(parseInt(match[2], 10));
    }

    if (fs.existsSync('scratch/locked_copy.xlsx')) {
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
  }

  console.log(`🟢 Produtos na cor #D8E4BC (alterados recentemente): ${greenItemIds.size}`);

  const enrichedRows = rows.map((r) => {
    const itemId = String(r['ID do Item'] || '').trim();
    const sku = String(r['SKU Principal'] || '').toUpperCase();
    const imp = Number(r['Total Impressões'] || 0);
    const clk = Number(r['Total Cliques'] || 0);
    const car = Number(r['Adições ao Carrinho'] || 0);
    const ped = Number(r['Pedidos Realizados (Não Pagos)'] || 0);
    const cat = String(r['Categoria'] || '').trim();
    const title = String(r['Produto'] || '').toLowerCase();
    const clas = String(r['Classificação'] || '').trim();

    const isAlreadyModified = greenItemIds.has(itemId) || greenSkus.has(sku);

    // Mapeamento específico dos Atributos
    let catSugerida = '';
    let material = '';
    let genero = '';
    let manga = '';
    let gola = '';
    let protecaoUv = 'Não se aplica';
    let ocasiao = 'Ao Ar Livre';

    if (title.includes('bandana') || title.includes('tubeneck') || title.includes('touca')) {
      catSugerida = 'Acessórios de Moda > Bonés, Chapéus e Toucas';
      material = 'Poliéster / Microfibra';
      genero = 'Unissex';
      manga = 'Sem Manga';
      gola = 'Tubular';
      protecaoUv = 'UV50+';
      ocasiao = 'Pesca e Sol';
    } else if (title.includes('boné') || title.includes('bone') || sku.startsWith('BA') || sku.startsWith('700')) {
      catSugerida = 'Acessórios de Moda > Bonés, Chapéus e Toucas';
      material = 'Poliéster / Algodão';
      genero = 'Unissex';
      manga = 'Sem Manga';
      gola = 'Não se aplica';
      protecaoUv = 'Proteção Solar';
      ocasiao = 'Agro / Campo';
    } else if (title.includes('camisa') || title.includes('camiseta') || sku.startsWith('C0') || sku.startsWith('CAX') || sku.startsWith('FUSION')) {
      material = 'XTech-Pro®';
      manga = title.includes('curta') ? 'Manga Curta' : 'Manga Comprida';
      gola = title.includes('padre') ? 'Gola Padre' : (title.includes('redonda') ? 'Gola Redonda' : 'Gola Alta c/ Zíper');
      protecaoUv = 'UV50+ Homologada';
      ocasiao = title.includes('pesca') ? 'Pesca Esportiva' : 'Agro / Fazenda';

      if (sku.endsWith('BL') || title.includes('baby look') || title.includes('feminina')) {
        catSugerida = 'Roupas Femininas > Tops > Camisetas';
        genero = 'Feminino (Baby Look)';
      } else if (sku.endsWith('I') || title.includes('infantil') || title.includes('kids')) {
        catSugerida = 'Moda Infantil > Roupas Infantis > Blusas';
        genero = 'Infantil / Juvenil';
      } else {
        catSugerida = 'Roupas Masculinas > Tops > Camisetas';
        genero = 'Masculino';
      }
    } else if (title.includes('copo') || title.includes('garrafa') || sku.startsWith('CPT')) {
      catSugerida = 'Esportes e Atividades ao Ar Livre > Acessórios > Garrafas e Copos Térmicos';
      material = 'Aço Inoxidável (Inox)';
      genero = 'Unissex';
      manga = 'Não se aplica';
      gola = 'Não se aplica';
      protecaoUv = 'Isolamento Térmico a Vácuo';
      ocasiao = 'Pesca / Lazer / Dia a Dia';
    } else if (title.includes('isca') || sku.startsWith('ISCA') || title.includes('popper') || title.includes('minnow')) {
      catSugerida = 'Esportes e Atividades ao Ar Livre > Pescaria > Iscas';
      material = 'Plástico ABS de Alta Resistência';
      genero = 'Não se aplica';
      manga = 'Não se aplica';
      gola = 'Não se aplica';
      protecaoUv = 'Não se aplica';
      ocasiao = 'Pesca Esportiva';
    } else if (title.includes('sandalia') || title.includes('sandália') || title.includes('chinelo') || title.includes('bota') || sku.startsWith('BT') || sku.startsWith('EVA')) {
      catSugerida = 'Sapatos Masculinos > Sandalia e Chinelos > Chinelos';
      material = 'EVA Confort';
      genero = title.includes('fem') ? 'Feminino' : 'Masculino';
      manga = 'Não se aplica';
      gola = 'Não se aplica';
      protecaoUv = 'Não se aplica';
      ocasiao = 'Casual / Lazer';
    } else {
      catSugerida = 'Esportes e Lazer / Pesca e Camping';
      material = 'Poliéster';
      genero = 'Unissex';
      manga = 'Manga Longa';
      gola = 'Padrão';
      protecaoUv = 'UV50+';
      ocasiao = 'Agro / Pesca';
    }

    let statusFichaTecnica = isAlreadyModified ? '✅ JÁ PREENCHIDA / CONCLUÍDA' : '🚨 VAZIA / SEM ATRIBUTOS NA SHOPEE';
    let statusOtimizacao = isAlreadyModified ? 'JÁ ALTERADO RECENTEMENTE (#D8E4BC)' : 'PENDENTE DE PREENCHIMENTO';
    let falhaPrincipal = '';
    let gargaloFunil = '';
    let problemasEspecificos = [];
    let acaoRecomendada = '';
    let prioridade = 'MÉDIA';

    const isOutros = cat.toLowerCase() === 'outros' || !cat;

    if (isAlreadyModified) {
      falhaPrincipal = 'Alterações Recentes Já Aplicadas (#D8E4BC)';
      gargaloFunil = 'Nenhum (Em Acompanhamento de Performance)';
      problemasEspecificos.push('Produto já otimizado recentemente pela equipe (marcado em verde #D8E4BC)');
      problemasEspecificos.push('Mudanças já implementadas no anúncio');
      acaoRecomendada = 'Nenhuma alteração proposta — acompanhar métricas de conversão nos próximos 15 a 30 dias';
      prioridade = 'CONCLUÍDO / EM MONITORAMENTO';
    } else if (car > 0) {
      falhaPrincipal = 'Abandono Crítico no Carrinho (Alta Intenção Sem Conversão)';
      gargaloFunil = 'Fundo do Funil (Checkout / Decisão Final)';
      problemasEspecificos.push(`Ficha Técnica Vazia na Shopee`);
      problemasEspecificos.push(`Cliente adicionou ao carrinho ${car}x e não pagou`);
      if (ped > 0) problemasEspecificos.push(`${ped} pedido(s) gerado(s) não pago(s) (Boleto/Pix abandonado)`);
      if (isOutros) problemasEspecificos.push('Categoria incorreta ("Outros")');
      problemasEspecificos.push('Possível dúvida de tamanho (falta tabela de medidas)');

      acaoRecomendada = 'Preencher Ficha Técnica + Adicionar Tabela de Medidas + Ativar Cupom de Loja';
      prioridade = car >= 3 || clk >= 50 ? 'URGENTE (Recuperação Rápida)' : 'ALTA';
    } else if (clk > 0) {
      falhaPrincipal = 'Tráfego sem Retenção (Cliques mas Zero Carrinho)';
      gargaloFunil = 'Meio do Funil (Página do Produto)';
      problemasEspecificos.push(`Ficha Técnica Vazia na Shopee`);
      problemasEspecificos.push(`Recebeu ${clk} cliques e ${imp} impressões mas NENHUM carrinho`);
      if (isOutros) problemasEspecificos.push('Preso na categoria "Outros"');
      problemasEspecificos.push('Marca sem destaque ou descrição pouco persuasiva');

      acaoRecomendada = `Preencher Ficha Técnica (Material: ${material}, Manga: ${manga}) + Migrar categoria para "${catSugerida}"`;
      prioridade = clk >= 30 ? 'ALTA' : 'MÉDIA';
    } else if (imp > 0) {
      falhaPrincipal = 'Baixa Atratividade Visual / Título (Impressões sem Cliques)';
      gargaloFunil = 'Topo do Funil (Busca e Vitrine)';
      problemasEspecificos.push(`Ficha Técnica Vazia na Shopee`);
      problemasEspecificos.push(`Exibido ${imp} vezes na Shopee com ZERO cliques (CTR 0%)`);
      if (isOutros) problemasEspecificos.push('Categoria genérica "Outros" prejudica entrega qualificada');

      acaoRecomendada = 'Preencher Ficha Técnica + Trocar foto de capa por imagem HD + Reformular título';
      prioridade = imp >= 1000 ? 'ALTA' : 'MÉDIA';
    } else {
      falhaPrincipal = 'Invisibilidade Total de Busca (Zero Impressões)';
      gargaloFunil = 'Inexistência / Algoritmo Ocultou o Anúncio';
      problemasEspecificos.push('Ficha Técnica Vazia (Algoritmo oculta o produto por falta de atributos)');
      if (isOutros) problemasEspecificos.push('Cadastrado em "Outros" sem palavras-chave indexadas');

      acaoRecomendada = 'Preencher Ficha Técnica completa + Otimizar Título SEO e reativar anúncio';
      prioridade = 'MÉDIA';
    }

    return {
      'ID do Item': r['ID do Item'],
      'SKU Principal': r['SKU Principal'],
      'Produto': r['Produto'],
      'Ficha Técnica na Shopee': statusFichaTecnica,
      'Status Otimização': statusOtimizacao,
      'Prioridade de Recuperação': prioridade,
      'Material (Atributo)': material,
      'Gênero (Atributo)': genero,
      'Manga (Atributo)': manga,
      'Gola (Atributo)': gola,
      'Proteção UV (Atributo)': protecaoUv,
      'Ocasião (Atributo)': ocasiao,
      'País de Origem': 'Brasil',
      'Condição': 'Novo',
      'Categoria Atual': r['Categoria'],
      'Categoria Sugerida Shopee': catSugerida,
      'Falha Principal': falhaPrincipal,
      'Gargalo no Funil': gargaloFunil,
      'Problemas Detectados': problemasEspecificos.join(' | '),
      'Ação Recomendada (Plano de Recuperação)': acaoRecomendada,
      'Total Impressões': imp,
      'Total Cliques': clk,
      'Adições ao Carrinho': car,
      'Pedidos Não Pagos': ped,
      'Classificação Shopee': clas
    };
  });

  const newSheet = XLSX.utils.json_to_sheet(enrichedRows);

  newSheet['!cols'] = [
    { wch: 14 }, // ID do Item
    { wch: 18 }, // SKU Principal
    { wch: 55 }, // Produto
    { wch: 35 }, // Ficha Técnica na Shopee
    { wch: 35 }, // Status Otimização
    { wch: 28 }, // Prioridade de Recuperação
    { wch: 28 }, // Material
    { wch: 24 }, // Gênero
    { wch: 20 }, // Manga
    { wch: 22 }, // Gola
    { wch: 25 }, // Proteção UV
    { wch: 22 }, // Ocasião
    { wch: 15 }, // País de Origem
    { wch: 12 }, // Condição
    { wch: 22 }, // Categoria Atual
    { wch: 45 }, // Categoria Sugerida
    { wch: 45 }, // Falha Principal
    { wch: 35 }, // Gargalo no Funil
    { wch: 75 }, // Problemas Detectados
    { wch: 75 }, // Ação Recomendada
    { wch: 16 }, // Total Impressões
    { wch: 14 }, // Total Cliques
    { wch: 18 }, // Adições ao Carrinho
    { wch: 16 }, // Pedidos Não Pagos
    { wch: 28 }  // Classificação Shopee
  ];

  const newWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWb, newSheet, 'Diagnostico_Atributos');
  XLSX.writeFile(newWb, outputPath);

  try {
    XLSX.writeFile(newWb, downloadsPath);
    console.log(`✅ Salvo em: ${downloadsPath}`);
  } catch (e) {
    const altPath = 'C:/Users/marke/Downloads/Relatorio_Diagnostico_Com_Ficha_Tecnica.xlsx';
    XLSX.writeFile(newWb, altPath);
    console.log(`✅ Salvo em alternativa: ${altPath}`);
  }

  const vazios = enrichedRows.filter(r => r['Ficha Técnica na Shopee'].includes('VAZIA')).length;
  const concluidos = enrichedRows.filter(r => r['Ficha Técnica na Shopee'].includes('JÁ PREENCHIDA')).length;

  console.log(`\n📊 Mapeamento Concluído:`);
  console.log(`   🚨 Produtos com Ficha Técnica VAZIA:        ${vazios}`);
  console.log(`   ✅ Produtos já preenchidos (#D8E4BC):       ${concluidos}`);
}

generateFaultsReport().catch(console.error);
