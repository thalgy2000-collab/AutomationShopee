# Agente 1 — Scraper BRK Fishing

Parte da arquitetura multi-agente para automação de cadastro de produtos na Shopee via Magis5.

## O que faz

1. Lê uma planilha CSV ou o arquivo Excel original `.xls` (`Estoque Douglas IMP.xls`)
2. Suporta **filtro avançado por cor hexadecimal** (ex: `#D1FAE5` para produtos *Cadastrado c/ Estoque*)
3. Para cada SKU pendente, busca o produto na API pública Shopify de `brkfishing.com.br`
4. Baixa todas as imagens do produto em alta resolução (1200×1200) para `./downloads/{sku}/`
5. Converte WebP/PNG → JPG automaticamente (formato único para o pipeline)
6. Atualiza o status na planilha de lote para `scraped` ou `erro: motivo`

## Requisitos

- Node.js 18+ (usa `fetch` nativo)
- npm

## Setup

```bash
cd agent1-scraper
npm install
```

## Uso e Filtro por Cor

### 1. Filtrando e Baixando Diretamente da Planilha Excel (.xls)

Você pode passar o arquivo `.xls` diretamente com a flag `--color`:

```bash
# Baixa apenas os produtos com a cor verde #D1FAE5 (283 produtos ativos com estoque)
node scraper.mjs --input "C:\Users\marke\Downloads\Estoque Douglas IMP.xls" --color "#D1FAE5"

# Para testar apenas os 5 primeiros produtos antes de rodar todos:
node scraper.mjs --input "C:\Users\marke\Downloads\Estoque Douglas IMP.xls" --color "#D1FAE5" --limit 5
```

### 2. Gerar o CSV do Lote por Cor Separadamente

Caso queira primeiro gerar o arquivo CSV filtrado para inspecionar:

```bash
# Extrai todos os 283 produtos com a cor #D1FAE5 para lote_d1fae5.csv
node create_lote.mjs

# Ou customizando cor / limite:
node create_lote.mjs --color "#D1FAE5" --output lote_d1fae5.csv
node create_lote.mjs --color "#D1FAE5" --limit 10 --output lote_teste10.csv
```

Em seguida, execute o scraper apontando para o CSV gerado:

```bash
node scraper.mjs --input lote_d1fae5.csv
# Ou com limite:
node scraper.mjs --input lote_d1fae5.csv --limit 10
```

### 3. Outros Comandos

```bash
# Com o CSV de exemplo (3 SKUs)
node scraper.mjs --input sample_input.csv

# Sem argumentos (detecta automaticamente lote_d1fae5.csv se existir)
node scraper.mjs
```

## Cores Identificadas na Planilha de Estoque

| Cor Hex | Significado / Classificação | Total de Itens |
|---|---|---|
| `#D1FAE5` | **Cadastrado c/ Estoque** (Ativo com estoque) | **283** |
| `#FEF9C3` | Rascunho / Sem Estoque | 125 |
| `#FFEDD5` | Sem Estoque (Ativo) | 58 |
| `#FEE2E2` | Não Cadastrado | 87 |

## Formato do CSV de Lote

```csv
sku,titulo_bruto,status,cor,classificacao
7908137912018,ANZOL 4330 MARINE SPORTS NICKEL - QUANTIDADE:10,pendente,#D1FAE5,Cadastrado c/ Estoque
7908137912025,ANZOL 4330 MARINE SPORTS NICKEL - QUANTIDADE:10,pendente,#D1FAE5,Cadastrado c/ Estoque
```

### Valores de status

| Status | Significado |
|---|---|
| `pendente` | Aguardando processamento (será processado) |
| `scraped` | Imagens baixadas com sucesso |
| `publicado` | Já publicado na Magis5 (ignorado pelo scraper) |
| `erro: ...` | Falha com motivo descrito |

## Saída

```
./downloads/
├── 7908137912018/
│   ├── 01.jpg
│   ├── 02.jpg
│   └── ...
├── OC1038/
│   ├── 01.jpg
│   └── ...
```

## Características

- **Idempotente**: rodar de novo pula SKUs já processados e imagens já baixadas
- **Rate limiting**: máximo 2 requests/s à API Shopify
- **Tolerante a falhas**: se uma imagem falha, registra o erro e continua
- **Progresso salvo**: o CSV é atualizado após cada SKU (crash-safe)
- **Filtro Nativo de Estilo**: lê diretamente os registros XFEXT da especificação BIFF8 do Excel para identificar as cores hexadecimais exatas aplicadas nas células.
