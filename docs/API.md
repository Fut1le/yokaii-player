# API Yokaii Player

## Подключение

```js
import { YokaiiPlayer, attachRemote, Enhancer } from './src/index.js';
import YokaiiPlayer from './src/index.js'; // так тоже можно
```

И стили:

```html
<link rel="stylesheet" href="src/yokaii-player.css">
```

## Конструктор

```js
const player = new YokaiiPlayer(mount, options);
```

`mount` — пустой элемент. Плеер заберёт его целиком: добавит класс `.yplayer` и заполнит своей разметкой.
По умолчанию коробка держит пропорцию 16:9 и тянется на всю ширину родителя.

### Опции

| Опция | По умолчанию | Что делает |
|---|---|---|
| `title` | `''` | Название в верхней строке |
| `subtitle` | `''` | Подпись под названием до выбора серии |
| `poster` | `''` | Картинка до старта |
| `autoplay` | `true` | Запускать серию сразу после загрузки. Если браузер запретит, появится большая кнопка «Смотреть» |
| `lang` | `'ru'` | Язык интерфейса: `'ru'` или `'en'` |
| `labels` | `{}` | Замена любых подписей, ключи те же, что в `STRINGS` внутри `yokaii-player.js` |
| `sourceLabel` | `''` | Приписка к номеру серии, например название озвучки |
| `seekStep` | `5` | Перемотка стрелками и двойным тапом, секунды |
| `seekStepLong` | `30` | Перемотка с <kbd>Shift</kbd> и с пульта |
| `skipStep` | `90` | Кнопка «пропустить опенинг» |
| `idleHide` | `2600` | Через сколько миллисекунд прятать панель при управлении мышью. На сенсорном экране не меньше 4200 |
| `speeds` | `[0.75, 1, 1.25, 1.5, 2]` | Пункты меню скорости |
| `keyboard` | `true` | Горячие клавиши на странице |
| `storageKey` | `'yokaii-player'` | Префикс ключей `localStorage` для громкости и «720+» |
| `crossOrigin` | `null` | `'anonymous'` для всех источников, если CDN отдаёт CORS-заголовки. Без CORS на CDN не ставьте: браузер откажется грузить видео |
| `hlsUrl` | jsDelivr, hls.js 1.5.13 | Откуда брать hls.js. Можно указать свою копию |
| `hlsConfig` | `{ capLevelToPlayerSize: true, maxBufferLength: 40 }` | Настройки hls.js |
| `enhance.enabled` | `false` | Включить «720+» по умолчанию, пока человек сам не выбрал |
| `enhance.maxHeight` | `1080` | Потолок растяжения кадра по высоте |

Опции лежат в `player.options`, и часть из них можно менять на лету. Например, включить
`autoplay` после первого нажатия «пуск», чтобы следующие серии стартовали сами.

## Формат серий

```js
player.setEpisodes([
  {
    number: 1,               // обязательно, по нему работают next/prev
    title: 'Начало',         // необязательно
    sources: [               // первый — качество по умолчанию
      { src: 'https://cdn.example/ep1.m3u8', label: '1080p', crossOrigin: 'anonymous' },
      { src: 'https://cdn.example/ep1-720.mp4', quality: 720 },
    ],
  },
], { title: 'Название тайтла', subtitle: '' });
```

Поля источника:

| Поле | Что это |
|---|---|
| `src` | Ссылка на `.mp4`, `.webm` или `.m3u8` |
| `type` | Необязательно. `application/x-mpegURL`, если ссылка на HLS без расширения `.m3u8` |
| `label` | Подпись в меню качества |
| `quality` | Число; если нет `label`, в меню будет `720p` |
| `crossOrigin` | CORS только для этого источника |

## Методы

| Метод | Что делает |
|---|---|
| `setEpisodes(list, { title, subtitle })` | Задать список серий |
| `playEpisode(number, startAt = 0)` | Включить серию с нужной секунды. Возвращает промис с объектом серии |
| `loadFile(src, { startAt, type, title, crossOrigin })` | Включить один файл без списка серий |
| `nextEpisode()` / `prevEpisode()` | Соседняя серия. Возвращает промис или `null`, если серии дальше нет |
| `play()` / `pause()` / `toggle()` | Управление воспроизведением |
| `seek(seconds, hintSide?)` | Перемотка. `hintSide`: `'left'` или `'right'` покажет круглую подсказку жеста |
| `setVolume(0…1)` | Громкость |
| `setSpeed(rate)` | Скорость |
| `setQuality(index)` | Качество по индексу в `sources`, позиция сохраняется |
| `setEnhance('on' \| 'off')` | «720+» |
| `toggleFullscreen()` / `togglePip()` | Весь экран / картинка в картинке |
| `handleMedia(action)` | Медиадействие: `toggle`, `play`, `pause`, `forward`, `rewind`, `next`, `prev`, `wake` |
| `showError(title, text, actions)` | Экран ошибки с кнопками: `[{ label, onClick, primary }]` |
| `hideError()` | Убрать экран ошибки |
| `state()` | `{ time, duration, episode, paused, source }` |
| `on(event, cb)` | Подписка. Возвращает функцию отписки |
| `destroy()` | Остановить видео, снять обработчики, освободить WebGL |

Прямой доступ к элементу `<video>`: `player.video`.

## События

| Событие | Данные | Когда |
|---|---|---|
| `ready` | `{ duration }` | Метаданные загружены |
| `durationchange` | `{ duration }` | Стала известна длительность |
| `play` / `pause` | `state()` | Пуск / пауза |
| `timeupdate` | `state()` | Несколько раз в секунду во время просмотра |
| `seeked` | `state()` | Перемотка завершена. Удобно для совместного просмотра |
| `ended` | `state()` | Серия закончилась |
| `episodechange` | `{ episode }` | Включена другая серия |
| `qualitychange` | `{ index, label }` | Сменилось качество |
| `enhancechange` | `{ mode }` | Человек переключил «720+» |
| `enhancefail` | `{ reason }` | «720+» выключилось само: нет WebGL2, кадр без CORS, потерян контекст |
| `error` | `{ code, message }` | Видео не запустилось. `code` — код `MediaError` (1–4), `'hls'` или `'hls-load'` |

Пример: показать свою кнопку при ошибке.

```js
player.on('error', () => {
  player.showError('Серия не загрузилась', 'Попробуйте другое качество', [
    { label: 'Другое качество', primary: true, onClick: () => player.setQuality(1) },
    { label: 'Скрыть', onClick: () => player.hideError() },
  ]);
});
```

## Пульт и медиакнопки

```js
const detach = attachRemote(player, { tv: true, mediaSession: true });
detach(); // отключить
```

| Опция | По умолчанию | Что делает |
|---|---|---|
| `tv` | `false` | Режим телевизора: панель и кнопки крупнее, плеер получает фокус, «ОК» ставит на паузу, «вверх/вниз» уводят фокус в панель. Стрелки перематывают, только когда фокус в плеере |
| `mediaSession` | `true` | Название серии и кнопки на экране блокировки, в шторке Android, на Bluetooth-гарнитуре |

Распознаются стандартные медиаклавиши (`MediaPlayPause`, `MediaTrackNext` и др.) и коды
старых пультов: Tizen `10252`, HbbTV `415`/`19`/`417`/`412`, `176`/`177`. На Tizen медиаклавиши
регистрируются автоматически через `tizen.tvinputdevice`.

## CSS-переменные

Задаются на `.yplayer` или на любом его родителе.

| Переменная | По умолчанию | Где видна |
|---|---|---|
| `--yp-accent` | `#F2452C` | Кнопка «Смотреть», прогресс, переключатели |
| `--yp-accent-2` | `#FF8A5C` | Второй конец градиента прогресса |
| `--yp-accent-glow` | `rgba(242,69,44,.5)` | Свечение кнопки и прогресса |
| `--yp-accent-soft` | `rgba(242,69,44,.12)` | Подсветка «пропустить опенинг» |
| `--yp-fox` | `#7FE8D8` | Выбранный пункт меню, фокус |
| `--yp-fox-soft` | `rgba(127,232,216,.14)` | Фон выбранного пункта |
| `--yp-text` | `#F2EFFA` | Текст |
| `--yp-muted` / `--yp-muted-dim` | `#9A93B4` / `#6C6688` | Второстепенный текст |
| `--yp-surface` | `rgba(16,13,26,.96)` | Фон меню |
| `--yp-font` | `inherit` | Основной шрифт |
| `--yp-font-display` | `var(--yp-font)` | Название и заголовок ошибки |
| `--yp-font-mono` | системный моноширинный | Время и подписи |
| `--yp-radius` | `20px` | Скругление плеера |
| `--yp-radius-menu` | `16px` | Скругление меню |
| `--yp-pad` | `clamp(12px, 2vw, 22px)` | Отступы панелей |

Чтобы плеер занимал всю высоту своего блока, а не держал 16:9:

```css
.yplayer { aspect-ratio: auto; height: 100%; }
```

## Состояние в атрибутах

Плеер пишет состояние в `data-*` корня. Их можно использовать в своих стилях:

| Атрибут | Значения |
|---|---|
| `data-playing` | `yes` / `no` |
| `data-idle` | `yes`, когда панель спрятана |
| `data-muted` | `yes` / `no` |
| `data-fullscreen` | `yes` / `no` |
| `data-scrubbing` | `yes`, пока тянут ползунок |
| `data-enhanced` | `yes`, когда «720+» реально рисует |
| `data-tv` | `on` в режиме телевизора |
