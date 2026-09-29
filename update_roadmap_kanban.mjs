import fs from 'node:fs';
import path from 'node:path';

const htmlPath = path.resolve('roadmap_shopee_brk.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Extra CSS for Urgent Hero & Kanban Board
const additionalCSS = `
    /* ==========================================================================
       URGENT TASKS HERO & KANBAN BOARD STYLES
       ========================================================================== */

    /* Pulse animation */
    @keyframes pulseGlow {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(0.92); }
    }

    @keyframes borderPulse {
      0%, 100% { border-color: rgba(244, 63, 94, 0.4); box-shadow: 0 0 15px rgba(244, 63, 94, 0.15); }
      50% { border-color: rgba(244, 63, 94, 0.7); box-shadow: 0 0 25px rgba(244, 63, 94, 0.3); }
    }

    /* Urgent Tasks Top Hero */
    .urgent-hero {
      background: linear-gradient(135deg, rgba(244, 63, 94, 0.14) 0%, rgba(245, 158, 11, 0.08) 50%, rgba(16, 22, 38, 0.85) 100%);
      border: 1px solid rgba(244, 63, 94, 0.35);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 32px;
      position: relative;
      overflow: hidden;
      animation: borderPulse 4s infinite ease-in-out;
      backdrop-filter: blur(14px);
    }

    .urgent-hero-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .urgent-title-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .urgent-badge-live {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(244, 63, 94, 0.2);
      border: 1px solid rgba(244, 63, 94, 0.5);
      color: #fb7185;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-rose);
      box-shadow: 0 0 8px var(--accent-rose);
      animation: pulseGlow 1.6s infinite ease-in-out;
    }

    .urgent-title {
      font-family: 'Outfit', sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .urgent-subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .urgent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }

    .urgent-card {
      background: var(--bg-card);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
      transition: var(--transition);
      position: relative;
    }

    .urgent-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    }

    .urgent-card.p1 {
      border-left: 4px solid var(--accent-rose);
      background: linear-gradient(180deg, rgba(244, 63, 94, 0.08) 0%, rgba(22, 30, 49, 0.7) 100%);
    }

    .urgent-card.p2 {
      border-left: 4px solid var(--accent-amber);
      background: linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(22, 30, 49, 0.7) 100%);
    }

    .urgent-card.p3 {
      border-left: 4px solid var(--accent-cyan);
      background: linear-gradient(180deg, rgba(6, 182, 212, 0.08) 0%, rgba(22, 30, 49, 0.7) 100%);
    }

    .urgent-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }

    .urgent-card-tag {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      text-transform: uppercase;
    }

    .tag-rose { background: rgba(244, 63, 94, 0.2); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.3); }
    .tag-amber { background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.3); }
    .tag-cyan { background: rgba(6, 182, 212, 0.2); color: #67e8f9; border: 1px solid rgba(6, 182, 212, 0.3); }

    .urgent-card-sku-count {
      font-size: 11px;
      color: var(--text-dim);
      font-weight: 600;
    }

    .urgent-card-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-main);
      margin-top: 6px;
      line-height: 1.35;
    }

    .urgent-card-desc {
      font-size: 12.5px;
      color: var(--text-muted);
      line-height: 1.45;
      margin-top: 4px;
    }

    .urgent-card-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }

    .chip-sku {
      font-family: monospace;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-main);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .urgent-card-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: auto;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .btn-urgent-action {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: var(--transition);
      text-decoration: none;
    }

    .btn-urgent-action:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.25);
    }

    .btn-urgent-action.primary {
      background: var(--accent-rose);
      color: #fff;
      border-color: transparent;
    }

    .btn-urgent-action.primary:hover {
      background: #e11d48;
      box-shadow: 0 2px 10px rgba(244, 63, 94, 0.35);
    }

    .btn-urgent-action.warning {
      background: var(--accent-amber);
      color: #000;
      font-weight: 700;
      border-color: transparent;
    }

    .btn-urgent-action.warning:hover {
      background: #fbbf24;
      box-shadow: 0 2px 10px rgba(245, 158, 11, 0.35);
    }

    .btn-urgent-action.cyan {
      background: var(--accent-cyan);
      color: #000;
      font-weight: 700;
      border-color: transparent;
    }

    .btn-urgent-action.cyan:hover {
      background: #22d3ee;
      box-shadow: 0 2px 10px rgba(6, 182, 212, 0.35);
    }

    /* View Switcher Bar */
    .view-switcher-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 24px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      padding: 12px 18px;
      border-radius: var(--radius);
      backdrop-filter: blur(10px);
    }

    .view-modes-group {
      display: flex;
      gap: 8px;
      background: rgba(0, 0, 0, 0.3);
      padding: 4px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .view-mode-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: var(--transition);
    }

    .view-mode-btn:hover {
      color: var(--text-main);
    }

    .view-mode-btn.active {
      background: var(--bg-card);
      color: var(--text-main);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .kanban-filter-group {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .kanban-search-input {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 7px 12px;
      color: var(--text-main);
      font-size: 12.5px;
      outline: none;
      width: 180px;
      transition: var(--transition);
    }

    .kanban-search-input:focus {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.2);
    }

    .filter-select {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 7px 12px;
      color: var(--text-main);
      font-size: 12.5px;
      outline: none;
      cursor: pointer;
    }

    /* Kanban Board Container */
    .kanban-view-container {
      display: block;
      margin-bottom: 40px;
      animation: fadeIn 0.3s ease;
    }

    .kanban-board {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      align-items: start;
    }

    @media (max-width: 1100px) {
      .kanban-board {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 640px) {
      .kanban-board {
        grid-template-columns: 1fr;
      }
    }

    .kanban-column {
      background: rgba(16, 22, 38, 0.65);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      min-height: 520px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      backdrop-filter: blur(10px);
      transition: var(--transition);
    }

    .kanban-column-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 10px;
      border-bottom: 2px solid rgba(255, 255, 255, 0.06);
    }

    .col-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .col-icon {
      font-size: 16px;
    }

    .col-title {
      font-family: 'Outfit', sans-serif;
      font-size: 15px;
      font-weight: 700;
      color: var(--text-main);
    }

    .col-count {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-muted);
    }

    /* Colored accents for columns */
    .col-todo { border-top: 3px solid #94a3b8; }
    .col-progress { border-top: 3px solid var(--accent-cyan); }
    .col-review { border-top: 3px solid var(--accent-amber); }
    .col-done { border-top: 3px solid var(--accent-emerald); }

    .col-progress .col-count { background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); }
    .col-review .col-count { background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); }
    .col-done .col-count { background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); }

    .kanban-cards-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 420px;
      padding: 4px;
      border-radius: 8px;
      transition: background 0.2s, border 0.2s;
    }

    .kanban-cards-area.drag-over {
      background: rgba(255, 255, 255, 0.04);
      outline: 2px dashed rgba(6, 182, 212, 0.5);
      outline-offset: -2px;
      border-radius: 10px;
    }

    /* Kanban Card */
    .kanban-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      cursor: grab;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s, border-color 0.2s;
      display: flex;
      flex-direction: column;
      gap: 8px;
      user-select: none;
      position: relative;
    }

    .kanban-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.18);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
    }

    .kanban-card:active {
      cursor: grabbing;
    }

    .kanban-card.dragging {
      opacity: 0.45;
      transform: scale(0.96);
    }

    .kanban-card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }

    .kanban-priority-pill {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .prio-critico { background: rgba(244, 63, 94, 0.25); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.4); }
    .prio-alto { background: rgba(245, 158, 11, 0.25); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.4); }
    .prio-medio { background: rgba(6, 182, 212, 0.2); color: #67e8f9; border: 1px solid rgba(6, 182, 212, 0.3); }
    .prio-normal { background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2); }

    .kanban-phase-tag {
      font-size: 10.5px;
      color: var(--text-dim);
      font-weight: 600;
    }

    .kanban-card-title {
      font-size: 13.5px;
      font-weight: 700;
      color: var(--text-main);
      line-height: 1.35;
    }

    .kanban-card-desc {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .kanban-card-metric {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 2px 7px;
      border-radius: 4px;
      color: var(--accent-emerald);
      align-self: flex-start;
    }

    .kanban-card-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
    }

    .kanban-card-nav-controls {
      display: flex;
      gap: 4px;
    }

    .btn-col-move {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 11px;
      transition: var(--transition);
    }

    .btn-col-move:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.15);
      color: var(--text-main);
    }

    .btn-col-move:disabled {
      opacity: 0.25;
      cursor: not-allowed;
    }

    .btn-card-details {
      background: transparent;
      border: none;
      color: var(--accent-cyan);
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      text-decoration: none;
    }

    .btn-card-details:hover {
      text-decoration: underline;
    }

    /* Toast notification */
    #kanbanToast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--bg-surface);
      border: 1px solid var(--accent-emerald);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
      color: var(--text-main);
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 9999;
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    #kanbanToast.show {
      transform: translateY(0);
      opacity: 1;
    }
`;

// Insert the new CSS right before </style>
html = html.replace('</style>', additionalCSS + '\n  </style>');

// 2. Prepare Urgent Tasks Hero HTML
const urgentHeroHTML = `
    <!-- ==================== TAREFAS MAIS URGENTES (TOPO DA TELA) ==================== -->
    <section class="urgent-hero" id="urgentHeroSection">
      <div class="urgent-hero-header">
        <div class="urgent-title-wrap">
          <span class="urgent-badge-live">
            <span class="pulse-dot"></span>
            Ação Imediata D-0
          </span>
          <div>
            <h2 class="urgent-title">🔥 Tarefas Mais Urgentes (Impacto Imediato na Shopee)</h2>
            <p class="urgent-subtitle">Itens com risco de cancelamento automático, perda de medalha ou bloqueio de tráfego orgânico.</p>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="btn-urgent-action" onclick="copyAllUrgentSkus()" title="Copiar todos os SKUs de risco para colar no Seller Center">
            📋 Copiar SKUs Críticos
          </button>
        </div>
      </div>

      <div class="urgent-grid">
        <!-- Urgent Card 1: DTS 2 dias -->
        <div class="urgent-card p1">
          <div>
            <div class="urgent-card-header">
              <span class="urgent-card-tag tag-rose">🚨 P1 • Crítico</span>
              <span class="urgent-card-sku-count">8 SKUs em Risco</span>
            </div>
            <h3 class="urgent-card-title">Alterar DTS de 2 para 9 dias nas 8 Camisas BRK</h3>
            <p class="urgent-card-desc">
              Camisas sob encomenda configuradas como pronta entrega (2 dias). Se venderem, a expedição não entrega em 48h gerando cancelamento automático e perda de medalha.
            </p>
            <div class="urgent-card-chips">
              <span class="chip-sku">C02846BL</span>
              <span class="chip-sku">C02830</span>
              <span class="chip-sku">C02824</span>
              <span class="chip-sku">CMB05</span>
              <span class="chip-sku">CMB07</span>
              <span class="chip-sku">CMB09</span>
              <span class="chip-sku">CMB010</span>
              <span class="chip-sku">27622333</span>
            </div>
          </div>
          <div class="urgent-card-actions">
            <button class="btn-urgent-action primary" onclick="copySkus(['C02846BL','C02830','C02824','CMB05','CMB07','CMB09','CMB010','27622333'])">
              📋 Copiar 8 SKUs
            </button>
            <button class="btn-urgent-action" onclick="jumpToTask('task-p1', 'fase1')">
              🔍 Ver Tabela & IDs Shopee ➔
            </button>
          </div>
        </div>

        <!-- Urgent Card 2: Categorias Outros -->
        <div class="urgent-card p2">
          <div>
            <div class="urgent-card-header">
              <span class="urgent-card-tag tag-amber">⚠️ P2 • Alto Impacto</span>
              <span class="urgent-card-sku-count">12 Anúncios Presos</span>
            </div>
            <h3 class="urgent-card-title">Migrar os 12 Produtos Presos na Categoria "Outros"</h3>
            <p class="urgent-card-desc">
              Anúncios desindexados sem tráfego de busca lateral. O caso mais grave é a <strong>Fita FT-GREEN</strong> cadastrada na categoria <em>Mãe e Bebê > Brinquedos</em>.
            </p>
            <div class="urgent-card-chips">
              <span class="chip-sku">FT-GREEN</span>
              <span class="chip-sku">MT055_FULL</span>
              <span class="chip-sku">EVASELVACREPE</span>
              <span class="chip-sku">51RASACP8</span>
              <span class="chip-sku">+8 outros</span>
            </div>
          </div>
          <div class="urgent-card-actions">
            <button class="btn-urgent-action warning" onclick="jumpToTask('task-p2', 'fase1')">
              🔍 Ver De/Para de Categorias ➔
            </button>
            <button class="btn-urgent-action" onclick="copySkus(['FT-GREEN','MT055_FULL','EVASELVACREPE','51RASACP8','GIRA'])">
              📋 Copiar SKUs
            </button>
          </div>
        </div>

        <!-- Urgent Card 3: Atributos Vazios -->
        <div class="urgent-card p3">
          <div>
            <div class="urgent-card-header">
              <span class="urgent-card-tag tag-cyan">⚡ P3 • Prioritário</span>
              <span class="urgent-card-sku-count">140 Fichas Vazias</span>
            </div>
            <h3 class="urgent-card-title">Injetar Atributos via Agente 5 nos 140 Itens</h3>
            <p class="urgent-card-desc">
              Comprovado ao vivo na Shopee: 247 anúncios já estão preenchidos. Vamos rodar o robô exclusivamente nos 140 itens vazios para liberar selos de relevância.
            </p>
            <div style="background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px; font-family: monospace; font-size: 11.5px; color: var(--accent-cyan); margin-top: 6px;">
              node agent5-shopee-attributes/src/runner.mjs
            </div>
          </div>
          <div class="urgent-card-actions">
            <button class="btn-urgent-action cyan" onclick="copyText('node agent5-shopee-attributes/src/runner.mjs --file uploads/Relatorio_Diagnostico_Produtos_Ativos_Shopee_AoVivo.xlsx')">
              ⚡ Copiar Comando Agente 5
            </button>
            <button class="btn-urgent-action" onclick="jumpToTask('task-p3', 'fase2')">
              🔍 Detalhes da Ficha ➔
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== BARRA DE CONTROLE: KANBAN vs FASES ==================== -->
    <div class="view-switcher-bar">
      <div class="view-modes-group">
        <button class="view-mode-btn active" id="btnModeKanban" onclick="switchViewMode('kanban')">
          <span>🗂️ Modo Kanban</span>
          <span style="font-size: 10px; padding: 2px 6px; background: rgba(16,185,129,0.2); color: var(--accent-emerald); border-radius: 4px; font-weight: 700;">Recomendado</span>
        </button>
        <button class="view-mode-btn" id="btnModeTimeline" onclick="switchViewMode('timeline')">
          <span>📑 Modo Detalhado por Fases</span>
        </button>
      </div>

      <div class="kanban-filter-group" id="kanbanFiltersGroup">
        <input type="text" class="kanban-search-input" id="kanbanSearch" placeholder="🔍 Filtrar tarefa / SKU..." oninput="filterKanban()">
        <select class="filter-select" id="kanbanPriorityFilter" onchange="filterKanban()">
          <option value="all">Todas as Prioridades</option>
          <option value="critico">🚨 Críticas (P1)</option>
          <option value="alto">⚠️ Altas (P2-P3)</option>
          <option value="medio">⚡ Médias (P4-P8)</option>
          <option value="normal">📦 Normais (P9-P10)</option>
        </select>
        <select class="filter-select" id="kanbanPhaseFilter" onchange="filterKanban()">
          <option value="all">Todas as Fases</option>
          <option value="Fase 1">Fase 1: Risco & Categorias</option>
          <option value="Fase 2">Fase 2: Ficha Técnica</option>
          <option value="Fase 3">Fase 3: Conversão</option>
          <option value="Fase 4">Fase 4: Ruptura</option>
        </select>
        <button class="btn-urgent-action" onclick="resetKanbanState()" title="Restaurar posições originais das colunas">
          🔄 Resetar
        </button>
      </div>
    </div>

    <!-- ==================== QUADRO KANBAN INTERATIVO ==================== -->
    <div class="kanban-view-container" id="kanbanContainer">
      <div class="kanban-board">

        <!-- Coluna 1: A Fazer -->
        <div class="kanban-column col-todo" data-col="todo">
          <div class="kanban-column-header">
            <div class="col-title-wrap">
              <span class="col-icon">📋</span>
              <span class="col-title">A Fazer / Backlog</span>
            </div>
            <span class="col-count" id="count-todo">0</span>
          </div>
          <div class="kanban-cards-area" id="col-todo" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, 'todo')">
            <!-- Cards injetados dinamicamente via JS com persistência -->
          </div>
        </div>

        <!-- Coluna 2: Em Andamento -->
        <div class="kanban-column col-progress" data-col="in-progress">
          <div class="kanban-column-header">
            <div class="col-title-wrap">
              <span class="col-icon">⚡</span>
              <span class="col-title">Em Andamento</span>
            </div>
            <span class="col-count" id="count-in-progress">0</span>
          </div>
          <div class="kanban-cards-area" id="col-in-progress" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, 'in-progress')">
          </div>
        </div>

        <!-- Coluna 3: Em Validação -->
        <div class="kanban-column col-review" data-col="review">
          <div class="kanban-column-header">
            <div class="col-title-wrap">
              <span class="col-icon">🔍</span>
              <span class="col-title">Em Validação</span>
            </div>
            <span class="col-count" id="count-review">0</span>
          </div>
          <div class="kanban-cards-area" id="col-review" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, 'review')">
          </div>
        </div>

        <!-- Coluna 4: Concluído -->
        <div class="kanban-column col-done" data-col="done">
          <div class="kanban-column-header">
            <div class="col-title-wrap">
              <span class="col-icon">✅</span>
              <span class="col-title">Concluído & Otimizado</span>
            </div>
            <span class="col-count" id="count-done">0</span>
          </div>
          <div class="kanban-cards-area" id="col-done" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, 'done')">
          </div>
        </div>

      </div>
    </div>

    <div id="timelineContainer" style="display: none;">
`;

// Replace the old banner-quick with our urgentHeroHTML and open the timelineContainer
const oldBannerRegex = /<!-- Quick Action Banner -->[\s\S]*?<div class="banner-quick">[\s\S]*?<\/div>/;
html = html.replace(oldBannerRegex, urgentHeroHTML);

// Close timelineContainer right before the footer
html = html.replace('<!-- Footer -->', '</div>\n\n    <!-- Toast Notification -->\n    <div id="kanbanToast">✅ Notificação</div>\n\n    <!-- Footer -->');

// 3. New JavaScript logic for Kanban, Drag and Drop, Filtering, and LocalStorage sync
const additionalJS = `
    // =========================================================================
    // DADOS E ESTADO DO KANBAN
    // =========================================================================
    const KANBAN_TASKS_DATA = [
      {
        id: 'task-p1',
        title: 'P1. Alterar DTS de 2 para 9 dias nas 8 Camisas',
        desc: 'Produtos sem sufixo _FULL configurados como pronta entrega. Risco de cancelamento automático pela Shopee.',
        phase: 'Fase 1',
        phaseTab: 'fase1',
        priority: 'critico',
        priorityLabel: 'Crítico',
        metric: '8 SKUs em Risco',
        defaultCol: 'todo'
      },
      {
        id: 'task-p2',
        title: 'P2. Migrar os 12 Produtos da Categoria "Outros"',
        desc: 'Reclassificar produtos desindexados. Caso crítico da fita de pesca FT-GREEN cadastrada em Bebês.',
        phase: 'Fase 1',
        phaseTab: 'fase1',
        priority: 'alto',
        priorityLabel: 'Alto',
        metric: '12 SKUs Desindexados',
        defaultCol: 'todo'
      },
      {
        id: 'task-p3',
        title: 'P3. Injetar Ficha Técnica via Agente 5',
        desc: 'Preencher Material (XTech-Pro), Gênero, Manga e Proteção UV50+ exclusivamente nos 140 itens vazios.',
        phase: 'Fase 2',
        phaseTab: 'fase2',
        priority: 'alto',
        priorityLabel: 'Alto',
        metric: '140 Fichas Vazias',
        defaultCol: 'in-progress'
      },
      {
        id: 'task-p4',
        title: 'P4. Vincular Tabela de Medidas na Linha Infantil e Calçados',
        desc: 'Vincular imagem oficial da Tabela de Tamanhos nos 18 itens que hoje geram dúvidas de tamanho.',
        phase: 'Fase 2',
        phaseTab: 'fase2',
        priority: 'medio',
        priorityLabel: 'Médio',
        metric: '18 Anúncios',
        defaultCol: 'todo'
      },
      {
        id: 'task-p5',
        title: 'P5. Preservar os 24 Produtos na Cor #D8E4BC',
        desc: 'Não alterar títulos nem categorias desses 24 anúncios recentemente otimizados pela equipe.',
        phase: 'Fase 2',
        phaseTab: 'fase2',
        priority: 'medio',
        priorityLabel: 'Monitoramento',
        metric: '24 SKUs Seguros',
        defaultCol: 'done'
      },
      {
        id: 'task-p6',
        title: 'P6. Ativar Cupom de Loja para Fechamento de Carrinho',
        desc: 'Cupom de R$ 10 acima de R$ 180 (2 camisas) para converter os 90 produtos com alto carrinho acumulado.',
        phase: 'Fase 3',
        phaseTab: 'fase3',
        priority: 'medio',
        priorityLabel: 'Médio',
        metric: '90 Produtos',
        defaultCol: 'todo'
      },
      {
        id: 'task-p7',
        title: 'P7. Configurar Combo "Leve Mais por Menos"',
        desc: 'Ativar selo laranja de desconto progressivo (2 com 5%, 3 com 10%) para aumentar o ticket médio.',
        phase: 'Fase 3',
        phaseTab: 'fase3',
        priority: 'normal',
        priorityLabel: 'Normal',
        metric: 'Ticket Médio',
        defaultCol: 'todo'
      },
      {
        id: 'task-p8',
        title: 'P8. Automação de Disparo de Chat para Carrinhos 24h',
        desc: 'Habilitar disparo de cupom relâmpago no assistente de chat para clientes que abandonaram o carrinho.',
        phase: 'Fase 3',
        phaseTab: 'fase3',
        priority: 'normal',
        priorityLabel: 'Normal',
        metric: 'Assistente Chat',
        defaultCol: 'todo'
      },
      {
        id: 'task-p9',
        title: 'P9. Decisão sobre os 99 Produtos Esgotados (Estoque 0)',
        desc: 'Decidir com PCP/Fábrica se haverá reposição ou se anúncios devem ser pausados para não reter tráfego.',
        phase: 'Fase 4',
        phaseTab: 'fase4',
        priority: 'normal',
        priorityLabel: 'Planejado',
        metric: '99 SKUs Esgotados',
        defaultCol: 'todo'
      },
      {
        id: 'task-p10',
        title: 'P10. Auditoria Semanal de Ruptura nos Tamanhos M e G',
        desc: 'Conferir se as camisas com alta visitação não estão com tamanhos centrais M e G esgotados.',
        phase: 'Fase 4',
        phaseTab: 'fase4',
        priority: 'normal',
        priorityLabel: 'Semanal',
        metric: 'Grade M/G',
        defaultCol: 'todo'
      }
    ];

    const COLUMNS = ['todo', 'in-progress', 'review', 'done'];
    let kanbanState = {}; // { taskId: 'todo' | 'in-progress' | 'review' | 'done' }
    let draggedTaskId = null;

    function initKanban() {
      // 1. Load state from localStorage or use defaults
      const saved = localStorage.getItem('brk_kanban_board_state');
      if (saved) {
        try {
          kanbanState = JSON.parse(saved);
        } catch(e) {
          kanbanState = {};
        }
      }

      KANBAN_TASKS_DATA.forEach(task => {
        if (!kanbanState[task.id]) {
          kanbanState[task.id] = task.defaultCol;
        }
      });

      renderKanban();
      syncCheckboxesFromKanban();
    }

    function renderKanban() {
      const search = (document.getElementById('kanbanSearch')?.value || '').toLowerCase();
      const prioFilter = document.getElementById('kanbanPriorityFilter')?.value || 'all';
      const phaseFilter = document.getElementById('kanbanPhaseFilter')?.value || 'all';

      // Clear columns
      COLUMNS.forEach(col => {
        const area = document.getElementById('col-' + col);
        if (area) area.innerHTML = '';
      });

      const counts = { 'todo': 0, 'in-progress': 0, 'review': 0, 'done': 0 };

      KANBAN_TASKS_DATA.forEach(task => {
        const col = kanbanState[task.id] || task.defaultCol;
        counts[col] = (counts[col] || 0) + 1;

        // Apply filters
        if (search && !task.title.toLowerCase().includes(search) && !task.desc.toLowerCase().includes(search) && !task.metric.toLowerCase().includes(search)) {
          return;
        }
        if (prioFilter !== 'all' && task.priority !== prioFilter) {
          return;
        }
        if (phaseFilter !== 'all' && task.phase !== phaseFilter) {
          return;
        }

        const card = createCardElement(task, col);
        const area = document.getElementById('col-' + col);
        if (area) area.appendChild(card);
      });

      // Update counters
      COLUMNS.forEach(col => {
        const countEl = document.getElementById('count-' + col);
        if (countEl) countEl.textContent = counts[col] || 0;
      });

      // Update header progress based on done tasks
      const doneCount = counts['done'] || 0;
      const totalCount = KANBAN_TASKS_DATA.length;
      const pct = Math.round((doneCount / totalCount) * 100);
      const progressEl = document.getElementById('progressPercent');
      if (progressEl) progressEl.textContent = pct + '%';
    }

    function createCardElement(task, currentCol) {
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.id = 'kcard-' + task.id;
      card.draggable = true;

      const colIdx = COLUMNS.indexOf(currentCol);
      const canMoveLeft = colIdx > 0;
      const canMoveRight = colIdx < COLUMNS.length - 1;

      card.innerHTML = \`
        <div class="kanban-card-top">
          <span class="kanban-priority-pill prio-\${task.priority}">\${task.priorityLabel}</span>
          <span class="kanban-phase-tag">\${task.phase}</span>
        </div>
        <div class="kanban-card-title">\${task.title}</div>
        <div class="kanban-card-desc">\${task.desc}</div>
        <div class="kanban-card-metric">\${task.metric}</div>
        <div class="kanban-card-bottom">
          <div class="kanban-card-nav-controls">
            <button class="btn-col-move" \${!canMoveLeft ? 'disabled' : ''} onclick="event.stopPropagation(); moveTaskCol('\${task.id}', -1)" title="Mover para coluna anterior">◀</button>
            <button class="btn-col-move" \${!canMoveRight ? 'disabled' : ''} onclick="event.stopPropagation(); moveTaskCol('\${task.id}', 1)" title="Mover para próxima coluna">▶</button>
          </div>
          <button class="btn-card-details" onclick="jumpToTask('\${task.id}', '\${task.phaseTab}')">
            Ver Detalhes ➔
          </button>
        </div>
      \`;

      card.addEventListener('dragstart', (e) => {
        draggedTaskId = task.id;
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', task.id);
      });

      card.addEventListener('dragend', () => {
        draggedTaskId = null;
        card.classList.remove('dragging');
      });

      return card;
    }

    // Drag and drop handlers
    function handleDragOver(e) {
      e.preventDefault();
      const area = e.currentTarget;
      area.classList.add('drag-over');
    }

    function handleDragLeave(e) {
      const area = e.currentTarget;
      area.classList.remove('drag-over');
    }

    function handleDrop(e, targetCol) {
      e.preventDefault();
      const area = e.currentTarget;
      area.classList.remove('drag-over');

      const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
      if (taskId) {
        setTaskColumn(taskId, targetCol);
      }
    }

    function moveTaskCol(taskId, delta) {
      const currentCol = kanbanState[taskId] || 'todo';
      const idx = COLUMNS.indexOf(currentCol);
      const newIdx = idx + delta;
      if (newIdx >= 0 && newIdx < COLUMNS.length) {
        setTaskColumn(taskId, COLUMNS[newIdx]);
      }
    }

    function setTaskColumn(taskId, newCol) {
      kanbanState[taskId] = newCol;
      localStorage.setItem('brk_kanban_board_state', JSON.stringify(kanbanState));

      // Also sync task checkbox
      const cb = document.getElementById(taskId);
      if (cb) {
        cb.checked = (newCol === 'done');
        const card = cb.closest('.task-card');
        if (card) {
          if (cb.checked) card.classList.add('checked');
          else card.classList.remove('checked');
        }
      }

      renderKanban();

      const taskObj = KANBAN_TASKS_DATA.find(t => t.id === taskId);
      const colLabels = { 'todo': 'A Fazer', 'in-progress': 'Em Andamento', 'review': 'Em Validação', 'done': 'Concluído' };
      showToast(\`⚡ "\${taskObj ? taskObj.title.split('.')[0] : taskId}" movido para \${colLabels[newCol] || newCol}\`);
    }

    function syncCheckboxesFromKanban() {
      Object.keys(kanbanState).forEach(id => {
        const cb = document.getElementById(id);
        if (cb) {
          cb.checked = (kanbanState[id] === 'done');
          const card = cb.closest('.task-card');
          if (card) {
            if (cb.checked) card.classList.add('checked');
            else card.classList.remove('checked');
          }
        }
      });
    }

    function filterKanban() {
      renderKanban();
    }

    function resetKanbanState() {
      if (confirm('Deseja restaurar as posições padrão do Quadro Kanban?')) {
        localStorage.removeItem('brk_kanban_board_state');
        kanbanState = {};
        initKanban();
        showToast('🔄 Quadro Kanban restaurado para o padrão original!');
      }
    }

    // Switch between Kanban mode and Deep Timeline mode
    function switchViewMode(mode) {
      const btnKanban = document.getElementById('btnModeKanban');
      const btnTimeline = document.getElementById('btnModeTimeline');
      const kanbanContainer = document.getElementById('kanbanContainer');
      const timelineContainer = document.getElementById('timelineContainer');
      const kanbanFilters = document.getElementById('kanbanFiltersGroup');

      if (mode === 'kanban') {
        btnKanban.classList.add('active');
        btnTimeline.classList.remove('active');
        kanbanContainer.style.display = 'block';
        timelineContainer.style.display = 'none';
        if (kanbanFilters) kanbanFilters.style.display = 'flex';
      } else {
        btnTimeline.classList.add('active');
        btnKanban.classList.remove('active');
        kanbanContainer.style.display = 'none';
        timelineContainer.style.display = 'block';
        if (kanbanFilters) kanbanFilters.style.display = 'none';
      }
    }

    // Jump to deep task details
    function jumpToTask(taskId, phaseTab) {
      switchViewMode('timeline');
      switchTab(phaseTab);
      setTimeout(() => {
        const target = document.getElementById(taskId);
        if (target) {
          const card = target.closest('.task-card') || target;
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.outline = '2px solid var(--accent-emerald)';
          card.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.4)';
          setTimeout(() => {
            card.style.outline = '';
            card.style.boxShadow = '';
          }, 3000);
        }
      }, 100);
    }

    // Toast helper
    function showToast(msg) {
      const toast = document.getElementById('kanbanToast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2800);
    }

    // Copy helper
    function copyText(txt) {
      navigator.clipboard.writeText(txt).then(() => {
        showToast('📋 Comando copiado para a área de transferência!');
      }).catch(() => {
        showToast('⚠️ Erro ao copiar. Selecione manualmente.');
      });
    }

    function copySkus(skus) {
      const text = skus.join(', ');
      navigator.clipboard.writeText(text).then(() => {
        showToast(\`📋 \${skus.length} SKUs copiados com sucesso!\`);
      }).catch(() => {
        showToast('⚠️ Erro ao copiar.');
      });
    }

    function copyAllUrgentSkus() {
      const all = ['C02846BL', 'C02830', 'C02824', 'CMB05', 'CMB07', 'CMB09', 'CMB010', '27622333', 'FT-GREEN', 'MT055_FULL', 'EVASELVACREPE', '51RASACP8', 'GIRA'];
      copySkus(all);
    }

    // Connect checkbox changes to Kanban Done column
    const origUpdateProgress = window.updateProgress;
    window.updateProgress = function() {
      const checkboxes = document.querySelectorAll('.custom-checkbox');
      checkboxes.forEach(cb => {
        const isChecked = cb.checked;
        if (kanbanState[cb.id]) {
          if (isChecked && kanbanState[cb.id] !== 'done') {
            kanbanState[cb.id] = 'done';
          } else if (!isChecked && kanbanState[cb.id] === 'done') {
            kanbanState[cb.id] = 'todo';
          }
        }
      });
      localStorage.setItem('brk_kanban_board_state', JSON.stringify(kanbanState));
      renderKanban();
    };

    window.addEventListener('DOMContentLoaded', () => {
      initKanban();
    });
`;

// Replace existing <script> contents with enhanced logic
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.indexOf('</script>');
const existingScript = html.substring(scriptStart + 8, scriptEnd);

html = html.substring(0, scriptStart + 8) + '\n' + existingScript + '\n' + additionalJS + '\n' + html.substring(scriptEnd);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✅ roadmap_shopee_brk.html updated successfully with Kanban and Urgent Tasks Hero!');
