# SCRIPT DE DIAGNÓSTICO: probe_shopify.mjs

## Objetivo
O script `scripts/probe_shopify.mjs` é uma ferramenta de inspeção e sonda de rede para testar a comunicação com a API pública da Shopify das lojas da BRK (`https://brkfishing.com.br`, `https://www.brkagro.com.br`, `https://www.brkmotors.com.br`).

Ele realiza requisições diretas de consulta aos endpoints:
1. `/search/suggest.json?q=<SKU>&resources[type]=product` — Busca termos e retorna handles de produtos correspondentes.
2. `/products/<handle>.js` — Retorna os dados completos do produto (incluindo variantes `variants[].sku` e imagens oficiais).

## Como Executar
```bash
node scripts/probe_shopify.mjs
```

## Regras e Segurança
- O script utiliza apenas URLs públicas das lojas da BRK.
- **Nenhum segredo, chave de API privada ou token de autenticação** é utilizado ou armazenado neste script.
- Ele serve exclusivamente para testes diagnósticos pontuais no ambiente local.
- Em testes automatizados (CI/CD / suite de testes), as chamadas HTTP à Shopify devem ser **estritamente mockadas** (interceptando a função global `fetch`), evitando qualquer dependência de rede em execuções de teste.
