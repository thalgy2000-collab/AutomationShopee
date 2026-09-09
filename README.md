# Pipeline de Automação Shopee — BRK Fishing 🎣

Sistema integrado de agentes autônomos para automação e publicação de produtos do catálogo da BRK Fishing para a Shopee através da plataforma Magis5.

---

## 🏛️ Arquitetura dos Agentes

O pipeline é composto por 3 agentes modulares orquestrados por uma interface web unificada:

1. **Agente 1 — Coletor (`agent1-scraper`)**:
   - Extrai e filtra produtos de planilhas de estoque (`.xls`, `.xlsx`, `.csv`) com suporte a identificação de cores hexadecimais nativas do Excel (BIFF8/XFEXT).
   - Coleta fotos oficiais limpas em alta resolução diretamente da API da Shopify.
   - Aplica aprimoramento de imagem com **Sharp.js** (nitidez adaptativa, contraste e realce de brilho).

2. **Agente 2 — Enriquecedor Shopee com IA (`agent2-enricher`)**:
   - Lê os produtos coletados e utiliza IA Multimodal (**Gemini 3.8 Flash**, 3.7, 3.6 ou Groq/Llama).
   - Analisa as fotos das variações para produzir:
     - Títulos persuasivos otimizados para SEO da Shopee.
     - Descrições completas com ficha técnica, especificações e dicas de uso.
     - Atributos específicos (marca, modelo, dimensões, peso).
     - Mapeamento e agrupamento de produtos pai e variações filhas com preços de tabela e promocionais.

3. **Agente 3 — Publicador Magis5 / Shopee (`agent3-rpa-magis5`)**:
   - Robô RPA baseado em **Playwright**.
   - Conecta-se à plataforma Magis5, seleciona a integração Shopee e realiza o preenchimento de ponta a ponta:
     - Título, medidas, descrição e pesos aproximados.
     - Navegação hierárquica completa de categorias e subcategorias.
     - Geração e preenchimento da ficha técnica de acordo com regras de marketplace.
     - Criação da grade de variações com o **Código ERP Sankhya**.
     - Upload das imagens gerais do anúncio e fotos individuais de cada variação.
     - Atualização automática de status para `publicado` e cor verde (`#83E28E`) no lote.

---

## 💻 Central de Controle Web (Mission Control)

Interface visual moderna com dark mode e glassmorphism que roda localmente em `http://localhost:3000`:
- **Disparo de Agentes com 1 Clique**: Execução sem necessidade de comandos de terminal.
- **Upload Dinâmico de Novas Planilhas**: Arraste e solte planilhas de fornecedores diretamente na tela com seleção de cores.
- **Visualizador e Auditoria de SKUs**:
  - Mini-chips mostrando a fila ordenada de produtos.
  - Sincronização em tempo real com a quantidade de SKUs configurada.
  - Modal interativo com busca instantânea e abas de pendentes/publicados.
- **Terminal de Logs ao Vivo**: Acompanhamento dos scripts em tempo real.

---

## 🚀 Como Iniciar

### 1. Pré-requisitos
- **Node.js** v18+ instalado.
- **Google Chrome** ou Chromium para o Playwright.

### 2. Instalação das Dependências
Instale as dependências nos três módulos:
```bash
# Agente 1
cd agent1-scraper && npm install && cd ..

# Agente 2
cd agent2-enricher && npm install && cd ..

# Agente 3
cd agent3-rpa-magis5 && npm install && cd ..
```

### 3. Configuração de Variáveis de Ambiente
Copie os modelos de `.env.example` e preencha com suas chaves:
```bash
# Agente 2 (.env)
GEMINI_API_KEY=sua_chave_gemini
GROQ_API_KEY=sua_chave_groq

# Agente 3 (.env)
MAGIS5_EMAIL=seu_email@empresa.com.br
MAGIS5_PASSWORD=sua_senha
```

### 4. Iniciar o Painel de Controle
```bash
cd agent2-enricher
node server.mjs
```
Acesse no navegador: **[http://localhost:3000](http://localhost:3000)**

---

## 🛡️ Segurança
Os arquivos `.env`, credenciais de login e pastas de downloads pesadas estão devidamente listados no `.gitignore` para proteção das informações confidenciais.
