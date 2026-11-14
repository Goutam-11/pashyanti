/* ==========================================================================
   HALFTONE RELAY — lab behaviour
   A fake call, a real state machine, and a dot-screen renderer that rasterises
   the shipped peacock geometry instead of drawing a second mascot.

   Everything here is local: no socket, no API, no build step.
   ========================================================================== */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const app = $("app");
  const studio = $("studio");
  const thread = $("thread");
  const statusEl = $("status");
  const statusLabel = $("statusLabel");
  const chipsEl = $("chips");
  const footEnd = $("footEnd");
  const form = $("composer");
  const draft = $("draft");
  const palettesEl = $("palettes");
  const paletteNote = $("paletteNote");
  const paletteName = $("paletteName");
  const resetBtn = $("reset");
  const seg = $("seg");
  const p = window.PEACOCK;

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
  const STORE_KEY = "pashyanti.lab.v1";

  /* ---------------------------------------------------------------------
     Copy — the chrome strings come from web/src/i18n/en.ts; chips are the
     Hindi replies the demo actually speaks, to prove Devanagari in the
     bubble at 16-23px.
     --------------------------------------------------------------------- */
  const CHIPS = [
    "हाँ, बोलिए।",
    "थोड़ा धीरे।",
    "समझ गया।",
    "फिर से बोलिए।",
    "एक मिनट।",
  ];

  const COPY = {
    status: {
      listening: "Listening",
      thinking: "Thinking",
      speaking: "Speaking",
      idle: "Ready",
      unsure: "Repeat",
    },
    empty: {
      title: "The other person’s words, right here",
      body: "Tap a chip below, or type your reply and it is spoken down the line.",
    },
    chipsLabel: "Quick replies",
    composer: { placeholder: "Type your reply…", send: "Speak", aria: "Type your reply" },
    call: { end: "End call", new: "New call" },
    summary: {
      eyebrow: "Call summary",
      agreed: "Agreed",
      next: "Next",
      turns: (n) => `${n} ${n === 1 ? "turn" : "turns"}`,
      waiting: "The summary will appear here.",
    },
    retry: { main: "Couldn’t catch that — please repeat", sub: "the audio was unclear" },
  };

  const SAMPLE = [
    { who: "caller", text: "नमस्ते, मैं डॉक्टर से मिलने का समय लेना चाहता हूँ।", lang: "hi", ms: 412 },
    { who: "me", text: "ठीक है, एक मिनट रुकिए।" },
    { who: "caller", text: "क्या आप कल शाम चार बजे आ सकते हैं?", lang: "hi", ms: 388 },
    { who: "me", text: "हाँ, चार बजे ठीक है। मैं आ जाऊँगा।" },
  ];

  const CALLER_POOL = [
    { who: "caller", text: "धन्यवाद, मैं आपका इंतज़ार करूँगा।", lang: "hi", ms: 401 },
    { who: "caller", text: "कृपया अपना नाम और समय लिखकर भेज दीजिए।", lang: "hi", ms: 436 },
    { who: "caller", text: "ठीक है, फिर मिलते हैं।", lang: "hi", ms: 357 },
  ];

  const SUMMARY = {
    who: "डॉक्टर से मिलने का समय",
    agreed: "कल शाम चार बजे, क्लिनिक पर।",
    next: "पहचान पत्र और पुरानी रिपोर्ट लेकर आना।",
    turns: 6,
    duration_s: 74,
  };

  /* Same families the palette sheet studies, so the two artifacts read as
     one system. Short labels fit the six-up swatch row; the full name rides
     under the Palette heading. */
  const PALETTE_META = [
    ["lime", "Peacock Matrix", "PEACOCK"],
    ["marigold", "Chuna Lime-Wash", "LIME WASH"],
    ["indigo", "Indigo Resist", "INDIGO"],
    ["teal", "Monsoon Slate", "SLATE"],
    ["madder", "Madder Night", "MADDER"],
    ["violet", "Ultraviolet", "VIOLET"],
  ];

  const VARIANTS = {
    a: { palette: "marigold", bubbles: "stair", bg: "lattice" },
    b: { palette: "lime", bubbles: "dissolve", bg: "peacock" },
    c: { palette: "indigo", bubbles: "ledger", bg: "wash" },
  };

  const DEFAULTS = {
    variant: "b",
    palette: "lime",
    pitch: 6,
    dots: "screen",
    bg: "peacock",
    bubbles: "dissolve",
    motion: "on",
    frame: "phone",
    preview: "transcript",
  };

  const state = Object.assign({}, DEFAULTS, {
    status: "listening",
    mode: "transcript",
    lines: SAMPLE.slice(),
    ended: false,
    summaryReady: false,
    pool: 0,
    busy: false,
  });

  /* ---------------------------------------------------------------------
     Persistence
     --------------------------------------------------------------------- */
  function save() {
    try {
      const knobs = {
        variant: state.variant,
        palette: state.palette,
        pitch: state.pitch,
        bg: state.bg,
        bubbles: state.bubbles,
        motion: state.motion,
        dots: state.dots,
        frame: state.frame,
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(knobs));
    } catch (err) {
      /* storage can be unavailable; the lab still works */
    }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      for (const key of Object.keys(DEFAULTS)) {
        if (saved[key] === undefined) continue;
        if (key === "pitch") {
          if ([4, 6, 8, 10].includes(saved[key])) state.pitch = saved[key];
        } else if (key === "palette") {
          if (PALETTE_META.some(([id]) => id === saved[key])) state.palette = saved[key];
        } else {
          state[key] = saved[key];
        }
      }
    } catch (err) {
      /* a corrupt store just means defaults */
    }
  }

  /* ---------------------------------------------------------------------
     Colour maths — palette notes are measured, never guessed.
     --------------------------------------------------------------------- */
  const TOKENS = [
    "field",
    "panel",
    "ink",
    "ink-2",
    "line",
    "signal",
    "accent",
    "accent-ink",
    "hot",
    "cool",
  ];
  const paletteCache = new Map();

  function paletteColors(name) {
    if (paletteCache.has(name)) return paletteCache.get(name);
    const prev = app.dataset.palette;
    app.dataset.palette = name;
    const cs = getComputedStyle(app);
    const out = {};
    for (const token of TOKENS) out[token] = cs.getPropertyValue("--" + token).trim();
    app.dataset.palette = prev;
    paletteCache.set(name, out);
    return out;
  }

  function channelLum(value) {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function luminance(hex) {
    const clean = hex.replace("#", "");
    const n = clean.length === 3
      ? clean.split("").map((ch) => ch + ch)
      : clean.match(/../g);
    const [r, g, b] = n.map((pair) => channelLum(parseInt(pair, 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  function labelOf(id) {
    const hit = PALETTE_META.find(([key]) => key === id);
    return hit ? hit[1] : id;
  }

  function shortLabelOf(id) {
    const hit = PALETTE_META.find(([key]) => key === id);
    return hit ? hit[2] : id;
  }

  /* ---------------------------------------------------------------------
     Peacock: rasterise the traced geometry into a dot screen.
     --------------------------------------------------------------------- */
  const coverageCache = new Map();

  function coverage(key, N, draw) {
    const cacheKey = key + "@" + N;
    if (coverageCache.has(cacheKey)) return coverageCache.get(cacheKey);

    const canvas = document.createElement("canvas");
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, N, N);
    ctx.setTransform(N / 100, 0, 0, N / 100, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    draw(ctx);

    const data = ctx.getImageData(0, 0, N, N).data;
    const out = new Float32Array(N * N);
    for (let i = 0; i < N * N; i += 1) out[i] = data[i * 4 + 3] / 255;
    coverageCache.set(cacheKey, out);
    return out;
  }

  function bodyCoverage(mascotState, N) {
    return coverage("body:" + mascotState, N, (ctx) => {
      ctx.fill(new Path2D(p.SHOULDER));
      ctx.fill(new Path2D(p.HEAD));
      ctx.fill(new Path2D(p.PUPIL));
      if (mascotState === "speaking") {
        ctx.fill(new Path2D(p.BEAK_UPPER));
        ctx.fill(new Path2D(p.BEAK_LOWER));
      } else {
        ctx.fill(new Path2D(p.BEAK_CLOSED), "evenodd");
      }
    });
  }

  const arcsCoverage = (N) =>
    coverage("arcs", N, (ctx) => {
      for (const d of p.ARCS) ctx.fill(new Path2D(d));
    });

  const badgeCoverage = (N) =>
    coverage("badge", N, (ctx) => {
      ctx.beginPath();
      ctx.arc(p.BADGE.cx, p.BADGE.cy, p.BADGE.r, 0, Math.PI * 2);
      ctx.fill();
    });

  const badgeMarkCoverage = (N) =>
    coverage("badge-mark", N, (ctx) => {
      ctx.lineWidth = 1.9;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(new Path2D(p.BADGE_MARK));
      ctx.beginPath();
      ctx.arc(p.BADGE_DOT.cx, p.BADGE_DOT.cy, p.BADGE_DOT.r, 0, Math.PI * 2);
      ctx.fill();
    });

  function stampDots(ctx, cov, N, pitch, colour, time, gain = 0.94) {
    ctx.fillStyle = colour;
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const a = cov[y * N + x];
        if (a < 0.1) continue;
        let r = (pitch / 2) * gain * Math.sqrt(a);
        if (time) {
          const wave = 1 + 0.3 * Math.sin(time * 0.0046 + x * 0.55 + y * 0.28);
          r *= wave;
        }
        r = Math.min(r, pitch * 0.54);
        ctx.beginPath();
        ctx.arc((x + 0.5) * pitch, (y + 0.5) * pitch, Math.max(0.35, r), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* Blend two #rrggbb values in sRGB. Canvas cannot parse color-mix(), so the
     watermark tone is mixed here instead of in CSS. */
  function mixHex(a, b, t) {
    const parse = (value) => {
      const clean = String(value).trim().replace("#", "");
      if (clean.length !== 6) return [0, 0, 0];
      return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
    };
    const [r1, g1, b1] = parse(a);
    const [r2, g2, b2] = parse(b);
    const mix = (x, y) => Math.round(x * (1 - t) + y * t);
    return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
  }

  function faceOf(status) {
    if (status === "unsure") return "unsure";
    if (status === "speaking") return "speaking";
    if (status === "listening") return "listening";
    return "idle";
  }

  function drawMascot(canvas, mascotState, size, time = 0) {
    if (!canvas) return;
    /* Dot pitch is the design decision; resolution follows it. ~1.8px dots
       at 40px keep the crest and eye ring readable; coarser turns to mush. */
    const N = Math.max(12, Math.min(72, Math.round(size / 1.8)));
    const px = Math.round(size * DPR);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";

    const cs = getComputedStyle(app);
    const ink = cs.getPropertyValue("--ink").trim();
    const accent = cs.getPropertyValue("--accent").trim();
    const field = cs.getPropertyValue("--field").trim();

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);

    const pitch = px / N;
    const animated = mascotState === "listening" && motionOn();

    if (mascotState !== "unsure") {
      stampDots(ctx, arcsCoverage(N), N, pitch, accent, animated ? time : 0);
    }
    stampDots(ctx, bodyCoverage(mascotState, N), N, pitch, ink, 0);

    if (mascotState === "unsure") {
      stampDots(ctx, badgeCoverage(N), N, pitch, accent, 0);
      stampDots(ctx, badgeMarkCoverage(N), N, pitch, field, 0, 0.55);
    }

    canvas.setAttribute("aria-label", "Sakhi, " + mascotState);
  }

  /* ---------------------------------------------------------------------
     Background peacock — same geometry, bigger screen, no animation.
     --------------------------------------------------------------------- */
  function drawBgPeacock() {
    const canvas = $("bgPeacock");
    if (!canvas) return;
    if (state.bg !== "peacock") return;

    const width = app.clientWidth;
    const height = app.clientHeight;
    const pitch = Math.max(4, state.pitch);

    /* Stamp the ghost on the SAME grid as the field: dots line up with the
       lattice and the peacock is drawn by recolouring it, exactly the way the
       reference halftone is built. */
    const cols = Math.max(40, Math.min(140, Math.ceil((width * 1.02) / pitch)));
    const sizeCss = cols * pitch;
    const left = Math.round((width - sizeCss * 0.86) / pitch) * pitch;
    const top = Math.round((height * 0.43) / pitch) * pitch;

    canvas.style.width = sizeCss + "px";
    canvas.style.height = sizeCss + "px";
    canvas.style.right = "auto";
    canvas.style.left = left + "px";
    canvas.style.top = top + "px";

    const px = Math.round(sizeCss * DPR);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }

    const cov = coverage("body:idle", cols, (ctx) => {
      ctx.fill(new Path2D(p.SHOULDER));
      ctx.fill(new Path2D(p.HEAD));
      ctx.fill(new Path2D(p.PUPIL));
      ctx.fill(new Path2D(p.BEAK_CLOSED), "evenodd");
    });

    const cs = getComputedStyle(app);
    const ink = cs.getPropertyValue("--ink").trim();
    const signal = cs.getPropertyValue("--signal").trim();
    const tone = mixHex(signal, ink, 0.22);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, sizeCss, sizeCss);
    /* Gain below 1 keeps the wash as separated dots; at full gain a solid
       interior reads as a pale cloud, not a screen. */
    stampDots(ctx, cov, cols, pitch, tone, 0, 0.62);
  }

  function drawAllMascots(time = 0) {
    drawMascot($("mascotTop"), faceOf(state.status), 46, time);
    const empty = $("mascotEmpty");
    if (empty) drawMascot(empty, faceOf(state.status), state.variant === "b" ? 124 : 116, time);
  }

  let raf = 0;
  let lastFrame = 0;

  function motionOn() {
    return state.motion === "on" && !REDUCED.matches;
  }

  function tick(now) {
    raf = 0;
    if (!motionOn() || state.status !== "listening") return;
    if (now - lastFrame > 55) {
      lastFrame = now;
      drawAllMascots(now);
    }
    raf = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (!raf && motionOn() && state.status === "listening") {
      raf = requestAnimationFrame(tick);
    }
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ---------------------------------------------------------------------
     Status
     --------------------------------------------------------------------- */
  function setStatus(next, opts = {}) {
    state.status = next;
    statusEl.dataset.state = next;
    statusLabel.textContent = COPY.status[next] || COPY.status.idle;
    if (next === "listening" && motionOn()) startLoop();
    else {
      stopLoop();
      drawAllMascots();
    }
    if (!opts.silent) drawAllMascots();
  }

  /* ---------------------------------------------------------------------
     Thread
     --------------------------------------------------------------------- */
  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function bubbleNode(line, index) {
    const turn = el("div", "turn" + (line.who === "me" ? " turn--me" : ""));
    turn.dataset.who = line.who;

    if (state.variant === "c" && line.who === "caller") {
      turn.appendChild(el("span", "turn-idx", String(index + 1).padStart(2, "0")));
    }

    const bubble = el("div", "bubble " + (line.who === "me" ? "bubble--me" : "bubble--caller"));

    const text = el("p", "bubble-text");
    text.textContent = line.text;
    if (line.lang) text.lang = line.lang;
    bubble.appendChild(text);

    const meta = el("div", "bubble-meta");
    if (line.who === "caller") {
      meta.appendChild(el("span", "", (line.lang || "hi").toUpperCase()));
      meta.appendChild(el("span", "", `${line.ms} MS`));
    } else {
      meta.appendChild(el("span", "", "SPOKEN"));
      meta.appendChild(el("span", "", "HINDI"));
    }
    bubble.appendChild(meta);
    turn.appendChild(bubble);
    return turn;
  }

  function missedNode() {
    return el(
      "div",
      "missed",
      `<span class="missed-badge" aria-hidden="true">?</span>
       <div><p class="missed-main">${COPY.retry.main}</p>
       <p class="missed-sub">${COPY.retry.sub}</p></div>`,
    );
  }

  function emptyNode() {
    const wrap = el("div", "empty");
    const canvas = document.createElement("canvas");
    canvas.className = "mascot";
    canvas.id = "mascotEmpty";
    canvas.setAttribute("role", "img");
    wrap.appendChild(canvas);
    wrap.appendChild(el("h2", "empty-title", COPY.empty.title));
    wrap.appendChild(el("p", "empty-body", COPY.empty.body));
    return wrap;
  }

  function summaryNode(summary) {
    const card = el("section", "summary");
    card.setAttribute("aria-live", "polite");
    card.innerHTML = `
      <p class="summary-eyebrow">${COPY.summary.eyebrow}</p>
      <h2 class="summary-title">${summary.who}</h2>
      <div class="summary-rule" role="presentation"></div>
      <dl>
        <div class="summary-row"><dt class="summary-label">${COPY.summary.agreed}</dt>
        <dd class="summary-value">${summary.agreed}</dd></div>
        <div class="summary-row"><dt class="summary-label">${COPY.summary.next}</dt>
        <dd class="summary-value">${summary.next}</dd></div>
      </dl>
      <p class="summary-meta">${COPY.summary.turns(summary.turns)} · ${formatDuration(summary.duration_s)}</p>
    `;
    return card;
  }

  function waitingNode() {
    const card = el("section", "summary");
    card.innerHTML = `
      <p class="summary-eyebrow">Call ended</p>
      <h2 class="summary-title">The call has ended</h2>
      <p class="summary-value" style="margin-top:12px">${COPY.summary.waiting}</p>
    `;
    return card;
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  }

  function renderThread() {
    thread.textContent = "";
    app.dataset.view =
      state.mode === "summary"
        ? "summary"
        : state.ended && !state.summaryReady
          ? "ended"
          : state.mode === "empty"
            ? "empty"
            : state.mode === "missed"
              ? "missed"
              : "transcript";

    if (state.mode === "summary") {
      thread.appendChild(summaryNode(SUMMARY));
      return;
    }

    if (state.ended && !state.summaryReady) {
      thread.appendChild(waitingNode());
      return;
    }

    if (state.mode === "empty" && state.lines.length === 0) {
      thread.appendChild(emptyNode());
      drawAllMascots();
      return;
    }

    state.lines.forEach((line, index) => thread.appendChild(bubbleNode(line, index)));
    if (state.mode === "missed") thread.appendChild(missedNode());
    thread.scrollTop = thread.scrollHeight;
  }

  function appendLine(line) {
    state.lines.push(line);
    thread.appendChild(bubbleNode(line, state.lines.length - 1));
    thread.scrollTop = thread.scrollHeight;
    updateFooter();
    requestAnimationFrame(applyStairs);
  }

  function renderChips() {
    chipsEl.textContent = "";
    chipsEl.setAttribute("aria-label", COPY.chipsLabel);
    for (const chip of CHIPS) {
      const button = el("button", "chip");
      button.type = "button";
      button.textContent = chip;
      button.addEventListener("click", () => send(chip));
      chipsEl.appendChild(button);
    }
  }

  /* ---------------------------------------------------------------------
     Footer
     --------------------------------------------------------------------- */
  function updateFooter() {
    const ended = state.ended;
    const hasLines = state.lines.length > 0;
    footEnd.hidden = ended || !hasLines;
    chipsEl.hidden = ended;
    form.hidden = ended;
    const newCall = $("newCall");
    if (newCall) newCall.hidden = !ended;
  }

  /* ---------------------------------------------------------------------
     Stepped corners — clip-path cannot draw its own border, so these panels
     carry no border and read by fill alone. Generated in px from real size,
     so the steps stay 4px at any text length.
     --------------------------------------------------------------------- */
  function stairPolygon(width, height, corner, step = 4, count = 3) {
    if (width < step * count * 2 || height < step * count * 2) return "none";
    const points = [];
    const fmt = ([x, y]) => `${Math.round(x)}px ${Math.round(y)}px`;

    if (corner === "tr") {
      points.push([0, 0], [width - step * count, 0]);
      let x = width - step * count;
      let y = 0;
      for (let i = 0; i < count; i += 1) {
        x += step;
        points.push([x, y]);
        y += step;
        points.push([x, y]);
      }
      points.push([width, height], [0, height]);
    } else {
      points.push([0, 0], [width, 0], [width, height]);
      let x = step * count;
      let y = height;
      points.push([x, y]);
      for (let i = 0; i < count; i += 1) {
        y -= step;
        points.push([x, y]);
        x -= step;
        points.push([x, y]);
      }
    }
    return `polygon(${points.map(fmt).join(", ")})`;
  }

  function applyStairs() {
    if (state.bubbles !== "stair") return;
    for (const bubble of thread.querySelectorAll(".bubble")) {
      const me = bubble.classList.contains("bubble--me");
      bubble.style.clipPath = stairPolygon(
        bubble.offsetWidth,
        bubble.offsetHeight,
        me ? "tr" : "bl",
      );
    }
  }

  /* ---------------------------------------------------------------------
     Controls
     --------------------------------------------------------------------- */
  function buildPalettes() {
    palettesEl.textContent = "";
    for (const [id] of PALETTE_META) {
      const label = shortLabelOf(id);
      const colours = paletteColors(id);
      const button = el("button", "swatch");
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.palette === id));
      button.title = label + " palette";
      button.style.setProperty("--field", colours.field);
      button.style.setProperty("--line", colours.line);
      const dots = [
        colours.ink,
        colours.accent,
        colours.hot,
        colours.field,
        colours["ink-2"],
        colours.signal,
      ]
        .map((colour) => `<i style="--c:${colour}"></i>`)
        .join("");
      button.innerHTML = `<span class="swatch-dots" aria-hidden="true" style="background:${colours.field};border-color:${colours.line}">${dots}</span><span class="swatch-name">${label}</span>`;
      button.addEventListener("click", () => {
        state.palette = id;
        render();
        save();
      });
      palettesEl.appendChild(button);
    }
  }

  function syncControls() {
    for (const button of document.querySelectorAll("[data-variant]")) {
      button.setAttribute("aria-pressed", String(button.dataset.variant === state.variant));
    }
    for (const button of palettesEl.querySelectorAll("[data-palette]")) {
      button.setAttribute("aria-pressed", String(button.dataset.palette === state.palette));
    }
    for (const button of seg.querySelectorAll("[data-preview]")) {
      button.setAttribute("aria-pressed", String(button.dataset.preview === state.preview));
    }
    $("pitch").value = String(state.pitch);
    $("pitchOut").textContent = state.pitch + " px";
    $("bg").value = state.bg;
    $("bubbles").value = state.bubbles;
    $("motion").checked = state.motion === "on";
    $("dots").value = state.dots;
    $("frameSel").value = state.frame;
  }

  function updatePaletteNote() {
    const colours = paletteColors(state.palette);
    const ink = contrast(colours.ink, colours.field);
    const meta = contrast(colours["ink-2"], colours.panel);
    const reply = contrast(colours["accent-ink"], colours.accent);
    paletteName.textContent = labelOf(state.palette);
    paletteNote.innerHTML = `Ink on field <b>${ink.toFixed(1)}:1</b> · meta on panel <b>${meta.toFixed(1)}:1</b> · reply on accent <b>${reply.toFixed(1)}:1</b>`;
  }

  /* ---------------------------------------------------------------------
     Send / end / new
     --------------------------------------------------------------------- */
  let timers = [];
  function clearTimers() {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
  }

  function send(text) {
    const value = String(text || "").trim();
    if (!value || state.ended) return;

    clearTimers();
    if (state.mode !== "transcript") {
      state.mode = "transcript";
      state.preview = "transcript";
      state.lines = [];
      renderThread();
      syncControls();
    }

    appendLine({ who: "me", text: value });
    draft.value = "";
    setStatus("thinking");
    timers.push(
      setTimeout(() => {
        setStatus("speaking");
        timers.push(
          setTimeout(() => {
            setStatus("listening");
            const next = CALLER_POOL[state.pool % CALLER_POOL.length];
            state.pool += 1;
            timers.push(setTimeout(() => appendLine(next), 900));
          }, 1500),
        );
      }, 550),
    );
  }

  function endCall() {
    if (state.ended) return;
    clearTimers();
    state.ended = true;
    state.summaryReady = false;
    state.status = "idle";
    setStatus("idle");
    updateFooter();
    renderThread();
    timers.push(
      setTimeout(() => {
        state.summaryReady = true;
        state.mode = "summary";
        state.preview = "summary";
        render();
      }, 1100),
    );
  }

  function newCall() {
    clearTimers();
    state.ended = false;
    state.summaryReady = false;
    state.mode = "empty";
    state.preview = "empty";
    state.lines = [];
    state.pool = 0;
    setStatus("listening");
    render();
  }

  /* ---------------------------------------------------------------------
     Render
     --------------------------------------------------------------------- */
  function render() {
    app.dataset.variant = state.variant;
    app.dataset.palette = state.palette;
    app.dataset.bubbles = state.bubbles;
    app.dataset.bg = state.bg;
    app.dataset.dots = state.dots;
    app.dataset.motion = motionOn() ? "on" : "off";
    app.dataset.screen = state.frame === "wide" ? "wide" : "phone";
    studio.dataset.frame = state.frame;
    app.style.setProperty("--pitch", state.pitch + "px");

    syncControls();
    updatePaletteNote();
    setStatus(state.status, { silent: true });
    renderThread();
    updateFooter();
    drawAllMascots();
    drawBgPeacock();
    requestAnimationFrame(() => {
      applyStairs();
    });
  }

  /* ---------------------------------------------------------------------
     Wiring
     --------------------------------------------------------------------- */
  function applyVariant(id) {
    const preset = VARIANTS[id];
    state.variant = id;
    state.palette = preset.palette;
    state.bubbles = preset.bubbles;
    state.bg = preset.bg;
    render();
    save();
  }

  for (const button of document.querySelectorAll("[data-variant]")) {
    button.addEventListener("click", () => applyVariant(button.dataset.variant));
  }
  for (const button of seg.querySelectorAll("[data-preview]")) {
    button.addEventListener("click", () => {
      const preview = button.dataset.preview;
      state.preview = preview;
      clearTimers();
      state.ended = preview === "summary";
      state.summaryReady = preview === "summary";
      state.mode = preview;
      if (preview === "transcript") {
        state.lines = SAMPLE.slice();
        state.status = "listening";
      } else if (preview === "empty") {
        state.lines = [];
        state.status = "listening";
      } else if (preview === "missed") {
        state.lines = SAMPLE.slice(0, 2);
        state.status = "unsure";
      } else if (preview === "summary") {
        state.status = "idle";
      }
      render();
    });
  }

  $("pitch").addEventListener("input", (event) => {
    state.pitch = Number(event.target.value);
    render();
    save();
  });
  $("bg").addEventListener("change", (event) => {
    state.bg = event.target.value;
    render();
    save();
  });
  $("dots").addEventListener("change", (event) => {
    state.dots = event.target.value;
    render();
    save();
  });
  $("bubbles").addEventListener("change", (event) => {
    state.bubbles = event.target.value;
    render();
    save();
  });
  $("motion").addEventListener("change", (event) => {
    state.motion = event.target.checked ? "on" : "off";
    render();
    save();
  });
  $("frameSel").addEventListener("change", (event) => {
    state.frame = event.target.value;
    render();
    save();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    send(draft.value);
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("#endCall, #newCall");
    if (!target) return;
    if (target.id === "endCall") endCall();
    else newCall();
  });

  resetBtn.addEventListener("click", () => {
    Object.assign(state, DEFAULTS);
    state.mode = "transcript";
    state.lines = SAMPLE.slice();
    state.ended = false;
    state.summaryReady = false;
    state.status = "listening";
    render();
    save();
  });

  REDUCED.addEventListener("change", () => render());

  /* Keep the frame honest when the window changes shape. */
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawBgPeacock();
      drawAllMascots();
      applyStairs();
    }, 120);
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => applyStairs());
  }

  /* Tweaks host protocol, per the make-tweakable contract: register the
     listener first, then announce availability. Standalone, the panel is
     always visible; a host can collapse it. */
  let tweaksForcedOff = false;
  window.addEventListener("message", (event) => {
    const type = event && event.data && event.data.type;
    if (type === "activate") {
      tweaksForcedOff = false;
      document.body.classList.remove("tweaks-off");
    } else if (type === "deactivate") {
      tweaksForcedOff = true;
      document.body.classList.add("tweaks-off");
    }
  });
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "tweaks-available" }, "*");
    }
  } catch (err) {
    /* cross-origin parents are fine to ignore */
  }

  /* ---------------------------------------------------------------------
     Boot — ?v=a|b|c&palette=lime&bubbles=stair&bg=peacock&preview=summary
     makes each direction a shareable link, and gives screenshots a way in.
     --------------------------------------------------------------------- */
  function applyParams() {
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (err) {
      return;
    }
    const variant = params.get("v");
    if (variant && VARIANTS[variant]) {
      state.variant = variant;
      state.palette = VARIANTS[variant].palette;
      state.bubbles = VARIANTS[variant].bubbles;
      state.bg = VARIANTS[variant].bg;
    }
    const palette = params.get("palette");
    if (palette && PALETTE_META.some(([id]) => id === palette)) state.palette = palette;
    const bubbles = params.get("bubbles");
    if (bubbles && ["stair", "dissolve", "stamp", "ledger"].includes(bubbles)) state.bubbles = bubbles;
    const bg = params.get("bg");
    if (bg && ["peacock", "lattice", "wash", "off"].includes(bg)) state.bg = bg;
    const frame = params.get("frame");
    if (frame === "wide" || frame === "phone") state.frame = frame;
    const preview = params.get("preview");
    if (preview && ["transcript", "empty", "missed", "summary"].includes(preview)) {
      state.preview = preview;
      state.mode = preview;
      state.ended = preview === "summary";
      state.summaryReady = preview === "summary";
      state.lines = preview === "empty" ? [] : SAMPLE.slice(0, preview === "missed" ? 2 : 4);
      state.status = preview === "missed" ? "unsure" : preview === "summary" ? "idle" : "listening";
    }
  }

  restore();
  applyParams();
  buildPalettes();
  renderChips();
  render();
  setStatus(state.status);
  if (state.status === "listening") startLoop();
})();
