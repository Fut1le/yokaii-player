/* ============================================================
   YOKAII PLAYER
   Открытый HTML5-плеер для аниме-сайтов. Вынесен из yokaii.web.app.

   Свой интерфейс поверх обычного <video>:
     • MP4 / WebM напрямую, HLS (.m3u8) — нативно в Safari,
       в остальных браузерах через hls.js (грузится лениво);
     • список серий, качество, скорость, «вперёд на 1:30»;
     • жесты на телефоне, горячие клавиши, пульт Smart TV;
     • улучшение картинки «720+» на WebGL2 (см. enhance.js).

   Откуда брать видео — не забота плеера: он получает готовые
   ссылки. Ни ключей, ни адресов чужих API здесь нет.

   События (player.on(name, cb)):
     ready, play, pause, seeked, timeupdate, durationchange, ended,
     error, episodechange, qualitychange, enhancechange, enhancefail

   Лицензия MIT.
   ============================================================ */

import { timecode, clamp, ls, esc } from './utils.js';
import { Enhancer } from './enhance.js';

/* ---------- Настройки по умолчанию ---------- */
const DEFAULTS = {
  poster: '',
  title: '',
  subtitle: '',
  autoplay: true,
  lang: 'ru',                 // 'ru' | 'en'
  labels: {},                 // точечная замена подписей
  sourceLabel: '',            // подпись источника в строке «3 серия · …»
  seekStep: 5,                // стрелки, двойной тап
  seekStepLong: 30,           // Shift + стрелки, перемотка с пульта
  skipStep: 90,               // кнопка «пропустить опенинг»
  idleHide: 2600,             // через сколько мс прятать панель (мышь)
  speeds: [0.75, 1, 1.25, 1.5, 2],
  keyboard: true,             // горячие клавиши на странице
  storageKey: 'yokaii-player',// префикс для громкости и «720+»
  /* 'anonymous' — если CDN отдаёт CORS-заголовки. Тогда «720+»
     сможет читать кадр. Без CORS на CDN ставить НЕЛЬЗЯ: браузер
     вовсе откажется грузить видео. По умолчанию не трогаем. */
  crossOrigin: null,
  hlsUrl: 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js',
  hlsConfig: { capLevelToPlayerSize: true, maxBufferLength: 40 },
  enhance: { enabled: false, maxHeight: 1080 },
};

/* ---------- Подписи ---------- */
const STRINGS = {
  ru: {
    loading: 'Разжигаем огонь…',
    play: 'Смотреть',
    playPause: 'Пуск / пауза',
    prev: 'Предыдущая серия',
    next: 'Следующая серия',
    mute: 'Звук',
    volume: 'Громкость',
    position: 'Позиция',
    skip: 'Пропустить опенинг — вперёд на 1:30',
    skipTitle: 'Вперёд на 1:30',
    settings: 'Настройки',
    pip: 'Картинка в картинке',
    fullscreen: 'На весь экран',
    quality: 'Качество',
    singleQuality: 'Одно качество',
    speed: 'Скорость',
    speedNormal: 'Обычная',
    picture: 'Картинка',
    enhanceTitle: '720+',
    enhanceNote: 'Чётче линии на 480p и 720p. Греет устройство.',
    enhanceUnsupported: 'Устройство не умеет',
    episode: (n) => `${n} серия`,
    fallbackSource: 'прямой файл',
    noEpisodesTitle: 'Серии не найдены',
    noEpisodesText: 'Источник не отдал список серий',
    errTitle: 'Видео не запустилось',
    errUnknown: 'Неизвестная ошибка источника',
    errCodes: {
      1: 'Загрузка прервана',
      2: 'Сеть не отдала файл',
      3: 'Файл повреждён или формат не поддерживается',
      4: 'Источник недоступен',
    },
    hlsBrokeTitle: 'Поток оборвался',
    hlsBrokeText: 'Сервер перестал отдавать сегменты видео',
    hlsLoadTitle: 'Не загрузился HLS',
    hlsLoadText: 'Не удалось загрузить hls.js',
  },
  en: {
    loading: 'Lighting the fire…',
    play: 'Play',
    playPause: 'Play / pause',
    prev: 'Previous episode',
    next: 'Next episode',
    mute: 'Mute',
    volume: 'Volume',
    position: 'Position',
    skip: 'Skip opening — forward 1:30',
    skipTitle: 'Forward 1:30',
    settings: 'Settings',
    pip: 'Picture in picture',
    fullscreen: 'Fullscreen',
    quality: 'Quality',
    singleQuality: 'Single quality',
    speed: 'Speed',
    speedNormal: 'Normal',
    picture: 'Picture',
    enhanceTitle: '720+',
    enhanceNote: 'Crisper lines on 480p and 720p. Warms the device.',
    enhanceUnsupported: 'Not supported here',
    episode: (n) => `Episode ${n}`,
    fallbackSource: 'direct file',
    noEpisodesTitle: 'No episodes',
    noEpisodesText: 'The source returned no episode list',
    errTitle: 'Video failed to start',
    errUnknown: 'Unknown source error',
    errCodes: {
      1: 'Loading aborted',
      2: 'Network error',
      3: 'File is corrupted or format is not supported',
      4: 'Source is unavailable',
    },
    hlsBrokeTitle: 'Stream interrupted',
    hlsBrokeText: 'The server stopped sending video segments',
    hlsLoadTitle: 'HLS failed to load',
    hlsLoadText: 'Could not load hls.js',
  },
};

/* ---------- hls.js грузим один раз и только когда нужен ---------- */
const hlsLoaders = new Map();
function loadHls(url) {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsLoaders.has(url)) return hlsLoaders.get(url);
  const loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve(window.Hls);
    s.onerror = () => { hlsLoaders.delete(url); reject(new Error('hls.js')); };
    document.head.append(s);
  });
  hlsLoaders.set(url, loader);
  return loader;
}

/* ---------- Иконки ---------- */
const SVG = {
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM14 4h4v16h-4z',
  volume: 'M4 9h4l5-4v14l-5-4H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4m-2.5 6.9a7 7 0 0 0 0-13.8v2.1a5 5 0 0 1 0 9.6z',
  mute: 'M4 9h4l5-4v14l-5-4H4zm12 1.4L17.4 9 19 10.6 20.6 9 22 10.4 20.4 12 22 13.6 20.6 15 19 13.4 17.4 15 16 13.6 17.6 12z',
  full: 'M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM6 15v3h3v2H4v-5zm12 0h2v5h-5v-2h3z',
  exit: 'M9 4v5H4V7h3V4zm6 0h2v3h3v2h-5zm0 16v-5h5v2h-3v3zM9 20H7v-3H4v-2h5z',
  pip: 'M19 11h-8v6h8zM3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1m1 2v10h16V7z',
  next: 'M5 4l10 8-10 8zm11 0h3v16h-3z',
  prev: 'M19 4L9 12l10 8zM5 4h3v16H5z',
  /* Настоящая шестерёнка: люди ищут глазами именно её,
     а три полоски-ползунка как «настройки» не читаются. */
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M19.4 12c0-.5 0-1-.1-1.5l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2.6-1.5L14 2.6h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.7 7.7 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3 1 2-3.4-2-1.5c.1-.5.1-1 .1-1.5Z',
  fwd: 'M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8',
  /* Две стрелки — общепринятый знак «перемотать вперёд» */
  skip: 'M4 5.5 12 12l-8 6.5zM13 5.5 21 12l-8 6.5z',
  back: 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8',
};

const svg = (d, cls = '') => {
  const stroke = d === SVG.gear;
  return `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">`
    + `<path d="${d}" fill="${stroke ? 'none' : 'currentColor'}"`
    + (stroke ? ' stroke="currentColor" stroke-width="1.8" stroke-linecap="round"' : '')
    + '/></svg>';
};

export class YokaiiPlayer {
  /**
   * @param {HTMLElement} mount контейнер (станет корнем плеера)
   * @param {object} options   см. DEFAULTS выше и docs/API.md
   */
  constructor(mount, options = {}) {
    if (!mount) throw new Error('YokaiiPlayer: не передан контейнер');

    this.mount = mount;
    this.options = {
      ...DEFAULTS,
      ...options,
      enhance: { ...DEFAULTS.enhance, ...(options.enhance || {}) },
    };
    this.t = { ...(STRINGS[this.options.lang] || STRINGS.ru), ...this.options.labels };
    this.key = (name) => `${this.options.storageKey}:${name}`;

    this.listeners = new Map();
    this.cleanup = [];         // всё, что нужно снять в destroy()

    this.episodes = [];
    this.current = null;       // текущий объект серии
    this.qualityIndex = 0;
    this.hls = null;
    this.destroyed = false;
    this.idleTimer = null;
    this.tapAt = 0;            // время касания — отличаем тап от свайпа
    this.seeking = false;

    this.#render();
    this.#bindVideo();
    this.#bindControls();
    if (this.options.keyboard) this.#bindKeys();
    this.#bindGestures();
    this.#restoreVolume();
    this.#setupEnhancer();
  }

  /* ==========================================================
     Улучшение картинки

     Шейдерная обработка кадра поверх видео: убирает размыв на
     границах заливок у 480p и 720p. Подробности и честная оговорка
     о том, что это не нейросеть, — в src/enhance.js.
     ========================================================== */
  #setupEnhancer() {
    const saved = ls.get(this.key('enhance'), this.options.enhance.enabled ? 'on' : 'off');
    this.enhanceMode = saved === 'on' ? 'on' : 'off';

    if (!Enhancer.supported()) {
      this.enhanceMode = 'off';
      this.enhanceUnsupported = true;
      return;
    }

    this.enhancer = new Enhancer(this.video, this.canvas, {
      maxHeight: this.options.enhance.maxHeight,
      /* Видео прячем ТОЛЬКО после первого настоящего кадра на
         холсте — подробный разбор в enhance.js. */
      onReady: () => { this.mount.dataset.enhanced = 'yes'; },
      onFail: (reason) => {
        this.mount.dataset.enhanced = 'no';
        this.enhanceMode = 'off';
        ls.set(this.key('enhance'), 'off');
        this.#renderMenu();
        this.emit('enhancefail', { reason });
      },
    });

    /* Пока видео на паузе или не пошло — обработка не нужна:
       пусть телефон не греется на неподвижном кадре. */
    this.video.addEventListener('playing', () => this.#applyEnhance());
    this.video.addEventListener('seeked', () => {
      if (this.enhanceMode === 'on' && this.video.paused) this.#applyEnhance();
    });
    /* На паузе — только останавливаем цикл, последний кадр остаётся
       на холсте. Раньше здесь был stop(): холст прятался, а видео
       под ним оставалось прозрачным — пауза с «720+» давала чёрный
       экран. */
    this.video.addEventListener('pause', () => this.enhancer?.pause());

    /* Сменился источник (серия, качество): холст с кадром старой
       серии больше не нужен — возвращаем видео, пока грузится новое.
       На `playing` обработка поднимется снова. */
    this.video.addEventListener('emptied', () => {
      this.enhancer?.stop();
      this.mount.dataset.enhanced = 'no';
    });
  }

  #applyEnhance() {
    if (!this.enhancer || this.enhanceMode === 'off') {
      this.enhancer?.stop();
      this.mount.dataset.enhanced = 'no';
      return;
    }
    /* data-enhanced здесь НЕ ставится: успешный start() значит лишь
       «WebGL завёлся», а не «картинка идёт». Флаг поднимет onReady
       после первого нарисованного кадра. */
    if (!this.enhancer.start()) {
      this.mount.dataset.enhanced = 'no';
      this.enhanceMode = 'off';
    }
  }

  /** Включить / выключить «720+»: 'on' | 'off' */
  setEnhance(mode) {
    if (this.enhanceUnsupported) return;
    this.enhanceMode = mode === 'on' ? 'on' : 'off';
    ls.set(this.key('enhance'), this.enhanceMode);

    /* Меню открывают, поставив видео на паузу, — поэтому нельзя
       требовать, чтобы видео играло. Если кадр уже есть
       (readyState >= 2), включаем сразу: холст нарисует текущий
       кадр. Если кадра нет — обработка поднимется на `playing`. */
    if (this.enhanceMode === 'off') {
      this.enhancer?.stop();
      this.mount.dataset.enhanced = 'no';
    } else if (this.video.readyState >= 2) {
      this.#applyEnhance();
    }

    this.#renderMenu();
    this.emit('enhancechange', { mode: this.enhanceMode });
  }

  /* ==========================================================
     Разметка
     ========================================================== */
  #render() {
    const { t } = this;
    const step = this.options.seekStep;

    this.mount.classList.add('yplayer');
    this.mount.innerHTML = `
      <video class="yp-video" playsinline preload="metadata"></video>

      <canvas class="yp-canvas" hidden aria-hidden="true"></canvas>

      <div class="yp-veil"></div>

      <div class="yp-loading" data-state="off">
        <div class="yp-flame"><i></i><i></i><i></i></div>
        <span class="yp-loading-text"></span>
      </div>

      <div class="yp-gesture yp-gesture--left" aria-hidden="true">
        ${svg(SVG.back)}<span>${step}</span>
      </div>
      <div class="yp-gesture yp-gesture--right" aria-hidden="true">
        ${svg(SVG.fwd)}<span>${step}</span>
      </div>

      <button class="yp-bigplay" aria-label="${esc(t.play)}">${svg(SVG.play)}</button>

      <div class="yp-error" data-state="off" role="alert">
        <h4></h4>
        <p></p>
        <div class="yp-error-actions"></div>
      </div>

      <div class="yp-top">
        <div class="yp-titles">
          <span class="yp-title"></span>
          <span class="yp-subtitle"></span>
        </div>
      </div>

      <div class="yp-panel">
        <div class="yp-track" tabindex="0" role="slider"
             aria-label="${esc(t.position)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="yp-buffer"></div>
          <div class="yp-played"><i class="yp-head"></i></div>
          <div class="yp-hover"><span class="yp-hover-time">0:00</span></div>
        </div>

        <div class="yp-buttons">
          <button class="yp-btn yp-toggle" aria-label="${esc(t.playPause)}">${svg(SVG.play, 'i-play')}${svg(SVG.pause, 'i-pause')}</button>
          <button class="yp-btn yp-prev" aria-label="${esc(t.prev)}" disabled>${svg(SVG.prev)}</button>
          <button class="yp-btn yp-next" aria-label="${esc(t.next)}" disabled>${svg(SVG.next)}</button>

          <div class="yp-volume">
            <button class="yp-btn yp-mute" aria-label="${esc(t.mute)}">${svg(SVG.volume, 'i-vol')}${svg(SVG.mute, 'i-mute')}</button>
            <input class="yp-vol-range" type="range" min="0" max="1" step="0.01" value="1" aria-label="${esc(t.volume)}">
          </div>

          <span class="yp-time"><b>0:00</b> <s>/</s> <em>0:00</em></span>

          <div class="yp-flex"></div>

          <button class="yp-btn yp-jump" aria-label="${esc(t.skip)}" title="${esc(t.skipTitle)}">${svg(SVG.skip)}</button>

          <div class="yp-menu-wrap">
            <button class="yp-btn yp-settings" aria-label="${esc(t.settings)}" aria-haspopup="true">${svg(SVG.gear)}</button>
            <div class="yp-menu" data-state="off"></div>
          </div>

          <button class="yp-btn yp-pip" aria-label="${esc(t.pip)}">${svg(SVG.pip)}</button>
          <button class="yp-btn yp-full" aria-label="${esc(t.fullscreen)}">${svg(SVG.full, 'i-full')}${svg(SVG.exit, 'i-exit')}</button>
        </div>
      </div>
    `;

    const q = (sel) => this.mount.querySelector(sel);
    this.video = q('.yp-video');
    this.canvas = q('.yp-canvas');
    this.ui = {
      loading: q('.yp-loading'),
      loadingText: q('.yp-loading-text'),
      bigplay: q('.yp-bigplay'),
      jump: q('.yp-jump'),
      error: q('.yp-error'),
      errorTitle: q('.yp-error h4'),
      errorText: q('.yp-error p'),
      errorActions: q('.yp-error-actions'),
      title: q('.yp-title'),
      subtitle: q('.yp-subtitle'),
      track: q('.yp-track'),
      buffer: q('.yp-buffer'),
      played: q('.yp-played'),
      hover: q('.yp-hover'),
      hoverTime: q('.yp-hover-time'),
      toggle: q('.yp-toggle'),
      prev: q('.yp-prev'),
      next: q('.yp-next'),
      mute: q('.yp-mute'),
      volRange: q('.yp-vol-range'),
      time: q('.yp-time b'),
      duration: q('.yp-time em'),
      settings: q('.yp-settings'),
      menu: q('.yp-menu'),
      pip: q('.yp-pip'),
      full: q('.yp-full'),
      gestureLeft: q('.yp-gesture--left'),
      gestureRight: q('.yp-gesture--right'),
      panel: q('.yp-panel'),
      top: q('.yp-top'),
    };

    /* Всё, что может прийти извне, — только через свойства и
       textContent, а не склейкой в innerHTML: так ни постер, ни
       название серии не превратятся в чужой HTML. */
    if (this.options.poster) this.video.poster = this.options.poster;
    this.ui.loadingText.textContent = t.loading;
    this.ui.title.textContent = this.options.title;
    this.ui.subtitle.textContent = this.options.subtitle;

    // PiP есть не везде (Firefox) — не показываем мёртвую кнопку
    if (!document.pictureInPictureEnabled) this.ui.pip.hidden = true;
  }

  /* ==========================================================
     События <video>
     ========================================================== */
  #bindVideo() {
    const v = this.video;
    const { t } = this;

    v.addEventListener('loadstart', () => this.#loading(true));
    v.addEventListener('waiting', () => this.#loading(true));
    v.addEventListener('canplay', () => this.#loading(false));
    v.addEventListener('playing', () => { this.#loading(false); this.mount.dataset.playing = 'yes'; });

    v.addEventListener('loadedmetadata', () => {
      this.ui.duration.textContent = timecode(v.duration);
      this.emit('durationchange', { duration: v.duration });
      this.emit('ready', { duration: v.duration });
    });

    v.addEventListener('play', () => {
      this.mount.dataset.playing = 'yes';
      this.emit('play', this.state());
      this.#scheduleHide();
    });

    v.addEventListener('pause', () => {
      this.mount.dataset.playing = 'no';
      this.mount.dataset.idle = 'no';
      this.emit('pause', this.state());
    });

    /* Перемотка — отдельным событием: совместному просмотру нужно
       знать не только «играет / на паузе», но и куда прыгнули. */
    v.addEventListener('seeked', () => this.emit('seeked', this.state()));

    v.addEventListener('timeupdate', () => {
      if (this.seeking) return;
      this.#paintProgress();
      this.#maybeSkipHint();
      this.emit('timeupdate', this.state());
    });

    v.addEventListener('progress', () => this.#paintBuffer());

    v.addEventListener('ended', () => {
      this.mount.dataset.playing = 'no';
      this.emit('ended', this.state());
    });

    v.addEventListener('error', () => {
      // Ошибку, пока HLS управляет элементом, разбирает сам hls.js
      if (this.hls) return;
      const code = v.error?.code;
      const message = t.errCodes[code] || t.errUnknown;
      this.showError(t.errTitle, message);
      this.emit('error', { code, message });
    });

    v.addEventListener('volumechange', () => {
      this.mount.dataset.muted = v.muted || v.volume === 0 ? 'yes' : 'no';
      this.ui.volRange.value = v.muted ? 0 : v.volume;
      ls.set(this.key('volume'), { volume: v.volume, muted: v.muted });
    });
  }

  /* Обработчик на document/window, который обязательно снимется в destroy() */
  #listen(target, event, handler, opts) {
    target.addEventListener(event, handler, opts);
    this.cleanup.push(() => target.removeEventListener(event, handler, opts));
  }

  /* ==========================================================
     Панель управления
     ========================================================== */
  #bindControls() {
    const { ui } = this;

    ui.toggle.onclick = () => this.toggle();
    ui.bigplay.onclick = () => this.toggle();

    ui.prev.onclick = () => this.prevEpisode();
    ui.next.onclick = () => this.nextEpisode();

    ui.mute.onclick = () => { this.video.muted = !this.video.muted; };
    ui.volRange.oninput = (e) => {
      this.video.volume = Number(e.target.value);
      this.video.muted = Number(e.target.value) === 0;
    };

    ui.full.onclick = () => this.toggleFullscreen();
    ui.pip.onclick = () => this.togglePip();

    ui.settings.onclick = (e) => {
      e.stopPropagation();
      const open = ui.menu.dataset.state === 'on';
      ui.menu.dataset.state = open ? 'off' : 'on';
      ui.settings.setAttribute('aria-expanded', String(!open));
      if (!open) this.#renderMenu();
    };
    ui.menu.addEventListener('click', (e) => e.stopPropagation());
    this.#listen(document, 'click', () => {
      ui.menu.dataset.state = 'off';
      ui.settings.setAttribute('aria-expanded', 'false');
    });

    ui.jump.onclick = () => {
      /* Прыгаем РОВНО на skipStep вперёд от текущей секунды, а не на
         заранее назначенную отметку: опенинг часто идёт после
         короткой сцены, и фиксированная отметка роняла человека в
         середину песни. Кнопка делает ровно то, что обещает. */
      this.seek(this.video.currentTime + this.options.skipStep, 'right');

      /* Короткая подсветка: кнопку можно нажать и второй раз, если
         опенинг длиннее, — без отклика непонятно, сработало ли. */
      ui.jump.classList.add('-hit');
      setTimeout(() => ui.jump.classList.remove('-hit'), 400);
    };

    /* --- перемотка по дорожке --- */
    const positionFromEvent = (e) => {
      const rect = ui.track.getBoundingClientRect();
      const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
      return clamp(x / rect.width, 0, 1);
    };

    const moveSeek = (e) => {
      const ratio = positionFromEvent(e);
      ui.played.style.width = `${ratio * 100}%`;
      ui.time.textContent = timecode(ratio * (this.video.duration || 0));
    };

    const endSeek = (e) => {
      window.removeEventListener('pointermove', moveSeek);
      const ratio = positionFromEvent(e);
      this.seeking = false;
      this.mount.dataset.scrubbing = 'no';
      this.seek(ratio * (this.video.duration || 0));
    };

    ui.track.addEventListener('pointerdown', (e) => {
      this.seeking = true;
      this.mount.dataset.scrubbing = 'yes';
      moveSeek(e);
      window.addEventListener('pointermove', moveSeek);
      window.addEventListener('pointerup', endSeek, { once: true });
    });

    ui.track.addEventListener('pointermove', (e) => {
      const ratio = positionFromEvent(e);
      ui.hover.style.left = `${ratio * 100}%`;
      ui.hoverTime.textContent = timecode(ratio * (this.video.duration || 0));
    });

    ui.track.addEventListener('keydown', (e) => {
      if (this.options.keyboard) return; // глобальные клавиши уже это делают
      if (e.key === 'ArrowRight') this.seek(this.video.currentTime + this.options.seekStep);
      if (e.key === 'ArrowLeft') this.seek(this.video.currentTime - this.options.seekStep);
    });

    /* ==========================================================
       Автоскрытие панели

       Две беды, обе на телефоне.

       1. `pointerleave` прятал панель СРАЗУ. У мыши это верно —
          курсор ушёл. Но у касания указатель уничтожается, когда
          палец отрывается от экрана, и браузер шлёт то же событие:
          нажал — панель появилась — отпустил — исчезла.

       2. `pointermove` держал панель живой только под мышью.

       Как теперь: касание по видео ПЕРЕКЛЮЧАЕТ панель. Показалась —
       висит, пока не пройдёт время бездействия. Любое касание самой
       панели сбрасывает отсчёт заново.
       ========================================================== */
    const isMouse = (e) => e.pointerType === 'mouse' || e.pointerType === '';

    this.mount.addEventListener('pointermove', (e) => {
      if (isMouse(e)) this.#wake();
    });

    this.mount.addEventListener('pointerleave', (e) => {
      if (isMouse(e) && !this.video.paused) this.mount.dataset.idle = 'yes';
    });

    const keepAlive = (e) => { if (!isMouse(e)) this.#wake(); };
    ['pointerdown', 'pointerup', 'input', 'change'].forEach((evt) => {
      ui.panel.addEventListener(evt, keepAlive, { passive: true });
      ui.top.addEventListener(evt, keepAlive, { passive: true });
    });

    this.mount.addEventListener('pointerdown', (e) => {
      if (isMouse(e)) { this.#wake(); return; }
      if (e.target.closest('.yp-panel, .yp-top, .yp-menu')) return;
      this.tapAt = Date.now();
    }, { passive: true });

    this.mount.addEventListener('pointerup', (e) => {
      if (isMouse(e)) return;
      if (!this.tapAt || Date.now() - this.tapAt > 400) { this.tapAt = 0; return; }
      this.tapAt = 0;

      if (e.target.closest('.yp-panel, .yp-top, .yp-menu')) return;

      // Меню открыто — первым касанием закрываем его
      if (ui.menu.dataset.state === 'on') {
        ui.menu.dataset.state = 'off';
        this.#wake();
        return;
      }

      if (this.mount.dataset.idle === 'yes') this.#wake();
      else if (!this.video.paused) this.mount.dataset.idle = 'yes';
    }, { passive: true });

    this.#listen(document, 'fullscreenchange', () => {
      this.mount.dataset.fullscreen = document.fullscreenElement === this.mount ? 'yes' : 'no';
    });
  }

  /* ==========================================================
     Клавиатура
     ========================================================== */
  #bindKeys() {
    this.#listen(document, 'keydown', (e) => {
      if (this.destroyed || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName) || active?.isContentEditable) {
        // Исключение — наши собственные ползунки
        if (!this.mount.contains(active)) return;
      }

      /* Если на странице несколько плееров или открыт модал,
         клавиши достаются тому плееру, в котором фокус. */
      const focusedPlayer = active?.closest?.('.yplayer');
      if (focusedPlayer && focusedPlayer !== this.mount) return;

      /* Режим телевизора (см. src/remote.js): стрелки принадлежат
         плееру, только когда фокус в нём или он во весь экран.
         Иначе «вниз» разом уводил бы фокус И убавлял громкость. */
      if (this.mount.dataset.tv === 'on' && /^Arrow/.test(e.key)
        && !this.mount.contains(active) && !document.fullscreenElement) return;

      const step = e.shiftKey ? this.options.seekStepLong : this.options.seekStep;
      const map = {
        ' ': () => this.toggle(),
        k: () => this.toggle(),
        ArrowRight: () => this.seek(this.video.currentTime + step, 'right'),
        ArrowLeft: () => this.seek(this.video.currentTime - step, 'left'),
        ArrowUp: () => this.setVolume(this.video.volume + 0.1),
        ArrowDown: () => this.setVolume(this.video.volume - 0.1),
        f: () => this.toggleFullscreen(),
        m: () => { this.video.muted = !this.video.muted; },
        p: () => this.togglePip(),
        n: () => this.nextEpisode(),
        b: () => this.prevEpisode(),
        s: () => this.seek(this.video.currentTime + this.options.skipStep, 'right'),
      };

      const handler = map[e.key] || map[e.key.toLowerCase()];
      if (handler) {
        // Пробел по кнопке плеера — это уже её клик, не дублируем
        if (e.key === ' ' && active?.tagName === 'BUTTON' && this.mount.contains(active)) return;
        e.preventDefault();
        this.#wake();
        handler();
        return;
      }

      // 0–9 — прыжок по процентам, как на YouTube
      if (/^[0-9]$/.test(e.key) && this.video.duration) {
        e.preventDefault();
        this.seek((Number(e.key) / 10) * this.video.duration);
      }
    });
  }

  /**
   * Медиа-действие от пульта, гарнитуры или своего кода.
   * @param {'toggle'|'play'|'pause'|'forward'|'rewind'|'next'|'prev'|'wake'} action
   */
  handleMedia(action) {
    if (this.destroyed) return;
    const step = this.options.seekStepLong;
    const act = {
      toggle: () => this.toggle(),
      play: () => this.play(),
      pause: () => this.pause(),
      forward: () => this.seek(this.video.currentTime + step, 'right'),
      rewind: () => this.seek(this.video.currentTime - step, 'left'),
      next: () => this.nextEpisode(),
      prev: () => this.prevEpisode(),
      wake: () => {},
    }[action];
    if (!act) return;
    this.#wake();
    act();
  }

  /* ==========================================================
     Жесты: двойной тап по краям = перемотка
     ========================================================== */
  #bindGestures() {
    let lastTap = 0;
    let lastSide = null;
    const step = this.options.seekStep;

    this.video.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      const now = Date.now();
      const rect = this.mount.getBoundingClientRect();
      const side = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right';

      if (now - lastTap < 320 && side === lastSide) {
        this.seek(this.video.currentTime + (side === 'left' ? -step : step), side);
        lastTap = 0;
      } else {
        lastTap = now;
        lastSide = side;
      }
    });

    /* Двойной клик мышью: по центру — на весь экран,
       по краям — перемотка, как на телефоне. */
    this.video.addEventListener('dblclick', (e) => {
      const rect = this.mount.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x > rect.width * 0.25 && x < rect.width * 0.75) {
        this.toggleFullscreen();
      } else {
        const side = x < rect.width / 2 ? 'left' : 'right';
        this.seek(this.video.currentTime + (side === 'left' ? -step : step), side);
      }
    });

    // Одиночный клик мышью по кадру — пауза / пуск
    this.video.addEventListener('click', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      clearTimeout(this.clickTimer);
      // Ждём: вдруг это первая половина двойного клика
      this.clickTimer = setTimeout(() => { if (e.detail === 1) this.toggle(); }, 220);
    });
    this.video.addEventListener('dblclick', () => clearTimeout(this.clickTimer));
  }

  /* ==========================================================
     Публичное API
     ========================================================== */

  /**
   * Загрузить список серий.
   * @param {Array<{number:number, title?:string, sources:Array<{src:string, type?:string, label?:string, quality?:number, crossOrigin?:string}>}>} episodes
   * @param {{title?:string, subtitle?:string}} meta
   */
  setEpisodes(episodes = [], { title, subtitle } = {}) {
    this.episodes = episodes;
    if (title != null) this.ui.title.textContent = title;
    if (subtitle != null) this.ui.subtitle.textContent = subtitle;
    this.#syncNav();
  }

  /**
   * Включить серию.
   * @param {number} number  номер серии
   * @param {number} startAt секунда старта (продолжить с места)
   */
  async playEpisode(number, startAt = 0) {
    const { t } = this;
    const episode = this.episodes.find((e) => e.number === Number(number)) || this.episodes[0];
    if (!episode) {
      this.showError(t.noEpisodesTitle, t.noEpisodesText);
      return null;
    }

    this.current = episode;
    this.hideError();
    this.#loading(true, t.episode(episode.number));
    this.ui.subtitle.textContent = [
      t.episode(episode.number),
      episode.title,
      this.options.sourceLabel,
    ].filter(Boolean).join(' · ');

    await this.#loadSource(episode, startAt);
    this.#syncNav();
    this.emit('episodechange', { episode: episode.number });
    return episode;
  }

  /**
   * Прямая загрузка одного файла (mp4 / webm / m3u8).
   * @param {string} src
   * @param {{startAt?:number, type?:string, title?:string, crossOrigin?:string}} opts
   */
  async loadFile(src, { startAt = 0, type, title, crossOrigin } = {}) {
    if (title != null) this.ui.title.textContent = title;
    this.hideError();
    this.current = { number: this.current?.number || 1, sources: [{ src, type, crossOrigin }] };
    this.qualityIndex = 0;
    await this.#loadSource(this.current, startAt);
  }

  async #loadSource(episode, startAt = 0) {
    const { t } = this;
    const sources = episode.sources || [];
    const preferred = sources[clamp(this.qualityIndex, 0, sources.length - 1)] || sources[0];
    if (!preferred) return;

    // Убираем прошлый hls
    if (this.hls) { this.hls.destroy(); this.hls = null; }

    /* CORS можно задать у конкретного источника — у одного CDN он
       есть, у другого нет. Через hls.js кадр и так читается: MSE
       отдаёт видео с нашего же домена. */
    const cors = preferred.crossOrigin ?? this.options.crossOrigin;
    if (cors) this.video.crossOrigin = cors;
    else this.video.removeAttribute('crossorigin');

    const isHls = /\.m3u8($|\?)/i.test(preferred.src)
      || /mpegurl/i.test(preferred.type || '');

    /* Safari (и iOS, и macOS) играет HLS сам — hls.js ему не нужен
       и на iPhone даже вреден: MSE там появилось только недавно. */
    if (isHls && !this.video.canPlayType('application/vnd.apple.mpegurl')) {
      try {
        const Hls = await loadHls(this.options.hlsUrl);
        if (this.destroyed) return;
        if (!Hls?.isSupported()) throw new Error('MSE');
        this.hls = new Hls(this.options.hlsConfig);
        this.hls.loadSource(preferred.src);
        this.hls.attachMedia(this.video);
        this.hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          this.showError(t.hlsBrokeTitle, t.hlsBrokeText);
          this.emit('error', { code: 'hls', message: data.details });
        });
      } catch {
        this.showError(t.hlsLoadTitle, t.hlsLoadText);
        this.emit('error', { code: 'hls-load', message: t.hlsLoadText });
        return;
      }
    } else {
      this.video.src = preferred.src;
      this.video.load();
    }

    if (startAt > 0) {
      this.video.addEventListener('loadedmetadata', () => {
        this.video.currentTime = startAt;
      }, { once: true });
    }

    if (this.options.autoplay) {
      this.video.play().catch(() => {
        // Браузер заблокировал автозапуск — покажем большую кнопку
        this.mount.dataset.playing = 'no';
        this.#loading(false);
      });
    }
  }

  play() { return this.video.play().catch(() => {}); }
  pause() { this.video.pause(); }
  toggle() { return this.video.paused ? this.play() : this.pause(); }

  /**
   * Перемотать.
   * @param {number} time секунда
   * @param {'left'|'right'|null} hintSide показать подсказку жеста
   */
  seek(time, hintSide = null) {
    if (!Number.isFinite(this.video.duration)) return;
    this.video.currentTime = clamp(time, 0, this.video.duration);
    this.#paintProgress();
    if (hintSide) this.#flashGesture(hintSide);
  }

  setVolume(value) {
    this.video.volume = clamp(value, 0, 1);
    if (this.video.volume > 0) this.video.muted = false;
  }

  setSpeed(rate) { this.video.playbackRate = rate; this.#renderMenu(); }

  setQuality(index) {
    const time = this.video.currentTime;
    const wasPaused = this.video.paused;
    this.qualityIndex = index;
    if (this.current) {
      this.#loadSource(this.current, time).then(() => {
        if (wasPaused) this.video.pause();
      });
    }
    this.#renderMenu();
    this.emit('qualitychange', { index, label: this.current?.sources?.[index]?.label });
  }

  /** Следующая серия. Вернёт промис playEpisode или null, если серий дальше нет */
  nextEpisode() {
    if (!this.current) return null;
    const idx = this.episodes.findIndex((e) => e.number === this.current.number);
    const next = this.episodes[idx + 1];
    return next ? this.playEpisode(next.number) : null;
  }

  prevEpisode() {
    if (!this.current) return null;
    const idx = this.episodes.findIndex((e) => e.number === this.current.number);
    const prev = this.episodes[idx - 1];
    return prev ? this.playEpisode(prev.number) : null;
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.mount.requestFullscreen({ navigationUI: 'hide' });
      // На телефоне во весь экран — сразу горизонтально
      if (screen.orientation?.lock && document.fullscreenElement) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch {
      /* iOS Safari не умеет полноэкранный режим для div —
         только для самого <video>, нативным плеером. */
      this.video.webkitEnterFullscreen?.();
    }
  }

  async togglePip() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await this.video.requestPictureInPicture();
    } catch { /* не поддерживается */ }
  }

  /** Снимок состояния — удобно для сохранения прогресса */
  state() {
    return {
      time: this.video.currentTime || 0,
      duration: this.video.duration || 0,
      episode: this.current?.number || 1,
      paused: this.video.paused,
      source: 'yokaii',
    };
  }

  /**
   * Экран ошибки с кнопками.
   * @param {string} title
   * @param {string} text
   * @param {Array<{label:string, onClick:Function, primary?:boolean}>} actions
   */
  showError(title, text, actions = []) {
    this.#loading(false);
    this.ui.errorTitle.textContent = title;
    this.ui.errorText.textContent = text;
    this.ui.errorActions.replaceChildren();
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'yp-err-btn' + (a.primary ? ' -primary' : '');
      btn.textContent = a.label;
      btn.onclick = a.onClick;
      this.ui.errorActions.append(btn);
    });
    this.ui.error.dataset.state = 'on';
  }

  hideError() { this.ui.error.dataset.state = 'off'; }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.enhancer?.destroy();
    this.cleanup.forEach((off) => off());
    this.cleanup = [];
    clearTimeout(this.idleTimer);
    clearTimeout(this.clickTimer);
    if (this.hls) this.hls.destroy();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.mount.innerHTML = '';
    this.mount.classList.remove('yplayer');
    this.listeners.clear();
  }

  /* ==========================================================
     События
     ========================================================== */
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  emit(event, payload) {
    this.listeners.get(event)?.forEach((cb) => {
      try { cb(payload); } catch (err) { console.error('[yokaii-player]', event, err); }
    });
  }

  /* ==========================================================
     Внутреннее
     ========================================================== */
  #paintProgress() {
    const { currentTime: time, duration: d } = this.video;
    const ratio = d ? (time / d) * 100 : 0;
    this.ui.played.style.width = `${ratio}%`;
    this.ui.time.textContent = timecode(time);
    this.ui.duration.textContent = timecode(d);
    this.ui.track.setAttribute('aria-valuenow', Math.round(ratio));
  }

  #paintBuffer() {
    const { buffered, duration } = this.video;
    if (!buffered.length || !duration) return;
    const end = buffered.end(buffered.length - 1);
    this.ui.buffer.style.width = `${(end / duration) * 100}%`;
  }

  /**
   * Подсветка кнопки пропуска в начале серии.
   * Кнопка видна всегда, но в первые три минуты, когда обычно
   * идёт опенинг, мягко подсвечивается — без навязчивой плашки
   * поверх кадра.
   */
  #maybeSkipHint() {
    const time = this.video.currentTime;
    const duration = this.video.duration || 0;
    const early = time >= 4 && time <= 180;
    const notAtEnd = !duration || duration - time > 120;
    this.ui.jump.classList.toggle('-hint', early && notAtEnd);
  }

  #syncNav() {
    const idx = this.current
      ? this.episodes.findIndex((e) => e.number === this.current.number)
      : -1;
    this.ui.prev.disabled = idx <= 0;
    this.ui.next.disabled = idx === -1 || idx >= this.episodes.length - 1;
  }

  #loading(on, text) {
    this.ui.loading.dataset.state = on ? 'on' : 'off';
    if (text) this.ui.loadingText.textContent = text;
  }

  #wake() {
    this.mount.dataset.idle = 'no';
    this.#scheduleHide();
  }

  #scheduleHide() {
    clearTimeout(this.idleTimer);
    if (this.video.paused) return;

    /* Пальцем всё делается медленнее, чем мышью: попасть по
       ползунку, открыть меню, выбрать пункт. Поэтому на сенсорном
       экране времени даём заметно больше. */
    const touch = !window.matchMedia('(hover: hover)').matches;
    const delay = touch ? Math.max(this.options.idleHide, 4200) : this.options.idleHide;

    this.idleTimer = setTimeout(() => {
      // Пока человек тянет ползунок или выбирает в меню — не прячем
      if (this.seeking || this.ui.menu.dataset.state === 'on') return this.#scheduleHide();
      // Фокус с пульта на кнопках панели — тоже не прячем
      if (this.ui.panel.contains(document.activeElement) && this.mount.dataset.tv === 'on') {
        return this.#scheduleHide();
      }
      if (!this.video.paused) this.mount.dataset.idle = 'yes';
    }, delay);
  }

  #flashGesture(side) {
    const node = side === 'left' ? this.ui.gestureLeft : this.ui.gestureRight;
    node.dataset.state = 'on';
    clearTimeout(node._timer);
    node._timer = setTimeout(() => { node.dataset.state = 'off'; }, 450);
  }

  #restoreVolume() {
    const saved = ls.get(this.key('volume'));
    if (saved) {
      this.video.volume = clamp(saved.volume ?? 1, 0, 1);
      this.video.muted = Boolean(saved.muted);
      this.ui.volRange.value = saved.muted ? 0 : (saved.volume ?? 1);
    }
  }

  #renderMenu() {
    const { t } = this;
    const sources = this.current?.sources || [];

    /* Подписи качества приходят извне (из API источника) —
       экранируем, прежде чем класть в разметку. */
    this.ui.menu.innerHTML = `
      <div class="yp-menu-group">
        <span class="yp-menu-label">${esc(t.quality)}</span>
        ${sources.length > 1
          ? sources.map((s, i) => `
              <button class="yp-menu-item${i === this.qualityIndex ? ' -on' : ''}" data-quality="${i}">
                ${esc(s.label || (s.quality ? `${s.quality}p` : `#${i + 1}`))}
              </button>`).join('')
          : `<span class="yp-menu-empty">${esc(t.singleQuality)}</span>`}
      </div>
      <div class="yp-menu-group">
        <span class="yp-menu-label">${esc(t.speed)}</span>
        ${this.options.speeds.map((s) => `
          <button class="yp-menu-item${this.video.playbackRate === s ? ' -on' : ''}" data-speed="${Number(s)}">
            ${s === 1 ? esc(t.speedNormal) : `${Number(s)}×`}
          </button>`).join('')}
      </div>
      <div class="yp-menu-group">
        <span class="yp-menu-label">${esc(t.picture)}</span>
        ${this.enhanceUnsupported
          ? `<span class="yp-menu-empty">${esc(t.enhanceUnsupported)}</span>`
          : `<button class="yp-menu-item -switch${this.enhanceMode === 'on' ? ' -on' : ''}"
                     data-enhance="${this.enhanceMode === 'on' ? 'off' : 'on'}"
                     role="switch" aria-checked="${this.enhanceMode === 'on'}">
               <span>${esc(t.enhanceTitle)}</span>
               <i class="yp-switch"></i>
             </button>
             <span class="yp-menu-note">${esc(t.enhanceNote)}</span>`}
      </div>
    `;

    this.ui.menu.querySelectorAll('[data-quality]').forEach((btn) => {
      btn.onclick = () => this.setQuality(Number(btn.dataset.quality));
    });
    this.ui.menu.querySelectorAll('[data-speed]').forEach((btn) => {
      btn.onclick = () => this.setSpeed(Number(btn.dataset.speed));
    });
    this.ui.menu.querySelectorAll('[data-enhance]').forEach((btn) => {
      btn.onclick = () => this.setEnhance(btn.dataset.enhance);
    });
  }
}

export default YokaiiPlayer;
