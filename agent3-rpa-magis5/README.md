# Agente 3 — RPA Magis5 / Shopee

Parte da arquitetura multi-agente para automação de cadastro e publicação de anúncios na **Shopee** através da plataforma **Magis5**.

---

## 🎯 O que faz

1. **Validação de Pré-Voo (Checkpoint):** Confere se o JSON do Agente 2 possui todos os campos obrigatórios (título SEO <= 120 chars, marca, modelo, descrição rica, dimensões fixas, preços da Shopify e código Sankhya associado).
2. **Autenticação e Sessão Persistente:** Conecta na Magis5 e reutiliza `session.json` (`storageState` do Playwright) para evitar logins recorrentes e bloqueios por rate limiting.
3. **Preenchimento dos Campos:**
   - Título otimizado para Shopee
   - Código Sankhya (como SKU interno / referência ERP)
   - Marca, Modelo e Categoria
   - Descrição rica pré-formatada
   - Dimensões e peso fixos de embalagem: **3 cm × 20 cm × 30 cm | 0,250 kg**
   - Preços regular e promocional
   - Variações com seus respectivos sufixos
4. **Upload de Fotos em Alta Resolução:** Envia as imagens baixadas pelo Agente 1 diretamente do disco local.
5. **Segurança (Modo Dry-Run padrão):** O robô simula todo o fluxo e captura screenshots de auditoria sem clicar no botão de publicar em produção, a não ser que a flag `--publish` seja informada.

## 🎨 Gestão por Cores na Planilha

| Cor Hex | Significado no Pipeline | Ação do Robô (Agente 3) |
|---|---|---|
| `#D1FAE5` | **Anúncios à Publicar** (Cadastrado c/ Estoque) | **Processa e publica** no Magis5 |
| `#83E28E` | **Anúncios Já Publicados** (Ativos na Magis5) | **Pula automaticamente** (evita perda de tempo e duplicação) |

> Após publicar com sucesso na Magis5 (quando executado com `--publish`), o robô atualiza automaticamente a linha do produto no CSV para status `publicado` e atribui a cor `#83E28E`.

---

## 📦 Estrutura de Arquivos

```
agent3-rpa-magis5/
├── package.json
├── .env.example
├── README.md
├── screenshots/            ← Auditoria visual e telas de erro
└── src/
    ├── config.mjs          ← Variáveis de ambiente, regras e seletores
    ├── checkpoint.mjs      ← Validador de dados e contrato do JSON
    ├── auth.mjs            ← Login e persistência de sessão (session.json)
    ├── publisher.mjs       ← Automação do formulário, fotos e variações
    └── runner.mjs          ← CLI principal
```

---

## ⚙️ Setup

```powershell
cd agent3-rpa-magis5
npm install
```

Crie o arquivo `.env` com base no `.env.example`:
```env
MAGIS5_LOGIN_URL=https://app.magis5.com.br/login
MAGIS5_BASE_URL=https://app.magis5.com.br
MAGIS5_EMAIL=seu_email@brkfishing.com.br
MAGIS5_PASSWORD=sua_senha
HEADLESS=false
```

---

## 🚀 Como Executar

### 1. Testar o Checkpoint de Dados (Sem abrir navegador)
Valida se os 54 produtos enriquecidos pelo Agente 2 atendem 100% dos requisitos:
```powershell
npm run checkpoint
```

### 2. Testar 1 Produto em Modo Visual (Dry-Run Seguro)
Abre o navegador, preenche os campos do SKU informado, carrega as fotos e tira um screenshot sem publicar:
```powershell
node src/runner.mjs --sku 7908137912018 --headed --dry-run
```

### 3. Testar Lote de 3 Produtos
```powershell
node src/runner.mjs --limit 3 --headed --dry-run
```

### 4. Publicação Real em Produção
*(Somente após validar visualmente os screenshots do dry-run)*:
```powershell
node src/runner.mjs --sku 7908137912018 --publish
```

---

## 🛡️ Medidas de Segurança Implementadas
- **Nenhum clique de salvar acidental:** O padrão é `--dry-run`.
- **Captura de tela em falhas:** Qualquer exceção gera um screenshot em `./screenshots/erro-[sku]-[timestamp].png`.
- **Idempotência:** Apenas produtos válidos no checkpoint são elegíveis para publicação.
