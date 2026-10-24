/* ============================================================
   Демо Yokaii Player
   Показывает всё публичное API: серии, качество, события,
   продолжение с места, пульт и смену языка.
   ============================================================ */

import { YokaiiPlayer, attachRemote } from '../src/index.js';

/* ---------- Источники ----------
   Только то, что можно показывать открыто: свой ролик и открытые
   тестовые потоки / фильмы Blender Foundation (CC BY). */
const CATALOG = {
  local: {
    title: 'Тории и лисий огонь',
    poster: 'media/torii-poster.jpg',
    episodes: [
      {
        number: 1,
        title: 'Ночь',
        sources: [
          { src: 'media/torii-480p.webm', label: '480p' },
          { src: 'media/torii-360p.webm', label: '360p' },
        ],
      },
      {
        number: 2,
        title: 'Та же ночь в 360p',
        sources: [{ src: 'media/torii-360p.webm', label: '360p' }],
      },
    ],
  },
  hls: {
    title: 'Тестовые HLS-потоки',
    poster: '',
    episodes: [
      {
        number: 1,
        title: 'Big Buck Bunny',
        sources: [{ src: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', label: 'Авто' }],
      },
      {
        number: 2,
        title: 'Apple BipBop',
        sources: [{
          src: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
          label: 'Авто',
        }],
      },
    ],
  },
  mp4: {
    title: 'Открытые фильмы Blender',
    poster: '',
    episodes: ['Sintel', 'ElephantsDream', 'TearsOfSteel'].map((name, i) => ({
      number: i + 1,
      title: name.replace(/([a-z])([A-Z])/g, '$1 $2'),
      sources: [{
        src: `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/${name}.mp4`,
        label: '720p',
      }],
    })),
  },
};

const $ = (s) => document.querySelector(s);
const mount = $('#player');
const log = $('#log');

let lang = 'ru';
let sourceKey = 'local';
let player = null;
let detachRemote = null;

/* ---------- Журнал событий ---------- */
function note(name, payload) {
  const li = document.createElement('li');
  const b = document.createElement('b');
  b.textContent = name;
  const span = document.createElement('span');
  span.textContent = payload ? JSON.stringify(payload, (k, v) => (
    typeof v === 'number' ? Math.round(v * 10) / 10 : v
  )) : '';
  li.append(b, span);
  log.prepend(li);
  while (log.children.length > 8) log.lastChild.remove();
}

/* ---------- Продолжить с места ----------
   Пример того, что делает сайт: запоминает секунду каждые
   несколько секунд и возвращает человека туда же. */
const progressKey = (ep) => `yp-demo:${sourceKey}:${ep}`;
let lastSave = 0;
function saveProgress({ time, duration, episode }) {
  if (Date.now() - lastSave < 3000) return;
  lastSave = Date.now();
  // Досмотрел — начинать заново, а не с титров
  const value = duration && duration - time < 5 ? 0 : time;
  try { localStorage.setItem(progressKey(episode), String(value)); } catch { /* noop */ }
}
function readProgress(ep) {
  try { return Number(localStorage.getItem(progressKey(ep))) || 0; } catch { return 0; }
}

/* ---------- Сборка плеера ---------- */
function build({ episode = 1, keepTime = 0 } = {}) {
  detachRemote?.();
  player?.destroy();

  const item = CATALOG[sourceKey];
  player = new YokaiiPlayer(mount, {
    lang,
    title: item.title,
    poster: item.poster,
    autoplay: false,
  });

  // Пульт, медиакнопки, шторка телефона
  detachRemote = attachRemote(player);

  ['ready', 'play', 'pause', 'seeked', 'ended', 'error',
    'episodechange', 'qualitychange', 'enhancechange', 'enhancefail']
    .forEach((name) => player.on(name, (p) => note(name, p)));

  player.on('timeupdate', saveProgress);
  player.on('episodechange', ({ episode: n }) => paintEpisodes(n));

  /* Автозапуск при загрузке страницы браузеры не любят, поэтому
     стартуем на паузе. После первого нажатия «пуск» серии дальше
     включаются сами. */
  player.on('play', () => { player.options.autoplay = true; });

  // Конец серии — следующая, если есть
  player.on('ended', () => player.nextEpisode());

  player.setEpisodes(item.episodes, { title: item.title });
  player.playEpisode(episode, keepTime || readProgress(episode));
}

/* ---------- Кнопки серий ---------- */
function paintEpisodes(active = 1) {
  const box = $('#episodes');
  box.replaceChildren(...CATALOG[sourceKey].episodes.map((ep) => {
    const btn = document.createElement('button');
    btn.textContent = `${ep.number}. ${ep.title}`;
    btn.setAttribute('aria-pressed', String(ep.number === active));
    btn.onclick = () => player.playEpisode(ep.number, readProgress(ep.number));
    return btn;
  }));
}

/* ---------- Переключатели ---------- */
document.querySelectorAll('[data-source]').forEach((tab) => {
  tab.onclick = () => {
    sourceKey = tab.dataset.source;
    document.querySelectorAll('[data-source]').forEach((t) => {
      t.setAttribute('aria-selected', String(t === tab));
    });
    paintEpisodes(1);
    build();
  };
});

document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.onclick = () => {
    lang = btn.dataset.lang;
    document.querySelectorAll('[data-lang]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b === btn));
    });
    const { episode, time } = player.state();
    build({ episode, keepTime: time });
  };
});

$('#own').onsubmit = (e) => {
  e.preventDefault();
  const url = $('#own-url').value.trim();
  if (!url) return;
  player.setEpisodes([], { title: url.split('/').pop() || url });
  player.loadFile(url, { title: url.split('/').pop() });
  player.play();
  $('#episodes').replaceChildren();
};

/* Ссылка на репозиторий — на Pages её можно вычислить из адреса */
const m = location.hostname.match(/^([^.]+)\.github\.io$/);
if (m) {
  const repo = location.pathname.split('/')[1];
  $('#repo-link').href = `https://github.com/${m[1]}/${repo}`;
}

paintEpisodes(1);
build();
