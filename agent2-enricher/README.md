# Agente 2 — Enriquecedor IA BRK Fishing

Parte da arquitetura multi-agente para automação de cadastro de produtos na Shopee via Magis5.

## O que faz

1. Lê o CSV de lote gerado pelo **Agente 1** (SKUs com status `scraped`)
2. Para cada SKU, carrega as imagens baixadas de `../agent1-scraper/downloads/{sku}/`
3. Redimensiona para 512×512px (economia de tokens) e envia ao **Gemini** (visão multimodal)
4. O Gemini analisa imagens + título bruto e gera um **JSON estruturado** com:
   - Título SEO otimizado para a Shopee (max 120 chars)
   - Marca, modelo e categoria sugerida
   - Descrição rica (200-800 chars)
   - Atributos extraídos (material, cor, tamanho, quantidade, etc.)
   - Variações (se aplicável)
   - Palavras-chave de busca
   - Medidas de embalagem fixas (3×20×30 cm, 0,250 kg)
5. Salva cada produto como `./produtos/{sku}.json`
6. Atualiza o status no CSV para `enriched`
7. Gera um **relatório HTML** visual para validação

## Requisitos

- Node.js 18+
- Chave de API do Google Gemini (salva no `.env`)

## Setup

```bash
cd agent2-enricher
npm install
```

Crie o arquivo `.env`:
```env
GEMINI_API_KEY=sua_chave_aqui
GEMINI_MODEL=gemini-3.8-flash
```

## Uso

```bash
# Processa todos os SKUs com status "scraped"
node enricher.mjs

# Processa apenas os 3 primeiros (para teste)
node enricher.mjs --limit 3

# Usa um modelo específico
node enricher.mjs --model gemini-3.7-flash

# Aponta para um CSV específico
node enricher.mjs --input ../agent1-scraper/lote_d1fae5.csv --limit 5

# Gera apenas o relatório HTML (sem processar novos SKUs)
node report.mjs

# Gera e abre o relatório no browser
node report.mjs --open
```

## Cadeia de Fallback de Modelos

Se o modelo primário falhar (quota esgotada, indisponível), o agente tenta automaticamente o próximo:

| Prioridade | Modelo |
|---|---|
| 1 (primário) | `gemini-3.8-flash` |
| 2 | `gemini-3.7-flash` |
| 3 | `gemini-3.6-flash` |
| 4 | `gemini-3.5-flash` |
| 5 | `gemini-2.5-flash` |
| 6 (fallback final) | `gemini-2.0-flash` |

## Saída

```
./produtos/
├── 7908137912018.json
├── 7908137912025.json
├── OC1038.json
└── ...

./relatorio.html    ← Relatório visual (abrir no browser)
```

### Exemplo de JSON gerado

```json
{
  "sku": "7908137912018",
  "titulo_shopee": "Anzol 4330 Marine Sports Nickel Nº 3/0 - 10 Unidades Pesca",
  "marca": "Marine Sports",
  "modelo": "4330",
  "categoria_sugerida": "Esportes e Lazer > Pesca > Anzóis",
  "descricao": "Anzol 4330 Marine Sports fabricado em aço Nickel...",
  "atributos": {
    "material": "Aço Nickel",
    "quantidade": "10 unidades",
    "numero": "3/0"
  },
  "variacoes": [],
  "medidas": {
    "altura_cm": 3,
    "largura_cm": 20,
    "comprimento_cm": 30,
    "peso_kg": 0.25
  },
  "palavras_chave": ["anzol", "pesca", "marine sports", "4330", "nickel"]
}
```

## Relatório HTML de Validação

O relatório permite validar visualmente cada produto:
- **Galeria de imagens** do produto lado a lado com os dados gerados
- **Comparação** título original vs título SEO gerado
- **Botões Aprovar/Rejeitar** por SKU (salva no localStorage do browser)
- **Busca e filtros** por SKU, marca ou status
- **Dark mode** com design premium

## Características

- **Idempotente**: rodar de novo pula SKUs já enriquecidos
- **Fallback inteligente**: cascata automática entre modelos Gemini
- **Rate limiting**: respeita limites da API (1.5s entre requests)
- **Crash-safe**: CSV atualizado após cada SKU
- **Economia de tokens**: imagens redimensionadas para 512px, máximo 4 por request
