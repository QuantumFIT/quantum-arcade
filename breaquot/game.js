'use strict';
/*
 * Breaquot: a quantum Breakout.
 *
 * The ball is a list of branches `psi`, each with a probability p (summing to
 * 1) and a phase ±1. Splitter bricks divide a branch, branches that meet
 * interfere, and the paddle measures any branch that reaches the bottom.
 */
(() => {
  const GAME_ID = 'breaquot';
  const rec = (k, v, m) => (window.QR ? QR.set(GAME_ID, k, v, m) : false);
  const t = (s, v) => (window.QA ? QA.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
  const W = 520, H = 640, COLS = 13, BW = 40, BH = 20, TOP = 64;
  const PY = 596, PH = 10, PW = 86, R = 6;
  const MAX_BRANCHES = 8, COHERENCE = 12;

  // 1-3 bricks (hit points) · H beam splitter · S steel barrier · Z phase plate
  // lowercase letters: entangled brick pairs (each letter appears twice)
  const LEVELS = [
    { name: 'BEAM SPLITTER', rows: [
      '3333333333333',
      '2222222222222',
      '2222222222222',
      '1111111111111',
      '1111111111111',
      '.............',
      '.............',
      '....H...H....',
    ] },
    { name: 'PHASE PLATES', rows: [
      '3333333333333',
      '2222222222222',
      '1111111111111',
      'ZZZ.......ZZZ',
      '1111111111111',
      '.............',
      '.............',
      '...H.....H...',
    ] },
    { name: 'TUNNEL BARRIER', rows: [
      '2222222222222',
      '2222222222222',
      '1111111111111',
      'SSSSSS.SSSSSS',
      '1111111111111',
      '.............',
      '.............',
      '......H......',
    ] },
    { name: 'SPOOKY ACTION', rows: [
      '3333333333333',
      'a2b2c2.2c2b2a',
      '1111111111111',
      'd1e1f1.1f1e1d',
      '.............',
      '.............',
      '..H.......H..',
    ] },
    { name: 'INTERFEROMETER', rows: [
      '3333333333333',
      '3SSS33333SSS3',
      '2222222222222',
      '2ZZ2222222ZZ2',
      '1111111111111',
      '.............',
      '.............',
      '..H...H...H..',
    ] },
  ];
  const HP_COLORS = ['', '#4dff9a', '#ffb347', '#ff3b5c'];
  const ENT_COLOR = '#ffb0d8';
  const PHASE_COLOR = { 1: '#3ff4ff', '-1': '#ff4fd8' };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const DPR = (window.devicePixelRatio || 1) > 1 ? 2 : 1;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // ------------------------------------------------------------- audio --
  let actx = null, muted = false;
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(f, dur, type = 'square', vol = 0.035, f2 = null, delay = 0) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  let lastBlip = 0;
  const sfx = {
    brick(p) {
      if (time - lastBlip < 0.03) return;
      lastBlip = time;
      tone(300 + 500 * p, 0.06, 'square', 0.02 + 0.03 * p);
    },
    wall() { tone(180, 0.03, 'triangle', 0.02); },
    paddle() { tone(260, 0.08, 'triangle', 0.05, 380); },
    split() { tone(500, 0.18, 'sine', 0.04, 1000); tone(500, 0.18, 'sine', 0.03, 250); },
    phase() { tone(900, 0.12, 'sawtooth', 0.02, 450); },
    measure() { tone(1500, 0.05, 'square', 0.04); tone(300, 0.18, 'triangle', 0.05, 150, 0.05); },
    vanish() { tone(700, 0.2, 'sine', 0.03, 120); },
    merge(same) { same ? [440, 660, 880].forEach((f, i) => tone(f, 0.1, 'sine', 0.04, null, i * 0.04)) : tone(500, 0.3, 'sine', 0.05, 80); },
    breakB() { tone(520, 0.08, 'square', 0.03, 260); },
    spooky() { tone(600, 0.4, 'sine', 0.05, 1800, 0.05); },
    lose() { tone(500, 0.8, 'sawtooth', 0.04, 60); },
    clear() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.15, 'triangle', 0.05, null, i * 0.09)); },
  };

  // ------------------------------------------------------------- state --
  let scene = 'title', sceneT = 0, pausedFrom = null;
  let levelIdx = 0, score = 0, lives = 3, high = 0;
  let bricks = [], psi = [], stuck = true, coherT = 0;
  const paddle = { x: W / 2, w: PW };
  let pointerX = null, time = 0;
  const keys = { left: false, right: false };
  const popups = [], particles = [];
  try { high = +localStorage.getItem('breaquot-high') || 0; } catch (e) { high = 0; }

  const speed = () => Math.min(520, 340 + levelIdx * 18);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function loadLevel(i) {
    levelIdx = i;
    const L = LEVELS[i % LEVELS.length];
    bricks = [];
    const pairs = {};
    L.rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === '.') return;
        const k = { x: c * BW, y: TOP + r * BH, w: BW, h: BH, type: 'n', hp: 1, max: 1, pair: null, alive: true, flash: 0 };
        if (ch >= '1' && ch <= '3') { k.hp = k.max = +ch; }
        else if (ch === 'H' || ch === 'S' || ch === 'Z') k.type = ch;
        else {
          k.type = 'E';
          if (pairs[ch]) { k.pair = pairs[ch]; pairs[ch].pair = k; } else pairs[ch] = k;
        }
        bricks.push(k);
      });
    });
    psi = []; stuck = true; coherT = 0;
    popups.length = 0; particles.length = 0;
    scene = 'ready'; sceneT = 1.6;
  }

  // ----------------------------------------------------------- effects --
  function popup(x, y, text, color = '#fff', life = 1.2) {
    popups.push({ x, y, text: String(text), color, t: 0, life });
  }
  function burst(x, y, color, n = 12, sp = 160) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = sp * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.4 + Math.random() * 0.5, color });
    }
  }
  function addScore(n) {
    score += n;
    if (score > high) high = score;
  }
  const pct = p => Math.round(p * 100) + '%';

  // ---------------------------------------------------------- branches --
  const LETTERS = 'abcdefgh';
  function freeLetter() {
    return [...LETTERS].find(l => !psi.some(b => b.name === l)) || '?';
  }
  function makeBranch(x, y, vx, vy, p = 1, ph = 1) {
    return { x, y, vx, vy, p, ph, age: 0, through: null, zIn: new Set(), passed: false, trail: [], name: 'a' };
  }

  function launch() {
    if (!stuck || scene !== 'play') return;
    const a = (Math.random() * 40 - 20) * Math.PI / 180, s = speed();
    psi = [makeBranch(paddle.x, PY - R - 1, Math.sin(a) * s, -Math.cos(a) * s)];
    stuck = false;
    sfx.paddle();
  }

  function renormalize() {
    const total = psi.reduce((s, b) => s + b.p, 0);
    if (total > 0) for (const b of psi) b.p /= total;
  }

  function collapseTo(b, msg) {
    for (const o of psi) if (o !== b) burst(o.x, o.y, PHASE_COLOR[o.ph], 10, 120);
    psi = [b];
    b.p = 1; b.ph = 1; b.name = 'a';
    coherT = 0;
    if (msg) popup(b.x, b.y - 16, t(msg.key, msg.vars), '#7ff9ff');
    sfx.measure();
  }

  function measureAll(msg) {
    if (psi.length < 2) return;
    let r = Math.random(), pick = psi[psi.length - 1];
    for (const b of psi) { r -= b.p; if (r <= 0) { pick = b; break; } }
    collapseTo(pick, msg);
  }

  function fixAngle(b) {
    const s = speed();
    const min = 0.28 * s;
    if (Math.abs(b.vy) < min) b.vy = (b.vy < 0 ? -1 : 1) * min;
    const k = s / Math.hypot(b.vx, b.vy);
    b.vx *= k; b.vy *= k;
  }

  function overlaps(b, k) {
    const cx = clamp(b.x, k.x, k.x + k.w), cy = clamp(b.y, k.y, k.y + k.h);
    return (b.x - cx) ** 2 + (b.y - cy) ** 2 < R * R;
  }

  function reflectOff(b, k) {
    const penX = Math.min(b.x + R - k.x, k.x + k.w - (b.x - R));
    const penY = Math.min(b.y + R - k.y, k.y + k.h - (b.y - R));
    if (penX < penY) {
      const left = b.x < k.x + k.w / 2;
      b.vx = (left ? -1 : 1) * Math.abs(b.vx);
      b.x = left ? k.x - R : k.x + k.w + R;
    } else {
      const above = b.y < k.y + k.h / 2;
      b.vy = (above ? -1 : 1) * Math.abs(b.vy);
      b.y = above ? k.y - R : k.y + k.h + R;
    }
  }

  function breakBrick(k, spooky) {
    if (!k.alive) return;
    k.alive = false;
    const color = k.type === 'E' ? ENT_COLOR : HP_COLORS[k.max];
    burst(k.x + k.w / 2, k.y + k.h / 2, color, 14, 150);
    addScore(50 * k.max + (spooky ? 100 : 0));
    sfx.breakB();
    if (spooky) popup(k.x + k.w / 2, k.y, t('SPOOKY +150'), ENT_COLOR, 1.3);
    if (k.pair && k.pair.alive) {
      sfx.spooky();
      breakBrick(k.pair, true);
    }
  }

  function hitBrick(b, k) {
    k.flash = 0.18;
    if (k.type === 'H' || k.type === 'S') {
      const T = k.type === 'H' ? 0.5 : 0.15;
      if (psi.length < MAX_BRANCHES && b.p * T > 0.004) {
        const tb = { ...b, p: b.p * T, through: k, age: 0, zIn: new Set(b.zIn), trail: [], passed: false, name: freeLetter() };
        b.p *= 1 - T;
        b.ph = -b.ph;
        b.age = 0;
        reflectOff(b, k);
        if (psi.length === 1) coherT = COHERENCE;
        psi.push(tb);
        popup(k.x + k.w / 2, k.y - 6, k.type === 'H' ? t('SPLIT 50/50') : t('TUNNEL {p}', { p: pct(tb.p) }), k.type === 'H' ? '#7ff9ff' : '#c9cde0', 0.9);
        sfx.split();
      } else if (Math.random() < T) {
        b.through = k;
        popup(k.x + k.w / 2, k.y - 6, t('TRANSMITTED'), '#c9cde0', 0.8);
      } else {
        b.ph = -b.ph;
        reflectOff(b, k);
      }
      return;
    }
    reflectOff(b, k);
    k.hp -= b.p;
    addScore(Math.max(1, Math.round(10 * b.p)));
    sfx.brick(b.p);
    if (k.hp <= 1e-6) breakBrick(k, false);
  }

  function atPaddle(b) {
    b.passed = true;
    if (psi.length > 1) {
      const real = Math.random() < b.p;
      if (!real) {
        burst(b.x, b.y, PHASE_COLOR[b.ph], 10, 100);
        popup(b.x, PY - 20, t('NOT HERE ({p})', { p: pct(b.p) }), '#9690c6');
        psi.splice(psi.indexOf(b), 1);
        renormalize();
        if (psi.length === 1) { psi[0].ph = 1; coherT = 0; }
        sfx.vanish();
        return;
      }
      collapseTo(b, { key: 'HERE! ({p})', vars: { p: pct(b.p) } });
    }
    const half = paddle.w / 2 + R;
    if (b.x >= paddle.x - half && b.x <= paddle.x + half) {
      const rel = clamp((b.x - paddle.x) / (paddle.w / 2), -1, 1);
      const a = rel * 62 * Math.PI / 180, s = speed();
      b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s;
      b.y = PY - R;
      b.passed = false;
      sfx.paddle();
    }
  }

  function interfere() {
    for (let i = 0; i < psi.length; i++) {
      for (let j = i + 1; j < psi.length; j++) {
        const a = psi[i], b = psi[j];
        if (a.age < 0.25 || b.age < 0.25 || a.through || b.through) continue;
        if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > (1.8 * R) ** 2) continue;
        let vx = a.vx * a.p + b.vx * b.p, vy = a.vy * a.p + b.vy * b.p;
        if (Math.hypot(vx, vy) < 1) { vx = -a.vy; vy = a.vx; }
        const same = a.ph === b.ph;
        if (!same) { vx = -vx; vy = -vy; }
        a.vx = vx; a.vy = vy; a.p += b.p; a.age = 0;
        fixAngle(a);
        psi.splice(j, 1);
        burst(a.x, a.y, same ? '#7ff9ff' : '#ff4fd8', 16, 140);
        popup(a.x, a.y - 16, same ? t('CONSTRUCTIVE') : t('DESTRUCTIVE: OTHER PORT'), same ? '#7ff9ff' : '#ff4fd8', 1.2);
        addScore(50);
        if (psi.length === 1) { a.ph = 1; coherT = 0; }
        sfx.merge(same);
        return;
      }
    }
  }

  function loseLife() {
    lives--;
    sfx.lose();
    psi = []; stuck = true; coherT = 0;
    if (lives <= 0) {
      scene = 'gameover';
      try { localStorage.setItem('breaquot-high', String(high)); } catch (e) { /* storage unavailable */ }
      rec('highScore', score, 'max'); rec('bestLevel', levelIdx + 1, 'max'); rec('games', 1, 'add');
      showOverlay('gameover');
    } else {
      popup(paddle.x, PY - 30, t('COLLAPSED INTO THE VOID'), '#ff6b8b', 1.4);
    }
  }

  // ------------------------------------------------------------ update --
  function step(h) {
    if (pointerX !== null) paddle.x = pointerX;
    else paddle.x += ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * 560 * h;
    paddle.x = clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);
    if (stuck) return;

    for (const b of [...psi]) {
      if (!psi.includes(b)) continue;
      b.age += h;
      b.x += b.vx * h; b.y += b.vy * h;
      if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); sfx.wall(); }
      if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); sfx.wall(); }
      if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); sfx.wall(); }

      for (const k of bricks) {
        if (!k.alive) continue;
        if (k.type === 'Z') {
          const inside = b.x > k.x && b.x < k.x + k.w && b.y > k.y && b.y < k.y + k.h;
          if (inside && !b.zIn.has(k)) { b.zIn.add(k); b.ph = -b.ph; k.flash = 0.18; if (psi.length > 1) sfx.phase(); }
          else if (!inside) b.zIn.delete(k);
          continue;
        }
        if (b.through === k) { if (!overlaps(b, k)) b.through = null; continue; }
        if (overlaps(b, k)) { hitBrick(b, k); fixAngle(b); break; }
      }
      if (!psi.includes(b)) continue;

      if (b.vy > 0 && b.y + R >= PY && !b.passed) {
        atPaddle(b);
        if (!psi.includes(b)) continue;
      }
      if (b.y - R > H) { loseLife(); return; }
    }

    interfere();

    if (psi.length > 1) {
      coherT -= h;
      if (coherT <= 0) measureAll({ key: 'DECOHERED' });
    }

    if (!bricks.some(k => k.alive && (k.type === 'n' || k.type === 'E'))) {
      scene = 'clear'; sceneT = 2;
      addScore(1000);
      sfx.clear();
    }
  }

  function update(dt) {
    if (scene === 'paused') return;
    time += dt;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
    }
    for (let i = popups.length - 1; i >= 0; i--) if ((popups[i].t += dt) > popups[i].life) popups.splice(i, 1);
    for (const k of bricks) if (k.flash > 0) k.flash -= dt;
    for (const b of psi) {
      b.trail.push([b.x, b.y]);
      if (b.trail.length > 10) b.trail.shift();
    }

    if (scene === 'ready') { sceneT -= dt; if (sceneT <= 0) scene = 'play'; }
    if (scene === 'clear') { sceneT -= dt; if (sceneT <= 0) loadLevel(levelIdx + 1); return; }
    if (scene !== 'play' && scene !== 'ready') return;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < n && (scene === 'play' || scene === 'ready'); i++) step(dt / n);
  }

  // ------------------------------------------------------------ render --
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  function wave(x1, y1, x2, y2, color, alpha, amp = 4) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 4) return;
    const nx = -dy / len, ny = dx / len, n = Math.max(10, Math.floor(len / 5));
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const s = i / n, o = Math.sin(s * len / 9 - time * 9) * amp * Math.sin(Math.PI * s);
      const x = x1 + dx * s + nx * o, y = y1 + dy * s + ny * o;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawBricks() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const k of bricks) {
      if (!k.alive) continue;
      const x = k.x + 2, y = k.y + 2, w = k.w - 4, h = k.h - 4;
      if (k.type === 'n' || k.type === 'E') {
        const color = k.type === 'E' ? ENT_COLOR : HP_COLORS[k.max];
        const frac = clamp(k.hp / k.max, 0, 1);
        ctx.fillStyle = '#0c0a26';
        rrect(x, y, w, h, 3); ctx.fill();
        ctx.globalAlpha = 0.25 + 0.75 * frac;
        ctx.fillStyle = color;
        rrect(x, y + h * (1 - frac), w, h * frac, 3); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        rrect(x + 0.5, y + 0.5, w - 1, h - 1, 3); ctx.stroke();
        if (k.type === 'E') {
          ctx.strokeStyle = '#05040f'; ctx.lineWidth = 1.5;
          for (const dx of [-3.5, 3.5]) { ctx.beginPath(); ctx.arc(k.x + k.w / 2 + dx, k.y + k.h / 2, 4, 0, Math.PI * 2); ctx.stroke(); }
        }
      } else if (k.type === 'H') {
        ctx.fillStyle = '#0c1e2a';
        rrect(x, y, w, h, 3); ctx.fill();
        ctx.strokeStyle = '#7ff9ff'; ctx.lineWidth = 1.5;
        rrect(x + 0.5, y + 0.5, w - 1, h - 1, 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 4, y + h - 3); ctx.lineTo(x + w - 4, y + 3);
        ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#7ff9ff';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillText('H', k.x + k.w / 2, k.y + k.h / 2 + 1);
      } else if (k.type === 'S') {
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, '#5a6078'); g.addColorStop(1, '#2c3042');
        ctx.fillStyle = g;
        rrect(x, y, w, h, 3); ctx.fill();
        ctx.fillStyle = '#c9cde0';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText('15%', k.x + k.w / 2, k.y + k.h / 2 + 1);
      } else if (k.type === 'Z') {
        ctx.fillStyle = 'rgba(255,79,216,.16)';
        rrect(x, y, w, h, 3); ctx.fill();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,79,216,.7)'; ctx.lineWidth = 1;
        rrect(x + 0.5, y + 0.5, w - 1, h - 1, 3); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ff4fd8';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillText('Z', k.x + k.w / 2, k.y + k.h / 2 + 1);
      }
      if (k.flash > 0) {
        ctx.globalAlpha = k.flash / 0.18 * 0.6;
        ctx.fillStyle = '#ffffff';
        rrect(x, y, w, h, 3); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    for (const k of bricks) {
      if (k.type === 'E' && k.alive && k.pair && k.pair.alive && k.x < k.pair.x) {
        wave(k.x + k.w / 2, k.y + k.h / 2, k.pair.x + k.pair.w / 2, k.pair.y + k.pair.h / 2, ENT_COLOR, 0.35, 3);
      }
    }
  }

  function drawPaddle() {
    ctx.save();
    ctx.shadowColor = '#7ff9ff'; ctx.shadowBlur = 14;
    const g = ctx.createLinearGradient(0, PY, 0, PY + PH);
    g.addColorStop(0, '#e8fdff'); g.addColorStop(1, '#3ff4ff');
    ctx.fillStyle = g;
    rrect(paddle.x - paddle.w / 2, PY, paddle.w, PH, 5); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#05040f';
    ctx.beginPath(); ctx.ellipse(paddle.x, PY + PH / 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3ff4ff';
    ctx.beginPath(); ctx.arc(paddle.x, PY + PH / 2, 1.8, 0, Math.PI * 2); ctx.fill();
  }

  function drawBall() {
    if (stuck) {
      if (scene === 'play' || scene === 'ready') {
        drawBranch({ x: paddle.x, y: PY - R - 1, p: 1, ph: 1, trail: [], name: '' }, false);
        if (scene === 'play') {
          ctx.fillStyle = '#9690c6';
          ctx.font = '8px "Press Start 2P", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(touchy ? t('TAP TO LAUNCH') : t('SPACE / CLICK TO LAUNCH'), W / 2, PY - 40);
        }
      }
      return;
    }
    const sup = psi.length > 1;
    if (sup) {
      const main = psi.reduce((a, b) => (b.p > a.p ? b : a));
      for (const b of psi) if (b !== main) wave(main.x, main.y, b.x, b.y, '#9a8cff', 0.25 + 0.4 * b.p, 3);
    }
    for (const b of psi) drawBranch(b, sup);
  }

  function drawBranch(b, sup) {
    const color = PHASE_COLOR[b.ph];
    const a = sup ? 0.3 + 0.7 * Math.sqrt(b.p) : 1;
    ctx.save();
    b.trail.forEach(([x, y], i) => {
      ctx.globalAlpha = a * (i / b.trail.length) * 0.35;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, R * (0.4 + 0.6 * i / b.trail.length), 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = a;
    const glow = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, R * 3.2);
    glow.addColorStop(0, color); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(b.x, b.y, R * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a;
    ctx.fillStyle = sup ? color : '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
    if (sup) {
      ctx.globalAlpha = 0.9;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = color;
      ctx.fillText(`${b.name} ${pct(b.p)}`, b.x, b.y - R - 4);
    }
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = '#04030c';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(108,92,255,.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = BW; x < W; x += BW) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = 0; y < H; y += BW) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
    // Detector line.
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(63,244,255,.18)';
    ctx.beginPath(); ctx.moveTo(0, PY + 0.5); ctx.lineTo(W, PY + 0.5); ctx.stroke();
    ctx.setLineDash([]);

    drawBricks();
    drawPaddle();
    drawBall();

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '8px "Press Start 2P", monospace';
    for (const p of popups) {
      ctx.globalAlpha = Math.max(0, 1 - (p.t / p.life) ** 2);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, clamp(p.x, 90, W - 90), p.y - p.t * 22);
    }
    ctx.restore();

    if (scene === 'ready' || scene === 'clear') {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffe14d'; ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 12;
      const L = LEVELS[levelIdx % LEVELS.length];
      ctx.fillText(scene === 'clear' ? t('LEVEL CLEARED') : t('LEVEL {n}', { n: levelIdx + 1 }), W / 2, 400);
      if (scene === 'ready') {
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = '#7ff9ff'; ctx.shadowColor = '#7ff9ff';
        ctx.fillText(t(L.name), W / 2, 424);
      }
      ctx.restore();
    }
  }

  // --------------------------------------------------------------- HUD --
  const $ = id => document.getElementById(id);
  const el = {
    score: $('score'), level: $('level'), lives: $('lives'), high: $('high'),
    ket: $('ket'), probs: $('probs'), coh: $('coh'), overlay: $('overlay'), mute: $('muteBtn'),
  };
  const set = (node, v) => { v = String(v); if (node._v !== v) { node._v = v; node.textContent = v; } };

  function updateHUD() {
    set(el.score, score); set(el.level, levelIdx + 1); set(el.high, high);
    set(el.lives, '●'.repeat(Math.max(0, lives)));
    if (psi.length > 1) {
      const sorted = [...psi].sort((a, b) => a.name.localeCompare(b.name));
      const terms = sorted.map((b, i) => {
        const amp = Math.sqrt(b.p).toFixed(2);
        const sign = b.ph < 0 ? '−' : '+';
        return (i === 0 ? (b.ph < 0 ? '−' : '') : ` ${sign} `) + `${amp}|${b.name}⟩`;
      });
      set(el.ket, '|ψ⟩ = ' + terms.join(''));
      set(el.probs, sorted.map(b => `P(${b.name}) = ${pct(b.p)}`).join(' · '));
      el.coh.style.width = (coherT / COHERENCE * 100).toFixed(1) + '%';
    } else {
      set(el.ket, t('|ψ⟩ = |ball⟩'));
      set(el.probs, stuck ? t('resting on the detector') : t('a definite classical ball · hit an H to split it'));
      el.coh.style.width = '0%';
    }
  }

  // ----------------------------------------------------------- overlay --
  const touchy = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  let overlayKind = null;
  function showOverlay(kind) {
    const o = el.overlay;
    overlayKind = kind;
    if (!kind) { o.classList.remove('show'); o.innerHTML = ''; return; }
    let html = '';
    if (kind === 'title') {
      html = `<div class="card">
        <div class="card-logo"><b>|</b>BREAQUOT<b>⟩</b></div>
        <p>${t('The ball is a wave packet. Split it, steer its phase, make it interfere, and catch the branch that turns out to be real.')}</p>
        <ul class="mini">
          <li><span class="gate h">H</span>${t('Beam splitters divide the ball 50/50')}</li>
          <li><span class="gate z">Z</span>${t('Phase plates flip the phase of a branch')}</li>
          <li><span class="sym">✕</span>${t('Meeting branches interfere')}</li>
          <li><span class="sym">👁</span>${t('The paddle measures each branch that reaches it')}</li>
        </ul>
        <button class="go" type="button" data-act="start">${touchy ? t('TAP TO START') : t('PRESS ENTER')}</button>
        <p class="hint">${touchy ? t('drag to move · tap to launch') : t('mouse or ←→ · space/click launch · space measure · P pause')}</p>
      </div>`;
    } else if (kind === 'paused') {
      html = `<div class="card"><div class="big">${t('PAUSED')}</div>
        <p>${t('The wavefunction is holding its breath.')}</p>
        <button class="go" type="button" data-act="resume">${touchy ? t('TAP TO RESUME') : t('P TO RESUME')}</button></div>`;
    } else if (kind === 'gameover') {
      html = `<div class="card"><div class="big" style="color:#ff3b5c">${t('GAME OVER')}</div>
        <p>${t('Every branch eventually found the floor.')}</p>
        <p class="big">${score}</p>
        <p>${t('level {n}', { n: levelIdx + 1 })} · ${score >= high && score > 0 ? t('new high score!') : t('high score {high}', { high })}</p>
        <button class="go" type="button" data-act="start">${touchy ? t('TAP TO RETRY') : t('ENTER TO RETRY')}</button></div>`;
    }
    o.innerHTML = html;
    o.classList.add('show');
  }

  function startGame() {
    audio();
    score = 0; lives = 3;
    loadLevel(0);
    showOverlay(null);
  }
  function togglePause() {
    if (scene === 'paused') { scene = pausedFrom; showOverlay(null); }
    else if (scene === 'play' || scene === 'ready') { pausedFrom = scene; scene = 'paused'; showOverlay('paused'); }
  }
  function action() {
    if (scene === 'title' || scene === 'gameover') { startGame(); return; }
    if (scene !== 'play') return;
    if (stuck) launch(); else measureAll({ key: 'MEASURED' });
  }

  el.overlay.addEventListener('click', e => {
    e.stopPropagation();
    const btn = e.target.closest('[data-act]');
    if (btn && btn.dataset.act === 'resume') togglePause();
    else if (btn || scene === 'title' || scene === 'gameover') startGame();
    else if (scene === 'paused') togglePause();
  });
  $('touch').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    audio();
    if (btn.dataset.act === 'pause') togglePause(); else action();
  });

  function toggleMute() {
    muted = !muted;
    el.mute.textContent = muted ? t('♪ OFF') : t('♪ ON');
    try { localStorage.setItem('breaquot-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  try { if (localStorage.getItem('breaquot-muted') === '1') toggleMute(); } catch (e) { /* ignore */ }
  el.mute.addEventListener('click', () => { toggleMute(); el.mute.blur(); });
  el.mute.textContent = muted ? t('♪ OFF') : t('♪ ON');
  if (window.QA) QA.onChange(() => {
    if (overlayKind) showOverlay(overlayKind);
    el.mute.textContent = muted ? t('♪ OFF') : t('♪ ON');
    el.ket._v = el.probs._v = undefined;
    updateHUD();
  });

  // ------------------------------------------------------------- input --
  const stage = $('stage');
  const toBoardX = e => {
    const r = canvas.getBoundingClientRect();
    return (e.clientX - r.left) / r.width * W;
  };
  stage.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' || e.buttons) pointerX = toBoardX(e);
  });
  stage.addEventListener('pointerdown', e => {
    pointerX = toBoardX(e);
    if (scene === 'play' && stuck) { audio(); launch(); }
  });
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': keys.left = true; pointerX = null; e.preventDefault(); break;
      case 'ArrowRight': case 'KeyD': keys.right = true; pointerX = null; e.preventDefault(); break;
      case 'Space': e.preventDefault(); if (!e.repeat) action(); break;
      case 'Enter': if (scene === 'title' || scene === 'gameover') startGame(); else if (scene === 'paused') togglePause(); break;
      case 'KeyP': case 'Escape': togglePause(); break;
      case 'KeyM': toggleMute(); break;
    }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  });
  window.addEventListener('blur', () => { keys.left = keys.right = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (scene === 'play' || scene === 'ready')) togglePause();
  });

  // -------------------------------------------------------------- loop --
  loadLevel(0);
  scene = 'title';
  showOverlay('title');

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    updateHUD();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
