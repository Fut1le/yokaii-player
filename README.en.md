<div align="center">

<img src="assets/logo.svg" width="96" height="96" alt="Yokaii Player logo">

# Yokaii Player — HTML5 video player for anime websites

**Open-source vanilla JavaScript video player.** HLS (m3u8) and MP4, SRT and WebVTT subtitles,
skip intro and outro, WebGL “720+” picture enhancement, mobile gestures and Smart TV remote
support. Zero dependencies, no build step, MIT license.

[**▶ Live demo**](https://fut1le.github.io/yokaii-player/demo/) ·
[Yokaii](https://yokaii.web.app) ·
[API (RU)](docs/API.md) ·
[How “720+” works (RU)](docs/ENHANCE.md) ·
[Русский](README.md)

[![Release](https://img.shields.io/github/v/release/Fut1le/yokaii-player?color=F2452C)](https://github.com/Fut1le/yokaii-player/releases)
![MIT](https://img.shields.io/badge/license-MIT-F2452C)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-7FE8D8)
![Size](https://img.shields.io/badge/gzip-~36_KB_with_comments-9A93B4)
![ES2022](https://img.shields.io/badge/JS-ES2022_modules-F2EFFA)

<img src="assets/preview.png" alt="Yokaii Player anime video player with subtitles, quality menu and skip intro button" width="880">

</div>

---

This is the player behind [yokaii.web.app](https://yokaii.web.app), a Russian site for
watching anime online. We moved it into its own repository so anyone building an anime
site, an online cinema or a home media server can use a finished player instead of
writing one from scratch.

The player takes ready-made video URLs and knows nothing about where they come from.
There are no third-party API endpoints, keys or scrapers here — just a UI on top of `<video>`.

## Features

| | |
|---|---|
| **Formats** | MP4 and WebM directly; HLS (`.m3u8`) natively in Safari and through lazily loaded [hls.js](https://github.com/video-dev/hls.js) everywhere else |
| **Subtitles** | SRT and WebVTT from any domain, multiple languages, the choice is remembered across episodes. Fansub tags are cleaned up, `<ruby>` furigana works |
| **Skip intro** | With per-episode markers the button jumps exactly to the end of the opening song. Opening and ending ranges are shown on the progress bar. No markers — +1:30. Auto-skip available |
| **Slow network** | Video stalls — the player switches to a lighter source from the same second. Connection lost — it waits and resumes instead of showing an error |
| **Episodes** | Episode list, next / previous, resume from any second |
| **Quality and speed** | Switch quality without losing position, 0.75×–2× speed |
| **“720+”** | An [Anime4K](https://github.com/bloc97/Anime4K)-style WebGL2 shader that sharpens blurred edges between flat fills on 480p/720p. Not a neural network — [details (RU)](docs/ENHANCE.md) |
| **Mobile** | Double-tap an edge to seek 5 s, tap to show / hide controls. On iPhone taps are no longer lost after native fullscreen |
| **Keyboard** | YouTube-style: space, arrows, <kbd>F</kbd>, <kbd>M</kbd>, <kbd>C</kbd>, 0–9 to jump by percent |
| **Smart TV** | Samsung Tizen, LG webOS and Android TV remotes, keyboard and headset media keys |
| **Lock screen** | Media Session: episode title and controls on the lock screen and Android notification shade |
| **Picture in picture** | Where the browser supports it |
| **Languages** | Russian and English UI; any label can be overridden |
| **Theming** | The whole look is driven by CSS custom properties |
| **Accessibility** | ARIA labels, visible focus, respects `prefers-reduced-motion` |

## Quick start: a player on your site in five minutes

No build step. Copy `src/` or load it from jsDelivr:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Fut1le/yokaii-player@v1.1.0/src/yokaii-player.css">

<div id="player"></div>

<script type="module">
  import { YokaiiPlayer } from 'https://cdn.jsdelivr.net/gh/Fut1le/yokaii-player@v1.1.0/src/index.js';

  const player = new YokaiiPlayer(document.getElementById('player'), {
    lang: 'en',
    title: 'Show title',
    poster: '/posters/title.jpg',
  });

  player.setEpisodes([
    {
      number: 1,
      title: 'The Beginning',
      sources: [                                   // best quality first
        { src: '/video/ep1-720.m3u8', label: '720p' },
        { src: '/video/ep1-480.mp4',  label: '480p' },
      ],
      subtitles: [
        { src: '/subs/ep1.en.srt', label: 'English', lang: 'en', default: true },
      ],
      skip: { opening: { start: 85, stop: 175 } }, // seconds
    },
    { number: 2, sources: [{ src: '/video/ep2.m3u8', label: 'Auto' }] },
  ]);

  player.playEpisode(1);
</script>
```

The first source is the default quality. On a slow network the player picks the last one.

### Remember where the viewer stopped

```js
player.on('timeupdate', ({ episode, time }) => {
  localStorage.setItem(`progress:${episode}`, time);
});

const saved = Number(localStorage.getItem('progress:1')) || 0;
player.playEpisode(1, saved);
```

### Autoplay the next episode

```js
player.on('ended', () => player.nextEpisode());
```

### TV remote

```js
import { YokaiiPlayer, attachRemote } from './src/index.js';

const player = new YokaiiPlayer(mount);
attachRemote(player, { tv: true }); // larger controls, OK = pause, remote media keys
```

### Your own colors

```css
.yplayer {
  --yp-accent: #7C5CFF;
  --yp-accent-glow: rgba(124, 92, 255, .5);
  --yp-fox: #FFD166;
}
```

The full list of options, methods, events and CSS variables is in [docs/API.md](docs/API.md) (Russian).

## SRT and WebVTT subtitles

Pass files in the episode's `subtitles` field. The player downloads them, parses SRT or WebVTT
and lists them in the “Subtitles” menu. <kbd>C</kbd> toggles them.

```js
subtitles: [
  { src: 'https://cdn.example/ep1.en.vtt', label: 'English', lang: 'en', default: true },
  { src: 'https://cdn.example/ep1.ru.srt', label: 'Русские', lang: 'ru' },
  { text: srtString, label: 'From DB', lang: 'ja' }, // inline text works too
]
```

What the player handles for you:

- **Cross-origin files without `crossorigin` on the video.** A plain cross-origin `<track>` needs
  `crossorigin` on `<video>`, which breaks video from CDNs without CORS. The player fetches
  subtitles itself and leaves the video alone.
- **SRT.** Browsers only understand WebVTT; the player converts SRT.
- **Fansubs.** ASS tags like `{\an8}` and `<font color>` are removed; italic, bold and `<ruby>` stay.
- **Above “720+” and the controls.** Cues are rendered by the player, so they stay visible over
  the shader canvas and move up while the control bar is shown.
- **Remembers the language** across episodes.

The parser is exported too: `import { parseSubtitles, toVtt } from './src/index.js'`.

## Skip intro and outro

If you know where the opening starts and ends, pass markers:

```js
skip: {
  opening: { start: 85, stop: 175 },
  ending: { start: 1320, stop: 1410 },
}
```

While the opening plays, the skip button lights up and says exactly what it does: “Skip
opening — to 2:55”. A click or <kbd>S</kbd> jumps to the end. Ranges are visible on the
progress bar. With `autoSkip: true` the player skips them itself, once: if the viewer
seeks back, they want to watch it.

Without markers the button jumps 90 seconds **from the current position**, not to a fixed
timestamp — openings often start after a cold open.

## Slow networks and dropped connections

- **Video stalls.** If buffering lasts longer than `stallTimeout` (9 s), the player switches to the
  lightest source from the same second and says so.
- **Slow from the start.** If the browser reports 2G/3G or Data Saver, the episode starts at a
  light quality right away.
- **Connection lost.** The player waits for the network and resumes from the same second.
- **HLS.** hls.js re-fetches after network errors and recovers from decoder errors.
- **Out of retries.** The error screen has a “Retry” button.

Choosing a quality manually turns automatic switching off.

## Keyboard shortcuts

| Key | Action |
|---|---|
| <kbd>Space</kbd>, <kbd>K</kbd> | Play / pause |
| <kbd>←</kbd> <kbd>→</kbd> | Seek 5 s, with <kbd>Shift</kbd> 30 s |
| <kbd>↑</kbd> <kbd>↓</kbd> | Volume |
| <kbd>S</kbd> | Skip opening or ending |
| <kbd>C</kbd> | Subtitles on / off |
| <kbd>N</kbd> / <kbd>B</kbd> | Next / previous episode |
| <kbd>F</kbd> | Fullscreen |
| <kbd>M</kbd> | Mute |
| <kbd>P</kbd> | Picture in picture |
| <kbd>0</kbd>–<kbd>9</kbd> | Jump to 0–90% |

With several players on a page, keys go to the focused one.

## “720+”: what it is and what it isn't

<img src="assets/compare.png" alt="Anime at 360p without processing and with WebGL 720+ enhancement" width="880">

It is **not a neural network**. Real AI upscaling costs about a gigaflop per frame and would
drain a phone in twenty minutes. Anime suffers from compression mostly in one place: edges
between flat fills blur by two or three pixels. The shader finds those edges and pulls them
back without touching flat areas. It runs on the GPU in a fraction of a millisecond.

No new detail is invented, which is why the mode is called “720+” and not “1080p”.
Off by default because it warms up phones. It needs a readable frame: same-origin files,
HLS via hls.js, or a CDN with CORS headers.

## How it compares to Plyr and Video.js

Plyr and Video.js are great general-purpose players. Yokaii Player is narrower: it is built
for anime sites and ships what they need first out of the box.

| | Yokaii Player | Plyr | Video.js |
|---|---|---|---|
| License | MIT | MIT | Apache-2.0 |
| HLS (m3u8) | built in, loads hls.js itself | add hls.js yourself | built in (VHS) |
| SRT subtitles | ✅ | WebVTT only | WebVTT only |
| Intro markers and skip button | ✅ | — | third-party plugins |
| Lower MP4 quality on slow networks | ✅ | — | — (adaptive only for HLS/DASH) |
| Anime picture enhancement | ✅ WebGL2 “720+” | — | — |
| Build step and dependencies | none | prebuilt bundle | prebuilt bundle |

Based on each project's documentation as of October 2026. If something is outdated, please send a PR.

## Browser support

| Platform | Player | “720+” |
|---|---|---|
| Chrome, Edge, Yandex Browser 84+ | ✅ | ✅ |
| Firefox 90+ | ✅ | ✅ (no PiP) |
| Safari 15+ (macOS, iOS) | ✅ native HLS | ✅ |
| Samsung Tizen (2022+ TVs) | ✅ | depends on model |
| LG webOS 22+ | ✅ | depends on model |
| Android TV (recent WebView) | ✅ | ✅ |

The lower bound comes from private class methods (`#method`), available in Chromium 84+ and Safari 15+.

## Project layout

```
src/
  index.js            entry: YokaiiPlayer, attachRemote, Enhancer, parseSubtitles
  yokaii-player.js    player: markup, events, gestures, keys, episodes, HLS, network
  subtitles.js        SRT and WebVTT parsing
  enhance.js          “720+”: WebGL2 shader and first-frame watchdog
  remote.js           Smart TV remote, media keys, Media Session
  utils.js            timecode, clamp, safe localStorage
  yokaii-player.css   all styles, scoped to .yplayer
demo/                 demo page (published by GitHub Pages)
docs/                 API and “720+” deep dive (Russian)
```

Run the demo with any local server — ES modules don't load from `file://`:

```bash
npx serve .          # or: python -m http.server
# open http://localhost:3000/demo/
```

## Security

- No keys, tokens or third-party API endpoints. The player only plays URLs you give it.
- Everything external (titles, quality and subtitle labels, poster) goes in via `textContent` or escaping. Subtitle cues are built by the browser's WebVTT parser: italic, bold and `<ruby>` only, no scripts or attributes.
- `destroy()` removes all `document` listeners and frees the WebGL context and subtitle blob URLs.

Found a vulnerability? See [SECURITY.md](SECURITY.md) — please don't open a public issue.

## FAQ

**How do I add a video player to my anime website?**
Include `src/` and give the player a list of episodes with video URLs, as in Quick start.
Where the URLs come from is up to your site.

**How do I add SRT subtitles to a video on a website?**
Put the `.srt` URL in the episode's `subtitles`. No need to convert to WebVTT. If the file is on
another domain, that domain must send a CORS header.

**How do I add a “Skip intro” button?**
It's built in. Pass `skip.opening` with start and end seconds and the button jumps to the end
of the opening. Without markers it seeks 90 seconds forward.

**How do I play HLS (m3u8) in the browser?**
Pass the `.m3u8` URL as a normal source. Safari plays it natively; in Chrome and Firefox the
player loads hls.js. You can self-host hls.js: `hlsUrl: ['/js/hls.min.js', 'https://cdn.jsdelivr.net/…']`.

**How do I use it with React, Vue or Svelte?**
Create the player when the component mounts (`useEffect`, `onMounted`, `onMount`) and call
`player.destroy()` on unmount. The player is framework-agnostic.

**Video doesn't play on iPhone.**
iOS can't fullscreen a `div`, so the player switches to native `<video>` fullscreen. If the
stream itself doesn't start, check that the server sends `Accept-Ranges` and a correct `Content-Type`.

**“720+” turns on and immediately off.**
The video most likely comes from another domain without CORS, so the browser blocks reading
frames. Pass `crossOrigin: 'anonymous'` on the source if the CDN sends CORS headers, or use HLS via hls.js.

**Can I use it commercially?**
Yes, MIT allows it. Keep the `LICENSE` file with the copyright.

## Contributing

Bugs and ideas go to [Issues](https://github.com/Fut1le/yokaii-player/issues). Read
[CONTRIBUTING.md](CONTRIBUTING.md) (Russian) before opening a PR. Release notes are in [CHANGELOG.md](CHANGELOG.md).

If the player helped you, a star ⭐ makes it easier for others to find.

## License

[MIT](LICENSE) © 2026 Vladimir, [Yokaii](https://yokaii.web.app).

The demo clip “Torii and Fox Fire” and its subtitles were made for this repository and use the
same license. Blender Foundation films in the demo are CC BY.
