/* ============================================================
   Yokaii Player — субтитры WebVTT и SRT

   Почему не просто <track src="…">:

   1. Чужой домен. Браузер грузит <track> с другого сайта, только
      если у самого <video> стоит crossorigin. А crossorigin на
      видео с CDN без CORS-заголовков ломает уже само видео. Поэтому
      файл субтитров скачиваем сами через fetch, а в <track> кладём
      blob: — он всегда «свой», и видео трогать не нужно.

   2. SRT. Аниме-субтитры чаще всего лежат в .srt, а браузер понимает
      только WebVTT. Парсер ниже читает оба формата и отдаёт плееру
      чистый WebVTT.

   3. Мусор из фансабов: теги ASS вроде {\an8}, <font color=…>.
      Вычищаем, оставляя только то, что умеет WebVTT: курсив,
      жирный, подчёркивание и ruby для фуриганы.

   Показывает реплики сам плеер (см. #renderCues в yokaii-player.js):
   родная отрисовка не видна поверх холста «720+» и не умеет
   уступать место панели управления.
   ============================================================ */

/* Теги, которые WebVTT понимает и которые безопасно оставить */
const KEEP_TAGS = /<(\/?)(i|b|u|ruby|rt|c|v|lang)(\b[^>]*)?>/gi;

/** «00:01:02,500» / «01:02.5» / «1:02:03.040» → секунды */
function parseTime(raw) {
  const m = String(raw).trim().replace(',', '.').match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return NaN;
  return (Number(m[1]) || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Секунды → «00:01:02.500» для WebVTT */
function vttTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

/** Убрать теги ASS и всё, чего нет в WebVTT */
function cleanText(text) {
  return text
    .replace(/\{\\[^}]*\}/g, '')                              // {\an8}, {\i1}
    .replace(/\\N/g, '\n')                                     // перенос строки в стиле ASS
    .replace(/<[^>]*>/g, (tag) => (tag.match(KEEP_TAGS) ? tag : ''))
    .replace(/-->/g, '→')                                      // сломало бы разбор WebVTT
    .trim();
}

/**
 * Разобрать текст WebVTT или SRT.
 * @param {string} text содержимое файла
 * @returns {Array<{start:number, end:number, text:string}>}
 */
export function parseSubtitles(text) {
  const cues = [];
  const blocks = String(text)
    .replace(/^﻿/, '')                // BOM в начале файла из Windows
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at === -1) continue;               // заголовок WEBVTT, NOTE, STYLE, номер без тайминга

    const [from, rest = ''] = lines[at].split('-->');
    const start = parseTime(from);
    const end = parseTime(rest.trim().split(/\s+/)[0]); // после времени у VTT бывают настройки позиции
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const body = cleanText(lines.slice(at + 1).join('\n'));
    if (body) cues.push({ start, end, text: body });
  }

  return cues.sort((a, b) => a.start - b.start);
}

/** Собрать WebVTT из реплик */
export function toVtt(cues) {
  return `WEBVTT\n\n${cues.map((c) => `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}`).join('\n\n')}\n`;
}

/**
 * Получить WebVTT как blob: URL, который можно отдать <track>.
 * @param {{src?:string, text?:string}} item ссылка на .vtt/.srt или сам текст
 * @param {AbortSignal} [signal]
 * @returns {Promise<{url:string, count:number}>}
 */
export async function subtitlesToBlobUrl(item, signal) {
  let text = item.text;
  if (text == null) {
    const res = await fetch(item.src, { signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  }
  const cues = parseSubtitles(text);
  if (!cues.length) throw new Error('Пустой файл субтитров или неизвестный формат');
  const blob = new Blob([toVtt(cues)], { type: 'text/vtt' });
  return { url: URL.createObjectURL(blob), count: cues.length };
}
