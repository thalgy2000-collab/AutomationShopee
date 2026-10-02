import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
export const LOCK_FILE = path.join(ROOT_DIR, '.agent.lock');

/**
 * Checa se um processo está ativo no sistema operacional.
 * No Windows, process.kill(pid, 0) pode lançar se o PID não existir.
 */
export function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // Se o erro for ESRCH, o processo definitivamente não existe
    // Se o erro for EPERM, o processo existe mas pertence a outro usuário (ainda vivo)
    return err.code === 'EPERM';
  }
}

/**
 * Lê o lock atual e remove se for órfão (PID morto).
 */
export function checkAndCleanOrphanLock() {
  try {
    if (!fs.existsSync(LOCK_FILE)) return null;
    const raw = fs.readFileSync(LOCK_FILE, 'utf-8');
    const lock = JSON.parse(raw);
    if (!lock || !lock.pid) {
      releaseLock(true);
      return null;
    }
    if (isPidAlive(lock.pid)) {
      return lock;
    } else {
      // PID morto -> órfão limpo
      releaseLock(true);
      return null;
    }
  } catch {
    releaseLock(true);
    return null;
  }
}

/**
 * Adquire o lock para um agente. Se outro processo estiver rodando, lança erro ou sai.
 */
export function acquireAgentLock(agentId, pid = process.pid) {
  const existing = checkAndCleanOrphanLock();
  if (existing && existing.pid !== pid) {
    const msg = `❌ [LOCK] O agente '${existing.agentId}' já está em execução (PID: ${existing.pid}, iniciado em: ${existing.acquiredAt}). Aguarde a conclusão ou interrompa o processo antes de rodar outro.`;
    throw new Error(msg);
  }
  const payload = {
    agentId,
    pid,
    acquiredAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify(payload, null, 2), { encoding: 'utf-8', flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      const current = checkAndCleanOrphanLock();
      if (current && current.pid !== pid) {
        throw new Error(`❌ [LOCK] O agente '${current.agentId}' já está em execução (PID: ${current.pid}). Race condition prevenida.`);
      }
      // Se era órfão ou o mesmo PID, sobrescreve
      fs.writeFileSync(LOCK_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } else {
      throw err;
    }
  }
}

/**
 * Libera o lock se pertencer ao PID atual (ou se force === true).
 */
export function releaseLock(force = false) {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      if (force) {
        fs.unlinkSync(LOCK_FILE);
      } else {
        const raw = fs.readFileSync(LOCK_FILE, 'utf-8');
        const lock = JSON.parse(raw);
        if (lock && lock.pid === process.pid) {
          fs.unlinkSync(LOCK_FILE);
        }
      }
    }
  } catch {}
}

/**
 * Registra listeners de encerramento no processo para garantir liberação do lock.
 */
export function setupLockAutoRelease(agentId) {
  acquireAgentLock(agentId, process.pid);
  const cleanup = () => {
    releaseLock();
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
  process.on('uncaughtException', (err) => {
    console.error(`💥 Exceção não tratada em ${agentId}:`, err);
    cleanup();
    process.exit(1);
  });
}
