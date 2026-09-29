# Agente 5 — Atualizador de Atributos Shopee Seller Center 🛒

Módulo de automação RPA baseado em **Playwright** com **perfil de navegador persistente** para auditoria e preenchimento direto dos atributos da ficha técnica (obrigatórios e recomendados) de produtos já publicados no **Shopee Seller Center** (`seller.shopee.com.br`).

---

## 🚀 Como Funciona

1. **Perfil Persistente de Sessão (`browser_profile_shopee/`):**
   - Elimina problemas de bloqueio por anti-bot e simplifica o 2FA/SMS.
   - O operador realiza o login na Shopee uma única vez em modo visual.
   - A partir disso, a sessão fica salva e o robô pode operar em segundo plano (headless ou headed).

2. **Mapeador Inteligente de Atributos (`attribute_mapper.mjs`):**
   - Aplica as regras estritas da skill `shopee-brk-agro`.
   - Lê os dados de `agent2-enricher/produtos/*.json` e normaliza para as opções esperadas pela Shopee:
     - Gênero (`Masculino`, `Feminino`, `Unissex`)
     - Material (`XTech-Pro`, `Poliéster`, `Aço Inoxidável`, `EVA`, etc.)
     - Manga (`Manga Comprida`, `Manga Curta`)
     - Gola (`Gola Alta`, `Gola Padre`, `Gola Redonda`)
     - Ocasião (`Fazenda`, `Pesca`, `Esportiva`)
     - Estampa, Marca, País de Origem (`Brasil`), Condição (`Novo`) e Quantidades.

3. **Preenchimento e Auditoria (`attribute_filler.mjs`):**
   - Acessa diretamente a URL de edição do produto: `https://seller.shopee.com.br/portal/product/{shopee_product_id}`
   - Detecta campos vazios (dropdowns com busca e campos de texto).
   - Preenche os atributos faltantes com tolerância a falhas.
   - Clica em **"Atualizar" / "Salvar"** e aguarda confirmação.
   - Registra screenshots de auditoria em `screenshots/shopee_attributes/`.

---

## 📋 Comandos de Uso

### 1. Autenticação Inicial (Fazer uma única vez)
Abre o navegador visível para você inserir e-mail/senha e fazer a verificação por SMS, WhatsApp ou QR Code:
```bash
npm run shopee:login
# ou
node agent5-shopee-attributes/src/login.mjs
```

### 2. Teste Piloto em 1 Produto (Simulação / Sem Salvar)
```bash
npm run agent5:test
```

### 3. Atualizar um Produto Específico pelo SKU
```bash
node agent5-shopee-attributes/src/runner.mjs --sku CPT023 --headed
```

### 4. Atualizar um Produto Específico pelo ID da Shopee
```bash
node agent5-shopee-attributes/src/runner.mjs --id 58258810146 --headed
```

### 5. Execução em Lote com Limite de Produtos
```bash
node agent5-shopee-attributes/src/runner.mjs --limit 5 --headed
```

### 6. Executar Filtrando Apenas os SKUs de uma Planilha Excel
```bash
node agent5-shopee-attributes/src/runner.mjs --file uploads/minha_planilha.xlsx --headed
```
*(O robô lê a planilha, identifica a coluna de SKU, pesquisa cada anúncio na Shopee e preenche os atributos).*

### 7. Execução Completa em Todos os Produtos Mapeados
```bash
npm run shopee:attributes
# ou
node agent5-shopee-attributes/src/runner.mjs
```

---

## ⚙️ Flags da Linha de Comando

| Flag | Descrição |
|---|---|
| `--file <caminho>` | Processa **exclusivamente** os SKUs listados na planilha (.xlsx, .xls ou .csv) |
| `--sku <SKU>` | Filtra apenas pelo SKU especificado |
| `--id <SHOPEE_ID>` | Filtra apenas pelo ID do produto na Shopee |
| `--limit <N>` | Limita a execução a N produtos |
| `--headed` | Abre o navegador de forma visível |
| `--dry-run` | Apenas inspeciona e preenche na tela, SEM clicar em Salvar |
| `--force` | Sobrescreve campos mesmo se já possuírem valor preenchido |
