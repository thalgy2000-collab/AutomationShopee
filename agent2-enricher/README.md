# Agente 2 — Enriquecedor com IA & Central de Controle Web 🧠

Módulo de processamento de linguagem natural e visão computacional multimodal da arquitetura **BRK Fishing**, responsável pelo enriquecimento de anúncios e pela Central de Controle Web (Mission Control).

---

## 🎯 O que faz

1. **Leitura e Agrupamento:** Lê a planilha de lote (`lote_d1fae5.csv`), identifica SKUs pai e suas respectivas variações filhas, associando o código interno do ERP Sankhya.
2. **Visão Computacional Multimodal:** Carrega as fotos oficiais em alta definição salvas pelo Agente 1 e as envia para o modelo de IA (Google Gemini ou Groq/LLaMA).
3. **Geração Estruturada (JSON):**
   - **Título SEO para Shopee:** Formulado com palavras-chave de alta conversão (máximo 120 caracteres).
   - **Descrição Persuasiva:** Estrutura escaneável (AIDA/E-E-A-T) com introdução, benefícios, indicação de pesca, especificações e dicas de uso.
   - **Ficha Técnica & Atributos:** Extração de material, comprimento, peso, garantia, país de origem e características específicas da categoria.
   - **Precificação:** Captura de preço de tabela e preço promocional (com cálculo de desconto percentual).
   - **Medidas Fixas de Envio:** Padrão Shopee de 3×20×30 cm e 0,250 kg.
4. **Auditoria de Qualidade (SEO Score):** Avalia cada anúncio com base em checklists rígidos (tamanho do título, persuasão, atributos técnicos mapeados e escaneabilidade).
5. **Servidor da Central de Controle (`server.mjs`):**
   - Roda localmente na porta 3000.
   - Serve as interfaces web: **Painel de Controle (`painel.html`)**, **Central de Rejeições (`rejeitados.html`)** e **Relatório Visual (`relatorio.html`)**.
   - Expõe endpoints REST para disparo e monitoramento dos agentes em tempo real.

---

## 📁 Estrutura de Arquivos

```text
agent2-enricher/
├── package.json
├── server.mjs             ← Servidor HTTP central e API REST do Mission Control
├── enricher.mjs           ← Motor de enriquecimento IA (Gemini / Groq)
├── report.mjs             ← Gerador do relatório visual de auditoria
├── grouping.mjs           ← Lógica de agrupamento Pai-Filho e extração de códigos
├── painel.html            ← Interface web Mission Control (Disparo de agentes e logs)
├── rejeitados.html        ← Interface web de Rejeições & Soluções Automáticas
├── relatorio.html         ← Relatório visual completo dos produtos
└── produtos/              ← 134 arquivos JSON enriquecidos por SKU
```

---

## ⚙️ Setup

```powershell
cd agent2-enricher
npm install
```

Crie o arquivo `.env`:
```env
GEMINI_API_KEY=sua_chave_gemini_aqui
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=sua_chave_groq_opcional
```

---

## 🚀 Como Executar

### 1. Iniciar a Central de Controle Web (Recomendado):
```powershell
node server.mjs
```
Acesse **[http://localhost:3000](http://localhost:3000)** no navegador para controlar todos os agentes pela interface visual.

### 2. Executar o Enriquecedor via Terminal:
```powershell
# Processa todos os SKUs pendentes:
node enricher.mjs

# Processa apenas os 5 primeiros (teste rápido):
node enricher.mjs --limit 5

# Aponta para uma planilha específica:
node enricher.mjs --input ../agent1-scraper/lote_d1fae5.csv --limit 10

# Gera apenas o relatório HTML visual:
node report.mjs
```

---

## 🔌 API REST da Central de Controle (`server.mjs`)

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/stats` | `GET` | Métricas gerais do pipeline e status de execução |
| `/api/agents/logs` | `GET` | Últimos 500 logs em streaming com timestamps |
| `/api/batch/preview` | `GET` | Fila ordenada de produtos pendentes e concluídos |
| `/api/agents/start` | `POST` | Inicia um agente (`agent1`, `agent2`, `agent3`, `agent4`) |
| `/api/agents/stop` | `POST` | Interrompe o processo ativo |
| `/api/status` | `POST` | Altera status manual de um SKU (`publicado` ou `pendente`) |
| `/api/diagnostics` | `GET` | Consulta diagnósticos de produtos rejeitados |
| `/api/diagnostics/apply` | `POST` | Aplica solução automática para um SKU específico |
| `/api/diagnostics/apply-all`| `POST` | Aplica a solução para toda a categoria |
