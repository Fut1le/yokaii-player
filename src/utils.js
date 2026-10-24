/* ============================================================
   Yokaii Player — маленькие утилиты
   Вынесены из сайта Yokaii без изменений логики.
   ============================================================ */

/** Ограничить число диапазоном */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** 3725 → «1:02:05», 65 → «1:05» */
export function timecode(seconds = 0) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Экранирование для вставки в innerHTML */
export function esc(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * localStorage, который никогда не бросает исключений:
 * приватный режим Safari, переполненная квота, запрет куки —
 * плеер просто работает без запоминания настроек.
 */
export const ls = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* квота */ }
  },
};
