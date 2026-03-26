/**
 * Mini-game platformer — Uma aventura para Agatha
 * Canvas 800x450, estados TITLE | PLAYING | MESSAGE | TRANSITION
 */
(function () {
  "use strict";

  const CANVAS_W = 800;
  const CANVAS_H = 450;
  const GRAVITY = 0.55;
  const MOVE_SPEED = 3.2;
  const JUMP_VEL = -11.5;
  /** Personagem pixel-art: grade 16x24, sombras e brilhos em camadas. */
  const DRAW_S = 2;
  const BASE_PLAYER_W = 16;
  const BASE_PLAYER_H = 24;
  const PLAYER_W = BASE_PLAYER_W * DRAW_S;
  const PLAYER_H = BASE_PLAYER_H * DRAW_S;
  const LEVEL_W = 2400;

  const FLOWER_MESSAGES = [
    "Desde o primeiro dia, você mudou tudo...",
    "Seu sorriso é minha parte favorita do dia",
    "Cada momento com você é especial",
    "Você faz o mundo mais bonito",
    "E agora preciso te fazer uma pergunta...",
  ];

  /** @type {HTMLCanvasElement | null} */
  let canvas = null;
  /** @type {CanvasRenderingContext2D | null} */
  let ctx = null;

  const state = {
    phase: "TITLE", // TITLE | PLAYING | MESSAGE | TRANSITION
    flowersCollected: 0,
    pendingMessage: "",
    camX: 0,
    player: {
      x: 60,
      y: 300,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
    },
    keys: {
      left: false,
      right: false,
      jump: false,
      jumpBuffered: false,
    },
    flowers: [
      { x: 100, y: 378, w: 20, h: 22, collected: false },
      { x: 228, y: 308, w: 20, h: 22, collected: false },
      { x: 568, y: 286, w: 20, h: 22, collected: false },
      { x: 1205, y: 166, w: 20, h: 22, collected: false },
      { x: 1865, y: 286, w: 20, h: 22, collected: false },
    ],
    transitionAlpha: 0,
    transitionDone: false,
    rafId: 0,
  };

  const platforms = [
    { x: 0, y: 400, w: LEVEL_W, h: 60 },
    { x: 180, y: 330, w: 110, h: 14 },
    { x: 360, y: 288, w: 100, h: 14 },
    { x: 520, y: 308, w: 130, h: 14 },
    { x: 760, y: 248, w: 100, h: 14 },
    { x: 940, y: 288, w: 120, h: 14 },
    { x: 1140, y: 188, w: 150, h: 14 },
    { x: 1380, y: 268, w: 100, h: 14 },
    { x: 1580, y: 228, w: 120, h: 14 },
    { x: 1780, y: 308, w: 180, h: 14 },
    { x: 2040, y: 338, w: 360, h: 14 },
  ];

  /** 8-bit style BGM (Web Audio API) */
  class Bit8Music {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.playing = false;
      this.nextTime = 0;
      this.stepIndex = 0;
      /** @type {number | null} */
      this.timer = null;
    }

    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.12;
      this.master.connect(this.ctx.destination);
      return true;
    }

    resume() {
      if (this.ctx && this.ctx.state === "suspended") {
        return this.ctx.resume();
      }
      return Promise.resolve();
    }

    playNote(freq, start, dur, type = "square") {
      if (!this.ctx || !this.master) return;
      const t0 = this.ctx.currentTime + start;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    /** Simple romantic loop: C major arpeggio + passing tones */
    tick() {
      if (!this.playing || !this.ctx) return;
      const now = this.ctx.currentTime;
      const beat = 0.22;
      const melody = [
        [523.25, beat],
        [659.25, beat],
        [783.99, beat],
        [659.25, beat],
        [587.33, beat],
        [698.46, beat],
        [880.0, beat * 1.5],
        [783.99, beat],
        [659.25, beat],
        [523.25, beat * 2],
      ];
      const pair = melody[this.stepIndex % melody.length];
      const [freq, dur] = pair;
      this.playNote(freq, 0, dur * 0.9, "triangle");
      this.stepIndex++;
      this.timer = window.setTimeout(() => this.tick(), dur * 1000);
    }

    start() {
      if (!this.ctx && !this.init()) return;
      this.resume().then(() => {
        if (this.playing) return;
        this.playing = true;
        this.stepIndex = 0;
        this.tick();
      });
    }

    stop() {
      this.playing = false;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }
  }

  const music = new Bit8Music();

  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function resolvePlayer() {
    const p = state.player;
    p.vy += GRAVITY;
    if (p.vy > 14) p.vy = 14;

    let nx = p.x + p.vx;
    let ny = p.y + p.vy;
    p.onGround = false;

    p.x = nx;
    for (const plat of platforms) {
      if (aabb(p.x, p.y, PLAYER_W, PLAYER_H, plat.x, plat.y, plat.w, plat.h)) {
        if (p.vx > 0) p.x = plat.x - PLAYER_W;
        else if (p.vx < 0) p.x = plat.x + plat.w;
      }
    }

    p.y = ny;
    for (const plat of platforms) {
      if (!aabb(p.x, p.y, PLAYER_W, PLAYER_H, plat.x, plat.y, plat.w, plat.h)) continue;
      if (p.vy > 0) {
        p.y = plat.y - PLAYER_H;
        p.vy = 0;
        p.onGround = true;
      } else if (p.vy < 0) {
        p.y = plat.y + plat.h;
        p.vy = 0;
      }
    }

    if (p.x < 0) p.x = 0;
    if (p.x + PLAYER_W > LEVEL_W) p.x = LEVEL_W - PLAYER_W;
    if (p.y > CANVAS_H + 200) {
      p.x = 60;
      p.y = 400 - PLAYER_H;
      p.vx = 0;
      p.vy = 0;
    }

    const targetCam = p.x - CANVAS_W * 0.35;
    state.camX = Math.max(0, Math.min(LEVEL_W - CANVAS_W, targetCam));
  }

  function checkFlowers() {
    const p = state.player;
    for (let i = 0; i < state.flowers.length; i++) {
      const f = state.flowers[i];
      if (f.collected) continue;
      if (aabb(p.x, p.y, PLAYER_W, PLAYER_H, f.x, f.y, f.w, f.h)) {
        f.collected = true;
        state.flowersCollected++;
        state.pendingMessage = FLOWER_MESSAGES[i] || "";
        state.phase = "MESSAGE";
        updateHud();
        showMessageOverlay(state.pendingMessage);
        if (state.flowersCollected >= 5) {
          music.stop();
        }
        break;
      }
    }
  }

  function updateHud() {
    const el = document.getElementById("hudFlowers");
    if (el) el.textContent = String(state.flowersCollected);
  }

  function showMessageOverlay(text) {
    const overlay = document.getElementById("messageOverlay");
    const msg = document.getElementById("messageText");
    if (overlay) overlay.classList.remove("is-hidden");
    if (msg) msg.textContent = text;
  }

  function hideMessageOverlay() {
    const overlay = document.getElementById("messageOverlay");
    if (overlay) overlay.classList.add("is-hidden");
  }

  function drawSky() {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    g.addColorStop(0, "#1a0a2e");
    g.addColorStop(0.5, "#2d1b4e");
    g.addColorStop(1, "#16213e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const seed = (state.camX | 0) % 1000;
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 97 + seed) % CANVAS_W) + ((i * 13) % 3);
      const sy = ((i * 53) % 200) + 20;
      if ((i + (state.camX >> 3)) % 7 === 0) ctx.fillRect(sx, sy, 2, 2);
    }
  }

  function drawPlatforms() {
    if (!ctx) return;
    const cam = state.camX;
    for (const plat of platforms) {
      if (plat.x + plat.w < cam || plat.x > cam + CANVAS_W) continue;
      const x = plat.x - cam;
      ctx.fillStyle = "#2d5016";
      ctx.fillRect(x, plat.y, plat.w, plat.h);
      ctx.fillStyle = "#4a8c3a";
      ctx.fillRect(x, plat.y, plat.w, 4);
      ctx.fillStyle = "#1a3009";
      for (let i = 0; i < plat.w; i += 8) {
        if (i % 16 === 0) ctx.fillRect(x + i, plat.y + 4, 2, plat.h - 4);
      }
    }
  }

  function drawTrees() {
    if (!ctx) return;
    const cam = state.camX;
    const trees = [
      { x: 300, y: 320 },
      { x: 900, y: 300 },
      { x: 1500, y: 280 },
      { x: 2000, y: 310 },
    ];
    for (const t of trees) {
      const x = t.x - cam;
      if (x < -80 || x > CANVAS_W + 40) continue;
      ctx.fillStyle = "#3d2914";
      ctx.fillRect(x + 18, t.y + 40, 14, 60);
      ctx.fillStyle = "#1e6b3a";
      ctx.beginPath();
      ctx.moveTo(x + 25, t.y);
      ctx.lineTo(x + 55, t.y + 50);
      ctx.lineTo(x - 5, t.y + 50);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#2d8f4e";
      ctx.beginPath();
      ctx.moveTo(x + 25, t.y - 15);
      ctx.lineTo(x + 48, t.y + 35);
      ctx.lineTo(x + 2, t.y + 35);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawFlower(f) {
    if (!ctx || f.collected) return;
    const cam = state.camX;
    const x = f.x - cam;
    if (x < -30 || x > CANVAS_W + 10) return;
    const y = f.y;
    ctx.fillStyle = "#228b22";
    ctx.fillRect(x + 8, y + 12, 4, 10);
    ctx.fillStyle = "#ff69b4";
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.ellipse(
        x + 10 + Math.cos(ang) * 5,
        y + 8 + Math.sin(ang) * 5,
        5,
        5,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.fillStyle = "#ffeb3b";
    ctx.beginPath();
    ctx.arc(x + 10, y + 8, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGirlSprite(c, lx, ly) {
    const S = DRAW_S;
    const hair = "#121018";
    const hairHi = "#2a2838";
    const hairEdge = "#0a0810";
    const skin = "#ffeadf";
    const skinMid = "#f0d0c4";
    const skinSh = "#d8b4a8";
    const blush = "#e898a8";
    const sclera = "#f8f6ff";
    const iris = "#3a3848";
    const lip = "#c05078";
    const lipHi = "#e87898";
    const dress = "#d85888";
    const dressMid = "#e87098";
    const dressHi = "#ffb0d0";
    const dressSh = "#983060";
    const dressFold = "#b84870";
    const shoe = "#2e2c38";
    const shoeHi = "#48445a";
    const sole = "#18161c";

    function fr(dx, dy, w, h, fill) {
      c.fillStyle = fill;
      c.fillRect(lx + dx * S, ly + dy * S, w * S, h * S);
    }

    fr(6, 0, 4, 2, hair);
    fr(7, 0, 2, 1, hairHi);
    fr(5, 1, 1, 1, hairEdge);
    fr(10, 1, 1, 1, hairEdge);

    fr(5, 2, 1, 5, hair);
    fr(10, 2, 1, 5, hair);
    fr(10, 3, 1, 2, hairHi);

    fr(6, 2, 4, 5, skin);
    fr(6, 6, 4, 1, skinSh);

    fr(6, 4, 1, 1, sclera);
    fr(7, 4, 1, 1, iris);
    fr(9, 4, 1, 1, sclera);
    fr(10, 4, 1, 1, iris);

    fr(5, 5, 1, 1, blush);
    fr(10, 5, 1, 1, blush);
    fr(7, 5, 2, 1, lip);
    fr(7, 5, 1, 1, lipHi);

    fr(6, 7, 4, 1, skinMid);

    fr(4, 8, 1, 4, skin);
    fr(11, 8, 1, 4, skin);
    fr(4, 11, 1, 1, skinSh);
    fr(11, 11, 1, 1, skinSh);

    fr(5, 8, 6, 3, dress);
    fr(5, 8, 1, 3, dressSh);
    fr(10, 8, 1, 3, dressSh);
    fr(7, 9, 2, 2, dressMid);
    fr(8, 9, 1, 2, dressFold);
    fr(7, 9, 1, 1, dressHi);

    fr(4, 11, 8, 4, dress);
    fr(4, 11, 1, 4, dressSh);
    fr(11, 11, 1, 4, dressMid);
    fr(5, 12, 6, 2, dressHi);
    fr(5, 14, 6, 1, dressFold);

    fr(5, 15, 6, 1, skinSh);
    fr(5, 16, 2, 5, skin);
    fr(9, 16, 2, 5, skin);
    fr(5, 16, 1, 5, skinSh);
    fr(10, 16, 1, 5, skinMid);
    fr(7, 16, 2, 4, skinSh);
    fr(5, 19, 2, 1, skinSh);
    fr(9, 19, 2, 1, skinSh);

    fr(5, 21, 2, 2, shoe);
    fr(9, 21, 2, 2, shoe);
    fr(5, 21, 2, 1, shoeHi);
    fr(9, 21, 2, 1, shoeHi);
    fr(5, 22, 2, 1, sole);
    fr(9, 22, 2, 1, sole);
  }

  function drawPlayer() {
    if (!ctx) return;
    const p = state.player;
    const ox = Math.round(p.x - state.camX);
    const oy = Math.round(p.y);
    const w = PLAYER_W;
    const h = PLAYER_H;

    ctx.save();
    if (p.facing < 0) {
      ctx.translate(ox + w, oy);
      ctx.scale(-1, 1);
      drawGirlSprite(ctx, 0, 0);
    } else {
      drawGirlSprite(ctx, ox, oy);
    }
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    drawSky();
    drawPlatforms();
    drawTrees();
    for (const f of state.flowers) drawFlower(f);
    drawPlayer();

    if (state.phase === "TRANSITION") {
      state.transitionAlpha = Math.min(1, state.transitionAlpha + 0.018);
      ctx.fillStyle = `rgba(0,0,0,${state.transitionAlpha})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }

  function gameLoop() {
    if (state.phase === "PLAYING") {
      const p = state.player;
      p.vx = 0;
      if (state.keys.left) p.vx = -MOVE_SPEED;
      if (state.keys.right) p.vx = MOVE_SPEED;
      if (p.vx > 0) p.facing = 1;
      else if (p.vx < 0) p.facing = -1;
      if ((state.keys.jump || state.keys.jumpBuffered) && p.onGround) {
        p.vy = JUMP_VEL;
        p.onGround = false;
        state.keys.jumpBuffered = false;
      }
      resolvePlayer();
      checkFlowers();
    }
    draw();
    if (state.phase === "TRANSITION" && state.transitionAlpha >= 1) {
      if (!state.transitionDone) {
        state.transitionDone = true;
        window.dispatchEvent(new CustomEvent("agatha:gameComplete"));
      }
      state.rafId = 0;
      return;
    }
    state.rafId = requestAnimationFrame(gameLoop);
  }

  function startPlaying() {
    const title = document.getElementById("titleScreen");
    const wrap = document.getElementById("gameCanvasWrap");
    const touch = document.getElementById("touchControls");
    if (title) title.classList.add("is-hidden");
    if (wrap) wrap.classList.remove("is-hidden");
    if (touch) {
      touch.classList.remove("is-hidden");
      touch.classList.add("touch-controls--desktop-hide");
      touch.setAttribute("aria-hidden", "false");
    }
    state.phase = "PLAYING";
    state.player = {
      x: 60,
      y: 400 - PLAYER_H,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
    };
    state.camX = 0;
    state.transitionDone = false;
    music.start();
    if (!state.rafId) state.rafId = requestAnimationFrame(gameLoop);
  }

  function onMessageOk() {
    hideMessageOverlay();
    if (state.flowersCollected >= 5) {
      state.phase = "TRANSITION";
      state.transitionAlpha = 0;
    } else {
      state.phase = "PLAYING";
    }
  }

  function bindKeys() {
    const down = (e) => {
      if (state.phase !== "PLAYING") return;
      if (e.code === "ArrowLeft" || e.code === "KeyA") state.keys.left = true;
      if (e.code === "ArrowRight" || e.code === "KeyD") state.keys.right = true;
      if (
        e.code === "Space" ||
        e.code === "ArrowUp" ||
        e.code === "KeyW"
      ) {
        e.preventDefault();
        state.keys.jump = true;
        if (state.player.onGround) state.keys.jumpBuffered = true;
      }
    };
    const up = (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") state.keys.left = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") state.keys.right = false;
      if (
        e.code === "Space" ||
        e.code === "ArrowUp" ||
        e.code === "KeyW"
      ) {
        state.keys.jump = false;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
  }

  function bindTouch() {
    const hold = (id, keyLeft, keyRight, keyJump) => {
      const el = document.getElementById(id);
      if (!el) return;
      const start = (ev) => {
        ev.preventDefault();
        if (keyLeft) state.keys.left = true;
        if (keyRight) state.keys.right = true;
        if (keyJump) {
          state.keys.jump = true;
          state.keys.jumpBuffered = true;
        }
      };
      const end = (ev) => {
        ev.preventDefault();
        if (keyLeft) state.keys.left = false;
        if (keyRight) state.keys.right = false;
        if (keyJump) state.keys.jump = false;
      };
      el.addEventListener("pointerdown", start);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointerleave", end);
      el.addEventListener("pointercancel", end);
    };
    hold("touchLeft", true, false, false);
    hold("touchRight", false, true, false);
    hold("touchJump", false, false, true);
  }

  function init() {
    canvas = document.getElementById("gameCanvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    document.getElementById("btnPlay")?.addEventListener("click", () => {
      music.init();
      music.resume().then(() => startPlaying());
    });

    document.getElementById("btnMessageOk")?.addEventListener("click", onMessageOk);

    bindKeys();
    bindTouch();
    updateHud();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
