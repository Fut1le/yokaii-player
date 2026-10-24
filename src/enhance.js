/* ============================================================
   Yokaii Player — улучшение картинки «720+»

   ЧЕСТНО О ТОМ, ЧТО ЭТО ТАКОЕ

   Это НЕ нейросеть. Настоящий ИИ-апскейл — это свёрточная сеть,
   которой на каждый кадр нужно порядка гигафлопа; на кадре 720p
   при 24 кадрах в секунду телефон такое не тянет, он захлебнётся
   и сядет за двадцать минут.

   Здесь другое, и для аниме оно работает лучше, чем звучит: набор
   шейдеров в духе Anime4K. Аниме — это заливки и линии, а не
   плёночное зерно. У такой картинки после сжатия страдает ровно
   одно место: границы между заливками размазаны на два-три
   пикселя. Если найти эти границы и подтянуть их обратно к
   резкости, кадр перестаёт выглядеть мыльным — и это считается на
   видеокарте за доли миллисекунды.

   Три прохода:
     1. поиск направления границы по градиенту яркости;
     2. подтяжка вдоль границы — пиксель тянется к тому соседу,
        который ближе по яркости (утоньшает линии, не трогая
        заливки);
     3. мягкая нерезкость с ограничением, чтобы не появились
        белые ореолы вокруг контуров.

   Работает ТОЛЬКО с видео, кадр которого браузер разрешает читать:
   файл с того же домена или с CDN, отдающего заголовок
   Access-Control-Allow-Origin. Кадр из чужого iframe или файл без
   CORS прочитать нельзя — это защита браузера, а не ошибка.
   В таком случае обработка молча выключается, видео играет как есть.
   ============================================================ */

/* ОДНА НАСТРОЙКА ВМЕСТО ЧЕТЫРЁХ

   Было: выключено / мягко / обычно / резко. Выбор, которого никто
   не хочет делать: чтобы отличить «мягко» от «резко», надо
   переключаться туда-сюда на движущейся картинке и сравнивать по
   памяти. А неудачный выбор («резко») даёт грязь на градиентах.

   Выбрано одно значение и подобрано так, чтобы оно годилось
   всегда: подтяжка 0.62 — на волос выше прежнего «обычно», линии
   собираются заметно; нерезкость 0.26 — ниже, потому что зажим по
   соседям и так тянет контраст, а лишнее даёт шум на небе и в
   тенях. На 480p разница видна сразу, на 720p — на волосах и
   тонких линиях. */
const TUNED = { strength: 0.62, sharpen: 0.26 };

const VERT = `#version 300 es
in vec2 pos;
out vec2 uv;
void main() {
  uv = pos * 0.5 + 0.5;
  uv.y = 1.0 - uv.y;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;

uniform sampler2D src;
uniform vec2 texel;      // размер одного пикселя источника
uniform float strength;  // сила подтяжки границ
uniform float sharpen;   // сила нерезкости

in vec2 uv;
out vec4 color;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec3 c  = texture(src, uv).rgb;

  vec3 n  = texture(src, uv + vec2(0.0, -texel.y)).rgb;
  vec3 s  = texture(src, uv + vec2(0.0,  texel.y)).rgb;
  vec3 w  = texture(src, uv + vec2(-texel.x, 0.0)).rgb;
  vec3 e  = texture(src, uv + vec2( texel.x, 0.0)).rgb;
  vec3 nw = texture(src, uv + vec2(-texel.x, -texel.y)).rgb;
  vec3 ne = texture(src, uv + vec2( texel.x, -texel.y)).rgb;
  vec3 sw = texture(src, uv + vec2(-texel.x,  texel.y)).rgb;
  vec3 se = texture(src, uv + vec2( texel.x,  texel.y)).rgb;

  float lc = luma(c);
  float ln = luma(n), ls = luma(s), lw = luma(w), le = luma(e);

  /* --- 1. Куда идёт граница ---
     Оператор Собеля по яркости. Длина градиента говорит, есть ли
     здесь вообще граница: на ровной заливке она близка к нулю, и
     тогда мы не трогаем пиксель вовсе — иначе полезло бы зерно. */
  float gx = (luma(ne) + 2.0 * le + luma(se)) - (luma(nw) + 2.0 * lw + luma(sw));
  float gy = (luma(sw) + 2.0 * ls + luma(se)) - (luma(nw) + 2.0 * ln + luma(ne));
  float grad = length(vec2(gx, gy));

  /* --- 2. Подтяжка вдоль границы ---
     Тянем пиксель к тому из соседей, что ближе по яркости: так
     размытый переход в два-три пикселя сжимается обратно к одному,
     а сама линия не смещается. */
  /* Начальное значение — 2.0, а НЕ 1e9.

     Здесь была настоящая ошибка: у mediump потолок примерно 65504,
     и 1e9 в него не влезает. На части мобильных видеокарт это
     превращается в бесконечность или в мусор, и сравнение
     d < bestDiff перестаёт работать — кадр выходит чёрным или
     полосатым. Разница яркостей никогда не превышает единицы,
     поэтому двойки с запасом хватает. */
  vec3 best = c;
  float bestDiff = 2.0;
  float d;

  d = abs(ln - lc); if (d < bestDiff) { bestDiff = d; best = n; }
  d = abs(ls - lc); if (d < bestDiff) { bestDiff = d; best = s; }
  d = abs(lw - lc); if (d < bestDiff) { bestDiff = d; best = w; }
  d = abs(le - lc); if (d < bestDiff) { bestDiff = d; best = e; }

  float edge = smoothstep(0.06, 0.34, grad);
  vec3 pulled = mix(c, best, strength * edge * 0.5);

  /* --- 3. Нерезкость с ограничением ---
     Обычная нерезкость даёт светлый ореол вокруг контуров. Поэтому
     результат зажимается между минимумом и максимумом соседей: ярче
     самого светлого соседа пиксель стать не может. */
  vec3 blur = (n + s + w + e + nw + ne + sw + se) / 8.0;
  vec3 crisp = pulled + (pulled - blur) * sharpen;

  vec3 lo = min(min(min(n, s), min(w, e)), c);
  vec3 hi = max(max(max(n, s), max(w, e)), c);
  crisp = clamp(crisp, lo, hi);

  color = vec4(mix(pulled, crisp, edge), 1.0);
}`;

export class Enhancer {
  /**
   * @param {HTMLVideoElement} video   исходное видео
   * @param {HTMLCanvasElement} canvas куда рисуем
   * @param {object} hooks { onReady, onFail, maxHeight } — см. ниже
   */
  constructor(video, canvas, hooks = {}) {
    this.video = video;
    // Потолок растяжения по высоте (px). По умолчанию 1080p.
    this.maxHeight = hooks.maxHeight || 1080;
    this.canvas = canvas;
    this.gl = null;
    this.running = false;
    this.frame = null;
    this.failed = false;

    /* ⚠️ ГЛАВНОЕ ИСПРАВЛЕНИЕ 5.4.2 — ЧЁРНЫЙ ЭКРАН.

       Раньше плеер прятал исходное видео (opacity: 0) сразу, как
       только start() возвращал true. Но true означал всего лишь
       «WebGL завёлся» — а завестись он может и там, где рисовать
       не выйдет:

         • кадр с чужого домена без CORS «пачкает» текстуру, и
           texImage2D бросает SecurityError. Именно это и было:
           многие CDN отдают файлы без Access-Control-Allow-Origin;
         • видео ещё не дошло до первого кадра (videoWidth == 0);
         • видеокарта потеряла контекст.

       Во всех трёх случаях холст оставался пустым, видео —
       спрятанным, и человек видел чёрный прямоугольник со звуком.

       Теперь порядок обратный: пока НЕ отрисован первый настоящий
       кадр, видео никто не трогает. onReady зовётся после первой
       удачной отрисовки, onFail — при любой осечке, и плеер
       немедленно возвращает обычное видео. */
    this.onReady = hooks.onReady || (() => {});
    this.onFail = hooks.onFail || (() => {});
    this.painted = false;
  }

  /** Поддерживается ли обработка на этом устройстве */
  static supported() {
    try {
      const probe = document.createElement('canvas');
      return Boolean(probe.getContext('webgl2'));
    } catch {
      return false;
    }
  }

  start() {
    if (this.running || this.failed) return this.running;

    try {
      /* Программу и текстуру собираем один раз. Раньше #init()
         звался на каждый start(), то есть после каждой паузы, — и
         каждый раз компилировал шейдеры и плодил буферы заново. */
      if (!this.gl) this.#init();
    } catch (err) {
      console.warn('[enhance]', err.message);
      this.failed = true;
      return false;
    }

    this.running = true;
    this.painted = false;
    this.canvas.hidden = false;

    /* Кадр уже есть (видео на паузе или только что перемотано) —
       рисуем его сразу. requestVideoFrameCallback срабатывает только
       на НОВЫЙ кадр, и на паузе его не будет: без этой строки
       включение «720+» из меню на паузе ждало полторы секунды,
       сторож решал, что ничего не выйдет, и выключал обработку. */
    if (this.video.readyState >= 2) this.#draw();
    if (this.failed) return false;

    this.#loop();

    /* Сторож первого кадра.

       Если за полторы секунды не нарисовалось ни одного кадра —
       значит не нарисуется вовсе. Молча возвращаем обычное видео:
       лучше картинка без обработки, чем чёрный экран. */
    clearTimeout(this.firstFrame);
    this.firstFrame = setTimeout(() => {
      if (!this.painted && this.running) this.#giveUp('первый кадр не пришёл');
    }, 1500);

    return true;
  }

  /** Сдаться и вернуть обычное видео */
  #giveUp(reason) {
    console.warn('[enhance] выключаемся:', reason);
    this.failed = true;
    this.stop();
    this.onFail(reason);
  }

  /**
   * Остановить обработку, но оставить на холсте последний кадр.
   * Нужно на паузе: исходное видео под холстом спрятано, и если
   * убрать холст, человек увидит чёрный экран вместо кадра.
   */
  pause() {
    this.running = false;
    clearTimeout(this.firstFrame);
    this.#cancelFrame();
  }

  /** Остановить и убрать холст — видео снова показывается само */
  stop() {
    this.pause();
    this.canvas.hidden = true;
  }

  #cancelFrame() {
    if (!this.frame) return;
    if (this.video.cancelVideoFrameCallback && this.usingFrameCallback) {
      this.video.cancelVideoFrameCallback(this.frame);
    } else {
      cancelAnimationFrame(this.frame);
    }
    this.frame = null;
  }

  destroy() {
    /* Сначала флаг, потом loseContext(): браузер ответит событием
       webglcontextlost, и без флага оно выглядело бы как авария —
       плеер записал бы «720+ выключено» в настройки человека
       просто потому, что его закрыли. */
    this.destroyed = true;
    this.stop();
    const ext = this.gl?.getExtension('WEBGL_lose_context');
    ext?.loseContext();
    this.gl = null;
  }

  /* ==========================================================
     Внутреннее
     ========================================================== */
  #init() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 недоступен');
    this.gl = gl;

    /* Телефон в фоне, переключение на встроенную видеокарту,
       нехватка памяти — контекст могут отобрать в любой момент.
       Без этого обработчика мы бы продолжали «рисовать» в
       мёртвый холст поверх спрятанного видео. */
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (this.destroyed) return; // контекст отдали сами в destroy()
      this.#giveUp('контекст WebGL потерян');
    }, { once: true });

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'шейдер не собрался');
    }
    gl.useProgram(program);
    this.program = program;

    // Прямоугольник во весь кадр
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.uniforms = {
      texel: gl.getUniformLocation(program, 'texel'),
      strength: gl.getUniformLocation(program, 'strength'),
      sharpen: gl.getUniformLocation(program, 'sharpen'),
      src: gl.getUniformLocation(program, 'src'),
    };
    gl.uniform1i(this.uniforms.src, 0);
  }

  #resize() {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return false;

    /* Во сколько раз растягивать.

       Смысл есть только когда исходник мельче экрана: 720p на
       телефоне уже рисуется точка в точку, и удваивать его — зря
       греть железо. Потолок — опция enhance.maxHeight, по умолчанию 1080p. */
    const cap = this.maxHeight;
    const target = Math.min(cap, Math.max(vh, Math.round(vh * 1.5)));
    const scale = target / vh;

    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
      this.gl.uniform2f(this.uniforms.texel, 1 / vw, 1 / vh);
    }
    return true;
  }

  #draw() {
    const gl = this.gl;
    if (!gl || this.video.readyState < 2) return;
    if (!this.#resize()) return;

    const p = TUNED;
    gl.uniform1f(this.uniforms.strength, p.strength);
    gl.uniform1f(this.uniforms.sharpen, p.sharpen);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.video);
    } catch (err) {
      /* Кадр с чужого домена без CORS «пачкает» текстуру — читать
         его нельзя. Это не поломка, а защита браузера. Возвращаем
         обычное видео и больше не пытаемся. */
      this.#giveUp('видео с чужого домена, кадр читать нельзя');
      return;
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (gl.isContextLost && gl.isContextLost()) {
      this.#giveUp('видеокарта потеряла контекст');
      return;
    }

    // Первый настоящий кадр — только теперь можно прятать видео
    if (!this.painted) {
      this.painted = true;
      clearTimeout(this.firstFrame);
      this.onReady();
    }
  }

  #loop() {
    if (!this.running) return;

    /* requestVideoFrameCallback вызывается ровно на новый кадр
       видео, а не на каждый кадр экрана. На 24 кадрах в секунду
       это втрое меньше работы, чем requestAnimationFrame на 60. */
    if (this.video.requestVideoFrameCallback) {
      this.usingFrameCallback = true;
      const step = () => {
        if (!this.running) return;
        this.#draw();
        this.frame = this.video.requestVideoFrameCallback(step);
      };
      this.frame = this.video.requestVideoFrameCallback(step);
    } else {
      this.usingFrameCallback = false;
      const step = () => {
        if (!this.running) return;
        this.#draw();
        this.frame = requestAnimationFrame(step);
      };
      this.frame = requestAnimationFrame(step);
    }
  }
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'шейдер не скомпилировался');
  }
  return shader;
}
