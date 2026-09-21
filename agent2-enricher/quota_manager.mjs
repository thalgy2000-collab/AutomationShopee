import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUOTA_FILE = path.resolve(__dirname, ".quota_limits.json");

/**
 * Retorna o objeto de quotas salvas no arquivo.
 * Limpa automaticamente entradas que já expiraram (passaram do resetAt).
 */
export function getQuotaData() {
  try {
    if (!fs.existsSync(QUOTA_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(QUOTA_FILE, "utf-8");
    const data = JSON.parse(raw);
    const now = Date.now();
    let changed = false;

    for (const [model, info] of Object.entries(data)) {
      if (info.resetAt && new Date(info.resetAt).getTime() <= now) {
        delete data[model];
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2), "utf-8");
    }

    return data;
  } catch (err) {
    console.error(`[QuotaManager] Erro ao ler ${QUOTA_FILE}:`, err.message);
    return {};
  }
}

/**
 * Verifica se um modelo específico está bloqueado por ter atingido o limite diário.
 * @param {string} modelName 
 * @returns {{ blocked: boolean, resetAt?: string, reason?: string }}
 */
export function isModelBlocked(modelName) {
  if (!modelName) return { blocked: false };
  const data = getQuotaData();
  const info = data[modelName];

  if (!info) return { blocked: false };

  const now = Date.now();
  const resetTime = new Date(info.resetAt).getTime();

  if (now < resetTime) {
    return {
      blocked: true,
      resetAt: info.resetAt,
      reason: info.reason || "Limite diário atingido"
    };
  }

  // Já expirou
  delete data[modelName];
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
  return { blocked: false };
}

/**
 * Bloqueia um modelo até o próximo dia (00:00:00 do dia seguinte no horário local).
 * @param {string} modelName 
 * @param {string} reason 
 * @returns {{ resetAt: string }}
 */
export function blockModelUntilNextDay(modelName, reason = "Limite diário atingido (RESOURCE_EXHAUSTED / Quota exceeded)") {
  const data = getQuotaData();
  const now = new Date();

  // Próximo dia às 00:00:00 horário local
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

  data[modelName] = {
    blockedAt: now.toISOString(),
    resetAt: nextDay.toISOString(),
    reason: String(reason).slice(0, 300)
  };

  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`[QuotaManager] Erro ao gravar ${QUOTA_FILE}:`, err.message);
  }

  return { resetAt: nextDay.toISOString() };
}

/**
 * Remove o bloqueio de todos os modelos.
 */
export function resetAllQuotas() {
  try {
    if (fs.existsSync(QUOTA_FILE)) {
      fs.unlinkSync(QUOTA_FILE);
    }
  } catch (err) {
    console.error(`[QuotaManager] Erro ao resetar quotas:`, err.message);
  }
}

/**
 * Remove o bloqueio de um modelo específico.
 */
export function unblockModel(modelName) {
  const data = getQuotaData();
  if (data[modelName]) {
    delete data[modelName];
    try {
      fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch {}
  }
}

/**
 * Formata a data/hora para exibição legível em português.
 */
export function formatResetTime(isoString) {
  if (!isoString) return "amanhã";
  try {
    const d = new Date(isoString);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return isoString;
  }
}
