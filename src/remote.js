/* ============================================================
   Yokaii Player — пульт телевизора и медиакнопки

   Samsung Tizen, LG webOS, Android TV, приставки и обычные
   клавиатуры с медиаклавишами шлют РАЗНЫЕ коды. Здесь они
   сводятся к семи действиям плеера, а плеер про коды не знает.

   Использование:
     import { attachRemote } from './remote.js';
     const detach = attachRemote(player, { tv: true });
     // …позже: detach();
   ============================================================ */

/* Стандартные имена клавиш (KeyboardEvent.key) */
const MEDIA_KEYS = {
  MediaPlayPause: 'toggle', MediaPlay: 'play', MediaPause: 'pause', MediaStop: 'pause',
  MediaFastForward: 'forward', MediaRewind: 'rewind',
  MediaTrackNext: 'next', MediaTrackPrevious: 'prev',
};

/* Старые пульты отдают только keyCode.
   10252 — Play/Pause у Tizen, 415/19/413/417/412 — общие для
   Tizen и webOS (HbbTV), 176/177 — «следующий / предыдущий трек». */
const MEDIA_CODES = {
  10252: 'toggle', 415: 'play', 19: 'pause', 413: 'pause',
  417: 'forward', 412: 'rewind', 176: 'next', 177: 'prev',
};

/* Tizen присылает медиаклавиши, только если их явно попросить */
function registerTizenKeys() {
  try {
    const api = window.tizen?.tvinputdevice;
    if (!api) return;
    ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
      'MediaFastForward', 'MediaRewind', 'MediaTrackNext', 'MediaTrackPrevious']
      .forEach((k) => { try { api.registerKey(k); } catch { /* нет такой клавиши */ } });
  } catch { /* не телевизор */ }
}

/**
 * Подключить пульт к плееру.
 *
 * @param {import('./yokaii-player.js').YokaiiPlayer} player
 * @param {object} [opts]
 * @param {boolean} [opts.tv=false]  режим телевизора: крупная панель,
 *        фокус на плеере, «ОК» = пауза, стрелки — только когда
 *        фокус внутри плеера (иначе они листают страницу)
 * @param {boolean} [opts.mediaSession=true] кнопки на экране
 *        блокировки телефона, в шторке Android и на гарнитуре
 * @returns {() => void} функция отключения
 */
export function attachRemote(player, { tv = false, mediaSession = true } = {}) {
  const { mount } = player;
  const off = [];

  if (tv) {
    mount.dataset.tv = 'on';
    // Плеер должен уметь получить фокус с пульта
    if (!mount.hasAttribute('tabindex')) mount.tabIndex = 0;
    registerTizenKeys();
  }

  /* ---------- клавиши ---------- */
  const onKey = (e) => {
    const action = MEDIA_KEYS[e.key] || MEDIA_CODES[e.keyCode];
    if (action) {
      e.preventDefault();
      player.handleMedia(action);
      return;
    }

    // «ОК» на самом плеере (не на кнопке панели) — пауза / пуск
    if (tv && e.key === 'Enter' && document.activeElement === mount) {
      e.preventDefault();
      player.handleMedia('toggle');
      return;
    }

    /* Вверх / вниз при фокусе на плеере будят панель и уводят
       фокус в её кнопки — так до шестерёнки можно дойти с пульта. */
    if (tv && document.activeElement === mount && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      e.stopImmediatePropagation(); // не менять громкость этим же нажатием
      player.handleMedia('wake');
      mount.querySelector('.yp-toggle')?.focus();
    }
  };
  // capture: раньше плеера, чтобы «вверх» не ушёл в громкость
  window.addEventListener('keydown', onKey, true);
  off.push(() => window.removeEventListener('keydown', onKey, true));

  /* ---------- Media Session API ----------
     Кнопки в шторке Android, на экране блокировки iOS,
     на Bluetooth-наушниках и в «Сейчас играет» macOS. */
  if (mediaSession && 'mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const handlers = {
      play: () => player.handleMedia('play'),
      pause: () => player.handleMedia('pause'),
      seekforward: () => player.handleMedia('forward'),
      seekbackward: () => player.handleMedia('rewind'),
      nexttrack: () => player.handleMedia('next'),
      previoustrack: () => player.handleMedia('prev'),
    };
    for (const [name, fn] of Object.entries(handlers)) {
      try { ms.setActionHandler(name, fn); } catch { /* не поддерживается */ }
    }
    off.push(() => {
      for (const name of Object.keys(handlers)) {
        try { ms.setActionHandler(name, null); } catch { /* noop */ }
      }
    });

    // Название серии в шторке
    const syncMeta = () => {
      if (typeof MediaMetadata === 'undefined') return;
      const title = mount.querySelector('.yp-title')?.textContent || '';
      const artist = mount.querySelector('.yp-subtitle')?.textContent || '';
      const poster = player.video.poster;
      ms.metadata = new MediaMetadata({
        title, artist,
        artwork: poster ? [{ src: poster, sizes: '512x512' }] : [],
      });
    };
    off.push(player.on('episodechange', syncMeta));
    off.push(player.on('play', syncMeta));
  }

  return () => {
    off.forEach((fn) => fn());
    if (tv) delete mount.dataset.tv;
  };
}
