# Agente 4 — Diagnóstico e Solução Automática de Rejeições 🩺

Módulo de auditoria forense e auto-recuperação do pipeline de automação Shopee da **BRK Fishing**.

---

## 🎯 O que faz

1. **Auditoria Contínua de Rejeições:** Inspeciona as capturas de tela geradas durante execuções com erro (`agent3-rpa-magis5/screenshots/erro-*.png`) e cruza com a base de produtos em `agent2-enricher/produtos/` e a planilha `lote_d1fae5.csv`.
2. **Classificação de Causa-Raiz:** Analisa o texto dos alertas da Magis5/Shopee e classifica as falhas em categorias claras:
   - **Categoria Inválida / Recusada:** Sugere o caminho taxonômico oficial da Shopee (4 níveis).
   - **Marca Recusada:** Ajusta marcas para nomes aceitos no catálogo Shopee.
   - **Atributos Obrigatórios Faltantes:** Preenche campos técnicos da Ficha Técnica.
   - **Excesso de Fotos por Variação:** Alerta sobre a regra de 1 foto por variação.
   - **Conflito de SKU:** Identifica produtos já existentes no marketplace.
3. **Resolução Automática em 1 Clique:**
   - Permite aplicar a correção instantaneamente no arquivo JSON do produto.
   - Permite aplicar a regra em lote para toda a família de produtos (ex: todas as Varas de Pesca ou todas as Sandálias Masculinas).
4. **Alimentação da Central de Rejeições:** Fornece os dados para o painel web interativo em `http://localhost:3000/rejeitados.html`.

---

## 📁 Estrutura de Arquivos

```text
agent4-diagnostician/
├── README.md                 ← Esta documentação
├── diagnose.mjs              ← Motor de diagnóstico e auditoria
├── rules.mjs                 ← Catálogo de categorias oficiais e classificadores
└── diagnostics_result.json   ← Saída consolidada em formato JSON
```

---

## 🚀 Como Executar

### Via Terminal (CLI):
```powershell
cd agent4-diagnostician
node diagnose.mjs
```

O script gerará o arquivo consolidado `diagnostics_result.json` contendo a lista completa de produtos auditados, evidências visuais e propostas de solução.

### Via Central de Controle Web:
Acesse **[http://localhost:3000/rejeitados.html](http://localhost:3000/rejeitados.html)** para visualizar todas as rejeições com as fotos comparativas e os botões de ação:
- **`Aplicar Solução Automática`**: Corrige o produto pontual.
- **`Aplicar a Todos Desta Categoria`**: Replica a correção para toda a categoria.
