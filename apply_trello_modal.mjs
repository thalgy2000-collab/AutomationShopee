import fs from 'node:fs';
import path from 'node:path';

const htmlPath = path.resolve('roadmap_shopee_brk.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Trello Modal CSS
const trelloModalCSS = `
    /* ==========================================================================
       TRELLO-STYLE POPUP MODAL STYLES
       ========================================================================== */
    .trello-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(4, 7, 15, 0.82);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 10000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      opacity: 0;
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .trello-modal-backdrop.active {
      display: flex;
      opacity: 1;
    }

    .trello-modal {
      background: #111728;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 18px;
      width: 100%;
      max-width: 900px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.75), 0 0 35px rgba(16, 185, 129, 0.15);
      transform: scale(0.95) translateY(10px);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
    }

    .trello-modal-backdrop.active .trello-modal {
      transform: scale(1) translateY(0);
    }

    .trello-modal-header {
      padding: 22px 26px 18px;
      background: rgba(16, 22, 38, 0.95);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .trello-header-left {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      flex: 1;
    }

    .trello-icon {
      font-size: 26px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 6px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .trello-title {
      font-family: 'Outfit', sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: #fff;
      line-height: 1.3;
    }

    .trello-subtext {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 5px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .trello-col-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 11.5px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .trello-btn-close {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
      width: 34px;
      height: 34px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: var(--transition);
      flex-shrink: 0;
    }

    .trello-btn-close:hover {
      background: rgba(244, 63, 94, 0.2);
      border-color: var(--accent-rose);
      color: #fff;
      transform: rotate(90deg);
    }

    .trello-modal-body {
      display: flex;
      gap: 24px;
      padding: 24px 26px;
      overflow-y: auto;
      flex: 1;
    }

    @media (max-width: 800px) {
      .trello-modal-body {
        flex-direction: column;
      }
    }

    .trello-main-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 22px;
    }

    .trello-sidebar-col {
      width: 250px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex-shrink: 0;
    }

    @media (max-width: 800px) {
      .trello-sidebar-col {
        width: 100%;
      }
    }

    .trello-section {
      background: rgba(22, 30, 49, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 16px;
    }

    .trello-section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .trello-section-icon {
      font-size: 16px;
    }

    .trello-section-title {
      font-family: 'Outfit', sans-serif;
      font-size: 14.5px;
      font-weight: 700;
      color: var(--text-main);
      letter-spacing: -0.2px;
    }

    .trello-desc-content {
      font-size: 13.5px;
      line-height: 1.6;
      color: #cbd5e1;
    }

    .trello-desc-content strong {
      color: #fff;
    }

    /* Checklist Progress */
    .trello-progress-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 10px 0 16px;
    }

    .trello-progress-pct {
      font-size: 12px;
      font-weight: 800;
      color: var(--accent-emerald);
      min-width: 35px;
    }

    .trello-progress-bar-bg {
      flex: 1;
      height: 8px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      overflow: hidden;
    }

    .trello-progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #34d399);
      border-radius: 999px;
      transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .trello-checklist-count {
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--accent-emerald);
      font-weight: 700;
    }

    .trello-checklist-items {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .trello-check-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(10, 14, 23, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.05);
      transition: var(--transition);
    }

    .trello-check-item:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.12);
    }

    .trello-check-item.done {
      background: rgba(16, 185, 129, 0.05);
      border-color: rgba(16, 185, 129, 0.2);
    }

    .trello-check-item.done .trello-item-text {
      text-decoration: line-through;
      color: var(--text-dim);
    }

    .trello-custom-cb {
      appearance: none;
      -webkit-appearance: none;
      width: 19px;
      height: 19px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 5px;
      background: transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
      transition: var(--transition);
    }

    .trello-custom-cb:checked {
      background: var(--accent-emerald);
      border-color: var(--accent-emerald);
    }

    .trello-custom-cb:checked::after {
      content: '✓';
      color: #052e16;
      font-weight: 900;
      font-size: 13px;
    }

    .trello-item-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .trello-item-sku-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .trello-sku-badge {
      font-family: monospace;
      font-size: 11.5px;
      background: rgba(6, 182, 212, 0.12);
      border: 1px solid rgba(6, 182, 212, 0.3);
      color: var(--accent-cyan);
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 700;
    }

    .trello-item-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
    }

    .trello-item-action {
      font-size: 12px;
      color: var(--text-muted);
    }

    .trello-btn-copy-mini {
      background: transparent;
      border: none;
      color: var(--text-dim);
      cursor: pointer;
      font-size: 12px;
      padding: 2px 4px;
      border-radius: 4px;
      transition: var(--transition);
    }

    .trello-btn-copy-mini:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
    }

    .trello-code-box {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(6, 182, 212, 0.3);
      border-radius: 8px;
      padding: 12px 14px;
      font-family: monospace;
      font-size: 12px;
      color: var(--accent-cyan);
      word-break: break-all;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    /* Notes Area */
    .trello-notes-textarea {
      width: 100%;
      background: rgba(10, 14, 23, 0.7);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--text-main);
      font-family: inherit;
      font-size: 13px;
      outline: none;
      resize: vertical;
      transition: var(--transition);
    }

    .trello-notes-textarea:focus {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.2);
    }

    /* Sidebar Boxes */
    .trello-side-box {
      background: rgba(22, 30, 49, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .trello-side-title {
      font-size: 11px;
      font-weight: 800;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }

    .trello-side-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 8px;
      padding: 8px 12px;
      color: var(--text-main);
      font-size: 12.5px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      text-decoration: none;
      transition: var(--transition);
    }

    .trello-side-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateX(2px);
    }

    .trello-side-btn.active {
      background: rgba(16, 185, 129, 0.15);
      border-color: rgba(16, 185, 129, 0.4);
      color: var(--accent-emerald);
    }

    .trello-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }

    .trello-meta-label {
      color: var(--text-dim);
    }

    .trello-meta-val {
      color: var(--text-main);
      font-weight: 600;
    }

    .trello-btn-small {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
      padding: 3px 8px;
      border-radius: 5px;
      font-size: 11px;
      cursor: pointer;
      transition: var(--transition);
    }

    .trello-btn-small:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }

    .trello-btn-primary {
      background: var(--accent-emerald);
      color: #052e16;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
      transition: var(--transition);
    }

    .trello-btn-primary:hover {
      background: #34d399;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }
`;

// Insert Trello CSS
html = html.replace('</style>', trelloModalCSS + '\n  </style>');

// 2. Trello Modal HTML
const trelloModalHTML = `
  <!-- ==================== POPUP MODAL ESTILO TRELLO ==================== -->
  <div class="trello-modal-backdrop" id="trelloModalBackdrop" onclick="handleBackdropClick(event)">
    <div class="trello-modal" id="trelloModal" role="dialog" aria-modal="true">
      <!-- Modal Header -->
      <div class="trello-modal-header">
        <div class="trello-header-left">
          <div class="trello-icon" id="trelloModalIcon">🚨</div>
          <div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <h2 class="trello-title" id="trelloModalTitle">Título da Tarefa</h2>
              <span class="kanban-priority-pill" id="trelloModalPrio">CRÍTICO</span>
            </div>
            <div class="trello-subtext">
              na coluna <span class="trello-col-badge" id="trelloModalCol">A Fazer</span> • <span id="trelloModalPhase">Fase 1</span>
            </div>
          </div>
        </div>
        <button class="trello-btn-close" onclick="closeTrelloModal()" title="Fechar (Esc)">✕</button>
      </div>

      <!-- Modal Body (Main Content 70% | Sidebar 30%) -->
      <div class="trello-modal-body">
        
        <!-- Main Column -->
        <div class="trello-main-col">
          
          <!-- Descrição -->
          <div class="trello-section">
            <div class="trello-section-header">
              <span class="trello-section-icon">📝</span>
              <h3 class="trello-section-title">Descrição & Impacto Operacional</h3>
            </div>
            <div class="trello-desc-content" id="trelloModalDesc">
              Carregando descrição...
            </div>
          </div>

          <!-- Checklist de Produtos / SKUs -->
          <div class="trello-section">
            <div class="trello-section-header" style="justify-content: space-between;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="trello-section-icon">☑️</span>
                <h3 class="trello-section-title">Checklist de Produtos & Ações</h3>
                <span class="trello-checklist-count" id="trelloChecklistRatio">0/0</span>
              </div>
              <div style="display:flex; gap:6px;">
                <button class="trello-btn-small" onclick="toggleAllChecklist(true)">Marcar Todos</button>
                <button class="trello-btn-small" onclick="toggleAllChecklist(false)">Desmarcar</button>
              </div>
            </div>

            <!-- Barra de Progresso do Checklist -->
            <div class="trello-progress-wrap">
              <span class="trello-progress-pct" id="trelloProgressPct">0%</span>
              <div class="trello-progress-bar-bg">
                <div class="trello-progress-bar-fill" id="trelloProgressBarFill" style="width: 0%;"></div>
              </div>
            </div>

            <!-- Lista de Itens do Checklist -->
            <div class="trello-checklist-items" id="trelloChecklistContainer">
              <!-- Injetado dinamicamente -->
            </div>
          </div>

          <!-- Bloco de Comando RPA ou Instruções Técnicas -->
          <div class="trello-section" id="trelloCommandSection" style="display: none;">
            <div class="trello-section-header">
              <span class="trello-section-icon">⚡</span>
              <h3 class="trello-section-title">Comando / Script de Execução</h3>
            </div>
            <div class="trello-code-box">
              <code id="trelloCommandCode">node ...</code>
              <button class="trello-btn-small" onclick="copyCurrentTaskCommand()">📋 Copiar</button>
            </div>
          </div>

          <!-- Anotações da Equipe -->
          <div class="trello-section">
            <div class="trello-section-header">
              <span class="trello-section-icon">💬</span>
              <h3 class="trello-section-title">Anotações da Equipe</h3>
            </div>
            <div class="trello-notes-wrap">
              <textarea id="trelloNotesInput" class="trello-notes-textarea" placeholder="Adicione observações da execução (ex: 'Ajustado prazo no Magis5 por Mariana')..." rows="3"></textarea>
              <div style="display:flex; justify-content: flex-end; margin-top:8px;">
                <button class="trello-btn-primary" onclick="saveTrelloNote()">💾 Salvar Anotação</button>
              </div>
            </div>
          </div>

        </div>

        <!-- Sidebar Lateral (Estilo Trello) -->
        <div class="trello-sidebar-col">
          
          <!-- Mover para Lista -->
          <div class="trello-side-box">
            <div class="trello-side-title">Mover para Coluna</div>
            <div style="display:flex; flex-direction:column; gap:6px;" id="trelloMoveGroup">
              <button class="trello-side-btn" onclick="moveCurrentCard('todo')" data-col="todo">
                <span>📋 A Fazer</span>
                <span class="col-active-dot" id="dot-todo"></span>
              </button>
              <button class="trello-side-btn" onclick="moveCurrentCard('in-progress')" data-col="in-progress">
                <span>⚡ Em Andamento</span>
                <span class="col-active-dot" id="dot-in-progress"></span>
              </button>
              <button class="trello-side-btn" onclick="moveCurrentCard('review')" data-col="review">
                <span>🔍 Em Validação</span>
                <span class="col-active-dot" id="dot-review"></span>
              </button>
              <button class="trello-side-btn" onclick="moveCurrentCard('done')" data-col="done">
                <span>✅ Concluído</span>
                <span class="col-active-dot" id="dot-done"></span>
              </button>
            </div>
          </div>

          <!-- Ações Rápidas -->
          <div class="trello-side-box">
            <div class="trello-side-title">Ações Rápidas</div>
            <button class="trello-side-btn" onclick="copyCurrentTaskSkus()">
              <span>📋 Copiar SKUs</span>
            </button>
            <a href="https://seller.shopee.com.br" target="_blank" class="trello-side-btn">
              <span>🛍️ Seller Center Shopee</span>
              <span>↗</span>
            </a>
            <a href="/relatorio.html" target="_blank" class="trello-side-btn">
              <span>📦 Relatório Produtos</span>
              <span>↗</span>
            </a>
            <button class="trello-side-btn" onclick="jumpFromModalToTable()">
              <span>📊 Ver na Tabela</span>
              <span>➔</span>
            </button>
          </div>

          <!-- Metadados Técnicos -->
          <div class="trello-side-box">
            <div class="trello-side-title">Metadados & SLA</div>
            <div class="trello-meta-row">
              <span class="trello-meta-label">Prioridade:</span>
              <span class="trello-meta-val" id="trelloMetaPrio">Crítica</span>
            </div>
            <div class="trello-meta-row">
              <span class="trello-meta-label">Impacto:</span>
              <span class="trello-meta-val" id="trelloMetaImpact">Cancelamento</span>
            </div>
            <div class="trello-meta-row">
              <span class="trello-meta-label">Sistema:</span>
              <span class="trello-meta-val" id="trelloMetaSystem">Magis5 / Shopee</span>
            </div>
            <div class="trello-meta-row">
              <span class="trello-meta-label">SLA:</span>
              <span class="trello-meta-val" id="trelloMetaSla" style="color: var(--accent-rose);">D-0 Imediato</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  </div>
`;

// Insert Modal HTML before </body>
html = html.replace('</body>', trelloModalHTML + '\n</body>');

// 3. Update the tasks database with full detailed SKUs and action items
const detailedTasksData = `
    // =========================================================================
    // BASE DE DADOS COMPLETA DAS 10 TAREFAS (COM SKUS, IMPACTOS E COMANDOS)
    // =========================================================================
    const KANBAN_TASKS_DATA = [
      {
        id: 'task-p1',
        title: 'P1. Alterar DTS de 2 para 9 dias nas 8 Camisas',
        icon: '🚨',
        desc: 'Esses 8 produtos não possuem o sufixo <code>_FULL</code> no SKU (são camisas sob encomenda na confecção), mas estão cadastrados na Shopee com Prazo de Envio (DTS) de <strong>2 dias</strong> (pronta entrega). Se venderem, a fábrica não consegue postar em 48h, gerando cancelamento automático pelo robô da Shopee e perda da medalha de Vendedor Indicado.',
        phase: 'Fase 1: Risco & Categorias',
        phaseTab: 'fase1',
        priority: 'critico',
        priorityLabel: 'Crítico',
        metric: '8 SKUs em Risco',
        impact: 'Cancelamento em 48h',
        system: 'Magis5 / Seller Center',
        sla: 'Imediato (D-0)',
        defaultCol: 'todo',
        skus: [
          { sku: 'C02846BL', name: 'Camisa Feminina BRK Apache Cavalos UV50+ Manga Longa Agro', detail: 'Mudar DTS de 2 dias para 9 dias', shopeeId: '45568052144' },
          { sku: 'C02830', name: 'Camisa Agro BRK São Bento Medalhão Masculina UV50+', detail: 'Mudar DTS de 2 dias para 9 dias', shopeeId: '48968043509' },
          { sku: 'C02824', name: 'Camisa Brk São Bento Anjos Preta Masculina UV50+', detail: 'Mudar DTS de 2 dias para 9 dias', shopeeId: '56918014401' },
          { sku: 'CMB05', name: 'Camisa de Botão Profissional com 2 Bolsos BRK', detail: 'Mudar DTS de 2 dias para 9 dias', shopeeId: '58215961381' },
          { sku: 'CMB07', name: 'Camisa de Botão Masculina Cinza Ártico Manga Longa BRK', detail: 'Mudar DTS de 2 dias para 9 dias', shopeeId: '22799657047' },
          { sku: 'CMB09', name: 'Camisa de Botão Masculina Trabalho Verde Jaleco Manga Longa', detail: 'Mudar DTS de 2 dias para 9 dias', shopeeId: '58215996505' },
          { sku: 'CMB010', name: 'Camisa de Botão Masculina Manga Longa BRK Azul Escuro', detail: 'Mudar DTS de 2 dias para 9 dias', shopeeId: '58215995869' },
          { sku: '27622333', name: 'Camisa Térmica Segunda Pele Viagem de Moto BRK Branca', detail: 'Mudar DTS de 2 dias para 9 dias', shopeeId: '22698219010' }
        ]
      },
      {
        id: 'task-p2',
        title: 'P2. Migrar os 12 Produtos Presos na Categoria "Outros"',
        icon: '⚠️',
        desc: 'Anúncios cadastrados na categoria "Outros" sofrem severa desindexação orgânica na Shopee: não aparecem nos filtros laterais de gênero, tamanho ou tecido. O caso mais grave identificado pela auditoria é a <strong>Fita de Proteção de Dedos (FT-GREEN)</strong>, classificada erroneamente em <em>Mãe e Bebê > Brinquedos</em>.',
        phase: 'Fase 1: Risco & Categorias',
        phaseTab: 'fase1',
        priority: 'alto',
        priorityLabel: 'Alto',
        metric: '12 SKUs Desindexados',
        impact: 'Desindexação de Busca',
        system: 'Seller Center / Magis5',
        sla: 'Dia 1 (D-1)',
        defaultCol: 'todo',
        skus: [
          { sku: 'FT-GREEN', name: 'Fita para Proteção de Dedos 2,5cm FT-Slim', detail: 'Atual: Mãe e Bebê > Brinquedos ➔ Nova: Esportes > Pescaria > Acessórios' },
          { sku: 'MT055_FULL', name: 'Protetor de Braço Manguito Térmico BRK Agro', detail: 'Atual: Esportes > Outros ➔ Nova: Acessórios de Moda > Luvas e Manguitos' },
          { sku: 'EVASELVACREPE', name: 'Chinelo Babuche Ortopédica Boaonda Adventure', detail: 'Atual: Esportes > Calçados > Outros ➔ Nova: Sapatos Masculinos > Chinelos' },
          { sku: '51RASACP8', name: 'Alicate de Pesca Rapala Marine 8"', detail: 'Atual: Esportes > Pescaria > Outros ➔ Nova: Esportes > Pescaria > Ferramentas' },
          { sku: 'GIRA', name: 'Girador com Snap Niquelado de Pesca', detail: 'Atual: Esportes > Pescaria > Outros ➔ Nova: Esportes > Pescaria > Anzóis e Snaps' },
          { sku: 'ISCA-MEGABASS', name: 'Isca Artificial de Meia Água BRK Pro', detail: 'Atual: Esportes > Outros ➔ Nova: Esportes > Pescaria > Iscas Artificiais' },
          { sku: 'LUV-PRO-01', name: 'Luva de Pesca com Proteção Solar UV50+', detail: 'Atual: Roupas > Outros ➔ Nova: Acessórios de Moda > Luvas' },
          { sku: 'BAND-MULTI', name: 'Bandana Tubeneck Multifuncional Agro', detail: 'Atual: Esportes > Outros ➔ Nova: Acessórios de Moda > Bandanas' },
          { sku: 'BON-TRUCK-01', name: 'Boné BRK Fishing Trucker com Tela', detail: 'Atual: Esportes > Outros ➔ Nova: Acessórios de Moda > Bonés' },
          { sku: 'FAC-FILET-7', name: 'Faca para Filetar Peixe Inox Marine 7"', detail: 'Atual: Casa > Outros ➔ Nova: Esportes > Pescaria > Ferramentas' },
          { sku: 'CARRET-VENT', name: 'Carretilha de Pesca Perfil Baixo 10 Rol.', detail: 'Atual: Esportes > Outros ➔ Nova: Esportes > Pescaria > Molinetes e Carretilhas' },
          { sku: 'OCUL-POLAR-01', name: 'Óculos de Sol Polarizado UV400 BRK', detail: 'Atual: Esportes > Outros ➔ Nova: Acessórios de Moda > Óculos de Sol' }
        ]
      },
      {
        id: 'task-p3',
        title: 'P3. Injetar Ficha Técnica via Agente 5 nos 140 Produtos Vazios',
        icon: '⚡',
        desc: 'A varredura ao vivo na Shopee revelou que 247 anúncios (63,8%) já possuem atributos. Vamos rodar a automação do Agente 5 focada <strong>exclusivamente nos 140 itens vazios</strong>, preenchendo os atributos obrigatórios que concedem selo de qualidade cadastral.',
        phase: 'Fase 2: Ficha Técnica & Tamanho',
        phaseTab: 'fase2',
        priority: 'alto',
        priorityLabel: 'Alto',
        metric: '140 Fichas Vazias',
        impact: 'Algoritmo de Busca',
        system: 'Agente 5 (RPA)',
        sla: 'Dias 2 a 4',
        command: 'node agent5-shopee-attributes/src/runner.mjs --file uploads/Relatorio_Diagnostico_Produtos_Ativos_Shopee_AoVivo.xlsx',
        defaultCol: 'in-progress',
        skus: [
          { sku: 'ATRIB-01', name: 'Material do Tecido', detail: 'Injetar: XTech-Pro Poliéster Inteligente de Secagem Rápida' },
          { sku: 'ATRIB-02', name: 'Gênero e Caimento', detail: 'Injetar: Masculino / Feminino / Unissex conforme título' },
          { sku: 'ATRIB-03', name: 'Comprimento da Manga', detail: 'Injetar: Manga Longa' },
          { sku: 'ATRIB-04', name: 'Tipo de Gola', detail: 'Injetar: Gola Padre com Zíper / Gola Redonda' },
          { sku: 'ATRIB-05', name: 'Fator de Proteção Solar', detail: 'Injetar: Proteção UV FPU 50+ Certificada' },
          { sku: 'ATRIB-06', name: 'Preservação de Atributos', detail: 'Ignorar os 247 produtos já preenchidos para não sobrescrever' }
        ]
      },
      {
        id: 'task-p4',
        title: 'P4. Vincular Tabela de Medidas na Linha Infantil e Calçados',
        icon: '📏',
        desc: 'A auditoria comprovou que os anúncios da linha infantil (ex: <code>CI061_FULL</code>) e calçados adventure estão sem imagem oficial no campo <em>Imagem de Tamanhos</em>, o que gera insegurança de compra e taxa de devolução elevada.',
        phase: 'Fase 2: Ficha Técnica & Tamanho',
        phaseTab: 'fase2',
        priority: 'medio',
        priorityLabel: 'Médio',
        metric: '18 Anúncios',
        impact: 'Redução Devoluções',
        system: 'Seller Center / Magis5',
        sla: 'Dia 4',
        command: 'Link Oficial: https://cf.shopee.com.br/file/br-11134201-820ld-mrj4uj3gfwudfb',
        defaultCol: 'todo',
        skus: [
          { sku: 'CI061_FULL', name: 'Camisa Infantil Manga Longa UV50+ BRK Tucunaré Azul', detail: 'Vincular imagem de medidas infantil na galeria' },
          { sku: 'CI062_FULL', name: 'Camisa Infantil Manga Longa UV50+ BRK Dourado Rio', detail: 'Vincular imagem de medidas infantil na galeria' },
          { sku: 'CI063_FULL', name: 'Camisa Infantil Manga Longa UV50+ BRK Agro Menina Flor', detail: 'Vincular imagem de medidas infantil na galeria' },
          { sku: 'CI064_FULL', name: 'Camisa Infantil Manga Longa BRK Camuflada Militar', detail: 'Vincular imagem de medidas infantil na galeria' },
          { sku: 'BOAONDA-GRADE', name: 'Grade de Calçados Babuche Ortopédico (14 SKUs)', detail: 'Inserir tabela de conversão em centímetros (cm)' }
        ]
      },
      {
        id: 'task-p5',
        title: 'P5. Preservar os 24 Produtos na Cor #D8E4BC (Recém Otimizados)',
        icon: '🛡️',
        desc: 'Estes 24 anúncios (ex: <code>C0796_FULL</code>, <code>ADV137_FULL</code>) foram recentemente atualizados pela equipe interna. A regra de ouro é: <strong>não alterar títulos nem categorias</strong> nestes anúncios para permitir que o algoritmo consolide a entrega orgânica.',
        phase: 'Fase 2: Ficha Técnica & Tamanho',
        phaseTab: 'fase2',
        priority: 'medio',
        priorityLabel: 'Monitoramento',
        metric: '24 SKUs Seguros',
        impact: 'Entrega Orgânica',
        system: 'Automação (Trava)',
        sla: 'Contínuo',
        defaultCol: 'done',
        skus: [
          { sku: 'C0796_FULL', name: 'Camisa BRK Agro Trator Colheitadeira UV50+', detail: 'Travar edição automática de título e categoria' },
          { sku: 'ADV137_FULL', name: 'Camisa de Pesca Tucunaré Alta Performance', detail: 'Travar edição automática de título e categoria' },
          { sku: 'MONIT-14D', name: 'Monitorar visitas e conversão na Shopee por 14 dias', detail: 'Verificar consolidação de impressões sem oscilação' }
        ]
      },
      {
        id: 'task-p6',
        title: 'P6. Ativar Cupom de Desconto de Loja para Fechamento de Carrinho',
        icon: '🎟️',
        desc: 'Existem 90 produtos com alto volume de carrinhos acumulados na loja da BRK. Criar um cupom estratégico de fechamento: <strong>R$ 10 OFF para compras acima de R$ 180</strong> (estimulando o cliente a comprar 2 camisas).',
        phase: 'Fase 3: Conversão & Carrinho',
        phaseTab: 'fase3',
        priority: 'medio',
        priorityLabel: 'Médio',
        metric: '90 Carrinhos',
        impact: 'Conversão Imediata',
        system: 'Central de Marketing',
        sla: 'Dia 5',
        defaultCol: 'todo',
        skus: [
          { sku: 'CUPOM-10', name: 'Criar Cupom de Loja R$ 10 OFF para compras acima de R$ 180', detail: 'Central de Marketing > Cupons da Loja' },
          { sku: 'CUPOM-SEGUIDOR', name: 'Criar Cupom de Seguidor R$ 5 OFF para novos seguidores', detail: 'Gatilho de entrada para novos visitantes' },
          { sku: 'VAL-30D', name: 'Configurar validade de 30 dias com cota de 500 resgates', detail: 'Garantir orçamento controlado de marketing' }
        ]
      },
      {
        id: 'task-p7',
        title: 'P7. Configurar Combo "Leve Mais por Menos"',
        icon: '🏷️',
        desc: 'Configurar promoção de desconto progressivo para produtos da mesma categoria: <em>Compre 2 com 5% de desconto</em> ou <em>Compre 3 com 10% de desconto</em>. A Shopee insere o selo laranja em destaque nas listagens, aumentando o CTR.',
        phase: 'Fase 3: Conversão & Carrinho',
        phaseTab: 'fase3',
        priority: 'normal',
        priorityLabel: 'Normal',
        metric: 'Ticket Médio',
        impact: 'Aumento de Ticket',
        system: 'Central de Marketing',
        sla: 'Dia 6',
        defaultCol: 'todo',
        skus: [
          { sku: 'COMBO-PESCA', name: 'Combo Camisas de Pesca Masculina e Feminina', detail: 'Regra: Compre 2 Camisas ganhe 5% OFF' },
          { sku: 'COMBO-AGRO', name: 'Combo Linha Camisas Agro & Trabalho', detail: 'Regra: Compre 3 Camisas ganhe 10% OFF' },
          { sku: 'SELO-FEED', name: 'Validar exibição do selo laranja nos anúncios', detail: 'Conferir na busca da Shopee se o selo está ativo' }
        ]
      },
      {
        id: 'task-p8',
        title: 'P8. Automação de Disparo de Chat para Carrinhos Abandonados',
        icon: '💬',
        desc: 'Habilitar no Assistente de Chat da Shopee o envio automatizado de mensagem para compradores que deixaram itens no carrinho nas últimas 24 horas, oferecendo um cupom relâmpago de 5%.',
        phase: 'Fase 3: Conversão & Carrinho',
        phaseTab: 'fase3',
        priority: 'normal',
        priorityLabel: 'Normal',
        metric: 'Assistente Chat',
        impact: 'Recuperação 24h',
        system: 'Shopee Chat Web',
        sla: 'Dia 7',
        defaultCol: 'todo',
        skus: [
          { sku: 'CHAT-AUT-01', name: 'Habilitar Mensagem Automática de Carrinho no Assistente de Chat', detail: 'Shopee Seller Center > Assistente de Chat' },
          { sku: 'CHAT-AUT-02', name: 'Configurar texto persuasivo com cupom relâmpago de 5%', detail: 'Gatilho de urgência: válido apenas hoje' },
          { sku: 'CHAT-TEST', name: 'Testar disparo para verificar entregabilidade no aplicativo', detail: 'Confirmar recebimento de push notification no celular' }
        ]
      },
      {
        id: 'task-p9',
        title: 'P9. Decisão sobre os 99 Produtos com Estoque 0 (Esgotados)',
        icon: '📦',
        desc: 'Conforme a regra estabelecida, estes 99 itens não receberam alerta cadastral porque a falta de venda decorre unicamente de estoque zerado. Alinhar com PCP se haverá lote fabril ou se os anúncios devem ser pausados.',
        phase: 'Fase 4: Gestão de Ruptura',
        phaseTab: 'fase4',
        priority: 'normal',
        priorityLabel: 'Planejado',
        metric: '99 SKUs Esgotados',
        impact: 'Tráfego Fantasma',
        system: 'PCP / Sankhya ERP',
        sla: 'Semanal',
        defaultCol: 'todo',
        skus: [
          { sku: 'PCP-ALINHAMENTO', name: 'Exportar lista dos 99 SKUs com estoque zero para o PCP', detail: 'Verificar se tecidos e moldes estão na fila de corte' },
          { sku: 'PAUSA-ANUNCIO', name: 'Pausar anúncios de modelos descontinuados definitivamente', detail: 'Evitar visitas perdidas e reclamações no chat' },
          { sku: 'SINCRONIZA-ERP', name: 'Sincronizar saldo de estoque Sankhya via Magis5', detail: 'Garantir que novos cortes atualizem a Shopee' }
        ]
      },
      {
        id: 'task-p10',
        title: 'P10. Auditoria Semanal de Ruptura nos Tamanhos Centrais M e G',
        icon: '📊',
        desc: 'Conferir semanalmente se as camisas campeãs de visitação não estão com os tamanhos M e G esgotados. Quando os tamanhos centrais zeram, a taxa de conversão do anúncio cai mais de 60%.',
        phase: 'Fase 4: Gestão de Ruptura',
        phaseTab: 'fase4',
        priority: 'normal',
        priorityLabel: 'Semanal',
        metric: 'Grade 70%',
        impact: 'Conversão de Grade',
        system: 'Magis5 / Estoque',
        sla: 'Toda Segunda',
        defaultCol: 'todo',
        skus: [
          { sku: 'AUDIT-GRADE-01', name: 'Conferir os 10 anúncios mais vendidos da BRK', detail: 'Mínimo de 15 peças de grade M e G em estoque' },
          { sku: 'AUDIT-GRADE-02', name: 'Emitir ordem de corte emergencial se M/G estiver abaixo de 5 un.', detail: 'Priorizar reposição rápida dos carros-chefe' },
          { sku: 'ALERTA-ROUTINE', name: 'Definir rotina de checagem toda segunda-feira às 08h30', detail: 'Adicionar checklist operacional com a equipe' }
        ]
      }
    ];
`;

// Replace the old KANBAN_TASKS_DATA array with detailedTasksData
const oldTaskRegex = /const KANBAN_TASKS_DATA = \[[\s\S]*?\];/;
html = html.replace(oldTaskRegex, detailedTasksData);

// 4. Modal functions and handlers in JS
const trelloModalJS = `
    // =========================================================================
    // MODAL POPUP ESTILO TRELLO (DETALHES, CHECKLIST DE SKUS E AÇÕES)
    // =========================================================================
    let currentModalTaskId = null;

    function openTaskModal(taskId) {
      const task = KANBAN_TASKS_DATA.find(t => t.id === taskId);
      if (!task) return;

      currentModalTaskId = taskId;
      const currentCol = kanbanState[taskId] || task.defaultCol;
      const colLabels = { 'todo': 'A Fazer', 'in-progress': 'Em Andamento', 'review': 'Em Validação', 'done': 'Concluído' };

      // Set Header info
      document.getElementById('trelloModalIcon').textContent = task.icon || '📌';
      document.getElementById('trelloModalTitle').textContent = task.title;
      document.getElementById('trelloModalCol').textContent = colLabels[currentCol] || currentCol;
      document.getElementById('trelloModalPhase').textContent = task.phase;

      // Priority pill
      const prioEl = document.getElementById('trelloModalPrio');
      prioEl.className = 'kanban-priority-pill prio-' + task.priority;
      prioEl.textContent = task.priorityLabel;

      // Description
      document.getElementById('trelloModalDesc').innerHTML = task.desc;

      // Metadata sidebar
      document.getElementById('trelloMetaPrio').textContent = task.priorityLabel;
      document.getElementById('trelloMetaImpact').textContent = task.impact || 'Otimização';
      document.getElementById('trelloMetaSystem').textContent = task.system || 'Seller Center';
      document.getElementById('trelloMetaSla').textContent = task.sla || 'Padrão';

      // RPA Command
      const cmdSection = document.getElementById('trelloCommandSection');
      if (task.command) {
        cmdSection.style.display = 'block';
        document.getElementById('trelloCommandCode').textContent = task.command;
      } else {
        cmdSection.style.display = 'none';
      }

      // Load saved notes
      const savedNotes = localStorage.getItem('brk_task_notes_' + taskId) || '';
      document.getElementById('trelloNotesInput').value = savedNotes;

      // Update sidebar move active buttons
      updateModalMoveButtons(currentCol);

      // Render Checklist
      renderTrelloChecklist(task);

      // Open Modal Backdrop
      const backdrop = document.getElementById('trelloModalBackdrop');
      backdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeTrelloModal() {
      const backdrop = document.getElementById('trelloModalBackdrop');
      if (backdrop) backdrop.classList.remove('active');
      document.body.style.overflow = '';
      currentModalTaskId = null;
    }

    function handleBackdropClick(e) {
      if (e.target.id === 'trelloModalBackdrop') {
        closeTrelloModal();
      }
    }

    // Keyboard ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeTrelloModal();
    });

    function renderTrelloChecklist(task) {
      const container = document.getElementById('trelloChecklistContainer');
      container.innerHTML = '';

      const items = task.skus || [];
      const savedChecks = JSON.parse(localStorage.getItem('brk_checklist_state') || '{}');

      let checkedCount = 0;

      items.forEach((item, idx) => {
        const itemKey = task.id + '_chk_' + idx;
        const isChecked = !!savedChecks[itemKey];
        if (isChecked) checkedCount++;

        const row = document.createElement('div');
        row.className = 'trello-check-item' + (isChecked ? ' done' : '');
        row.id = 'trello_row_' + itemKey;

        row.innerHTML = \`
          <input type="checkbox" class="trello-custom-cb" id="\${itemKey}" \${isChecked ? 'checked' : ''} onchange="toggleChecklistItem('\${task.id}', '\${itemKey}')">
          <div class="trello-item-content">
            <div class="trello-item-sku-row">
              <span class="trello-sku-badge">\${item.sku}</span>
              <button class="trello-btn-copy-mini" onclick="copyText('\${item.sku}')" title="Copiar SKU">📋</button>
              \${item.shopeeId ? \`<span style="font-size:11px; color:var(--text-dim);">ID: \${item.shopeeId}</span>\` : ''}
              <span class="trello-item-name">\${item.name}</span>
            </div>
            <div class="trello-item-action">\${item.detail}</div>
          </div>
        \`;

        container.appendChild(row);
      });

      updateChecklistProgress(checkedCount, items.length);
    }

    function toggleChecklistItem(taskId, itemKey) {
      const cb = document.getElementById(itemKey);
      const isChecked = cb ? cb.checked : false;

      const savedChecks = JSON.parse(localStorage.getItem('brk_checklist_state') || '{}');
      savedChecks[itemKey] = isChecked;
      localStorage.setItem('brk_checklist_state', JSON.stringify(savedChecks));

      const row = document.getElementById('trello_row_' + itemKey);
      if (row) {
        if (isChecked) row.classList.add('done');
        else row.classList.remove('done');
      }

      // Re-calculate progress
      const task = KANBAN_TASKS_DATA.find(t => t.id === taskId);
      if (task && task.skus) {
        let count = 0;
        task.skus.forEach((_, idx) => {
          if (savedChecks[taskId + '_chk_' + idx]) count++;
        });
        updateChecklistProgress(count, task.skus.length);

        // If 100% of SKUs checked and not in done column, offer / auto move
        if (count === task.skus.length && count > 0) {
          showToast('🎉 Todos os SKUs da tarefa concluídos!');
        }
      }
    }

    function toggleAllChecklist(setAllChecked) {
      if (!currentModalTaskId) return;
      const task = KANBAN_TASKS_DATA.find(t => t.id === currentModalTaskId);
      if (!task || !task.skus) return;

      const savedChecks = JSON.parse(localStorage.getItem('brk_checklist_state') || '{}');
      task.skus.forEach((_, idx) => {
        const itemKey = task.id + '_chk_' + idx;
        savedChecks[itemKey] = setAllChecked;
        const cb = document.getElementById(itemKey);
        if (cb) cb.checked = setAllChecked;
        const row = document.getElementById('trello_row_' + itemKey);
        if (row) {
          if (setAllChecked) row.classList.add('done');
          else row.classList.remove('done');
        }
      });

      localStorage.setItem('brk_checklist_state', JSON.stringify(savedChecks));
      updateChecklistProgress(setAllChecked ? task.skus.length : 0, task.skus.length);
      showToast(setAllChecked ? '✅ Todos os itens marcados' : '⬜ Itens desmarcados');
    }

    function updateChecklistProgress(checked, total) {
      const ratioEl = document.getElementById('trelloChecklistRatio');
      const pctEl = document.getElementById('trelloProgressPct');
      const barFill = document.getElementById('trelloProgressBarFill');

      if (total === 0) {
        ratioEl.textContent = '0/0';
        pctEl.textContent = '0%';
        barFill.style.width = '0%';
        return;
      }

      const pct = Math.round((checked / total) * 100);
      ratioEl.textContent = checked + '/' + total;
      pctEl.textContent = pct + '%';
      barFill.style.width = pct + '%';
    }

    function updateModalMoveButtons(currentCol) {
      COLUMNS.forEach(col => {
        const btn = document.querySelector(\`#trelloMoveGroup button[data-col="\${col}"]\`);
        if (btn) {
          if (col === currentCol) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      });
    }

    function moveCurrentCard(targetCol) {
      if (!currentModalTaskId) return;
      setTaskColumn(currentModalTaskId, targetCol);
      updateModalMoveButtons(targetCol);

      const colLabels = { 'todo': 'A Fazer', 'in-progress': 'Em Andamento', 'review': 'Em Validação', 'done': 'Concluído' };
      document.getElementById('trelloModalCol').textContent = colLabels[targetCol] || targetCol;
    }

    function copyCurrentTaskSkus() {
      if (!currentModalTaskId) return;
      const task = KANBAN_TASKS_DATA.find(t => t.id === currentModalTaskId);
      if (!task || !task.skus) return;
      const skuList = task.skus.map(s => s.sku).filter(Boolean);
      copySkus(skuList);
    }

    function copyCurrentTaskCommand() {
      if (!currentModalTaskId) return;
      const task = KANBAN_TASKS_DATA.find(t => t.id === currentModalTaskId);
      if (task && task.command) {
        copyText(task.command);
      }
    }

    function saveTrelloNote() {
      if (!currentModalTaskId) return;
      const note = document.getElementById('trelloNotesInput').value.trim();
      localStorage.setItem('brk_task_notes_' + currentModalTaskId, note);
      showToast('💾 Anotação salva com sucesso!');
    }

    function jumpFromModalToTable() {
      if (!currentModalTaskId) return;
      const task = KANBAN_TASKS_DATA.find(t => t.id === currentModalTaskId);
      closeTrelloModal();
      if (task) {
        jumpToTask(task.id, task.phaseTab);
      }
    }
`;

// Replace `btn-card-details` in `createCardElement` to open the modal!
html = html.replace(
  `button class="btn-card-details" onclick="jumpToTask('\${task.id}', '\${task.phaseTab}')"`,
  `button class="btn-card-details" onclick="openTaskModal('\${task.id}')"`
);

// In the Urgent Hero section, also add `openTaskModal` calls
html = html.replace(`onclick="jumpToTask('task-p1', 'fase1')"`, `onclick="openTaskModal('task-p1')"`);
html = html.replace(`onclick="jumpToTask('task-p2', 'fase1')"`, `onclick="openTaskModal('task-p2')"`);
html = html.replace(`onclick="jumpToTask('task-p3', 'fase2')"`, `onclick="openTaskModal('task-p3')"`);

// Append trelloModalJS inside the script block
html = html.replace('window.addEventListener(\'DOMContentLoaded\', () => {', trelloModalJS + '\n    window.addEventListener(\'DOMContentLoaded\', () => {');

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✅ roadmap_shopee_brk.html successfully enhanced with Trello-style modal, SKU checklists, and persistence!');
