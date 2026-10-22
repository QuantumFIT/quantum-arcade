'use strict';
/*
 * Quetris: a quantum Tetris.
 *
 * The board is 10x22 with the top two rows hidden. A piece carries one or two
 * shape "kinds" (two = superposition), a phase (+1 / -1) and an optional
 * entanglement id shared with exactly one other piece.
 */
(() => {
  const GAME_ID = 'quetris';
  const rec = (k, v, m) => (window.QR ? QR.set(GAME_ID, k, v, m) : false);
  const t = (s, v) => (window.QA ? QA.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));

  // ---------------------------------------------------------- geometry --
  const COLS = 10, ROWS = 22, HIDDEN = 2, CELL = 30;
  const BX = 120, BY = 15, W = 540, H = 630;
  const BW = COLS * CELL, BH = (ROWS - HIDDEN) * CELL;

  const COLORS = {
    I: '#3ff4ff', O: '#ffe14d', T: '#b06cff', S: '#4dff9a',
    Z: '#ff3b5c', J: '#4d7cff', L: '#ffb347',
  };
  const KINDS = Object.keys(COLORS);
  const MATS = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  };
  const rotCW = m => m.map((row, r) => row.map((_, c) => m[m.length - 1 - c][r]));
  const SHAPES = {};
  for (const k of KINDS) {
    let m = MATS[k];
    SHAPES[k] = [];
    for (let rot = 0; rot < 4; rot++) {
      const cells = [];
      m.forEach((row, r) => row.forEach((v, c) => { if (v) cells.push([c, r]); }));
      SHAPES[k].push(cells);
      m = rotCW(m);
    }
  }

  // SRS wall kicks (x right, y up), converted to y-down on use.
  const K_JLSTZ = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const K_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };
  function kickList(k, from, to) {
    if (k === 'O') return [[0, 0]];
    return (k === 'I' ? K_I : K_JLSTZ)[from + '>' + to].map(([x, y]) => [x, -y]);
  }

  const LINE_SCORE = [0, 100, 300, 500, 800];
  const LOCK_DELAY = 0.5, MAX_RESETS = 15, DAS = 0.16, ARR = 0.04;
  const MAX_CHARGES = 5;
  const ENT_COLORS = ['#ff8ee8', '#7ff9ff', '#ffd27a', '#a9ff8e', '#c9a4ff'];
  const gravity = l => Math.pow(Math.max(0.05, 0.8 - (Math.min(l, 15) - 1) * 0.007), Math.min(l, 15) - 1);

  // ------------------------------------------------------------ canvas --
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
  const arp = (fs, step, type = 'square', vol = 0.03, dur = 0.12) =>
    fs.forEach((f, i) => tone(f, dur, type, vol, null, i * step));
  const sfx = {
    move() { tone(220, 0.03, 'square', 0.015); },
    rotate() { tone(440, 0.05, 'triangle', 0.03, 520); },
    lock() { tone(110, 0.09, 'square', 0.04, 70); },
    hold() { tone(330, 0.08, 'triangle', 0.03, 660); },
    line(n) { arp(n >= 4 ? [523, 659, 784, 1046, 1318] : [523, 659, 784].slice(0, n + 1), 0.06); },
    measure() { tone(1500, 0.05, 'square', 0.04); tone(300, 0.18, 'triangle', 0.05, 150, 0.05); },
    flip() { tone(900, 0.3, 'sawtooth', 0.03, 140); },
    annihilate() { tone(500, 0.3, 'sine', 0.05, 80); tone(505, 0.3, 'sine', 0.05, 82); },
    spooky() { tone(600, 0.4, 'sine', 0.05, 1800, 0.05); },
    tunnel() { tone(2000, 0.25, 'sine', 0.04, 200); },
    reflect() { tone(120, 0.15, 'square', 0.05, 60); },
    level() { arp([392, 523, 659, 784], 0.08, 'triangle', 0.04); },
    over() { tone(600, 1.2, 'sawtooth', 0.04, 50); },
  };

  // ------------------------------------------------------------- state --
  let scene = 'title', pausedFrom = null;
  let board, cur, holdPiece, holdUsed, queue, bag;
  let score = 0, lines = 0, level = 1, flips = 3, tunnels = 3, high = 0;
  let lockT = 0, resets = 0, fallAcc = 0, time = 0, generated = 0;
  let entCounter = 0, pendingEnt = null;
  const held = { left: false, right: false, down: false };
  let dasDir = 0, dasT = 0, arrT = 0;
  const popups = [], particles = [], flashes = [];
  try { high = +localStorage.getItem('quetris-high') || 0; } catch (e) { high = 0; }

  const emptyRow = () => Array(COLS).fill(null);

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function fromBag() {
    if (!bag.length) bag = shuffle([...KINDS]);
    return bag.pop();
  }

  // Quantum modifiers are rolled when a piece enters the queue, so the player
  // can see them coming.
  function genPiece() {
    const k = fromBag();
    const d = { kinds: [k], phase: 1, e: null, h: 0 };
    if (pendingEnt !== null) {
      d.e = pendingEnt; d.h = 1; pendingEnt = null;
    } else if (generated > 3 && Math.random() < 0.11) {
      d.e = ++entCounter; d.h = 0; pendingEnt = d.e;
    }
    if (generated > 1 && Math.random() < Math.min(0.25, 0.12 + level * 0.01)) {
      let b;
      do b = KINDS[Math.floor(Math.random() * KINDS.length)]; while (b === k);
      d.kinds.push(b);
    }
    if (generated > 2 && Math.random() < 0.07) d.phase = -1;
    generated++;
    return d;
  }

  function newGame() {
    board = Array.from({ length: ROWS }, emptyRow);
    bag = []; queue = []; holdPiece = null; holdUsed = false;
    score = 0; lines = 0; level = 1; flips = 3; tunnels = 3;
    generated = 0; entCounter = 0; pendingEnt = null;
    popups.length = 0; particles.length = 0; flashes.length = 0;
    while (queue.length < 4) queue.push(genPiece());
    nextPiece();
  }

  // ----------------------------------------------------------- effects --
  const cellX = c => BX + c * CELL;
  const cellY = r => BY + (r - HIDDEN) * CELL;
  function popup(c, r, text, color = '#fff', life = 1.2) {
    popups.push({ c, r, text: String(text), color, t: 0, life });
  }
  function burst(c, r, color, n = 10, speed = 140) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      particles.push({
        x: cellX(c) + CELL / 2, y: cellY(r) + CELL / 2,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.4 + Math.random() * 0.5, color,
      });
    }
  }
  function addScore(n) {
    score += n;
    if (score > high) high = score;
  }

  // ------------------------------------------------------------- rules --
  function fitsKind(k, rot, x, y) {
    for (const [dx, dy] of SHAPES[k][rot]) {
      const c = x + dx, r = y + dy;
      if (c < 0 || c >= COLS || r >= ROWS) return false;
      if (r >= 0 && board[r][c]) return false;
    }
    return true;
  }
  const fits = (p, x = p.x, y = p.y, rot = p.rot) => p.kinds.every(k => fitsKind(k, rot, x, y));
  const cellsOf = (k, p, y = p.y) => SHAPES[k][p.rot].map(([dx, dy]) => [p.x + dx, y + dy]);

  function spawn(d) {
    const p = {
      kinds: [...d.kinds], phase: d.phase, e: d.e, h: d.h, rot: 0,
      x: d.kinds.length === 1 && d.kinds[0] === 'O' ? 4 : 3, y: 0,
    };
    if (p.e !== null && !entAlive(p.e)) p.e = null;
    if (!fits(p)) {
      const ok = p.kinds.filter(k => fitsKind(k, 0, p.x, p.y));
      if (!ok.length) { gameOver(); return; }
      p.kinds = [ok[0]];
    }
    if (fits(p, p.x, p.y + 1)) p.y++;
    cur = p;
    lockT = 0; resets = 0; fallAcc = 0;
  }

  function nextPiece() {
    spawn(queue.shift());
    queue.push(genPiece());
    holdUsed = false;
  }

  // An entanglement id stays alive until one of its cells has been removed.
  const deadEnts = new Set();
  const entAlive = id => !deadEnts.has(id);

  function describe(p) {
    return { kinds: [...p.kinds], phase: p.phase, e: p.e, h: p.h };
  }

  function hold() {
    if (scene !== 'play' || holdUsed) return;
    const d = describe(cur);
    if (holdPiece) spawn(holdPiece);
    else { spawn(queue.shift()); queue.push(genPiece()); }
    holdPiece = d;
    holdUsed = true;
    sfx.hold();
  }

  function grounded() { return !fits(cur, cur.x, cur.y + 1); }

  function afterMove(wasGrounded) {
    if (resets < MAX_RESETS) lockT = 0;
    if (wasGrounded) resets++;
  }

  function tryMove(dx, dy) {
    if (scene !== 'play' || !cur) return false;
    if (!fits(cur, cur.x + dx, cur.y + dy)) return false;
    const g = grounded();
    cur.x += dx; cur.y += dy;
    afterMove(g);
    return true;
  }

  function rotate(dir) {
    if (scene !== 'play') return;
    const from = cur.rot, to = (from + dir + 4) % 4;
    const seen = new Set();
    for (const k of cur.kinds) {
      for (const [kx, ky] of kickList(k, from, to)) {
        const key = kx + ',' + ky;
        if (seen.has(key)) continue;
        seen.add(key);
        if (fits(cur, cur.x + kx, cur.y + ky, to)) {
          const g = grounded();
          cur.x += kx; cur.y += ky; cur.rot = to;
          afterMove(g);
          sfx.rotate();
          return;
        }
      }
    }
  }

  function collapse(msg) {
    if (cur.kinds.length < 2) return;
    const i = Math.random() < 0.5 ? 0 : 1;
    const keep = cur.kinds[i], gone = cur.kinds[1 - i];
    for (const [c, r] of cellsOf(gone, cur)) if (r >= HIDDEN) burst(c, r, COLORS[gone], 4, 90);
    cur.kinds = [keep];
    const [c0, r0] = cellsOf(keep, cur)[0];
    popup(c0, Math.max(HIDDEN, r0) - 0.5, `${t(msg)} → |${keep}⟩`, '#7ff9ff');
    sfx.measure();
  }

  function landingY(p) {
    let y = p.y;
    while (fits(p, p.x, y + 1)) y++;
    return y;
  }

  function hardDrop() {
    if (scene !== 'play') return;
    let n = 0;
    for (;;) {
      while (fits(cur, cur.x, cur.y + 1)) { cur.y++; n++; }
      if (cur.kinds.length > 1) { collapse('CONTACT'); continue; }
      break;
    }
    addScore(2 * n);
    for (const [c, r] of cellsOf(cur.kinds[0], cur)) {
      if (r >= HIDDEN) particles.push({ x: cellX(c) + CELL / 2, y: cellY(r), vx: 0, vy: -260, t: 0, life: 0.25, color: COLORS[cur.kinds[0]] });
    }
    lock();
  }

  function phaseFlip() {
    if (scene !== 'play') return;
    if (flips <= 0) { popupAtPiece(t('NO Z FLIPS'), '#ff6b8b'); return; }
    flips--;
    cur.phase = -cur.phase;
    popupAtPiece(cur.phase < 0 ? 'Z: |+⟩ → |−⟩' : 'Z: |−⟩ → |+⟩', '#ff4fd8');
    sfx.flip();
  }

  function measureNow() {
    if (scene !== 'play' || cur.kinds.length < 2) return;
    collapse('MEASURED');
  }

  function tunnel() {
    if (scene !== 'play') return;
    if (tunnels <= 0) { popupAtPiece(t('NO TUNNELS'), '#ff6b8b'); return; }
    const y0 = landingY(cur);
    let ty = y0 + 1;
    while (ty < ROWS && !fits(cur, cur.x, ty)) ty++;
    if (ty >= ROWS) { popupAtPiece(t('NO WAY THROUGH'), '#9690c6'); return; }
    tunnels--;
    const w = ty - y0 - 1;
    const p = Math.exp(-0.6 * w);
    if (Math.random() < p) {
      for (const k of cur.kinds) {
        for (const [c, r] of cellsOf(k, cur)) {
          for (let rr = Math.max(r, HIDDEN); rr <= r + (ty - cur.y); rr += 1) {
            particles.push({ x: cellX(c) + CELL / 2, y: cellY(rr) + CELL / 2, vx: (Math.random() - 0.5) * 40, vy: 30, t: -(rr - r) * 0.015, life: 0.5, color: '#ffe14d' });
          }
        }
      }
      cur.y = ty;
      lockT = 0;
      popupAtPiece(t('TUNNELED ({p}%)', { p: Math.round(p * 100) }), '#ffe14d');
      sfx.tunnel();
    } else {
      popupAtPiece(t('REFLECTED ({p}%)', { p: Math.round(p * 100) }), '#ff6b8b');
      sfx.reflect();
    }
  }

  function popupAtPiece(text, color) {
    const [c, r] = cellsOf(cur.kinds[0], cur)[0];
    popup(Math.min(COLS - 2, Math.max(1, c)), Math.max(HIDDEN + 1, r) - 0.5, text, color);
  }

  // Remove a board cell, remembering broken entanglement.
  function removeCell(c, r, broken) {
    const cell = board[r][c];
    if (!cell) return;
    if (cell.e !== null) broken.add(cell.e);
    board[r][c] = null;
  }

  function lock() {
    const k = cur.kinds[0];
    const cells = cellsOf(k, cur).sort((a, b) => b[1] - a[1]);
    if (cells.every(([, r]) => r < HIDDEN)) { gameOver(); return; }
    const broken = new Set();
    let pairs = 0;
    for (const [c, r] of cells) {
      const below = r + 1 < ROWS ? board[r + 1][c] : null;
      if (below && below.p !== cur.phase) {
        burst(c, r + 0.5, '#ffffff', 10, 160);
        burst(c, r + 0.5, COLORS[below.k], 8, 110);
        removeCell(c, r + 1, broken);
        if (cur.e !== null) broken.add(cur.e);
        pairs++;
        continue;
      }
      if (r >= 0) board[r][c] = { k, p: cur.phase, e: cur.e, h: cur.h };
    }
    if (pairs) {
      addScore(25 * pairs * level);
      popup(cells[0][0], cells[0][1] - 0.5, `|+⟩+|−⟩ → 0  ×${pairs}`, '#ffffff', 1.4);
      sfx.annihilate();
    } else {
      sfx.lock();
    }

    const full = [];
    for (let r = 0; r < ROWS; r++) if (board[r].every(Boolean)) full.push(r);
    if (full.length) {
      for (const r of full) {
        for (let c = 0; c < COLS; c++) {
          burst(c, r, COLORS[board[r][c].k], 3, 120);
          removeCell(c, r, broken);
        }
        flashes.push({ y: cellY(r), t: 0 });
      }
      board = board.filter((_, r) => !full.includes(r));
      while (board.length < ROWS) board.unshift(emptyRow());
      const n = full.length;
      addScore(LINE_SCORE[n] * level);
      popup(4.5, full[full.length - 1] - 1, t(['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUETRIS!'][n]), n === 4 ? '#ffe14d' : '#7ff9ff', 1.4);
      sfx.line(n);
      const before = Math.floor(lines / 5);
      lines += n;
      const gained = Math.floor(lines / 5) - before;
      if (gained) { flips = Math.min(MAX_CHARGES, flips + gained); tunnels = Math.min(MAX_CHARGES, tunnels + gained); }
      const newLevel = Math.floor(lines / 10) + 1;
      if (newLevel > level) { level = newLevel; popup(4.5, 10, t('LEVEL {n}', { n: level }), '#ffe14d', 1.6); sfx.level(); }
    }

    // Spooky action: a measured entangled cell takes its whole pair with it.
    let spooky = 0;
    for (const id of broken) {
      deadEnts.add(id);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = board[r][c];
          if (cell && cell.e === id) {
            burst(c, r, ENT_COLORS[id % ENT_COLORS.length], 8, 120);
            board[r][c] = null;
            spooky++;
          }
        }
      }
      for (const d of [...queue, holdPiece]) if (d && d.e === id) d.e = null;
    }
    if (spooky) {
      addScore(50 * spooky * level);
      popup(4.5, 8, t('SPOOKY ACTION ×{n}', { n: spooky }), '#ffb0d8', 1.5);
      sfx.spooky();
    }

    nextPiece();
  }

  function gameOver() {
    scene = 'gameover';
    cur = null;
    try { localStorage.setItem('quetris-high', String(high)); } catch (e) { /* storage unavailable */ }
    rec('highScore', score, 'max'); rec('mostLines', lines, 'max'); rec('bestLevel', level, 'max'); rec('games', 1, 'add');
    sfx.over();
    showOverlay('gameover');
  }

  function startGame() {
    audio();
    deadEnts.clear();
    newGame();
    scene = 'play';
    showOverlay(null);
  }
  function togglePause() {
    if (scene === 'paused') { scene = pausedFrom; showOverlay(null); }
    else if (scene === 'play') { pausedFrom = scene; scene = 'paused'; showOverlay('paused'); }
  }

  // ------------------------------------------------------------ update --
  function update(dt) {
    if (scene === 'paused') return;
    time += dt;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      if (p.t > 0) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; }
    }
    for (let i = popups.length - 1; i >= 0; i--) if ((popups[i].t += dt) > popups[i].life) popups.splice(i, 1);
    for (let i = flashes.length - 1; i >= 0; i--) if ((flashes[i].t += dt) > 0.35) flashes.splice(i, 1);
    if (scene !== 'play' || !cur) return;

    if (dasDir) {
      dasT += dt;
      if (dasT >= DAS) {
        arrT += dt;
        while (arrT >= ARR) { arrT -= ARR; if (!tryMove(dasDir, 0)) break; }
      }
    }

    const g = gravity(level);
    const interval = held.down ? Math.min(g, 0.035) : g;
    fallAcc += dt;
    while (fallAcc >= interval) {
      fallAcc -= interval;
      if (fits(cur, cur.x, cur.y + 1)) { cur.y++; if (held.down) addScore(1); }
      else { fallAcc = 0; break; }
    }

    // Touching down is a measurement for a superposed piece.
    if (cur.kinds.length > 1 && grounded()) collapse('CONTACT');

    if (grounded()) {
      lockT += dt;
      if (lockT >= LOCK_DELAY) lock();
    } else {
      lockT = 0;
    }
  }

  // ------------------------------------------------------------ render --
  function drawCell(px, py, s, color, phase, alpha = 1) {
    ctx.globalAlpha = alpha;
    if (phase > 0) {
      ctx.fillStyle = color;
      ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.fillRect(px + 1, py + 1, s - 2, Math.max(2, s * 0.16));
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(px + 1, py + s * 0.8, s - 2, s * 0.2 - 1);
    } else {
      ctx.fillStyle = '#0a0720';
      ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, s / 14);
      ctx.strokeRect(px + 2.5, py + 2.5, s - 5, s - 5);
      ctx.fillStyle = color;
      ctx.fillRect(px + s * 0.3, py + s / 2 - s / 20, s * 0.4, Math.max(2, s / 10));
    }
    ctx.globalAlpha = 1;
  }

  function drawEntMark(px, py, s, id) {
    ctx.save();
    ctx.strokeStyle = ENT_COLORS[id % ENT_COLORS.length];
    ctx.lineWidth = Math.max(1.2, s / 20);
    // Two linked rings in the top-right corner, gently pulsing.
    const r = s * 0.11 * (1 + 0.12 * Math.sin(time * 6)), y = py + s * 0.26;
    for (const x of [px + s * 0.62, px + s * 0.8]) {
      ctx.fillStyle = '#05040f';
      ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.fill();
    }
    for (const x of [px + s * 0.62, px + s * 0.8]) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function wave(x1, y1, x2, y2, color, alpha, amp = 5) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 4) return;
    const nx = -dy / len, ny = dx / len, n = Math.max(10, Math.floor(len / 5));
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const s = i / n, o = Math.sin(s * len / 10 - time * 8) * amp * Math.sin(Math.PI * s);
      const x = x1 + dx * s + nx * o, y = y1 + dy * s + ny * o;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawBoard() {
    ctx.fillStyle = '#07061a';
    ctx.fillRect(BX, BY, BW, BH);
    ctx.strokeStyle = 'rgba(108,92,255,.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) { ctx.moveTo(BX + c * CELL + 0.5, BY); ctx.lineTo(BX + c * CELL + 0.5, BY + BH); }
    for (let r = 1; r < ROWS - HIDDEN; r++) { ctx.moveTo(BX, BY + r * CELL + 0.5); ctx.lineTo(BX + BW, BY + r * CELL + 0.5); }
    ctx.stroke();

    for (let r = HIDDEN; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        drawCell(cellX(c), cellY(r), CELL, COLORS[cell.k], cell.p);
        if (cell.e !== null) drawEntMark(cellX(c), cellY(r), CELL, cell.e);
      }
    }
  }

  function drawEntLinks() {
    const groups = new Map();
    const add = (id, h, x, y) => {
      if (!groups.has(id)) groups.set(id, [[0, 0, 0], [0, 0, 0]]);
      const g = groups.get(id)[h];
      g[0] += x; g[1] += y; g[2]++;
    };
    for (let r = HIDDEN; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (cell && cell.e !== null) add(cell.e, cell.h, cellX(c) + CELL / 2, cellY(r) + CELL / 2);
      }
    }
    if (cur && cur.e !== null) {
      for (const [c, r] of cellsOf(cur.kinds[0], cur)) add(cur.e, cur.h, cellX(c) + CELL / 2, cellY(r) + CELL / 2);
    }
    for (const [id, [a, b]] of groups) {
      if (!a[2] || !b[2]) continue;
      wave(a[0] / a[2], a[1] / a[2], b[0] / b[2], b[1] / b[2], ENT_COLORS[id % ENT_COLORS.length], 0.6);
    }
  }

  function drawPiece() {
    if (!cur) return;
    const sup = cur.kinds.length > 1;
    // Landing shadow (for a superposed piece: where the measurement happens).
    const ly = landingY(cur);
    for (const k of cur.kinds) {
      ctx.strokeStyle = COLORS[k];
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.5;
      for (const [c, r] of cellsOf(k, cur, ly)) if (r >= HIDDEN) ctx.strokeRect(cellX(c) + 3.5, cellY(r) + 3.5, CELL - 7, CELL - 7);
      ctx.globalAlpha = 1;
    }
    cur.kinds.forEach((k, i) => {
      const alpha = sup ? 0.5 + 0.2 * Math.sin(time * 9 + i * Math.PI) : 1;
      ctx.save();
      ctx.shadowColor = COLORS[k];
      ctx.shadowBlur = sup ? 16 : 10;
      for (const [c, r] of cellsOf(k, cur)) {
        if (r < HIDDEN) continue;
        drawCell(cellX(c), cellY(r), CELL, COLORS[k], cur.phase, alpha);
      }
      ctx.restore();
      if (cur.e !== null) for (const [c, r] of cellsOf(k, cur)) if (r >= HIDDEN) drawEntMark(cellX(c), cellY(r), CELL, cur.e);
    });
    if (sup) {
      const cells = cellsOf(cur.kinds[0], cur).concat(cellsOf(cur.kinds[1], cur));
      const top = Math.min(...cells.map(([, r]) => r));
      const left = Math.min(...cells.map(([c]) => c)), right = Math.max(...cells.map(([c]) => c));
      if (top >= HIDDEN) {
        ctx.save();
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#7ff9ff';
        ctx.fillText(`|${cur.kinds[0]}⟩+|${cur.kinds[1]}⟩`, cellX((left + right + 1) / 2), cellY(top) - 3);
        ctx.restore();
      }
    }
  }

  function drawMini(d, cx, cy, s) {
    if (!d) return;
    d.kinds.forEach((k, i) => {
      const cells = SHAPES[k][0];
      const minX = Math.min(...cells.map(c => c[0])), maxX = Math.max(...cells.map(c => c[0]));
      const minY = Math.min(...cells.map(c => c[1])), maxY = Math.max(...cells.map(c => c[1]));
      const ox = cx - ((maxX - minX + 1) * s) / 2, oy = cy - ((maxY - minY + 1) * s) / 2;
      const alpha = d.kinds.length > 1 ? 0.5 + 0.2 * Math.sin(time * 9 + i * Math.PI) : 1;
      for (const [x, y] of cells) drawCell(ox + (x - minX) * s, oy + (y - minY) * s, s, COLORS[k], d.phase, alpha);
      if (d.e !== null && i === 0) drawEntMark(ox + (cells[0][0] - minX) * s, oy + (cells[0][1] - minY) * s, s, d.e);
    });
  }

  function box(x, y, w, h, label) {
    ctx.fillStyle = '#0c0a26';
    ctx.strokeStyle = '#262058';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x + 0.5, y + 0.5, w, h, 8); else ctx.rect(x + 0.5, y + 0.5, w, h);
    ctx.fill(); ctx.stroke();
    if (label) {
      ctx.fillStyle = '#9690c6';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(t(label), x + 8, y + 8);
    }
  }

  function drawSide() {
    box(10, BY, 100, 92, 'HOLD');
    ctx.globalAlpha = holdUsed ? 0.4 : 1;
    drawMini(holdPiece, 60, BY + 54, 18);
    ctx.globalAlpha = 1;

    box(430, BY, 100, 92, 'NEXT');
    if (queue) {
      drawMini(queue[0], 480, BY + 54, 18);
      for (let i = 1; i < 4; i++) {
        const y = BY + 104 + (i - 1) * 72;
        box(430, y, 100, 64, null);
        drawMini(queue[i], 480, y + 32, 14);
      }
      // Entanglement links in the queue.
      const centers = [BY + 54, BY + 136, BY + 208, BY + 280];
      const all = [cur, ...queue];
      for (let i = 0; i < 4; i++) {
        const a = all[i], b = all[i + 1];
        if (!a || !b || a.e === null || a.e !== b.e || i === 0) continue;
        wave(522, centers[i - 1], 522, centers[i], ENT_COLORS[a.e % ENT_COLORS.length], 0.8, 3);
      }
    }

    // Left column: quick legend of the current quantum state.
    box(10, BY + 104, 100, 240, 'STATE');
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    const info = [];
    if (cur) {
      info.push([cur.kinds.length > 1 ? 'superposed' : 'definite', cur.kinds.length > 1 ? '#7ff9ff' : '#e8e5ff']);
      info.push([cur.phase > 0 ? 'phase |+⟩' : 'phase |−⟩', cur.phase > 0 ? '#e8e5ff' : '#ff4fd8']);
      info.push([cur.e !== null ? 'entangled' : 'separable', cur.e !== null ? ENT_COLORS[cur.e % ENT_COLORS.length] : '#9690c6']);
    }
    info.forEach(([txt, c], i) => { ctx.fillStyle = c; ctx.fillText(t(txt), 20, BY + 132 + i * 22); });
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = '#9690c6';
    ctx.fillText(t('Z FLIPS'), 20, BY + 210);
    ctx.fillText(t('TUNNELS'), 20, BY + 262);
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ff4fd8';
    ctx.fillText('◆'.repeat(flips), 20, BY + 226);
    ctx.fillStyle = '#3ff4ff';
    ctx.fillText('◆'.repeat(tunnels), 20, BY + 278);
  }

  function render() {
    ctx.fillStyle = '#04030c';
    ctx.fillRect(0, 0, W, H);
    drawSide();
    ctx.save();
    ctx.shadowColor = '#6c5cff'; ctx.shadowBlur = 16;
    ctx.strokeStyle = '#6c5cff'; ctx.lineWidth = 2;
    ctx.strokeRect(BX - 2, BY - 2, BW + 4, BH + 4);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(BX, BY, BW, BH); ctx.clip();
    drawBoard();
    drawEntLinks();
    drawPiece();
    for (const f of flashes) {
      ctx.globalAlpha = 1 - f.t / 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(BX, f.y, BW, CELL);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    for (const p of particles) {
      if (p.t < 0) continue;
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '9px "Press Start 2P", monospace';
    for (const p of popups) {
      ctx.globalAlpha = Math.max(0, 1 - (p.t / p.life) ** 2);
      ctx.fillStyle = p.color;
      const x = Math.min(BX + BW - 70, Math.max(BX + 70, cellX(p.c) + CELL / 2));
      ctx.fillText(p.text, x, cellY(p.r) + CELL / 2 - p.t * 18);
    }
    ctx.restore();
  }

  // --------------------------------------------------------------- HUD --
  const $ = id => document.getElementById(id);
  const el = {
    score: $('score'), lines: $('lines'), level: $('level'), high: $('high'),
    flips: $('flips'), tunnels: $('tunnels'), ket: $('ket'), probs: $('probs'),
    overlay: $('overlay'), mute: $('muteBtn'),
  };
  const set = (node, v) => { v = String(v); if (node._v !== v) { node._v = v; node.textContent = v; } };
  const pips = n => '◆'.repeat(n) + '◇'.repeat(Math.max(0, MAX_CHARGES - n));

  function updateHUD() {
    set(el.score, score); set(el.lines, lines); set(el.level, level); set(el.high, high);
    set(el.flips, pips(flips)); set(el.tunnels, pips(tunnels));
    if (!cur) { set(el.ket, '|ψ⟩ = ∅'); set(el.probs, t('no piece in play')); return; }
    const sign = cur.phase > 0 ? '' : '−';
    const ket = cur.kinds.length > 1
      ? `|ψ⟩ = ${sign}(|${cur.kinds[0]}⟩ + |${cur.kinds[1]}⟩)/√2`
      : `|ψ⟩ = ${sign}|${cur.kinds[0]}⟩`;
    set(el.ket, ket);
    const bits = [];
    bits.push(cur.kinds.length > 1 ? `P(${cur.kinds[0]}) = P(${cur.kinds[1]}) = 50%` : t('definite shape'));
    bits.push(t(cur.phase > 0 ? 'matter' : 'antimatter: annihilates |+⟩ below'));
    if (cur.e !== null) bits.push(t(cur.h === 0 ? 'entangled with the next piece' : 'entangled with a placed piece'));
    set(el.probs, bits.join(' · '));
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
        <div class="card-logo"><b>|</b>QUETRIS<b>⟩</b></div>
        <p>${t("Stack and clear lines as usual, but each piece is a wavefunction that only becomes definite when it's measured.")}</p>
        <ul class="mini">
          <li><span class="sym sup">⊕</span>${t('Superposed pieces collapse on contact')}</li>
          <li><span class="gate z">Z</span>${t('Flip to |−⟩ antimatter to annihilate blocks')}</li>
          <li><span class="sym wave">〰</span>${t('Clear part of an entangled pair and it all goes')}</li>
          <li><span class="sym">⇣</span>${t('<kbd>T</kbd> tunnels through overhangs')}</li>
        </ul>
        <button class="go" type="button" data-act="start">${t(touchy ? 'TAP TO START' : 'PRESS ENTER')}</button>
        <p class="hint">${t(touchy ? 'use the buttons below the board' : '←→ move · ↑ rotate · space drop · C hold · F flip · Q measure · T tunnel')}</p>
      </div>`;
    } else if (kind === 'paused') {
      html = `<div class="card"><div class="big">${t('PAUSED')}</div>
        <p>${t('The wavefunction is holding its breath.')}</p>
        <button class="go" type="button" data-act="resume">${t(touchy ? 'TAP TO RESUME' : 'P TO RESUME')}</button></div>`;
    } else if (kind === 'gameover') {
      html = `<div class="card"><div class="big" style="color:#ff3b5c">${t('GAME OVER')}</div>
        <p>${t('The stack decohered into the ceiling.')}</p>
        <p class="big">${score}</p>
        <p>${t('{lines} lines · level {level}', { lines, level })} · ${score >= high && score > 0 ? t('new high score!') : t('high score {high}', { high })}</p>
        <button class="go" type="button" data-act="start">${t(touchy ? 'TAP TO RETRY' : 'ENTER TO RETRY')}</button></div>`;
    }
    o.innerHTML = html;
    o.classList.add('show');
  }

  function act(a) {
    switch (a) {
      case 'start': startGame(); break;
      case 'resume': case 'pause': togglePause(); break;
      case 'left': if (tryMove(-1, 0)) sfx.move(); break;
      case 'right': if (tryMove(1, 0)) sfx.move(); break;
      case 'soft': if (tryMove(0, 1)) addScore(1); break;
      case 'rotate': rotate(1); break;
      case 'drop': hardDrop(); break;
      case 'hold': hold(); break;
      case 'flip': phaseFlip(); break;
      case 'measure': measureNow(); break;
      case 'tunnel': tunnel(); break;
    }
  }

  el.overlay.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (btn) act(btn.dataset.act);
    else if (scene === 'title' || scene === 'gameover') startGame();
    else if (scene === 'paused') togglePause();
  });
  $('touch').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (btn) { audio(); act(btn.dataset.act); }
  });

  function toggleMute() {
    muted = !muted;
    el.mute.textContent = t(muted ? '♪ OFF' : '♪ ON');
    try { localStorage.setItem('quetris-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  try { if (localStorage.getItem('quetris-muted') === '1') toggleMute(); } catch (e) { /* ignore */ }
  el.mute.addEventListener('click', () => { toggleMute(); el.mute.blur(); });
  el.mute.textContent = t(muted ? '♪ OFF' : '♪ ON');

  if (window.QA) {
    QA.onChange(() => {
      el.mute.textContent = t(muted ? '♪ OFF' : '♪ ON');
      el.probs._v = undefined;
      if (overlayKind) showOverlay(overlayKind);
    });
  }

  // ------------------------------------------------------------- input --
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(code)) e.preventDefault();
    if (scene === 'title' || scene === 'gameover') {
      if (code === 'Enter' || code === 'Space') startGame();
      return;
    }
    if (code === 'KeyP' || code === 'Escape') { togglePause(); return; }
    if (code === 'KeyM') { toggleMute(); return; }
    if (scene === 'paused') { if (code === 'Enter') togglePause(); return; }
    if (e.repeat && code !== 'ArrowDown') return;
    switch (code) {
      case 'ArrowLeft':
        held.left = true; dasDir = -1; dasT = 0; arrT = 0;
        if (tryMove(-1, 0)) sfx.move();
        break;
      case 'ArrowRight':
        held.right = true; dasDir = 1; dasT = 0; arrT = 0;
        if (tryMove(1, 0)) sfx.move();
        break;
      case 'ArrowDown': held.down = true; break;
      case 'ArrowUp': case 'KeyX': rotate(1); break;
      case 'KeyZ': rotate(-1); break;
      case 'Space': hardDrop(); break;
      case 'KeyC': case 'ShiftLeft': case 'ShiftRight': hold(); break;
      case 'KeyF': phaseFlip(); break;
      case 'KeyQ': measureNow(); break;
      case 'KeyT': tunnel(); break;
    }
  });
  window.addEventListener('keyup', e => {
    switch (e.code) {
      case 'ArrowLeft':
        held.left = false;
        if (dasDir === -1) { dasDir = held.right ? 1 : 0; dasT = 0; }
        break;
      case 'ArrowRight':
        held.right = false;
        if (dasDir === 1) { dasDir = held.left ? -1 : 0; dasT = 0; }
        break;
      case 'ArrowDown': held.down = false; break;
    }
  });
  window.addEventListener('blur', () => { held.left = held.right = held.down = false; dasDir = 0; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && scene === 'play') togglePause(); });

  // -------------------------------------------------------------- loop --
  newGame();
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
