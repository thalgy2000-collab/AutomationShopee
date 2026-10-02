import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const painelPath = path.resolve(__dirname, '../agent2-enricher/painel.html');

let content = fs.readFileSync(painelPath, 'utf8');

// 1. Add Token/Auth Button to header right
const headerRightMarker = '<div class="shopee-topbar-right">';
const tokenButtonHtml = `
        <!-- Token de Autenticação / Acesso Remoto -->
        <button class="btn-header" id="btn-panel-auth" onclick="promptPanelAuthToken()" title="Configurar Token de Autenticação (Acesso Remoto/Túnel)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span id="panel-auth-label">Auth Token</span>
        </button>`;

if (!content.includes('id="btn-panel-auth"')) {
  content = content.replace(headerRightMarker, headerRightMarker + '\r\n' + tokenButtonHtml);
  console.log('Added btn-panel-auth to header');
}

// 2. Update getPanelAuthHeaders to use sessionStorage and add promptPanelAuthToken
const oldAuthFn = `    function getPanelAuthHeaders() {
      const token = localStorage.getItem('PANEL_TOKEN') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['x-panel-token'] = token;
      return headers;
    }`;

const newAuthCode = `    function getPanelAuthHeaders() {
      const token = sessionStorage.getItem('PANEL_TOKEN') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['x-panel-token'] = token;
      return headers;
    }

    function promptPanelAuthToken() {
      const current = sessionStorage.getItem('PANEL_TOKEN') || '';
      const entered = window.prompt('🔒 Digite o PANEL_TOKEN configurado no servidor (necessário apenas para acesso externo ou túnel Cloudflare/Ngrok):', current);
      if (entered !== null) {
        const trimmed = entered.trim();
        if (trimmed) {
          sessionStorage.setItem('PANEL_TOKEN', trimmed);
          updateAuthButtonState();
          showToast('🔑 Token de autenticação salvo na sessão do navegador!');
        } else {
          sessionStorage.removeItem('PANEL_TOKEN');
          updateAuthButtonState();
          showToast('ℹ️ Token removido da sessão.');
        }
      }
    }

    function updateAuthButtonState() {
      const btn = document.getElementById('btn-panel-auth');
      const label = document.getElementById('panel-auth-label');
      if (!btn || !label) return;
      const token = sessionStorage.getItem('PANEL_TOKEN');
      if (token) {
        btn.classList.add('notif-active');
        btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        btn.style.color = '#10B981';
        label.textContent = 'Token: Ativo';
      } else {
        btn.classList.remove('notif-active');
        btn.style.borderColor = '';
        btn.style.color = '';
        label.textContent = 'Auth Token';
      }
    }`;

if (content.includes('localStorage.getItem(\'PANEL_TOKEN\')')) {
  // Check if CRLF or LF
  if (content.includes('localStorage.getItem(\'PANEL_TOKEN\') || \'\';\r\n')) {
    content = content.replace(
      /function getPanelAuthHeaders\(\) \{[\r\n\s]+const token = localStorage\.getItem\('PANEL_TOKEN'\) \|\| '';[\r\n\s]+const headers = \{ 'Content-Type': 'application\/json' \};[\r\n\s]+if \(token\) headers\['x-panel-token'\] = token;[\r\n\s]+return headers;[\r\n\s]+\}/,
      newAuthCode
    );
  } else {
    content = content.replace(
      /function getPanelAuthHeaders\(\) \{[\n\s]+const token = localStorage\.getItem\('PANEL_TOKEN'\) \|\| '';[\n\s]+const headers = \{ 'Content-Type': 'application\/json' \};[\n\s]+if \(token\) headers\['x-panel-token'\] = token;[\n\s]+return headers;[\n\s]+\}/,
      newAuthCode
    );
  }
  console.log('Updated getPanelAuthHeaders to sessionStorage + added promptPanelAuthToken');
}

// 3. Ensure updateAuthButtonState() is called on page load
if (content.includes('window.addEventListener(\'DOMContentLoaded\', () => {') && !content.includes('updateAuthButtonState();')) {
  content = content.replace(
    'window.addEventListener(\'DOMContentLoaded\', () => {',
    'window.addEventListener(\'DOMContentLoaded\', () => {\r\n      updateAuthButtonState();'
  );
  console.log('Added updateAuthButtonState() to DOMContentLoaded');
}

fs.writeFileSync(painelPath, content, 'utf8');
console.log('painel.html successfully updated!');
