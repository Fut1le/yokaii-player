<div align="center">

<img src="assets/logo.svg" width="96" height="96" alt="Yokaii Player logo">

# Yokaii Player

**Open-source HTML5 video player for anime websites.** HLS and MP4, WebGL “720+” picture
enhancement, mobile gestures, hotkeys and Smart TV remote support. Vanilla JavaScript,
zero dependencies, no build step.

[**▶ Live demo**](https://fut1le.github.io/yokaii-player/demo/) ·
[Yokaii](https://yokaii.web.app) ·
[API](docs/API.md) ·
[How “720+” works](docs/ENHANCE.md) ·
[Русский](README.md)

![MIT](https://img.shields.io/badge/license-MIT-F2452C)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-7FE8D8)

<img src="assets/preview.png" alt="Yokaii Player anime video player with quality and speed menu" width="880">

</div>

---

This is the player behind [yokaii.web.app](https://yokaii.web.app), a Russian site for
watching anime online. We moved it into its own repository so anyone building an anime
site, an online cinema or a home media server can use a finished player instead of
writing one from scratch.

The player takes ready-made video URLs and knows nothing about where they come from.
There are no third-party API endpoints, keys or scrapers here — just a UI on top of `<video>`.

## Features

- **Formats:** MP4 and WebM directly; HLS (`.m3u8`) natively in Safari and through lazily loaded [hls.js](https://github.com/video-dev/hls.js) elsewhere.
- **Episodes:** episode list, next / previous, resume from any second.
- **Quality and speed:** switch quality without losing position, 0.75×–2× speed.
- **Skip opening:** button and <kbd>S</kbd> key jump exactly 1:30 forward; the button glows gently during the first three minutes.
- **“720+”:** an [Anime4K](https://github.com/bloc97/Anime4K)-style WebGL2 shader that sharpens blurred edges between flat fills on 480p/720p. Not a neural network — [details](docs/ENHANCE.md).
- **Mobile:** double-tap edges to seek, tap to toggle controls, finger-sized buttons, landscape lock in fullscreen.
- **Keyboard:** YouTube-style hotkeys, 0–9 to jump by percent.
- **Smart TV:** Samsung Tizen, LG webOS and Android TV remotes, keyboard and headset media keys.
- **Media Session:** episode title and controls on the lock screen and in the Android notification shade.
- **Picture-in-picture**, Russian and English UI, themable with CSS variables, ARIA labels and `prefers-reduced-motion`.

## Quick start

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Fut1le/yokaii-player@1.0.0/src/yokaii-player.css">
<div id="player"></div>

<script type="module">
  import { YokaiiPlayer } from 'https://cdn.jsdelivr.net/gh/Fut1le/yokaii-player@1.0.0/src/index.js';

  const player = new YokaiiPlayer(document.getElementById('player'), {
    lang: 'en',
    title: 'Show title',
    poster: '/posters/show.jpg',
  });

  player.setEpisodes([
    { number: 1, sources: [
      { src: '/video/ep1-720.m3u8', label: '720p' },
      { src: '/video/ep1-480.mp4',  label: '480p' },
    ] },
    { number: 2, sources: [{ src: '/video/ep2.m3u8', label: 'Auto' }] },
  ]);

  player.playEpisode(1);
  player.on('ended', () => player.nextEpisode());
</script>
```

TV remote:

```js
import { attachRemote } from './src/index.js';
attachRemote(player, { tv: true });
```

Full options, methods, events and CSS variables: [docs/API.md](docs/API.md) (in Russian, code samples are universal).

## Hotkeys

<kbd>Space</kbd>/<kbd>K</kbd> play/pause · <kbd>←</kbd><kbd>→</kbd> ±5 s (<kbd>Shift</kbd> ±30 s) ·
<kbd>↑</kbd><kbd>↓</kbd> volume · <kbd>S</kbd> skip opening · <kbd>N</kbd>/<kbd>B</kbd> next/previous episode ·
<kbd>F</kbd> fullscreen · <kbd>M</kbd> mute · <kbd>P</kbd> PiP · <kbd>0</kbd>–<kbd>9</kbd> jump to 0–90%.

## Browser support

Chromium 84+, Firefox 90+, Safari 15+ (the floor is set by private class methods).
Samsung and LG TVs from 2022 on. “720+” needs WebGL2 and a CORS-readable frame.

## License

[MIT](LICENSE) © 2026 Vladimir, [Yokaii](https://yokaii.web.app).

<sub>Keywords: anime player, anime video player, watch anime online, html5 video player, hls player,
m3u8 player, javascript video player, smart tv video player, anime4k webgl, vanilla js player.</sub>
