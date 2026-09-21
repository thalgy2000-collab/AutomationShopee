/**
 * notifier.mjs — Módulo de Notificações do Sistema Operacional (Windows)
 * Dispara pop-up na bandeja do Windows e som nativo do sistema quando os agentes finalizam.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function sendWindowsNotification(title, message, type = 'Info') {
  if (process.platform !== 'win32') return;
  try {
    const script = path.join(__dirname, 'notify_windows.ps1');
    const child = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden',
      '-File', script,
      '-Title', title,
      '-Message', message,
      '-Type', type
    ], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  } catch (err) {
    console.warn('Erro ao disparar notificação Windows:', err.message);
  }
}
