# Agente 3 — RPA de Publicação Magis5 / Shopee 🤖

Robô de automação baseado em **Playwright** para preenchimento e publicação de anúncios na **Shopee** através da plataforma integradora **Magis5**.

---

## 🎯 O que faz

1. **Validação de Pré-Voo (Checkpoint):**
   - Confere se o arquivo JSON gerado pelo Agente 2 possui todos os campos obrigatórios (título SEO <= 120 chars, marca, modelo, descrição rica, dimensões e fotos locais).
   - **Prevenção de Preço Nulo:** Valida se o produto possui preço positivo de venda. Possui fallback inteligente que resgata os preços das variações filhas se o cabeçalho não estiver populado.
2. **Autenticação e Sessão Persistente:** Conecta na Magis5 e reaproveita os cookies em `session.json`, evitando re-logins constantes e prevenindo rate limits.
3. **Preenchimento Completo do Anúncio:**
   - Seleciona o marketplace **Shopee**.
   - Preenche Título, Código Sankhya (SKU Interno), Marca, Modelo, Medidas padrão de frete (3×20×30 cm | 0,250 kg) e Descrição formatada.
   - Navega na árvore de categorias em cascata (até 4 níveis taxonômicos).
   - Gera e preenche a Ficha Técnica dinâmica com mais de 18 atributos, convertendo unidades (cm, g, meses) e aproximando opções para as aceitas pelo marketplace.
4. **Gestão de Variações e Fotos:**
   - Monta a grade de variações associando o Código ERP Sankhya específico de cada modelo/tamanho.
   - Aplica a regra estrita da Shopee (máximo 1 foto por variação): realiza limpeza automática de fotos residuais duplicadas herdadas do ERP antes de anexar a foto oficial da variação.
   - Envia a galeria principal de fotos do anúncio em alta resolução.
5. **Auditoria Visual & Segurança:**
   - Modo **Dry-Run** ativado por padrão para simulações seguras sem salvar em produção.
   - Captura screenshots no término de cada anúncio (`published-*.png` ou `erro-*.png`).
   - Atualiza automaticamente o status na planilha `lote_d1fae5.csv` para `publicado` e cor verde (`#83E28E`).

---

## 🎨 Gestão por Cores na Planilha

| Cor Hexadecimal | Significado | Ação do Robô |
|---|---|---|
| `#D1FAE5` | **À Publicar (Cadastrado c/ Estoque)** | **Processa e publica** |
| `#83E28E` | **Já Publicado / Concluído** | **Ignora automaticamente** (evita duplicatas) |

---

## 📁 Estrutura de Arquivos

```text
agent3-rpa-magis5/
├── package.json
├── session.json             ← Sessão autenticada persistente (Playwright)
├── screenshots/             ← Screenshots de auditoria e telas de erro
└── src/
    ├── runner.mjs           ← Orquestrador CLI principal do Agente 3
    ├── publisher.mjs        ← Automação Playwright do formulário Magis5
    ├── checkpoint.mjs       ← Validador de integridade e fallback de preços
    ├── auth.mjs             ← Autenticação e reaproveitamento de sessão
    └── config.mjs           ← Seletores CSS, URLs e regras de negócio
```

---

## ⚙️ Setup

```powershell
cd agent3-rpa-magis5
npm install
npx playwright install chromium
```

Crie o arquivo `.env`:
```env
MAGIS5_LOGIN_URL=https://app.magis5.com.br/v2/admin/autenticacao/login.php
MAGIS5_BASE_URL=https://app.magis5.com.br
MAGIS5_EMAIL=seu_email@empresa.com.br
MAGIS5_PASSWORD=sua_senha_secreta
MAGIS5_INTEGRATION_NAME=Shopee
HEADLESS=true
ACTION_TIMEOUT_MS=15000
NAVIGATION_TIMEOUT_MS=30000
```

---

## 🚀 Como Executar

### 1. Simulação Segura (Dry-Run — Padrão):
```powershell
# Executa sem clicar em salvar, capturando telas de auditoria:
node src/runner.mjs --limit 5
```

### 2. Publicação Real em Produção:
```powershell
# Publica os 10 primeiros produtos pendentes do lote:
node src/runner.mjs --publish --limit 10

# Com navegador visível na tela (útil para acompanhar o fluxo):
node src/runner.mjs --publish --headed --limit 3
```

### 3. Filtros Específicos:
```powershell
# Publica apenas um produto específico:
node src/runner.mjs --sku "BRAVEAZUL" --publish --headed

# Atualiza em lote todas as Varas de Pesca com as novas regras:
node src/runner.mjs --varas --publish

# Força reprocessamento de produtos já marcados como publicados:
node src/runner.mjs --force --publish --limit 5
```
