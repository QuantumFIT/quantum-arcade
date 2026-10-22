'use strict';
/*
 * Quak-Man: a quantum Pac-Man.
 *
 * Coordinates are in tiles; an entity sitting exactly on a tile centre has
 * integer x/y. Grid movers travel from centre to centre towards (tx, ty).
 */
(() => {
  const GAME_ID = 'quak-man';
  const rec = (k, v, m) => (window.QR ? QR.set(GAME_ID, k, v, m) : false);
  const t = (s, v) => (window.QA ? QA.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));

  // ---------------------------------------------------------------- maze --
  const T = 20, COLS = 28, ROWS = 31, TUNNEL_ROW = 14;
  const W = COLS * T, H = ROWS * T;

  // # wall  . dot  o Z-gate  H Hadamard gate  P EPR portal  - ghost door
  const MAZE = [
    '############################',
    '#P...........##...........P#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#H.....##....##....##.....H#',
    '######.##### ## #####.######',
    '     #.##### ## #####.#     ',
    '     #.##          ##.#     ',
    '     #.## ###--### ##.#     ',
    '######.## #      # ##.######',
    '      .   #      #   .      ',
    '######.## #      # ##.######',
    '     #.## ######## ##.#     ',
    '     #.##          ##.#     ',
    '     #.## ######## ##.#     ',
    '######.## ######## ##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##.......  .......##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#P........................P#',
    '############################',
  ];

  const DIR = {
    up: { x: 0, y: -1 }, left: { x: -1, y: 0 },
    down: { x: 0, y: 1 }, right: { x: 1, y: 0 },
  };
  const DIR_LIST = [DIR.up, DIR.left, DIR.down, DIR.right];
  const opp = d => (d ? DIR_LIST.find(e => e.x === -d.x && e.y === -d.y) : null);
  const mirrorDir = d => (d && d.x !== 0 ? opp(d) : d);

  function isOpen(c, r) {
    if (r < 0 || r >= ROWS) return false;
    if (c < 0 || c >= COLS) return r === TUNNEL_ROW;
    const ch = MAZE[r][c];
    return ch !== '#' && ch !== '-';
  }
  const isWall = (c, r) => r >= 0 && r < ROWS && c >= 0 && c < COLS && MAZE[r][c] === '#';

  // Tiles the player can legally reach (tunneling must land on one of these).
  const REACH = new Set(['13,23']);
  {
    const q = [[13, 23]];
    while (q.length) {
      const [c, r] = q.shift();
      for (const d of DIR_LIST) {
        const nc = (c + d.x + COLS) % COLS, nr = r + d.y, k = nc + ',' + nr;
        if (isOpen(nc, nr) && !REACH.has(k)) { REACH.add(k); q.push([nc, nr]); }
      }
    }
  }

  // EPR portal pairs: opposite corners are entangled.
  const PORTAL_PAIRS = [
    [{ x: 1, y: 1 }, { x: 26, y: 29 }, '#3ff4ff'],
    [{ x: 26, y: 1 }, { x: 1, y: 29 }, '#ff4fd8'],
  ];
  const PORTALS = {};
  const PORTAL_LIST = [];
  for (const [a, b, color] of PORTAL_PAIRS) {
    PORTALS[a.x + ',' + a.y] = { ...b, color };
    PORTALS[b.x + ',' + b.y] = { ...a, color };
    PORTAL_LIST.push({ ...a, color }, { ...b, color });
  }

  const GHOST_DEFS = [
    { name: 'Blinky', color: '#ff3b5c', slot: 13.5, release: 0, corner: { x: 25, y: -3 } },
    { name: 'Pinky', color: '#ff8ee8', slot: 13.5, release: 1, corner: { x: 2, y: -3 } },
    { name: 'Inky', color: '#3ff4ff', slot: 11.5, release: 5, corner: { x: 27, y: 33 } },
    { name: 'Clyde', color: '#ffb347', slot: 15.5, release: 9, corner: { x: 0, y: 33 } },
  ];
  const PAIRS = [['Blinky', 'Inky'], ['Pinky', 'Clyde']]; // Bell pairs
  const MODES = [['scatter', 7], ['chase', 20], ['scatter', 7], ['chase', 20],
    ['scatter', 5], ['chase', 20], ['scatter', 5], ['chase', Infinity]];
  const SUPER_TIME = 10;
  const TUNNELS_PER_LEVEL = 3;

  // -------------------------------------------------------------- canvas --
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const DPR = (window.devicePixelRatio || 1) > 1 ? 2 : 1;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = W * DPR; c.height = H * DPR;
    const x = c.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    return [c, x];
  }

  // Neon outlined walls: fill walls, erode by dilated open tiles, hollow out.
  function buildMaze(color, fill) {
    const D = T * 0.32;
    const erode = (x, d) => {
      x.globalCompositeOperation = 'destination-out';
      x.beginPath();
      for (let r = -1; r <= ROWS; r++) {
        for (let c = -1; c <= COLS; c++) {
          if (isWall(c, r)) continue;
          if (x.roundRect) x.roundRect(c * T - d, r * T - d, T + 2 * d, T + 2 * d, d);
          else x.rect(c * T - d, r * T - d, T + 2 * d, T + 2 * d);
        }
      }
      x.fill();
      x.globalCompositeOperation = 'source-over';
    };
    const paintWalls = (x, style) => {
      x.fillStyle = style;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isWall(c, r)) x.fillRect(c * T, r * T, T, T);
    };
    const [a, ax] = makeCanvas();
    paintWalls(ax, color); erode(ax, D);
    const [m, mx] = makeCanvas();
    paintWalls(mx, fill); erode(mx, D + 2.2);
    ax.drawImage(m, 0, 0, W, H);
    const [out, ox] = makeCanvas();
    ox.shadowColor = color; ox.shadowBlur = 12;
    ox.drawImage(a, 0, 0, W, H);
    ox.shadowBlur = 0;
    ox.drawImage(a, 0, 0, W, H);
    return out;
  }
  const mazeImg = buildMaze('#6c5cff', '#0c0a26');
  const mazeFlash = buildMaze('#ffffff', '#1d1a48');

  // --------------------------------------------------------------- audio --
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
  let wakaFlip = false, lastWaka = 0;
  const sfx = {
    dot() {
      if (time - lastWaka < 0.09) return;
      lastWaka = time; wakaFlip = !wakaFlip;
      tone(wakaFlip ? 330 : 240, 0.07, 'triangle', 0.05, wakaFlip ? 240 : 330);
    },
    zgate() { tone(900, 0.35, 'sawtooth', 0.03, 120); },
    hgate() { [440, 660, 880, 1320].forEach((f, i) => tone(f, 0.12, 'square', 0.03, null, i * 0.05)); },
    hh() { [1320, 880, 660, 440].forEach((f, i) => tone(f, 0.1, 'square', 0.03, null, i * 0.04)); },
    measure() { tone(1500, 0.05, 'square', 0.04); tone(300, 0.18, 'triangle', 0.05, 150, 0.05); },
    eat() { tone(200, 0.25, 'square', 0.04, 1200); },
    spooky() { tone(600, 0.4, 'sine', 0.05, 1800, 0.12); },
    interfere() { tone(500, 0.3, 'sine', 0.05, 80); tone(505, 0.3, 'sine', 0.05, 82); },
    portal() { tone(300, 0.25, 'sine', 0.05, 1400); },
    tunnel() { tone(2000, 0.25, 'sine', 0.04, 200); },
    reflect() { tone(120, 0.15, 'square', 0.05, 60); },
    observe() { tone(1000, 0.08, 'triangle', 0.04, 500); },
    split() { tone(400, 0.2, 'triangle', 0.03, 800); },
    death() { tone(800, 1.2, 'sawtooth', 0.04, 60); },
    life() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'square', 0.03, null, i * 0.08)); },
    clear() { [523, 784, 1046, 1568].forEach((f, i) => tone(f, 0.15, 'triangle', 0.05, null, i * 0.1)); },
  };

  // --------------------------------------------------------------- state --
  let scene = 'title', sceneT = 0, pausedFrom = null;
  let level = 1, score = 0, lives = 3, nextLifeAt = 10000;
  let high = 0;
  try { high = +localStorage.getItem('quakman-high') || 0; } catch (e) { high = 0; }
  let dots = [], dotsLeft = 0;
  let psi = [], ghosts = [], clyde = null;
  let modeIdx = 0, modeT = 0, chaseMode = 'scatter';
  let superT = 0, tunnels = TUNNELS_PER_LEVEL, eatChain = 0, grace = 0, freezeT = 0;
  let wantDir = null, time = 0;
  const popups = [], particles = [];

  function resetDots() {
    dotsLeft = 0;
    dots = MAZE.map(row => row.split('').map(ch => {
      if (ch === '.' || ch === 'o' || ch === 'H') { dotsLeft++; return ch; }
      return '';
    }));
  }

  function makeBranch(x, y, dir, mirror) {
    return { x, y, tx: null, ty: null, dir, mirror, mouth: 0, moving: false, ported: false };
  }

  function resetActors() {
    psi = [makeBranch(13, 23, DIR.left, false)];
    superT = 0; grace = 0; freezeT = 0; eatChain = 0; wantDir = null;
    const rf = Math.max(0.3, 1 - 0.15 * (level - 1));
    ghosts = GHOST_DEFS.map((d, i) => ({
      name: d.name, color: d.color, corner: d.corner,
      x: i === 0 ? 13 : d.slot, y: i === 0 ? 11 : 14,
      state: i === 0 ? 'normal' : 'house', release: d.release * rf,
      dir: i === 0 ? DIR.left : DIR.down, tx: null, ty: null,
      phase: 1, fright: 0, bob: i * 1.3, path: null, partner: null,
      twin: null, isTwin: false, origin: null, splitT: 6,
    }));
    const by = n => ghosts.find(g => g.name === n);
    for (const [a, b] of PAIRS) { by(a).partner = by(b); by(b).partner = by(a); }
    clyde = by('Clyde');
    modeIdx = 0; modeT = MODES[0][1]; chaseMode = MODES[0][0];
    particles.length = 0;
    popups.length = 0;
  }

  // ------------------------------------------------------------- effects --
  function popup(x, y, text, color = '#fff', life = 1.1) {
    popups.push({ x, y, text: String(text), color, t: 0, life });
  }
  function burst(x, y, color, n = 16, speed = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.4 + Math.random() * 0.5, color });
    }
  }
  function trail(x0, y0, x1, y1, color) {
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      particles.push({
        x: x0 + (x1 - x0) * s, y: y0 + (y1 - y0) * s,
        vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
        t: -s * 0.15, life: 0.6, color,
      });
    }
  }
  function addScore(n) {
    score += n;
    if (score >= nextLifeAt) {
      nextLifeAt += 10000; lives++;
      popup(psi[0].x, psi[0].y - 1.5, t('1UP'), '#ffe14d', 1.5);
      sfx.life();
    }
    if (score > high) high = score;
  }

  // ------------------------------------------------------------ movement --
  function wrapX(e) {
    if (e.x < 0 && e.dir === DIR.left) e.x = COLS;
    else if (e.x > COLS - 1 && e.dir === DIR.right) e.x = -1;
  }

  // Advance a grid mover by `dist` tiles, calling onCenter whenever it needs a
  // new target and onArrive whenever it lands on a tile centre.
  function stepGrid(e, dist, onCenter, onArrive) {
    let guard = 0;
    while (dist > 1e-9 && guard++ < 8) {
      if (e.tx === null) {
        onCenter(e);
        if (e.tx === null) return;
      }
      const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.abs(dx) + Math.abs(dy);
      if (d <= dist) {
        e.x = e.tx; e.y = e.ty; e.tx = e.ty = null; dist -= d;
        onArrive(e);
      } else {
        e.x += Math.sign(dx) * dist; e.y += Math.sign(dy) * dist; dist = 0;
      }
    }
  }

  const branchWant = b => (b.mirror ? mirrorDir(wantDir) : wantDir);

  function playerChoose(b) {
    const nd = branchWant(b);
    if (nd && isOpen(b.x + nd.x, b.y + nd.y)) b.dir = nd;
    if (b.dir && isOpen(b.x + b.dir.x, b.y + b.dir.y)) {
      b.tx = b.x + b.dir.x; b.ty = b.y + b.dir.y; b.moving = true;
    } else {
      b.moving = false;
    }
  }

  function arrivePlayer(b) {
    wrapX(b);
    if (b.x < 0 || b.x >= COLS) return;
    const d = dots[b.y][b.x];
    if (d) {
      dots[b.y][b.x] = ''; dotsLeft--;
      if (d === '.') { addScore(10); sfx.dot(); }
      else if (d === 'o') { addScore(50); phaseFlip(b); }
      else if (d === 'H') { addScore(50); hadamard(b); }
    }
    if (!psi.includes(b)) return;
    const p = PORTALS[b.x + ',' + b.y];
    if (p && !b.ported) {
      trail(b.x, b.y, p.x, p.y, p.color);
      burst(b.x, b.y, p.color, 10, 4);
      b.x = p.x; b.y = p.y; b.ported = true;
      burst(b.x, b.y, p.color, 10, 4);
      sfx.portal();
    } else if (!p) {
      b.ported = false;
    }
  }

  function ghostSpeed(g) {
    const base = Math.min(6.6 + level * 0.3, 9);
    if (g.state === 'eyes') return 15;
    if (g.state === 'entering') return 8;
    if (g.state === 'house' || g.state === 'leaving') return 3.5;
    if (Math.round(g.y) === TUNNEL_ROW && (g.x < 5.5 || g.x > 21.5)) return base * 0.5;
    if (g.phase < 0) return base * 0.6;
    return base;
  }
  const playerSpeed = () => Math.min(7.6 + level * 0.2, 9.2);

  function nearestBranch(g) {
    let best = psi[0], bd = Infinity;
    for (const b of psi) {
      const d = (b.x - g.x) ** 2 + (b.y - g.y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function ghostTarget(g) {
    if (g.state === 'eyes') return { x: 13, y: 11 };
    if (chaseMode === 'scatter') return g.corner;
    const p = nearestBranch(g), pd = p.dir || DIR.left;
    const px = Math.round(p.x), py = Math.round(p.y);
    switch (g.name) {
      case 'Pinky': return { x: px + pd.x * 4, y: py + pd.y * 4 };
      case 'Inky': {
        const b = ghosts[0];
        const ax = px + pd.x * 2, ay = py + pd.y * 2;
        return { x: 2 * ax - b.x, y: 2 * ay - b.y };
      }
      case 'Clyde':
        return (px - g.x) ** 2 + (py - g.y) ** 2 > 64 ? { x: px, y: py } : g.corner;
      default: return { x: px, y: py };
    }
  }

  function ghostChoose(g) {
    if (g.state === 'eyes' && g.x === 13 && g.y === 11) {
      g.state = 'entering';
      g.path = [{ x: 13.5, y: 11 }, { x: 13.5, y: 14 }];
      return;
    }
    const back = opp(g.dir);
    let opts = DIR_LIST.filter(d => d !== back && isOpen(g.x + d.x, g.y + d.y));
    if (!opts.length) opts = [back];
    let choice;
    if (g.state === 'normal' && g.phase < 0) {
      choice = opts[Math.floor(Math.random() * opts.length)];
    } else {
      const t = ghostTarget(g);
      let bd = Infinity;
      for (const d of opts) {
        const dd = (g.x + d.x - t.x) ** 2 + (g.y + d.y - t.y) ** 2;
        if (dd < bd) { bd = dd; choice = d; }
      }
    }
    g.dir = choice; g.tx = g.x + choice.x; g.ty = g.y + choice.y;
  }

  function reverseGhost(g) {
    if (g.tx !== null) { g.tx -= g.dir.x; g.ty -= g.dir.y; }
    g.dir = opp(g.dir);
  }

  function followPath(g, dist) {
    while (g.path.length && dist > 0) {
      const w = g.path[0], dx = w.x - g.x, dy = w.y - g.y, d = Math.hypot(dx, dy);
      if (d > 1e-9) g.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIR.right : DIR.left) : (dy > 0 ? DIR.down : DIR.up);
      if (d <= dist) { g.x = w.x; g.y = w.y; dist -= d; g.path.shift(); }
      else { g.x += dx / d * dist; g.y += dy / d * dist; dist = 0; }
    }
    if (!g.path.length) { g.path = null; return true; }
    return false;
  }

  function updateGhost(g, dt) {
    const sp = ghostSpeed(g) * dt;
    if (g.state === 'house') {
      g.bob += dt;
      g.y = 14 + Math.sin(g.bob * 5) * 0.3;
      g.dir = Math.cos(g.bob * 5) > 0 ? DIR.down : DIR.up;
      g.release -= dt;
      if (g.release <= 0) {
        g.state = 'leaving';
        g.path = [{ x: g.x, y: 14 }, { x: 13.5, y: 14 }, { x: 13.5, y: 11 }, { x: 13, y: 11 }];
      }
      return;
    }
    if (g.state === 'leaving' || g.state === 'entering') {
      if (followPath(g, sp)) {
        if (g.state === 'leaving') {
          g.state = 'normal'; g.dir = DIR.left; g.tx = g.ty = null; g.phase = 1; g.fright = 0;
        } else {
          g.state = 'house'; g.release = 0.8; g.bob = 0;
        }
      }
      return;
    }
    if (g.state === 'normal' && g.phase < 0) {
      g.fright -= dt;
      if (g.fright <= 0) { g.phase = 1; g.fright = 0; }
    }
    stepGrid(g, sp, ghostChoose, wrapX);
  }

  // ------------------------------------------------------ quantum stuff --
  function phaseFlip(b) {
    eatChain = 0;
    const ft = Math.max(2.5, 8 - (level - 1) * 0.8);
    let toMinus = 0, toPlus = 0;
    for (const g of ghosts) {
      if (g.state !== 'normal') continue;
      if (g.phase > 0) { g.phase = -1; g.fright = ft; toMinus++; }
      else { g.phase = 1; g.fright = 0; toPlus++; }
      reverseGhost(g);
    }
    popup(b.x, b.y - 1, toPlus && !toMinus ? 'Z|−⟩ = |+⟩ !' : t('Z: PHASE FLIP'), '#ff4fd8');
    sfx.zgate();
  }

  function hadamard(b) {
    if (psi.length === 1) {
      const m = makeBranch(COLS - 1 - b.x, b.y, mirrorDir(b.dir), true);
      if (b.tx !== null) { m.tx = COLS - 1 - b.tx; m.ty = b.ty; }
      psi.push(m);
      superT = SUPER_TIME;
      // The gate acts on both branches: the mirror tile's pickup is consumed too.
      if (m.x >= 0 && m.x < COLS && dots[m.y][m.x]) { dots[m.y][m.x] = ''; dotsLeft--; addScore(50); }
      trail(b.x, b.y, m.x, m.y, '#3ff4ff');
      popup(13.5, b.y - 1, t('H: SUPERPOSITION'), '#3ff4ff');
      sfx.hgate();
    } else {
      collapseTo(psi.find(x => !x.mirror) || psi[0], 'H·H = I');
      sfx.hh();
    }
  }

  function collapseTo(keep, msg) {
    for (const b of psi) if (b !== keep) burst(b.x, b.y, '#ffe14d', 18);
    if (keep.mirror) wantDir = keep.dir;
    psi = [keep];
    keep.mirror = false;
    superT = 0;
    if (msg) popup(keep.x, keep.y - 1, t(msg), '#7ff9ff');
    sfx.measure();
  }

  function measure(msg) {
    if (psi.length < 2) return;
    collapseTo(psi[Math.random() < 0.5 ? 0 : 1], msg);
  }

  function sees(b, g) {
    const bx = Math.round(b.x), by = Math.round(b.y), gx = Math.round(g.x), gy = Math.round(g.y);
    if (by === gy && Math.abs(bx - gx) <= 9) {
      for (let x = Math.min(bx, gx) + 1; x < Math.max(bx, gx); x++) if (!isOpen(x, by)) return false;
      return true;
    }
    if (bx === gx && Math.abs(by - gy) <= 9) {
      for (let y = Math.min(by, gy) + 1; y < Math.max(by, gy); y++) if (!isOpen(bx, y)) return false;
      return true;
    }
    return false;
  }

  function splitClyde() {
    const c = clyde;
    const t = Object.assign({}, c, { isTwin: true, origin: c, twin: null, path: null });
    t.dir = opp(c.dir) || DIR.right;
    if (c.tx !== null) { t.tx = c.tx - c.dir.x; t.ty = c.ty - c.dir.y; }
    c.twin = t;
    ghosts.push(t);
    popup(c.x, c.y - 1, '|a⟩+|b⟩', '#ffb347');
    sfx.split();
  }

  // Collapse Schrödinger's Clyde onto `keep` (Clyde or his twin); returns Clyde.
  function collapseClyde(keep) {
    const c = clyde, t = c.twin;
    if (!t) return c;
    const gone = keep === t ? c : t;
    burst(gone.x, gone.y, c.color, 14, 5);
    if (keep === t) {
      c.x = t.x; c.y = t.y; c.tx = t.tx; c.ty = t.ty; c.dir = t.dir;
      c.phase = t.phase; c.fright = t.fright;
    }
    ghosts.splice(ghosts.indexOf(t), 1);
    c.twin = null;
    c.splitT = 5 + Math.random() * 3;
    return c;
  }
  const real = g => (g.isTwin || g.twin ? collapseClyde(g) : g);

  function updateSchrodinger(dt) {
    const c = clyde;
    if (c.state !== 'normal') return;
    if (!c.twin) {
      c.splitT -= dt;
      if (c.splitT <= 0 && !psi.some(b => sees(b, c))) splitClyde();
      return;
    }
    for (const g of [c, c.twin]) {
      if (psi.some(b => sees(b, g))) {
        collapseClyde(Math.random() < 0.5 ? c : c.twin);
        popup(c.x, c.y - 1, t('OBSERVED'), '#ffb347');
        sfx.observe();
        return;
      }
    }
  }

  function eatGhost(g, spooky) {
    g = real(g);
    if (g.state !== 'normal') return;
    g.state = 'eyes'; g.phase = 1; g.fright = 0;
    eatChain = Math.min(eatChain + 1, 4);
    const pts = 100 * 2 ** eatChain;
    addScore(pts);
    popup(g.x, g.y, spooky ? t('SPOOKY {pts}', { pts }) : pts, spooky ? '#ffb0d8' : '#7ff9ff', 1.3);
    burst(g.x, g.y, g.color, 14);
    freezeT = 0.35;
    if (spooky) sfx.spooky(); else sfx.eat();
    if (!spooky && g.partner) {
      let p = g.partner;
      if (p.twin) p = collapseClyde(Math.random() < 0.5 ? p : p.twin);
      if (p.state === 'normal') eatGhost(p, true);
    }
  }

  function checkInterference() {
    const live = ghosts.filter(g => g.state === 'normal');
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        if (a.twin === b || b.twin === a || a.phase === b.phase) continue;
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= 0.8) continue;
        const A = real(a), B = real(b);
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        for (const g of [A, B]) {
          g.state = 'eyes'; g.phase = 1; g.fright = 0;
          burst(g.x, g.y, g.color, 18, 7);
        }
        addScore(600);
        popup(mx, my - 0.5, '|+⟩+|−⟩ → 0', '#ffffff', 1.4);
        popup(mx, my + 0.6, '+600', '#7ff9ff', 1.4);
        sfx.interfere();
        return;
      }
    }
  }

  function checkCollisions() {
    for (const b of psi) {
      for (const g0 of ghosts) {
        if (g0.state !== 'normal') continue;
        if (Math.abs(b.x - g0.x) + Math.abs(b.y - g0.y) > 0.8) continue;
        let g = g0;
        if (g.twin || g.isTwin) {
          if (Math.random() < 0.5) {
            collapseClyde(g.twin || g.origin);
            popup(b.x, b.y - 1, t('NOBODY HOME'), '#ffb347');
            sfx.observe();
            return;
          }
          g = collapseClyde(g);
        }
        if (g.phase < 0) { eatGhost(g, false); return; }
        if (grace > 0) return;
        if (psi.length > 1) {
          if (Math.random() < 0.5) {
            collapseTo(b, 'MEASURED: HERE');
            die();
          } else {
            collapseTo(psi.find(x => x !== b), 'MEASURED: ELSEWHERE');
            grace = 1;
          }
          return;
        }
        die();
        return;
      }
    }
  }

  function tryTunnel() {
    if (scene !== 'play' || freezeT > 0) return;
    if (tunnels <= 0) { popup(psi[0].x, psi[0].y - 1, t('NO TUNNELS'), '#ff6b8b'); return; }
    let attempted = false;
    for (const b of [...psi]) {
      if (!psi.includes(b)) continue;
      const d = branchWant(b) || b.dir;
      if (!d) continue;
      const ox = Math.round(b.x), oy = Math.round(b.y);
      if (isOpen(ox + d.x, oy + d.y)) continue;
      let k = 1;
      while (k <= 4 && !isOpen(ox + d.x * k, oy + d.y * k)) k++;
      const nx = ox + d.x * k, ny = oy + d.y * k;
      if (k > 4 || !REACH.has(nx + ',' + ny)) continue;
      attempted = true;
      const p = Math.exp(-0.6 * (k - 1));
      if (Math.random() < p) {
        trail(b.x, b.y, nx, ny, '#ffe14d');
        b.x = nx; b.y = ny; b.tx = b.ty = null; b.dir = d;
        popup(nx, ny - 1, t('TUNNELED ({p}%)', { p: Math.round(p * 100) }), '#ffe14d');
        sfx.tunnel();
        arrivePlayer(b);
      } else {
        burst(ox + d.x * 0.6, oy + d.y * 0.6, '#ff6b8b', 10, 4);
        popup(ox, oy - 1, t('REFLECTED ({p}%)', { p: Math.round(p * 100) }), '#ff6b8b');
        sfx.reflect();
      }
    }
    if (attempted) tunnels--;
    else popup(psi[0].x, psi[0].y - 1, t('NO BARRIER'), '#9690c6', 0.8);
  }

  // -------------------------------------------------------------- scenes --
  function startGame() {
    audio();
    level = 1; score = 0; lives = 3; nextLifeAt = 10000; tunnels = TUNNELS_PER_LEVEL;
    resetDots(); resetActors();
    scene = 'ready'; sceneT = 2.2;
    showOverlay(null);
  }
  function die() {
    scene = 'dying'; sceneT = 1.6;
    sfx.death();
  }
  function afterDeath() {
    lives--;
    burst(psi[0].x, psi[0].y, '#ffe14d', 24, 8);
    if (lives <= 0) {
      scene = 'gameover';
      try { localStorage.setItem('quakman-high', String(high)); } catch (e) { /* storage unavailable */ }
      rec('highScore', score, 'max'); rec('bestLevel', level, 'max'); rec('games', 1, 'add');
      showOverlay('gameover');
      return;
    }
    resetActors();
    scene = 'ready'; sceneT = 2;
  }
  function nextLevel() {
    level++;
    tunnels = TUNNELS_PER_LEVEL;
    resetDots(); resetActors();
    scene = 'ready'; sceneT = 2.2;
  }
  function togglePause() {
    if (scene === 'paused') { scene = pausedFrom; showOverlay(null); }
    else if (scene === 'play' || scene === 'ready') { pausedFrom = scene; scene = 'paused'; showOverlay('paused'); }
  }

  // -------------------------------------------------------------- update --
  function update(dt) {
    if (scene === 'paused') return;
    time += dt;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      if (p.t > 0) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; }
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.t += dt;
      if (p.t > p.life) popups.splice(i, 1);
    }

    switch (scene) {
      case 'ready': sceneT -= dt; if (sceneT <= 0) scene = 'play'; return;
      case 'dying': sceneT -= dt; if (sceneT <= 0) afterDeath(); return;
      case 'clear': sceneT -= dt; if (sceneT <= 0) nextLevel(); return;
      case 'play': break;
      default: return;
    }
    if (freezeT > 0) { freezeT -= dt; return; }

    modeT -= dt;
    if (modeT <= 0 && modeIdx < MODES.length - 1) {
      modeIdx++;
      [chaseMode, modeT] = MODES[modeIdx];
      for (const g of ghosts) if (g.state === 'normal' && g.phase > 0) reverseGhost(g);
    }
    if (grace > 0) grace -= dt;

    if (psi.length > 1) {
      superT -= dt;
      if (superT <= 0) measure('DECOHERED');
    }

    const ps = playerSpeed() * dt;
    for (const b of [...psi]) {
      if (!psi.includes(b) || scene !== 'play') continue;
      const w = branchWant(b);
      if (w && b.dir && w === opp(b.dir) && b.tx !== null) {
        b.tx -= b.dir.x; b.ty -= b.dir.y; b.dir = w;
      }
      stepGrid(b, ps, playerChoose, arrivePlayer);
      if (b.tx !== null) b.mouth += ps;
    }
    if (dotsLeft <= 0) {
      scene = 'clear'; sceneT = 2.4;
      sfx.clear();
      return;
    }

    for (const g of [...ghosts]) if (ghosts.includes(g)) updateGhost(g, dt);
    updateSchrodinger(dt);
    checkInterference();
    checkCollisions();
  }

  // -------------------------------------------------------------- render --
  const cx = x => (x + 0.5) * T;

  function drawDots() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const d = dots[r][c];
        if (!d) continue;
        const px = cx(c), py = cx(r);
        if (d === '.') {
          ctx.fillStyle = '#ffd9b0';
          ctx.fillRect(px - 2, py - 2, 4, 4);
        } else {
          const isH = d === 'H';
          const color = isH ? '#3ff4ff' : '#ff4fd8';
          const s = 13 + Math.sin(time * 6 + c) * 1.5;
          ctx.save();
          ctx.shadowColor = color; ctx.shadowBlur = 14;
          ctx.fillStyle = color;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(px - s / 2, py - s / 2, s, s, 3); else ctx.rect(px - s / 2, py - s / 2, s, s);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#05040f';
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(isH ? 'H' : 'Z', px, py + 1);
          ctx.restore();
        }
      }
    }
  }

  function drawPortals() {
    for (const p of PORTAL_LIST) {
      const px = cx(p.x), py = cx(p.y);
      ctx.save();
      ctx.strokeStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 10; ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const a = time * (i ? -3 : 2.2) + i;
        ctx.beginPath();
        ctx.arc(px, py, 6 + i * 3.5, a, a + Math.PI * 1.3);
        ctx.stroke();
      }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 5);
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawDoor() {
    ctx.fillStyle = '#ff8ee8';
    ctx.fillRect(13 * T - T * 0.32, 12 * T + T * 0.42, 2 * T + T * 0.64, 3);
  }

  function wave(x1, y1, x2, y2, c1, c2, alpha, amp = 4) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 1 || Math.abs(dx) > W / 2) return;
    const nx = -dy / len, ny = dx / len, n = Math.max(10, Math.floor(len / 5));
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, c1); grad.addColorStop(1, c2);
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = grad; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const s = i / n, o = Math.sin(s * len / 10 - time * 8) * amp * Math.sin(Math.PI * s);
      const x = x1 + dx * s + nx * o, y = y1 + dy * s + ny * o;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawLinks() {
    for (const [a, b] of PAIRS) {
      const A = ghosts.filter(g => g.name === a && g.state === 'normal');
      const B = ghosts.filter(g => g.name === b && g.state === 'normal');
      for (const ga of A) {
        for (const gb of B) {
          const split = A.length > 1 || B.length > 1;
          wave(cx(ga.x), cx(ga.y), cx(gb.x), cx(gb.y), ga.color, gb.color, split ? 0.18 : 0.32);
        }
      }
    }
  }

  function drawEyes(px, py, r, dir) {
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0;
    for (const s of [-1, 1]) {
      const ex = px + s * r * 0.36, ey = py - r * 0.22;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(ex + dx * r * 0.08, ey + dy * r * 0.08, r * 0.25, r * 0.31, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b2cff';
      ctx.beginPath(); ctx.arc(ex + dx * r * 0.17, ey + dy * r * 0.18, r * 0.13, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawGhost(g) {
    const px = cx(g.x), py = cx(g.y), r = T * 0.78;
    const split = !!(g.twin || g.isTwin);
    ctx.save();
    if (split) ctx.globalAlpha = 0.42 + 0.18 * Math.sin(time * 9 + (g.isTwin ? Math.PI : 0));
    if (g.state !== 'eyes' && g.state !== 'entering') {
      const scared = g.state === 'normal' && g.phase < 0;
      let body = g.color;
      if (scared) body = g.fright < 2 && Math.floor(time * 8) % 2 ? '#e8e8ff' : '#2a3bff';
      ctx.fillStyle = body; ctx.shadowColor = body; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(px, py - r * 0.1, r, Math.PI, 0);
      const bottom = py + r * 0.88, wob = Math.floor(time * 8) % 2;
      ctx.lineTo(px + r, bottom);
      const n = 8;
      for (let i = 1; i <= n; i++) {
        ctx.lineTo(px + r - (2 * r * i) / n, bottom - ((i + wob) % 2 ? r * 0.28 : 0));
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      if (scared) {
        ctx.fillStyle = body === '#2a3bff' ? '#ffd0d0' : '#ff2a2a';
        ctx.fillRect(px - r * 0.42, py - r * 0.35, r * 0.24, r * 0.24);
        ctx.fillRect(px + r * 0.18, py - r * 0.35, r * 0.24, r * 0.24);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const x = px - r * 0.6 + (r * 1.2 * i) / 6, y = py + r * 0.3 + (i % 2 ? -r * 0.12 : r * 0.08);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      } else {
        drawEyes(px, py, r, g.dir);
      }
    } else {
      drawEyes(px, py, r, g.dir);
    }
    if (g.state === 'normal') {
      ctx.globalAlpha = split ? 0.8 : 0.85;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = g.phase > 0 ? '#ffffff' : '#9fb0ff';
      ctx.fillText((g.phase > 0 ? '|+⟩' : '|−⟩') + (split ? '?' : ''), px, py - r * 1.1);
    }
    ctx.restore();
  }

  function drawPac(b, sup, idx) {
    const px = cx(b.x), py = cx(b.y), r = T * 0.8;
    let m;
    if (scene === 'dying') {
      const p = Math.min(1, (1.6 - sceneT) / 1.3);
      m = 0.15 + p * (Math.PI - 0.15);
    } else {
      m = b.moving ? (0.04 + 0.27 * Math.abs(Math.sin(b.mouth * Math.PI))) * Math.PI : 0.22 * Math.PI;
    }
    const d = b.dir || DIR.left;
    const ang = scene === 'dying' ? -Math.PI / 2 : Math.atan2(d.y, d.x);
    ctx.save();
    if (grace > 0 && Math.floor(time * 16) % 2) ctx.globalAlpha = 0.35;
    if (sup) {
      ctx.globalAlpha *= 0.62 + 0.2 * Math.sin(time * 10 + idx * Math.PI);
      const g = ctx.createRadialGradient(px, py, 2, px, py, r * 2.2);
      g.addColorStop(0, 'rgba(63,244,255,.35)'); g.addColorStop(1, 'rgba(63,244,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, r * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffe14d'; ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = sup ? 20 : 10;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, r, ang + m, ang - m + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const sup = psi.length > 1;
    if (sup) {
      const [a, b] = psi;
      wave(cx(a.x), cx(a.y), cx(b.x), cx(b.y), '#ffe14d', '#3ff4ff', 0.45, 6);
    }
    psi.forEach((b, i) => drawPac(b, sup, i));
    if (sup) {
      ctx.save();
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const sorted = [...psi].sort((p, q) => p.x - q.x);
      sorted.forEach((b, i) => {
        ctx.fillStyle = '#7ff9ff';
        ctx.fillText(i ? '|R⟩' : '|L⟩', cx(b.x), cx(b.y) - T * 0.95);
      });
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      if (p.t < 0) continue;
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(cx(p.x) - 1.5, cx(p.y) - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups() {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '8px "Press Start 2P", monospace';
    for (const p of popups) {
      ctx.globalAlpha = Math.max(0, 1 - (p.t / p.life) ** 2);
      ctx.fillStyle = p.color;
      const x = Math.min(W - 60, Math.max(60, cx(p.x)));
      ctx.fillText(p.text, x, cx(p.y) - p.t * 14);
    }
    ctx.restore();
  }

  function drawBanner() {
    let text = null, color = '#ffe14d';
    if (scene === 'ready') text = t('READY!');
    else if (scene === 'clear') { text = t('MAZE CLEARED'); color = '#3ff4ff'; }
    else if (scene === 'gameover') { text = t('GAME  OVER'); color = '#ff3b5c'; }
    if (!text) return;
    ctx.save();
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.fillText(text, W / 2, cx(17));
    if (scene === 'ready') {
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#3ff4ff'; ctx.shadowColor = '#3ff4ff';
      ctx.fillText(t('LEVEL {n}', { n: level }), W / 2, cx(11) - 2);
    }
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = '#04030c';
    ctx.fillRect(0, 0, W, H);
    const flash = scene === 'clear' && Math.floor(sceneT * 6) % 2 === 0;
    ctx.drawImage(flash ? mazeFlash : mazeImg, 0, 0, W, H);
    drawDoor();
    drawPortals();
    drawDots();
    const hideGhosts = scene === 'clear' || (scene === 'dying' && sceneT < 1.3);
    if (!hideGhosts) {
      drawLinks();
      for (const g of ghosts) drawGhost(g);
    }
    if (!(scene === 'dying' && sceneT < 0.2)) drawPlayer();
    drawParticles();
    drawPopups();
    drawBanner();
  }

  // ----------------------------------------------------------------- HUD --
  const $ = id => document.getElementById(id);
  const el = {
    score: $('score'), high: $('high'), level: $('level'), lives: $('lives'), tunnels: $('tunnels'),
    ket: $('ket'), coh: $('coh'), probs: $('probs'), ghostList: $('ghostList'),
    overlay: $('overlay'), mute: $('muteBtn'),
  };
  const set = (node, v) => { v = String(v); if (node._v !== v) { node._v = v; node.textContent = v; } };
  const setHTML = (node, v) => { if (node._h !== v) { node._h = v; node.innerHTML = v; } };

  const ghostRows = GHOST_DEFS.map(d => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="swatch" style="background:${d.color};box-shadow:0 0 8px ${d.color}"></span>` +
      `<span class="gname">${d.name}</span><span class="gstate"></span>`;
    el.ghostList.appendChild(li);
    return li.querySelector('.gstate');
  });

  function ghostStatus(g) {
    const partner = PAIRS.flat()[PAIRS.flat().indexOf(g.name) ^ 1];
    let s;
    if (g.state === 'house') s = t('boxed');
    else if (g.state === 'leaving') s = t('emerging');
    else if (g.state === 'eyes' || g.state === 'entering') s = t('collapsed, returning');
    else if (g.twin) s = '<b>(|a⟩+|b⟩)/√2</b> ' + t('unobserved');
    else if (g.phase > 0) s = '<b>|+⟩</b> ' + t(chaseMode === 'chase' ? 'hunting' : 'scattering');
    else s = '<b>|−⟩</b> ' + t(g.fright < 2 ? 'edible, decohering' : 'edible');
    return `${s} · ⇄ ${partner}`;
  }

  function updateHUD() {
    set(el.score, score);
    set(el.high, high);
    set(el.level, level);
    set(el.lives, '●'.repeat(Math.max(0, lives)));
    set(el.tunnels, '◆'.repeat(tunnels) + '◇'.repeat(Math.max(0, TUNNELS_PER_LEVEL - tunnels)));
    if (psi.length > 1) {
      set(el.ket, '|ψ⟩ = (|L⟩ + |R⟩)/√2');
      set(el.probs, t('P(L) = 50% · P(R) = 50% · coherent {s}s', { s: superT.toFixed(1) }));
      el.coh.style.width = (superT / SUPER_TIME * 100).toFixed(1) + '%';
    } else {
      const b = psi[0];
      set(el.ket, '|ψ⟩ = |x⟩');
      set(el.probs, t('definite at ({x}, {y}) · eat H to superpose', { x: Math.round(b.x), y: Math.round(b.y) }));
      el.coh.style.width = '0%';
    }
    GHOST_DEFS.forEach((d, i) => {
      const g = ghosts.find(x => x.name === d.name && !x.isTwin);
      setHTML(ghostRows[i], ghostStatus(g));
    });
  }

  // ------------------------------------------------------------- overlay --
  const touchy = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  let overlayKind = null;
  function showOverlay(kind) {
    const o = el.overlay;
    overlayKind = kind;
    if (!kind) { o.classList.remove('show'); o.innerHTML = ''; return; }
    const go = t(touchy ? 'TAP TO START' : 'PRESS ENTER');
    let html = '';
    if (kind === 'title') {
      html = `<div class="card">
        <div class="card-logo"><b>|</b>QUAK-MAN<b>⟩</b></div>
        <p>${t("You're a quantum particle loose in a maze. Eat every dot without being measured by a ghost.")}</p>
        <ul class="mini">
          <li><span class="gate h">H</span>${t('Split into two mirrored copies')}</li>
          <li><span class="gate z">Z</span>${t('Flip ghosts |+⟩ → |−⟩ (edible), and back')}</li>
          <li><span class="sym wave">〰</span>${t('Entangled ghosts: eat one, catch both')}</li>
          <li><span class="sym">?</span>${t("Schrödinger's Clyde: two places until seen")}</li>
          <li><span class="sym ring">◎</span>${t('EPR portals · <kbd>T</kbd> to tunnel through walls')}</li>
        </ul>
        <button class="go" type="button" data-act="start">${go}</button>
        <p class="hint">${t(touchy ? 'swipe to move' : 'arrows/WASD · space: measure · T: tunnel · P: pause')}</p>
      </div>`;
    } else if (kind === 'paused') {
      html = `<div class="card"><div class="big">${t('PAUSED')}</div>
        <p>${t('The wavefunction is holding its breath.')}</p>
        <button class="go" type="button" data-act="resume">${t(touchy ? 'TAP TO RESUME' : 'P TO RESUME')}</button></div>`;
    } else if (kind === 'gameover') {
      html = `<div class="card"><div class="big" style="color:#ff3b5c">${t('GAME OVER')}</div>
        <p>${t('Your wavefunction collapsed for good.')}</p>
        <p class="big">${score}</p>
        <p>${score >= high && score > 0 ? t('New high score!') : t('High score: {high}', { high })}</p>
        <button class="go" type="button" data-act="start">${t(touchy ? 'TAP TO RETRY' : 'ENTER TO RETRY')}</button></div>`;
    }
    o.innerHTML = html;
    o.classList.add('show');
  }

  function act(a) {
    switch (a) {
      case 'start': startGame(); break;
      case 'resume': case 'pause': togglePause(); break;
      case 'measure': if (scene === 'play') measure('MEASURED'); break;
      case 'tunnel': tryTunnel(); break;
    }
  }

  el.overlay.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (btn) act(btn.dataset.act);
    else if (scene === 'title' || scene === 'gameover') startGame();
    else if (scene === 'paused') togglePause();
  });
  document.getElementById('touch').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (btn) { audio(); act(btn.dataset.act); }
  });

  function toggleMute() {
    muted = !muted;
    el.mute.textContent = t(muted ? '♪ OFF' : '♪ ON');
    try { localStorage.setItem('quakman-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  try { if (localStorage.getItem('quakman-muted') === '1') toggleMute(); } catch (e) { /* ignore */ }
  el.mute.addEventListener('click', () => { toggleMute(); el.mute.blur(); });
  el.mute.textContent = t(muted ? '♪ OFF' : '♪ ON');

  if (window.QA) {
    QA.onChange(() => {
      el.mute.textContent = t(muted ? '♪ OFF' : '♪ ON');
      for (const node of [el.probs, ...ghostRows]) { node._v = undefined; node._h = undefined; }
      if (overlayKind) showOverlay(overlayKind);
    });
  }

  // --------------------------------------------------------------- input --
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (KEYMAP[e.code]) {
      wantDir = DIR[KEYMAP[e.code]];
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case 'Enter':
        if (scene === 'title' || scene === 'gameover') startGame();
        else if (scene === 'paused') togglePause();
        break;
      case 'Space':
        e.preventDefault();
        if (scene === 'title' || scene === 'gameover') startGame();
        else if (scene === 'play') measure('MEASURED');
        break;
      case 'KeyT': tryTunnel(); break;
      case 'KeyP': case 'Escape': togglePause(); break;
      case 'KeyM': toggleMute(); break;
    }
  });

  const stage = document.getElementById('stage');
  let touch0 = null;
  stage.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    touch0 = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  stage.addEventListener('touchmove', e => {
    if (!touch0) return;
    const t = e.changedTouches[0], dx = t.clientX - touch0.x, dy = t.clientY - touch0.y;
    if (Math.hypot(dx, dy) > 18) {
      wantDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIR.right : DIR.left) : (dy > 0 ? DIR.down : DIR.up);
      touch0 = { x: t.clientX, y: t.clientY };
    }
    e.preventDefault();
  }, { passive: false });
  stage.addEventListener('touchend', () => { touch0 = null; });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (scene === 'play' || scene === 'ready')) togglePause();
  });

  // ---------------------------------------------------------------- loop --
  resetDots();
  resetActors();
  showOverlay('title');

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < steps; i++) update(dt / steps);
    render();
    updateHUD();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
