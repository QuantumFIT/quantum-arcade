'use strict';
/*
 * Hexxaqon: a quantum Hexxagon.
 *
 * The rules engine works on plain state objects (cloneable, no DOM), so the
 * AI can simulate moves. A cell is null or a piece { p, ph, ent, g }:
 * owner p (0/1), phase ph (+1, or -1 = shielded), entanglement id ent, and
 * ghost id g when the piece is one half of a superposition.
 */
(() => {
  const t = (s, v) => (window.QA ? QA.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
  // A status message: a key plus placeholder values (functions are evaluated
  // when the message is shown, so names follow the current language).
  const M = (k, v) => ({ k, v });

  // ---------------------------------------------------------- geometry --
  const RADIUS = 4;
  const HOLES = new Set(['1,0', '0,-1', '-1,1']);
  const CELLS = [];
  for (let q = -RADIUS; q <= RADIUS; q++) {
    for (let r = -RADIUS; r <= RADIUS; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > RADIUS) continue;
      if (HOLES.has(q + ',' + r)) continue;
      CELLS.push({ q, r });
    }
  }
  const N = CELLS.length;
  const INDEX = new Map(CELLS.map((c, i) => [c.q + ',' + c.r, i]));
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const NB = CELLS.map(({ q, r }) => DIRS.map(([dq, dr]) => INDEX.get((q + dq) + ',' + (r + dr))).filter(i => i !== undefined));
  const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  const DIST = CELLS.map(a => CELLS.map(b => hexDist(a, b)));
  const REACH = CELLS.map((_, i) => CELLS.map((_, j) => j).filter(j => DIST[i][j] === 1 || DIST[i][j] === 2));
  const START = [[[4, 0], [0, -4], [-4, 4]], [[4, -4], [-4, 0], [0, 4]]];

  // ------------------------------------------------------------ engine --
  function initialState() {
    const cells = Array(N).fill(null);
    START.forEach((list, p) => list.forEach(([q, r]) => {
      cells[INDEX.get(q + ',' + r)] = { p, ph: 1, ent: null, g: null };
    }));
    return {
      cells, ghosts: {}, nextId: 1, turn: 0, over: false,
      charges: [{ H: 3, E: 3, Z: 2 }, { H: 3, E: 3, Z: 2 }],
    };
  }

  function cloneState(S) {
    const ghosts = {};
    for (const k in S.ghosts) ghosts[k] = { ...S.ghosts[k] };
    return {
      cells: S.cells.map(c => c && { ...c }), ghosts, nextId: S.nextId,
      turn: S.turn, over: S.over, charges: S.charges.map(c => ({ ...c })),
    };
  }

  function breakEnt(S, i) {
    const id = S.cells[i] && S.cells[i].ent;
    if (id === null || id === undefined) return;
    for (const c of S.cells) if (c && c.ent === id) c.ent = null;
  }

  function capture(S, n, owner, log) {
    const c = S.cells[n];
    if (c.ph < 0) { c.ph = 1; log.push({ k: 'shield', i: n }); return; }
    c.p = owner;
    log.push({ k: 'flip', i: n, p: owner });
    if (c.ent !== null) {
      const id = c.ent;
      const j = S.cells.findIndex((x, idx) => idx !== n && x && x.ent === id);
      c.ent = null;
      if (j >= 0) {
        const o = S.cells[j];
        o.ent = null;
        if (o.g === null && o.p !== owner) {
          if (o.ph < 0) { o.ph = 1; log.push({ k: 'shield', i: j }); }
          else { o.p = owner; log.push({ k: 'spooky', i: j, from: n, p: owner }); }
        }
      }
    }
  }

  function captureAround(S, i, log) {
    const me = S.cells[i];
    if (!me) return;
    for (const n of NB[i]) {
      const c = S.cells[n];
      if (c && c.g === null && c.p !== me.p) capture(S, n, me.p, log);
    }
  }

  function collapse(S, id, rng, log) {
    const gh = S.ghosts[id];
    if (!gh) return;
    delete S.ghosts[id];
    const keep = rng() < 0.5 ? gh.a : gh.b, gone = keep === gh.a ? gh.b : gh.a;
    S.cells[gone] = null;
    S.cells[keep].g = null;
    log.push({ k: 'collapse', keep, gone, p: gh.p });
    observe(S, keep, rng, log);
    captureAround(S, keep, log);
  }

  // A definite piece at i observes every superposed piece next to it.
  function observe(S, i, rng, log) {
    const seen = new Set();
    for (const n of NB[i]) { const c = S.cells[n]; if (c && c.g !== null) seen.add(c.g); }
    for (const id of seen) {
      const gh = S.ghosts[id];
      if (!gh) continue;
      if (NB[i].includes(gh.a) && NB[i].includes(gh.b)) {
        delete S.ghosts[id];
        S.cells[gh.a] = null; S.cells[gh.b] = null;
        log.push({ k: 'annihilate', a: gh.a, b: gh.b, p: gh.p });
      } else {
        collapse(S, id, rng, log);
      }
    }
  }

  function place(S, i, p, ph, ent, rng, log) {
    S.cells[i] = { p, ph, ent, g: null };
    observe(S, i, rng, log);
    captureAround(S, i, log);
  }

  function pieceCount(S, p) {
    let n = 0;
    for (const c of S.cells) if (c && c.p === p) n += c.g === null ? 1 : 0.5;
    return n;
  }

  function hasMove(S, p) {
    for (let i = 0; i < N; i++) {
      const c = S.cells[i];
      if (!c || c.p !== p || c.g !== null) continue;
      for (const j of REACH[i]) if (!S.cells[j]) return true;
    }
    return false;
  }

  function finish(S, rng, log) {
    for (const id of Object.keys(S.ghosts)) collapse(S, +id, rng, log);
    S.over = true;
    log.push({ k: 'over' });
  }

  function advance(S, rng, log) {
    const empty = S.cells.some(c => !c);
    if (!empty || pieceCount(S, 0) === 0 || pieceCount(S, 1) === 0) { finish(S, rng, log); return; }
    S.turn = 1 - S.turn;
    if (!hasMove(S, S.turn)) {
      log.push({ k: 'pass', p: S.turn });
      S.turn = 1 - S.turn;
      if (!hasMove(S, S.turn)) finish(S, rng, log);
    }
  }

  // m: { type: 'c' clone | 'j' jump | 'e' entangled clone | 's' split, from, to, to2, z }
  function legal(S, m) {
    const P = S.turn, from = S.cells[m.from], ch = S.charges[P];
    if (S.over || !from || from.p !== P || from.g !== null) return false;
    if (S.cells[m.to] || !REACH[m.from].includes(m.to)) return false;
    const d = DIST[m.from][m.to];
    if (m.z && (ch.Z <= 0 || m.type === 's')) return false;
    if (m.type === 'c') return d === 1;
    if (m.type === 'j') return d === 2;
    if (m.type === 'e') return d === 2 && ch.E > 0;
    if (m.type === 's') return ch.H > 0 && m.to2 !== m.to && !S.cells[m.to2] && REACH[m.from].includes(m.to2);
    return false;
  }

  function applyMove(S, m, rng, log) {
    const P = S.turn, ch = S.charges[P];
    log.push({ k: 'move', m, p: P });
    if (m.type === 'c') {
      place(S, m.to, P, m.z ? -1 : 1, null, rng, log);
    } else if (m.type === 'j') {
      const piece = S.cells[m.from];
      S.cells[m.from] = null;
      place(S, m.to, P, m.z ? -1 : piece.ph, piece.ent, rng, log);
    } else if (m.type === 'e') {
      breakEnt(S, m.from);
      const id = S.nextId++;
      S.cells[m.from].ent = id;
      ch.E--;
      place(S, m.to, P, m.z ? -1 : 1, id, rng, log);
    } else if (m.type === 's') {
      breakEnt(S, m.from);
      S.cells[m.from] = null;
      const id = S.nextId++;
      S.ghosts[id] = { a: m.to, b: m.to2, p: P };
      S.cells[m.to] = { p: P, ph: 1, ent: null, g: id };
      S.cells[m.to2] = { p: P, ph: 1, ent: null, g: id };
      ch.H--;
      log.push({ k: 'split', a: m.to, b: m.to2, p: P });
    }
    if (m.z) ch.Z--;
    advance(S, rng, log);
  }

  // ---------------------------------------------------------------- AI --
  function mulberry(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function candidates(S, opts) {
    const P = S.turn, ch = S.charges[P], out = [], cloneTo = new Set();
    const mine = [];
    for (let i = 0; i < N; i++) { const c = S.cells[i]; if (c && c.p === P && c.g === null) mine.push(i); }
    for (const i of mine) {
      for (const j of REACH[i]) {
        if (S.cells[j]) continue;
        if (DIST[i][j] === 1) {
          if (!cloneTo.has(j)) { cloneTo.add(j); out.push({ type: 'c', from: i, to: j, z: false }); }
        } else {
          out.push({ type: 'j', from: i, to: j, z: false });
          if (opts.special && ch.E > 0) out.push({ type: 'e', from: i, to: j, z: false });
        }
      }
    }
    if (opts.special && ch.H > 0 && mine.length) {
      const rng = mulberry(S.nextId * 7919 + mine.length);
      for (let k = 0; k < opts.splits; k++) {
        const i = mine[Math.floor(rng() * mine.length)];
        const free = REACH[i].filter(j => !S.cells[j]);
        if (free.length < 2) continue;
        const a = free[Math.floor(rng() * free.length)];
        let b = free[Math.floor(rng() * free.length)];
        if (a === b) continue;
        out.push({ type: 's', from: i, to: a, to2: b, z: false });
      }
    }
    return out;
  }

  function evaluate(S, me) {
    const mine = pieceCount(S, me), theirs = pieceCount(S, 1 - me);
    if (S.over) return (mine - theirs) * 100 + (mine > theirs ? 1e4 : mine < theirs ? -1e4 : 0);
    const a = S.charges[me], b = S.charges[1 - me];
    // A superposed half lands with probability ½ and then captures its
    // neighbours, each a swing of 2: worth one point per adjacent enemy.
    let threat = 0;
    for (let i = 0; i < N; i++) {
      const c = S.cells[i];
      if (!c || c.g === null) continue;
      let enemies = 0;
      for (const n of NB[i]) { const o = S.cells[n]; if (o && o.g === null && o.p !== c.p) enemies++; }
      threat += (c.p === me ? 1 : -1) * enemies;
    }
    return mine - theirs + threat + 0.25 * (a.H + a.E - b.H - b.E) + 0.2 * (a.Z - b.Z);
  }

  function simulate(S, m, seed) {
    const T = cloneState(S), log = [];
    applyMove(T, m, mulberry(seed), log);
    return { T, random: log.some(e => e.k === 'collapse') };
  }

  function expectedValue(S, m, me, seed) {
    let { T, random } = simulate(S, m, seed);
    if (!random) return { v: evaluate(T, me), T };
    let sum = evaluate(T, me);
    for (let s = 1; s < 4; s++) sum += evaluate(simulate(S, m, seed + s * 101).T, me);
    return { v: sum / 4, T };
  }

  function chooseMove(S, level) {
    const me = S.turn;
    const hard = level === 'hard';
    let cands = candidates(S, { special: hard || Math.random() < 0.4, splits: hard ? 16 : 6 });
    if (!cands.length) return null;
    let scored = cands.map((m, k) => {
      const r = expectedValue(S, m, me, 1000 + k);
      return { m, v: r.v + (hard ? Math.random() * 0.01 : (Math.random() - 0.5) * 2.4), T: r.T };
    });
    scored.sort((a, b) => b.v - a.v);
    if (!hard) return scored[0].m;

    // Hard: look at the opponent's best greedy reply for the top candidates,
    // and consider shielding them with Z.
    const top = scored.slice(0, 10);
    if (S.charges[me].Z > 0) {
      for (const s of scored.slice(0, 4)) {
        if (s.m.type === 's') continue;
        const m = { ...s.m, z: true };
        const r = expectedValue(S, m, me, 7);
        top.push({ m, v: r.v, T: r.T });
      }
    }
    let best = null, bestV = -Infinity;
    for (const s of top) {
      const T = s.T;
      let v;
      if (T.over || T.turn === me) v = evaluate(T, me);
      else {
        const replies = candidates(T, { special: false, splits: 0 });
        v = Infinity;
        for (let k = 0; k < replies.length; k++) {
          const val = evaluate(simulate(T, replies[k], 50 + k).T, me);
          if (val < v) v = val;
        }
        if (v === Infinity) v = evaluate(T, me);
      }
      v += Math.random() * 0.01;
      if (v > bestV) { bestV = v; best = s.m; }
    }
    return best;
  }

  // ------------------------------------------------------------ canvas --
  const W = 520, H = 560, CX = W / 2, CY = H / 2, SIZE = 32;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const DPR = (window.devicePixelRatio || 1) > 1 ? 2 : 1;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const PX = CELLS.map(({ q, r }) => [CX + SIZE * 1.5 * q, CY + SIZE * Math.sqrt(3) * (r + q / 2)]);
  const COLORS = ['#3ff4ff', '#ffb347'];

  function cellAtPixel(x, y) {
    const fq = (2 / 3 * (x - CX)) / SIZE;
    const fr = (-1 / 3 * (x - CX) + Math.sqrt(3) / 3 * (y - CY)) / SIZE;
    let q = Math.round(fq), r = Math.round(fr), s = Math.round(-fq - fr);
    const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s + fq + fr);
    if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
    const i = INDEX.get(q + ',' + r);
    return i === undefined ? -1 : i;
  }

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
  const sfx = {
    select() { tone(520, 0.05, 'triangle', 0.03); },
    move() { tone(330, 0.08, 'triangle', 0.04, 440); },
    flip(n) { for (let i = 0; i < Math.min(n, 6); i++) tone(600 + i * 90, 0.06, 'square', 0.025, null, 0.05 + i * 0.05); },
    split() { tone(500, 0.2, 'sine', 0.04, 1000); tone(500, 0.2, 'sine', 0.03, 250); },
    measure() { tone(1500, 0.05, 'square', 0.04); tone(300, 0.18, 'triangle', 0.05, 150, 0.05); },
    annihilate() { tone(500, 0.3, 'sine', 0.05, 80); tone(505, 0.3, 'sine', 0.05, 82); },
    spooky() { tone(600, 0.4, 'sine', 0.05, 1800, 0.05); },
    shield() { tone(900, 0.15, 'sawtooth', 0.025, 450); },
    nope() { tone(140, 0.12, 'square', 0.04, 90); },
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.15, 'triangle', 0.05, null, i * 0.09)); },
    lose() { tone(500, 0.8, 'sawtooth', 0.04, 60); },
  };

  // ---------------------------------------------------------- UI state --
  let S = initialState();
  let opp = 'easy', selected = -1, mode = 'classic', zOn = false, splitFirst = -1;
  let hover = -1, thinking = false, lastMove = null, time = 0;
  const anims = [], particles = [], popups = [];
  try { opp = localStorage.getItem('hexxaqon-opp') || 'easy'; } catch (e) { opp = 'easy'; }
  if (!['easy', 'hard', 'human'].includes(opp)) opp = 'easy';

  const isAI = p => opp !== 'human' && p === 1;
  const name = p => t(opp === 'human' ? (p ? 'AMBER' : 'CYAN') : (p ? 'AI' : 'YOU'));
  const toMove = () => (opp === 'human' ? M('{who} to move. Select a piece.', { who: () => name(S.turn) }) : 'You to move. Select a piece.');

  function newGame() {
    S = initialState();
    selected = -1; splitFirst = -1; mode = 'classic'; zOn = false;
    thinking = false; lastMove = null;
    anims.length = 0; particles.length = 0; popups.length = 0;
    setStatus(toMove());
    syncButtons();
  }

  // ----------------------------------------------------------- effects --
  function burst(i, color, n = 12, sp = 120) {
    const [x, y] = PX[i];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = sp * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.4 + Math.random() * 0.5, color });
    }
  }
  function popup(i, text, color) {
    const [x, y] = PX[i];
    popups.push({ x, y: y - 18, text, color, t: 0, life: 1.3 });
  }

  function playLog(log) {
    let flips = 0, msg = null;
    for (const e of log) {
      switch (e.k) {
        case 'flip': flips++; anims.push({ i: e.i, t: 0 }); burst(e.i, COLORS[e.p], 8); break;
        case 'spooky':
          flips++; anims.push({ i: e.i, t: 0 }); burst(e.i, '#ffb0d8', 14);
          anims.push({ link: [e.from, e.i], t: 0 });
          popup(e.i, 'SPOOKY', '#ffb0d8'); sfx.spooky();
          msg = 'Spooky action: an entangled partner flipped along with its twin.';
          break;
        case 'shield': anims.push({ i: e.i, t: 0 }); burst(e.i, '#b06cff', 10); popup(e.i, 'Z|−⟩ = |+⟩', '#b06cff'); sfx.shield(); break;
        case 'collapse':
          burst(e.gone, COLORS[e.p], 10, 90); anims.push({ i: e.keep, t: 0 });
          anims.push({ link: [e.keep, e.gone], t: 0 });
          popup(e.keep, 'COLLAPSED', '#e8e5ff'); sfx.measure();
          msg = msg || 'Measured! The superposed piece collapsed, and it captures from where it lands.';
          break;
        case 'annihilate':
          burst(e.a, '#ffffff', 16, 150); burst(e.b, '#ffffff', 16, 150);
          popup(e.a, '|A⟩−|A⟩ = 0', '#ffffff'); sfx.annihilate();
          msg = 'Interference: both halves were observed at once, and the piece annihilated.';
          break;
        case 'split': burst(e.a, COLORS[e.p], 8); burst(e.b, COLORS[e.p], 8); sfx.split(); break;
        case 'pass': { const p = e.p; msg = M('{who} cannot move and passes.', { who: () => name(p) }); break; }
        case 'move': lastMove = e.m; break;
      }
    }
    if (flips) sfx.flip(flips); else sfx.move();
    return msg;
  }

  // -------------------------------------------------------------- turn --
  function commit(m) {
    if (!legal(S, m)) { sfx.nope(); return; }
    const log = [];
    applyMove(S, m, Math.random, log);
    const msg = playLog(log);
    selected = -1; splitFirst = -1; mode = 'classic'; zOn = false;
    afterTurn(msg);
  }

  function afterTurn(msg) {
    syncButtons();
    if (S.over) {
      const a = pieceCount(S, 0), b = pieceCount(S, 1);
      const fmt = v => (v % 1 ? Math.floor(v) + '½' : String(v));
      const v = { a: fmt(a), b: fmt(b) };
      const verdict = a === b ? M('Draw, {a}–{b}. Press N for a new game.', v)
        : opp === 'human' ? M('{who} wins, {a}–{b}. Press N for a new game.', { ...v, who: () => name(a > b ? 0 : 1) })
          : a > b ? M('You win, {a}–{b}. Press N for a new game.', v) : M('The AI wins, {a}–{b}. Press N for a new game.', v);
      setStatus(verdict, a > b || opp === 'human' ? 'win' : 'lose');
      if (opp !== 'human' && b > a) sfx.lose(); else sfx.win();
      return;
    }
    if (isAI(S.turn)) {
      setStatus(msg ? [msg, 'The AI is thinking…'] : 'The AI is thinking…');
      thinking = true;
      setTimeout(aiMove, 450);
    } else {
      setStatus(msg || toMove());
    }
  }

  function aiMove() {
    if (!isAI(S.turn) || S.over) { thinking = false; return; }
    const m = chooseMove(S, opp);
    thinking = false;
    if (!m) { afterTurn(null); return; }
    const log = [];
    applyMove(S, m, Math.random, log);
    let msg = playLog(log);
    const said = {
      c: ['The AI cloned.', 'The AI cloned with a Z shield.'],
      j: ['The AI jumped.', 'The AI jumped with a Z shield.'],
      e: ['The AI made an entangled clone.', 'The AI made an entangled clone with a Z shield.'],
      s: ['The AI split a piece into superposition.', 'The AI split a piece into superposition.'],
    }[m.type][m.z ? 1 : 0];
    msg = msg || said;
    afterTurn(msg);
  }

  // --------------------------------------------------------------- input --
  function onCell(i) {
    if (S.over || thinking || isAI(S.turn) || i < 0) return;
    audio();
    const c = S.cells[i], P = S.turn;
    if (c && c.p === P && c.g === null) {
      if (selected === i) { selected = -1; splitFirst = -1; }
      else { selected = i; splitFirst = -1; sfx.select(); }
      hint();
      return;
    }
    if (selected < 0) {
      if (c && c.g !== null) setStatus('A superposed piece cannot move until it is measured.');
      return;
    }
    if (c || !REACH[selected].includes(i)) { sfx.nope(); return; }
    const d = DIST[selected][i];
    if (mode === 'classic') {
      commit({ type: d === 1 ? 'c' : 'j', from: selected, to: i, z: zOn });
    } else if (mode === 'entangle') {
      if (d !== 2) { setStatus('An entangled clone reaches exactly two cells away (amber).'); sfx.nope(); return; }
      commit({ type: 'e', from: selected, to: i, z: zOn });
    } else if (mode === 'split') {
      if (splitFirst < 0) { splitFirst = i; setStatus('Now pick the second cell of the superposition.'); sfx.select(); return; }
      if (i === splitFirst) { splitFirst = -1; hint(); return; }
      commit({ type: 's', from: selected, to: splitFirst, to2: i, z: false });
    }
  }

  function hint() {
    if (selected < 0) { setStatus(toMove()); return; }
    if (mode === 'classic') setStatus(zOn ? ['Green cells: clone. Amber cells: jump.', 'The new piece will be shielded (|−⟩).'] : 'Green cells: clone. Amber cells: jump.');
    if (mode === 'split') setStatus('Split: pick two cells within reach. The piece will be ½ in each.');
    if (mode === 'entangle') setStatus(zOn ? ['Entangle: clone to an amber cell. The two pieces will share their fate.', 'The clone will be shielded.'] : 'Entangle: clone to an amber cell. The two pieces will share their fate.');
  }

  function setMode(m) {
    const ch = S.charges[S.turn];
    if (m === 'split' && ch.H <= 0) { sfx.nope(); return; }
    if (m === 'entangle' && ch.E <= 0) { sfx.nope(); return; }
    mode = m; splitFirst = -1;
    if (m === 'split') zOn = false;
    syncButtons(); hint();
  }
  function toggleZ() {
    if (S.charges[S.turn].Z <= 0 || mode === 'split') { sfx.nope(); return; }
    zOn = !zOn;
    syncButtons(); hint();
  }

  const $ = id => document.getElementById(id);
  const statusEl = $('status');
  // Status parts are plain keys or M(key, vars); kept so a language switch
  // can re-render the current line.
  let lastStatus = { parts: [], cls: '' };
  function setStatus(parts, cls = '') {
    lastStatus = { parts: Array.isArray(parts) ? parts : [parts], cls };
    renderStatus();
  }
  function renderStatus() {
    statusEl.textContent = lastStatus.parts.map(p => {
      if (typeof p === 'string') return t(p);
      const v = {};
      for (const k in p.v || {}) v[k] = typeof p.v[k] === 'function' ? p.v[k]() : p.v[k];
      return t(p.k, v);
    }).join(' ');
    statusEl.className = 'status' + (lastStatus.cls ? ' ' + lastStatus.cls : '');
  }
  function syncButtons() {
    const ch = S.charges[S.turn];
    $('chH').textContent = '×' + ch.H;
    $('chE').textContent = '×' + ch.E;
    $('chZ').textContent = '×' + ch.Z;
    document.querySelectorAll('#modes button').forEach(b => {
      b.classList.toggle('on', b.dataset.mode === mode);
      b.disabled = (b.dataset.mode === 'split' && ch.H <= 0) || (b.dataset.mode === 'entangle' && ch.E <= 0);
    });
    $('zBtn').classList.toggle('on', zOn);
    $('zBtn').disabled = ch.Z <= 0;
    document.querySelectorAll('#opps button').forEach(b => b.classList.toggle('on', b.dataset.opp === opp));
    $('name0').textContent = name(0);
    $('name1').textContent = name(1);
  }

  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    hover = cellAtPixel((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
  });
  canvas.addEventListener('pointerleave', () => { hover = -1; });
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    onCell(cellAtPixel((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H));
  });
  $('modes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  $('zBtn').addEventListener('click', toggleZ);
  $('opps').addEventListener('click', e => {
    const b = e.target.closest('[data-opp]');
    if (!b) return;
    opp = b.dataset.opp;
    try { localStorage.setItem('hexxaqon-opp', opp); } catch (err) { /* ignore */ }
    newGame();
  });
  $('newBtn').addEventListener('click', newGame);

  const muteBtn = $('muteBtn');
  function toggleMute() {
    muted = !muted;
    muteBtn.textContent = t(muted ? '♪ OFF' : '♪ ON');
    try { localStorage.setItem('hexxaqon-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  muteBtn.textContent = t('♪ ON');
  try { if (localStorage.getItem('hexxaqon-muted') === '1') toggleMute(); } catch (e) { /* ignore */ }
  muteBtn.addEventListener('click', () => { toggleMute(); muteBtn.blur(); });

  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.code) {
      case 'KeyH': setMode('split'); break;
      case 'KeyE': setMode('entangle'); break;
      case 'KeyC': setMode('classic'); break;
      case 'KeyZ': toggleZ(); break;
      case 'Escape': selected = -1; splitFirst = -1; hint(); break;
      case 'KeyN': newGame(); break;
      case 'KeyM': toggleMute(); break;
    }
  });

  // ------------------------------------------------------------ render --
  function hexPath(x, y, s) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 3 * k;
      const px = x + s * Math.cos(a), py = y + s * Math.sin(a);
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  function wave(x1, y1, x2, y2, color, alpha, amp = 4) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 4) return;
    const nx = -dy / len, ny = dx / len, n = Math.max(10, Math.floor(len / 5));
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const s = i / n, o = Math.sin(s * len / 9 - time * 8) * amp * Math.sin(Math.PI * s);
      const x = x1 + dx * s + nx * o, y = y1 + dy * s + ny * o;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPiece(i, c, scale = 1) {
    const [x, y] = PX[i];
    const ghost = c.g !== null;
    const color = COLORS[c.p];
    const r = SIZE * 0.6 * scale;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.42 + 0.14 * Math.sin(time * 5 + i);
    ctx.shadowColor = color; ctx.shadowBlur = ghost ? 18 : 10;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, color); g.addColorStop(1, c.p ? '#a5601a' : '#127f8c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    if (ghost) {
      ctx.fillStyle = '#05040f';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('½', x, y + 1);
    }
    if (c.ph < 0) {
      ctx.strokeStyle = '#b06cff'; ctx.lineWidth = 2.5;
      ctx.shadowColor = '#b06cff'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#b06cff';
      ctx.fillRect(x + r - 2, y - r - 2, 7, 2.5);
    }
    if (c.ent !== null) {
      ctx.strokeStyle = '#05040f'; ctx.lineWidth = 1.8;
      for (const dx of [-3.5, 3.5]) { ctx.beginPath(); ctx.arc(x + dx, y, 4, 0, Math.PI * 2); ctx.stroke(); }
    }
  }

  function render() {
    ctx.fillStyle = '#04030c';
    ctx.fillRect(0, 0, W, H);

    const P = S.turn;
    const targets = new Map();
    if (selected >= 0) {
      for (const j of REACH[selected]) {
        if (S.cells[j]) continue;
        const d = DIST[selected][j];
        if (mode === 'entangle' && d !== 2) continue;
        targets.set(j, d);
      }
    }

    for (let i = 0; i < N; i++) {
      const [x, y] = PX[i];
      hexPath(x, y, SIZE * 0.96);
      ctx.fillStyle = i === hover ? '#1a1648' : '#0c0a26';
      ctx.fill();
      ctx.strokeStyle = '#262058'; ctx.lineWidth = 1.5;
      ctx.stroke();
      if (lastMove && (lastMove.to === i || lastMove.to2 === i || lastMove.from === i)) {
        hexPath(x, y, SIZE * 0.84);
        ctx.strokeStyle = 'rgba(232,229,255,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (targets.has(i)) {
        const d = targets.get(i);
        const color = mode === 'split' ? '#7ff9ff' : mode === 'entangle' ? '#ffb0d8' : d === 1 ? '#4dff9a' : '#ffb347';
        hexPath(x, y, SIZE * 0.8);
        ctx.globalAlpha = 0.18 + 0.1 * Math.sin(time * 5);
        ctx.fillStyle = color; ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
        if (i === splitFirst) {
          ctx.fillStyle = '#7ff9ff';
          ctx.font = 'bold 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('½', x, y + 1);
        }
      }
    }
    if (selected >= 0) {
      const [x, y] = PX[selected];
      hexPath(x, y, SIZE * 0.96);
      ctx.strokeStyle = COLORS[P]; ctx.lineWidth = 3;
      ctx.shadowColor = COLORS[P]; ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Links: superpositions and entangled pairs.
    for (const id in S.ghosts) {
      const gh = S.ghosts[id];
      wave(PX[gh.a][0], PX[gh.a][1], PX[gh.b][0], PX[gh.b][1], '#e8e5ff', 0.5, 4);
    }
    const ents = {};
    S.cells.forEach((c, i) => { if (c && c.ent !== null) (ents[c.ent] = ents[c.ent] || []).push(i); });
    for (const id in ents) {
      const [a, b] = ents[id];
      if (b !== undefined) wave(PX[a][0], PX[a][1], PX[b][0], PX[b][1], '#ffb0d8', 0.55, 3);
    }

    S.cells.forEach((c, i) => {
      if (!c) return;
      const a = anims.find(x => x.i === i);
      const scale = a ? 1 + 0.25 * Math.sin(Math.min(1, a.t / 0.35) * Math.PI) : 1;
      drawPiece(i, c, scale);
    });
    for (const a of anims) if (a.link) wave(PX[a.link[0]][0], PX[a.link[0]][1], PX[a.link[1]][0], PX[a.link[1]][1], '#ffffff', Math.max(0, 1 - a.t / 0.9), 6);

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
      ctx.fillText(t(p.text), Math.max(60, Math.min(W - 60, p.x)), p.y - p.t * 20);
    }
    ctx.restore();
  }

  function updateHUD() {
    const a = pieceCount(S, 0), b = pieceCount(S, 1);
    const fmt = v => (v % 1 ? Math.floor(v) + '½' : String(v));
    const c0 = $('count0'), c1 = $('count1'), turnEl = $('turn');
    if (c0._v !== a) { c0._v = a; c0.textContent = fmt(a); }
    if (c1._v !== b) { c1._v = b; c1.textContent = fmt(b); }
    const tv = S.over ? t('END') : name(S.turn);
    if (turnEl._v !== tv) { turnEl._v = tv; turnEl.textContent = tv; turnEl.className = 'val ' + (S.over ? '' : 'p' + S.turn); }
  }

  if (window.QA) {
    QA.onChange(() => {
      renderStatus();
      syncButtons();
      muteBtn.textContent = t(muted ? '♪ OFF' : '♪ ON');
      $('turn')._v = null;
    });
  }

  // -------------------------------------------------------------- loop --
  newGame();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    for (let i = anims.length - 1; i >= 0; i--) if ((anims[i].t += dt) > 0.9) anims.splice(i, 1);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
    }
    for (let i = popups.length - 1; i >= 0; i--) if ((popups[i].t += dt) > popups[i].life) popups.splice(i, 1);
    render();
    updateHUD();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
