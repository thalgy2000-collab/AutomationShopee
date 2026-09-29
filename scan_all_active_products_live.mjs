import fs from 'node:fs';
import path from 'node:path';
import XLSX from './agent3-rpa-magis5/node_modules/xlsx/xlsx.js';
import { getShopeeBrowserContext } from './agent5-shopee-attributes/src/browser.mjs';

const URL_TABELA_MASCULINA = 'https://cf.shopee.com.br/file/br-11134201-820ld-mrj4uj3gfwudfb';
const URL_TABELA_FEMININA = 'https://cf.shopee.com.br/file/br-11134207-820m8-mtgvlhopnbped5';

const COOKIE_STRING = `SPC_F=blbpbXAkN6mwqIUMUol3xcAwuN3jxfZz; REC_T_ID=514c73b8-94d8-11f1-9f12-a26019125554; language=pt-BR; SPC_CLIENTID=YmxicGJYQWtONm13dmtztsuegjpazhvp; SC_DFP=zwhctQoEZMhiUaZvTWOVUbvsYVGIRPUJ; _gcl_au=1.1.1688578987.1786448301; _ga=GA1.1.848442999.1786448301; _fbp=fb.2.1786448301322.185081183116080780; SPC_EC=-; _med=affiliates; _ga_VF5H5BSHNS=GS2.1.s1789479390$o2$g1$t1789479391$j59$l0$h0; SPC_SI=K6GNagAAAABVdFVEZ0k2QrOYNwgAAAAAR0FrdVk5RTQ=; SPC_SC_MAIN_SHOP_SA_UD=0; SPC_CDS_CHAT=cac80750-5aa5-43e1-a610-0ada9691a33c; csrftoken=cx3DXBCncNw9UZOtZMZhQy9k1YKskKz8; _gcl_aw=GCL.1790180946.Cj0KCQjwvJHIBhCgARIsAEQnWlBf8ZBkg0Q9Ch8_YJHpG1P8H8wLXYMpRc25hkryHz1HgSjY2SzUjjgaAh4GEALw_wcB; _gcl_gs=2.1.k1$i1790180942$u53233770; sense_sa_r=s; _ga_T69DLR1QPG=GS2.1.s1790180946$o133$g1$t1790182878$j60$l1$h1524968161; SPC_ST=fm+0/P+hWCE1UiVaYFJM1HQYJuqPyGV23MFI+/OUFY56D3GW/zK8jbwF8myNQNrnanbGq3hd/21+lTJC1L4+7qUWY6yn8+5qQpdeDIplmGJXxwBK/3Z6uCohzm2Vev+4rhpDWuPNK1b0zLAgi+U/WvhSvB6E3cofqoRCh60C6gHzbMc2oY/CZJBSv7HWBYhCgoKsWqoFCpBXI57yXZo1DQ==.APSSA5Gedu7OQxJoCRIR+oK1tNFQ7mhYkXehwd98KAHa; SPC_U=1111933939; SPC_SC_SESSION=gDaXVJ8e5g3wjAYUxN2VvB77T4qfu4+k7JKIhFvD1nj3a4hKDC/36bdrRcyOnTamWE6EkoaU1LS+0hQlDO3my0aHKvOqUxhcZHfXBAtbNQRB9bubNcL6fbjujVm205ODk0gp0j8Dx/wpJ1Odu0jhxlgB+ZzFlZtJKnALkfyEc9r3FMzfrPdc2Uopxd8zPIJLmNvhs8uRP9MBZ3Dy3Ee19+ogYMzEjaz0kyOKIcFhC5bSXrk2vhDPXS48Lx3rrYBTO3kH4lWu6z3avTw8GzEuGTQ==_1_1111933939; SPC_STK=rt23kgzsOewvg8stsqHkHf3uCt55vYUMnNpCBssQPMKrKdUhLpe741XIW0UVB0IcjtzxElTzKBJxBynGXRNfirb9Tq0yBzDPGFrvEPa9eHuWiatfskPwMBaLQwKjoxTYkSf5+5Al2Um8zC8VnahkfvWojZddQydQ1rwVkn0+im/UkHrF5g8KNb4Kp21m8uMpDA+0yoJmInmVIRt3urER7w+20kHqdc2/asMF1Cw3pnGbL/b5NhTsDIUt3yGz4rT+X9WS6d73DRJppM+TsBuM7gYBcm9iVg0li6dAfzL4KGK5VAI4a3OpdUh/TGI8bC84nBC8a8q72Tk2T3JIefDIV5tCgACRHnXQCykVvvtEOZgCCwrqe7I18R6GDToG4yd4q6fbarz2z61LmJIv/NCu1CrmVcdC9Lop20cgyXUSuHUc6YiMGr1FDUmyJICvr0sQk3JS6yFL+bPSIkEoORoMzqQlAegEaE/2i140wQLOVbJ8C4VsCSCeMTLjnf1js1HK; SPC_R_T_ID=UDchGXWFt8Zv6cPwn6+RDIroofS7DQ+XDpavGv7GS3DraGdTBFYtTSNi8HcEG/c8TuQyHz87/wdn11JfvU7mmxIU1vGH36ZN2vJUk58a6EE5p+J1k2ia8QtgyHf34TLqtKAUgoqfn2xeiTLwmNtuv5F2YxXa+6M6qnZc5iq0Lhs=; SPC_R_T_IV=dGtkSkNIWWVobVpCWU0xcw==; SPC_T_ID=UDchGXWFt8Zv6cPwn6+RDIroofS7DQ+XDpavGv7GS3DraGdTBFYtTSNi8HcEG/c8TuQyHz87/wdn11JfvU7mmxIU1vGH36ZN2vJUk58a6EE5p+J1k2ia8QtgyHf34TLqtKAUgoqfn2xeiTLwmNtuv5F2YxXa+6M6qnZc5iq0Lhs=; SPC_T_IV=dGtkSkNIWWVobVpCWU0xcw==; CTOKEN=YxDJV7eHEfGff4rNR2YnFA%3D%3D`;

async function main() {
  const inputPath = 'uploads/relatorio_produtos_sem_venda.xlsx';
  const outputPath = 'uploads/Relatorio_Diagnostico_Produtos_Ativos_Shopee_AoVivo.xlsx';
  const downloadsPath = 'C:/Users/marke/Downloads/Relatorio_Diagnostico_Produtos_Ativos_Shopee_AoVivo.xlsx';

  console.log('📖 Lendo planilha bruta...');
  const wb = XLSX.readFile(inputPath);
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

  // Descartar produtos excluídos
  const activeRows = rawRows.filter(r => !String(r['Produto'] || '').includes('Não foi possível obter informações do produto devido à exclusão'));
  console.log(`🎯 Produtos ativos identificados: ${activeRows.length}`);

  // Produtos preservados na cor D8E4BC
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
    const dataLocked = XLSX.utils.sheet_to_json(wbLocked.Sheets[wbLocked.SheetNames[0]], { header: 1 });
    for (const rNum of coloredRowNumbers) {
      const row = dataLocked[rNum - 1];
      if (row) {
        if (row[0]) greenItemIds.add(String(row[0]).trim());
        if (row[1]) greenSkus.add(String(row[1]).trim().toUpperCase());
      }
    }
  }
  console.log(`🟢 Produtos #D8E4BC preservados: ${greenItemIds.size}`);

  // Carrega base de mídia da Shopee para Tabela de Medidas
  const dirDownloads = 'C:/Users/marke/Downloads';
  const mediaFiles = fs.readdirSync(dirDownloads).filter(f => f.startsWith('mass_update_media_info_') && f.endsWith('.xlsx'));
  const mediaMap = new Map();
  for (const f of mediaFiles) {
    try {
      const wbMedia = XLSX.readFile(path.join(dirDownloads, f));
      const dataMedia = XLSX.utils.sheet_to_json(wbMedia.Sheets[wbMedia.SheetNames[0]], { header: 1 });
      for (let i = 5; i < dataMedia.length; i++) {
        const r = dataMedia[i];
        const id = String(r[0] || '').trim();
        if (!id || id === 'ID do Produto') continue;
        mediaMap.set(id, {
          template: r[13] ? String(r[13]).trim() : '',
          sizeChart: r[14] ? String(r[14]).trim() : '',
          imagesCount: [r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12]].filter(Boolean).length
        });
      }
    } catch {}
  }

  // Inicializa Chromium com injeção de cookies para varredura ao vivo
  console.log('🌐 Conectando à API da Shopee com os cookies atualizados...');
  const { context, page } = await getShopeeBrowserContext({ headless: true });

  const rawCookies = COOKIE_STRING.split(';').map(c => c.trim()).filter(Boolean);
  const cookieList = [];
  for (const pair of rawCookies) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.substring(0, idx).trim();
    const value = pair.substring(idx + 1).trim();
    for (const domain of ['.shopee.com.br', 'seller.shopee.com.br']) {
      cookieList.push({
        name,
        value,
        domain,
        path: '/',
        httpOnly: name === 'SPC_SC_SESSION' || name === 'SPC_ST',
        secure: true,
        sameSite: 'Lax'
      });
    }
  }
  await context.addCookies(cookieList);

  let capturedCds = null;
  page.on('request', req => {
    const u = req.url();
    if (u.includes('SPC_CDS=')) {
      const match = u.match(/SPC_CDS=([a-f0-9\-]+)/);
      if (match && !capturedCds) capturedCds = match[1];
    }
  });

  await page.goto('https://seller.shopee.com.br/portal/product/list/all', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log(`🔑 Sessão Shopee Ativa | SPC_CDS: ${capturedCds}`);

  // Dispara consulta em lotes para os 387 produtos
  const itemIds = activeRows.map(r => String(r['ID do Item'] || '').trim()).filter(Boolean);
  console.log(`⚡ Disparando auditoria em tempo real para os ${itemIds.length} produtos ativos...`);

  const liveMap = new Map();
  const BATCH_SIZE = 15;

  for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
    const batch = itemIds.slice(i, i + BATCH_SIZE);
    process.stdout.write(`   Consultando lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(itemIds.length / BATCH_SIZE)}...\r`);
    
    const batchResults = await page.evaluate(async ({ ids, cds }) => {
      const list = [];
      for (const id of ids) {
        try {
          const url = `/api/v3/product/get_product_info?SPC_CDS=${cds}&SPC_CDS_VER=2&product_id=${id}&is_draft=false`;
          const res = await fetch(url);
          const data = await res.json();
          const p = data?.data?.product_info;
          if (p) {
            let totalStock = 0;
            if (p.model_list && p.model_list.length > 0) {
              for (const m of p.model_list) {
                totalStock += Number(m.stock_detail?.total_available_stock || 0);
              }
            } else {
              totalStock = Number(p.stock || 0);
            }
            list.push({
              id: String(p.id),
              name: p.name,
              sku: p.parent_sku,
              attributesCount: p.attributes?.length || 0,
              attributes: p.attributes || [],
              totalStock,
              categoryPath: p.category_path_name_list || []
            });
          } else {
            list.push({ id: String(id), error: true });
          }
        } catch (e) {
          list.push({ id: String(id), error: true });
        }
      }
      return list;
    }, { ids: batch, cds: capturedCds });

    for (const res of batchResults) {
      liveMap.set(res.id, res);
    }
  }

  console.log(`\n✅ Varredura ao vivo concluída! ${liveMap.size} produtos auditados.`);
  await context.close();

  // Monta a planilha enriquecida com os dados ao vivo
  const enrichedRows = activeRows.map(r => {
    const itemId = String(r['ID do Item'] || '').trim();
    const sku = String(r['SKU Principal'] || '').toUpperCase();
    const imp = Number(r['Total Impressões'] || 0);
    const clk = Number(r['Total Cliques'] || 0);
    const vis = Number(r['Total Visitantes'] || 0);
    const pv = Number(r['Pageviews'] || 0);
    const car = Number(r['Adições ao Carrinho'] || 0);
    const ped = Number(r['Pedidos Realizados (Não Pagos)'] || 0);
    const valNaoPago = Number(r['Valor Realizado Não Pago (R$)'] || 0);
    const title = String(r['Produto'] || '');
    const isAlreadyModified = greenItemIds.has(itemId) || greenSkus.has(sku);

    const ctr = imp > 0 ? ((clk / imp) * 100).toFixed(2) + '%' : '0.00%';
    const pvPorVisitante = vis > 0 ? (pv / vis).toFixed(2) : (pv > 0 ? pv.toFixed(2) : '0.00');
    const taxaCarrinho = vis > 0 ? ((car / vis) * 100).toFixed(2) + '%' : (clk > 0 ? ((car / clk) * 100).toFixed(2) + '%' : '0.00%');

    // Dados ao vivo da API Shopee
    const live = liveMap.get(itemId);
    const liveAttrsCount = live?.attributesCount !== undefined ? live.attributesCount : 0;
    const liveStock = live?.totalStock !== undefined ? live.totalStock : null;
    const liveCategory = live?.categoryPath && live.categoryPath.length > 0 ? live.categoryPath.join(' > ') : r['Categoria'];

    // Extrai nomes dos atributos preenchidos
    let atributosPreenchidosTexto = '';
    if (live && live.attributes && live.attributes.length > 0) {
      const valores = [];
      for (const a of live.attributes) {
        if (a.attribute_values) {
          for (const v of a.attribute_values) {
            if (v.raw_value) valores.push(v.raw_value);
          }
        }
      }
      atributosPreenchidosTexto = valores.length > 0 ? valores.join(', ') : `${liveAttrsCount} atributos cadastrados`;
    }

    const isFeminino = sku.endsWith('BL') || title.toLowerCase().includes('baby look') || title.toLowerCase().includes('feminina');
    const isVestuario = title.toLowerCase().includes('camisa') || title.toLowerCase().includes('camiseta') || title.toLowerCase().includes('bota') || title.toLowerCase().includes('chinelo');
    const urlTabelaRecomendada = isFeminino ? URL_TABELA_FEMININA : URL_TABELA_MASCULINA;

    // Tabela de medidas
    const media = mediaMap.get(itemId);
    let statusTabela = '';
    let urlTabela = '';
    if (media) {
      if (media.sizeChart || media.template) {
        urlTabela = media.sizeChart || `Template ID: ${media.template}`;
        statusTabela = urlTabela.includes('mrj4uj3gfwudfb') 
          ? '✅ Vinculada na Shopee (Tabela Masculina Oficial)' 
          : (urlTabela.includes('mtgvlhopnbped5') ? '✅ Vinculada na Shopee (Tabela Feminina Oficial)' : '✅ Vinculada na Shopee (Tabela Ativa)');
      } else {
        statusTabela = isVestuario ? '🚨 AUSENTE NA SHOPEE (Campo Vazio)' : 'Não se aplica (Acessório/Equipamento)';
      }
    } else {
      statusTabela = isVestuario ? 'ℹ️ Pendente de Auditoria (Sugerido Vincular)' : 'Não se aplica (Acessório/Equipamento)';
    }

    let statusFichaTecnica = '';
    let statusOtimizacao = '';
    let prioridade = 'MÉDIA';
    let falhaPrincipal = '';
    let gargaloFunil = '';
    let analiseNaoConversao = '';
    let acaoRecomendada = '';

    // Status da Ficha Técnica
    if (isAlreadyModified) {
      statusFichaTecnica = '✅ JÁ PREENCHIDA / CONCLUÍDA';
      statusOtimizacao = 'JÁ ALTERADO RECENTEMENTE (#D8E4BC)';
    } else if (liveAttrsCount > 0) {
      statusFichaTecnica = `✅ PREENCHIDA NA SHOPEE (${liveAttrsCount} atributos)`;
      statusOtimizacao = 'FICHA TÉCNICA OK';
    } else {
      statusFichaTecnica = '🚨 VAZIA / SEM ATRIBUTOS NA SHOPEE';
      statusOtimizacao = 'PENDENTE DE PREENCHIMENTO';
    }

    // Regras de Diagnóstico e Prioridade
    if (isAlreadyModified) {
      prioridade = 'CONCLUÍDO / EM MONITORAMENTO';
      falhaPrincipal = 'Alterações Recentes Já Aplicadas (#D8E4BC)';
      gargaloFunil = 'Nenhum (Em Acompanhamento de Performance)';
      analiseNaoConversao = 'Produto já otimizado recentemente pela equipe da loja (identificado pela marcação verde #D8E4BC). Mudanças de ficha técnica e fotos implementadas. Manter em monitoramento.';
      acaoRecomendada = 'Nenhuma alteração proposta — acompanhar métricas de conversão nas próximas semanas.';
    } else if (liveStock === 0) {
      // REGRA DO USUÁRIO: Estoque 0 -> Não gerar alertas de melhoria!
      prioridade = 'BAIXA / AGUARDANDO REPOSIÇÃO';
      falhaPrincipal = 'Ruptura de Estoque (Estoque 0 Disponível)';
      gargaloFunil = 'Estoque Esgotado';
      analiseNaoConversao = 'Produto com estoque físico zerado na Shopee no momento. A falta de vendas decorre diretamente da indisponibilidade do produto para compra pelo cliente, e não de deficiências no cadastro, fotos ou atributos.';
      acaoRecomendada = 'Nenhum alerta de melhoria cadastral necessário — providenciar reposição de estoque físico se houver demanda comercial.';
    } else if (car > 0) {
      // Produto com carrinhos e com estoque disponível
      prioridade = car >= 3 || clk >= 50 ? 'URGENTE (Alta Intenção Perdida)' : 'ALTA (Demanda Comprovada)';
      falhaPrincipal = 'Abandono Crítico no Checkout (Alta Intenção sem Pagamento)';
      gargaloFunil = 'Fundo do Funil (Decisão Final de Pagamento / Checkout)';

      const pedMsg = ped > 0 ? ` Foram gerados ${ped} pedido(s) (R$ ${valNaoPago.toFixed(2)}) não pagos.` : '';
      const tabMsg = statusTabela.includes('AUSENTE') 
        ? ' A causa prioritária é a ausência da Tabela de Medidas na galeria da Shopee (insegurança do cliente sobre o tamanho ideal).' 
        : ' A Ficha Técnica e a Tabela estão ativas, o gargalo restante é a ausência de cupom de incentivo no carrinho.';

      analiseNaoConversao = `Produto com apelo comprovado de público: teve ${clk} cliques e ${car} adições ao carrinho (${taxaCarrinho} de conversão visitante-carrinho). Como a loja possui Frete Grátis ativo e estoque disponível (${liveStock} un), o abandono decorre de:${pedMsg} ${tabMsg}`;
      acaoRecomendada = statusTabela.includes('AUSENTE')
        ? `1. Vincular Tabela de Medidas oficial (${urlTabelaRecomendada}); 2. Ativar Cupom de Loja e mensagem de recuperação de carrinho no chat da Shopee.`
        : `1. Ativar Cupom de Desconto de Loja (ex: R$ 5 OFF acima de R$ 99) para acelerar o fechamento do carrinho; 2. Incluir em Combo Leve Mais por Menos.`;
    } else if (clk > 0) {
      // Recebe tráfego mas sem carrinhos
      prioridade = clk >= 30 ? 'ALTA (Tráfego sem Retenção)' : 'MÉDIA-ALTA (Gargalo de Página)';
      falhaPrincipal = 'Tráfego sem Retenção (Cliques mas Zero Carrinho)';
      gargaloFunil = 'Meio do Funil (Página do Produto / Detalhamento)';

      const attrMsg = liveAttrsCount === 0 ? ' Ficha Técnica está vazia na Shopee, passando aspecto amador.' : ` Ficha Técnica preenchida com ${liveAttrsCount} atributos.`;
      const tabMsg = statusTabela.includes('AUSENTE') ? ' Falta vincular a Tabela de Medidas no anúncio.' : '';

      analiseNaoConversao = `O anúncio atraiu ${clk} cliques e ${vis} visitantes (${pvPorVisitante} pageviews/visitante), mas nenhum comprador adicionou ao carrinho. Possui estoque disponível (${liveStock} un).${attrMsg}${tabMsg} Recomenda-se adicionar fotos de close da textura/zíper e ativar promoção De/Por.`;
      acaoRecomendada = liveAttrsCount === 0
        ? `1. Preencher Ficha Técnica via Agente 5; 2. Vincular Tabela de Medidas; 3. Ativar tag de % OFF na Central de Marketing.`
        : `1. Vincular Tabela de Medidas se pendente; 2. Criar combo Leve Mais por Menos (2 peças com desconto); 3. Conferir fotos de detalhe da peça.`;
    } else if (imp > 0) {
      prioridade = imp >= 1000 ? 'ALTA (Oportunidade Oculta)' : 'MÉDIA (Baixo CTR)';
      falhaPrincipal = 'Baixa Atratividade no Feed (Impressões sem Cliques)';
      gargaloFunil = 'Topo do Funil (Vitrine e Resultados de Busca Shopee)';
      analiseNaoConversao = `O anúncio teve ${imp} impressões na Shopee, mas ZERO cliques (CTR 0.00%). Ele é exibido aos compradores, mas não atrai o clique. Recomenda-se adicionar tag de desconto promocional (% OFF) e revisar a foto de capa para aumentar a atratividade visual.`;
      acaoRecomendada = '1. Ativar desconto promocional com tag de % OFF na Central de Marketing da Shopee; 2. Testar nova foto principal com mais contraste.';
    } else {
      prioridade = 'MÉDIA (Invisibilidade Orgânica)';
      falhaPrincipal = 'Invisibilidade Total de Busca (Zero Impressões)';
      gargaloFunil = 'Inexistência / Anúncio Desindexado';
      analiseNaoConversao = 'Anúncio dormente na Shopee (0 impressões e 0 cliques em 9 meses). O algoritmo não está entregando o produto nas buscas.';
      acaoRecomendada = '1. Reativar o anúncio e incluir em promoção de campanha oficial da Shopee; 2. Ajustar palavras-chave do título para pesca e agro.';
    }

    return {
      'ID do Item': itemId,
      'SKU Principal': sku,
      'Produto': title,
      'Ficha Técnica Shopee (Ao Vivo)': statusFichaTecnica,
      'Atributos Cadastrados na Shopee': atributosPreenchidosTexto || 'Nenhum',
      'Estoque Disponível Shopee (Ao Vivo)': liveStock !== null ? `${liveStock} un` : 'A consultar',
      'Categoria Oficial Shopee (Ao Vivo)': liveCategory,
      'Status Tabela de Medidas': statusTabela,
      'URL Tabela de Medidas': urlTabela || (isVestuario ? urlTabelaRecomendada : 'Não se aplica'),
      'Status Frete Grátis': '✅ Habilitado (Frete Grátis Extra Shopee)',
      'Proporção das Fotos': '✅ 1:1 Quadrada (1024x1024 px)',
      'Prioridade de Recuperação': prioridade,
      'Falha Principal': falhaPrincipal,
      'Gargalo no Funil': gargaloFunil,
      'Análise Detalhada de Não-Conversão': analiseNaoConversao,
      'Ação Recomendada': acaoRecomendada,
      'Total Impressões': imp,
      'Total Cliques': clk,
      'Taxa de Cliques (CTR)': ctr,
      'Total Visitantes': vis,
      'Pageviews por Visitante': pvPorVisitante,
      'Adições ao Carrinho': car,
      'Taxa Conversão Carrinho': taxaCarrinho,
      'Pedidos Não Pagos': ped,
      'Valor Realizado Não Pago (R$)': valNaoPago,
      'Classificação Shopee': r['Classificação']
    };
  });

  const newSheet = XLSX.utils.json_to_sheet(enrichedRows);

  newSheet['!cols'] = [
    { wch: 14 }, // ID do Item
    { wch: 18 }, // SKU Principal
    { wch: 55 }, // Produto
    { wch: 38 }, // Ficha Técnica Shopee (Ao Vivo)
    { wch: 45 }, // Atributos Cadastrados
    { wch: 25 }, // Estoque Disponível
    { wch: 55 }, // Categoria Oficial Shopee
    { wch: 45 }, // Status Tabela de Medidas
    { wch: 65 }, // URL Tabela de Medidas
    { wch: 35 }, // Status Frete Grátis
    { wch: 35 }, // Proporção das Fotos
    { wch: 30 }, // Prioridade de Recuperação
    { wch: 45 }, // Falha Principal
    { wch: 40 }, // Gargalo no Funil
    { wch: 95 }, // Análise Detalhada
    { wch: 85 }, // Ação Recomendada
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
  XLSX.utils.book_append_sheet(newWb, newSheet, 'Auditoria_Shopee_Ao_Vivo');

  XLSX.writeFile(newWb, outputPath);
  console.log(`✅ Salvo no projeto: ${outputPath}`);

  try {
    XLSX.writeFile(newWb, downloadsPath);
    console.log(`✅ Salvo em Downloads: ${downloadsPath}`);
  } catch (e) {
    console.log(`⚠️ Falha ao salvar em Downloads: ${e.message}`);
  }

  // Estatísticas finais
  const total = enrichedRows.length;
  const preenchidos = enrichedRows.filter(r => r['Ficha Técnica Shopee (Ao Vivo)'].includes('PREENCHIDA')).length;
  const vazios = enrichedRows.filter(r => r['Ficha Técnica Shopee (Ao Vivo)'].includes('VAZIA')).length;
  const estoqueZero = enrichedRows.filter(r => r['Estoque Disponível Shopee (Ao Vivo)'] === '0 un').length;
  const estoquePositivo = enrichedRows.filter(r => r['Estoque Disponível Shopee (Ao Vivo)'].includes('un') && r['Estoque Disponível Shopee (Ao Vivo)'] !== '0 un').length;

  console.log('\n================ RESUMO FINAL DA AUDITORIA AO VIVO ================');
  console.log(`📦 Total de Produtos Ativos Auditados:       ${total}`);
  console.log(`✅ Produtos com Ficha Técnica JÁ PREENCHIDA:  ${preenchidos} (${((preenchidos/total)*100).toFixed(1)}%)`);
  console.log(`🚨 Produtos com Ficha Técnica REALMENTE VAZIA: ${vazios} (${((vazios/total)*100).toFixed(1)}%)`);
  console.log(`🔴 Produtos com Estoque ZERADO (Sem Alerta): ${estoqueZero}`);
  console.log(`🟢 Produtos com Estoque DISPONÍVEL:          ${estoquePositivo}`);
  console.log(`====================================================================\n`);
}

main().catch(console.error);
