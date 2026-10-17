'use strict';
/*
 * MineQueeper: a quantum Minesweeper.
 *
 * Cells hold classical mines (phase +1), anti-mines (phase -1) or belong to a
 * quantum pair: 'S' = superposed mine (|10⟩+|01⟩)/√2, exactly one of the two
 * cells is a mine; 'E' = entangled pair (|00⟩+|11⟩)/√2, both or neither.
 * Revealed numbers show the expected signed mine count of the neighbours.
 */
(() => {
  const t = (s, v) => (window.QA ? QA.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
  const CS = 32;
  const DIFFS = {
    easy: { cols: 9, rows: 9, classic: 6, anti: 1, sup: 2, ent: 1 },
    normal: { cols: 16, rows: 16, classic: 26, anti: 4, sup: 6, ent: 4 },
    hard: { cols: 30, rows: 16, classic: 65, anti: 10, sup: 14, ent: 10 },
  };
  const NUM_COLORS = ['#9690c6', '#3ff4ff', '#4dff9a', '#ff5c8a', '#b06cff', '#ffb347', '#2fd6c3', '#ffffff', '#9690c6'];
  const PAIR_COLORS = { S: '#3ff4ff', E: '#ffb0d8' };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const DPR = (window.devicePixelRatio || 1) > 1 ? 2 : 1;

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
    reveal(n) { tone(n > 1 ? 520 : 380, 0.06, 'triangle', 0.04, n > 1 ? 900 : 420); },
    flag() { tone(660, 0.06, 'square', 0.025); },
    measure() { tone(1500, 0.05, 'square', 0.04); tone(300, 0.18, 'triangle', 0.05, 150, 0.05); },
    spooky() { tone(600, 0.4, 'sine', 0.05, 1800, 0.05); },
    boom() { tone(180, 0.8, 'sawtooth', 0.06, 30); tone(90, 0.9, 'square', 0.04, 25, 0.05); },
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.15, 'triangle', 0.05, null, i * 0.09)); },
    nope() { tone(140, 0.12, 'square', 0.04, 90); },
  };

  // ------------------------------------------------------------- state --
  let diffKey = 'easy', D = DIFFS.easy;
  let cells = [], pairs = [], placed = false, over = false, won = false;
  let measures = 0, flags = 0, startT = 0, endT = 0, time = 0;
  let hover = -1, mode = 'reveal', exploded = -1;
  const waves = [], particles = [];
  let best = {};
  try { best = JSON.parse(localStorage.getItem('minequeeper-best') || '{}') || {}; } catch (e) { best = {}; }

  const idx = (c, r) => r * D.cols + c;
  const colOf = i => i % D.cols, rowOf = i => Math.floor(i / D.cols);
  function neighbors(i) {
    const c = colOf(i), r = rowOf(i), out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const cc = c + dc, rr = r + dr;
        if (cc >= 0 && cc < D.cols && rr >= 0 && rr < D.rows) out.push(idx(cc, rr));
      }
    }
    return out;
  }
  const cheb = (a, b) => Math.max(Math.abs(colOf(a) - colOf(b)), Math.abs(rowOf(a) - rowOf(b)));

  function newGame(key = diffKey) {
    diffKey = key; D = DIFFS[key];
    cells = Array.from({ length: D.cols * D.rows }, () => ({
      mine: false, phase: 1, pair: null, revealed: false, flagged: false,
    }));
    pairs = [];
    placed = false; over = false; won = false; exploded = -1;
    measures = D.sup + D.ent + 1;
    flags = 0; startT = 0; endT = 0;
    waves.length = 0; particles.length = 0;
    canvas.width = D.cols * CS * DPR;
    canvas.height = D.rows * CS * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const col = document.getElementById('stageCol');
    col.style.width = `min(${D.cols * CS}px, calc(100vw - 32px))`;
    document.getElementById('stage').style.aspectRatio = `${D.cols} / ${D.rows}`;
    document.querySelectorAll('#diffs button').forEach(b => b.classList.toggle('on', b.dataset.diff === key));
    setStatus('Click any cell to start. Your first click is always safe.');
  }

  // Mines are placed on the first click, keeping its 3x3 neighbourhood clear.
  function place(first) {
    const used = new Set([first, ...neighbors(first)]);
    const take = (pred = () => true) => {
      const cand = [];
      for (let i = 0; i < cells.length; i++) if (!used.has(i) && pred(i)) cand.push(i);
      if (!cand.length) return -1;
      const i = cand[Math.floor(Math.random() * cand.length)];
      used.add(i);
      return i;
    };
    for (let n = 0; n < D.classic; n++) { const i = take(); if (i >= 0) cells[i].mine = true; }
    for (let n = 0; n < D.anti; n++) { const i = take(); if (i >= 0) { cells[i].mine = true; cells[i].phase = -1; } }
    const addPair = (type, lo, hi) => {
      const a = take();
      if (a < 0) return;
      let b = take(i => { const d = cheb(a, i); return d >= lo && d <= hi; });
      if (b < 0) b = take();
      if (b < 0) { used.delete(a); return; }
      const p = { id: pairs.length, type, a, b, resolved: false };
      pairs.push(p);
      cells[a].pair = p; cells[b].pair = p;
    };
    for (let n = 0; n < D.sup; n++) addPair('S', 1, 2);
    for (let n = 0; n < D.ent; n++) addPair('E', 2, 4);
    placed = true;
    startT = performance.now();
    setStatus('A ½ in a number means a superposed mine is next to it. Measure before you guess.');
  }

  const quantum = cell => cell.pair && !cell.pair.resolved;
  const value = cell => (quantum(cell) ? 0.5 : cell.mine ? cell.phase : 0);
  const expected = i => neighbors(i).reduce((s, j) => s + value(cells[j]), 0);
  const trulyEmpty = i => neighbors(i).every(j => !cells[j].mine && !quantum(cells[j]));

  function collapse(p) {
    if (p.resolved) return;
    if (p.type === 'S') {
      const mineA = Math.random() < 0.5;
      cells[p.a].mine = mineA; cells[p.b].mine = !mineA;
    } else {
      const both = Math.random() < 0.5;
      cells[p.a].mine = both; cells[p.b].mine = both;
    }
    p.resolved = true;
    waves.push({ a: p.a, b: p.b, t: 0, color: PAIR_COLORS[p.type] });
  }

  function flood(i) {
    const stack = [i];
    let n = 0;
    while (stack.length) {
      const j = stack.pop();
      const cell = cells[j];
      if (cell.revealed || cell.flagged || cell.mine || quantum(cell)) continue;
      cell.revealed = true;
      n++;
      if (trulyEmpty(j)) for (const k of neighbors(j)) if (!cells[k].revealed) stack.push(k);
    }
    return n;
  }

  function reveal(i) {
    const cell = cells[i];
    if (over || cell.revealed || cell.flagged) return;
    if (!placed) place(i);
    const p = cell.pair;
    if (p && !p.resolved) {
      collapse(p);
      sfx.measure();
    }
    if (cell.mine) { explode(i); return; }
    let n = flood(i);
    if (p && p.type === 'E') {
      const other = p.a === i ? p.b : p.a;
      if (!cells[other].revealed && !cells[other].flagged) {
        n += flood(other);
        setStatus('Spooky action: its entangled partner was safe too.');
        sfx.spooky();
      }
    }
    if (n) sfx.reveal(n);
    checkWin();
  }

  function chord(i) {
    const v = expected(i);
    if (v <= 0 || v % 1 !== 0) return;
    const nb = neighbors(i);
    const f = nb.filter(j => cells[j].flagged).length;
    if (f !== v) return;
    for (const j of nb) if (!cells[j].revealed && !cells[j].flagged) { reveal(j); if (over) return; }
  }

  function toggleFlag(i) {
    const cell = cells[i];
    if (over || cell.revealed) return;
    cell.flagged = !cell.flagged;
    flags += cell.flagged ? 1 : -1;
    sfx.flag();
  }

  function measure(i) {
    const cell = cells[i];
    if (over || cell.revealed) return;
    if (!placed) { setStatus('Reveal a cell first. There is nothing to measure yet.'); sfx.nope(); return; }
    if (measures <= 0) { setStatus('No measurements left. From here on, revealing is a gamble.'); sfx.nope(); return; }
    measures--;
    if (quantum(cell)) {
      collapse(cell.pair);
      setStatus(cell.pair.type === 'S'
        ? 'Collapsed a superposed mine. The numbers nearby are whole again.'
        : 'Collapsed an entangled pair: both cells are now mines, or both are safe.');
      sfx.measure();
    } else {
      setStatus('That cell was already classical. The measurement told you that, and nothing else.');
      sfx.nope();
    }
    checkWin();
  }

  function explode(i) {
    over = true; exploded = i; endT = performance.now();
    const c = colOf(i), r = rowOf(i);
    for (let n = 0; n < 40; n++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 220;
      particles.push({ x: (c + 0.5) * CS, y: (r + 0.5) * CS, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.5 + Math.random() * 0.6, color: Math.random() < 0.5 ? '#ff3b5c' : '#ffb347' });
    }
    setStatus(cells[i].phase < 0
      ? 'BOOM: an anti-mine. Phase −1 still explodes. Press N to try again.'
      : 'BOOM: the wavefunction collapsed onto a mine. Press N to try again.', 'lose');
    sfx.boom();
  }

  function checkWin() {
    if (over) return;
    const done = cells.every(c => c.revealed || (!quantum(c) && c.mine));
    if (!done) return;
    over = true; won = true; endT = performance.now();
    const secs = Math.floor((endT - startT) / 1000);
    const prev = best[diffKey];
    if (prev === undefined || secs < prev) {
      best[diffKey] = secs;
      try { localStorage.setItem('minequeeper-best', JSON.stringify(best)); } catch (e) { /* ignore */ }
    }
    setStatus(prev === undefined || secs < prev
      ? 'CLEARED in {secs}s, a new best! Every wavefunction resolved safely.'
      : 'CLEARED in {secs}s. Every wavefunction resolved safely.', 'win', { secs });
    sfx.win();
  }

  // ------------------------------------------------------------ render --
  function fmt(v) {
    const a = Math.abs(v), whole = Math.floor(a + 1e-9), half = a - whole > 0.25;
    const s = (whole || !half ? String(whole) : '') + (half ? '½' : '');
    return (v < 0 ? '−' : '') + s;
  }

  function drawMine(x, y, color, phase, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 4;
      ctx.moveTo(x - Math.cos(a) * 10, y - Math.sin(a) * 10);
      ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
    }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    if (phase < 0) {
      ctx.fillStyle = '#05040f';
      ctx.fillRect(x - 4, y - 1.2, 8, 2.4);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.arc(x - 2, y - 2, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawFlag(x, y) {
    ctx.fillStyle = '#ffe14d';
    ctx.fillRect(x - 5, y - 8, 2, 16);
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 8); ctx.lineTo(x + 8, y - 4); ctx.lineTo(x - 3, y);
    ctx.closePath(); ctx.fill();
  }

  function wave(x1, y1, x2, y2, color, alpha, amp = 4) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 4) return;
    const nx = -dy / len, ny = dx / len, n = Math.max(10, Math.floor(len / 5));
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const s = i / n, o = Math.sin(s * len / 9 - time * 9) * amp * Math.sin(Math.PI * s);
      const x = x1 + dx * s + nx * o, y = y1 + dy * s + ny * o;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  const center = i => [(colOf(i) + 0.5) * CS, (rowOf(i) + 0.5) * CS];

  function render() {
    const W = D.cols * CS, H = D.rows * CS;
    ctx.fillStyle = '#04030c';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i], x = colOf(i) * CS, y = rowOf(i) * CS;
      const cx = x + CS / 2, cy = y + CS / 2;
      if (cell.revealed) {
        ctx.fillStyle = '#0a0820';
        ctx.fillRect(x, y, CS, CS);
        ctx.strokeStyle = '#17143a';
        ctx.strokeRect(x + 0.5, y + 0.5, CS - 1, CS - 1);
        if (!trulyEmpty(i)) {
          const v = expected(i);
          const half = Math.abs(v % 1) > 0.25;
          const color = v < 0 || v === 0 ? '#ff4fd8' : NUM_COLORS[Math.min(8, Math.ceil(v))];
          ctx.save();
          ctx.font = `bold ${fmt(v).length > 2 ? 13 : 16}px "JetBrains Mono", monospace`;
          ctx.fillStyle = color;
          if (half) { ctx.shadowColor = '#3ff4ff'; ctx.shadowBlur = 10; }
          ctx.globalAlpha = v === 0 ? 0.7 : 1;
          ctx.fillText(fmt(v), cx, cy + 1);
          ctx.restore();
        }
      } else {
        const hot = i === hover && !over;
        ctx.fillStyle = hot ? '#2a2468' : '#16123e';
        ctx.fillRect(x + 1, y + 1, CS - 2, CS - 2);
        ctx.fillStyle = 'rgba(140,120,255,.18)';
        ctx.fillRect(x + 1, y + 1, CS - 2, 3);
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.fillRect(x + 1, y + CS - 4, CS - 2, 3);
        if (hot && mode === 'measure') {
          ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, CS - 4, CS - 4);
          ctx.lineWidth = 1;
        }
        if (cell.flagged) drawFlag(cx, cy);
      }

      if (over) {
        if (i === exploded) {
          ctx.fillStyle = 'rgba(255,59,92,.55)';
          ctx.fillRect(x, y, CS, CS);
        }
        if (!cell.revealed) {
          if (quantum(cell)) {
            drawMine(cx, cy, PAIR_COLORS[cell.pair.type], 1, 0.35 + 0.15 * Math.sin(time * 6));
          } else if (cell.mine && !(won && cell.flagged)) {
            drawMine(cx, cy, cell.phase < 0 ? '#ff4fd8' : '#ff3b5c', cell.phase, cell.flagged ? 0.6 : 1);
          } else if (cell.flagged && !cell.mine) {
            ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + 7, y + 7); ctx.lineTo(x + CS - 7, y + CS - 7);
            ctx.moveTo(x + CS - 7, y + 7); ctx.lineTo(x + 7, y + CS - 7);
            ctx.stroke();
            ctx.lineWidth = 1;
          }
        } else if (i === exploded) {
          drawMine(cx, cy, '#ffffff', cell.phase);
        }
      }
    }
    if (exploded >= 0) drawMine(...center(exploded), '#ffffff', cells[exploded].phase);

    // After the game, show every quantum pair; during it, only fresh collapses.
    if (over) {
      for (const p of pairs) {
        const [x1, y1] = center(p.a), [x2, y2] = center(p.b);
        wave(x1, y1, x2, y2, PAIR_COLORS[p.type], p.resolved ? 0.35 : 0.8);
      }
    }
    for (const w of waves) {
      const [x1, y1] = center(w.a), [x2, y2] = center(w.b);
      wave(x1, y1, x2, y2, w.color, Math.max(0, 1 - w.t / 1.4), 5);
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  // --------------------------------------------------------------- HUD --
  const $ = id => document.getElementById(id);
  const el = {
    mines: $('mines'), time: $('time'), measures: $('measures'), best: $('best'),
    status: $('status'), mute: $('muteBtn'),
  };
  const set = (node, v) => { v = String(v); if (node._v !== v) { node._v = v; node.textContent = v; } };
  let lastStatus = ['', '', null];
  function setStatus(text, cls = '', vars = null) {
    lastStatus = [text, cls, vars];
    el.status.textContent = t(text, vars);
    el.status.className = 'status' + (cls ? ' ' + cls : '');
  }
  function updateHUD() {
    const total = D.classic + D.anti + D.sup + D.ent;
    set(el.mines, total - flags);
    const secs = !placed ? 0 : Math.floor(((over ? endT : performance.now()) - startT) / 1000);
    set(el.time, secs);
    set(el.measures, measures > 8 ? `◆×${measures}` : '◆'.repeat(measures) || '–');
    set(el.best, best[diffKey] === undefined ? '–' : best[diffKey] + 's');
  }

  // ------------------------------------------------------------- input --
  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left) / r.width * D.cols);
    const rr = Math.floor((e.clientY - r.top) / r.height * D.rows);
    if (c < 0 || c >= D.cols || rr < 0 || rr >= D.rows) return -1;
    return idx(c, rr);
  }

  function primary(i, shift) {
    if (i < 0) return;
    audio();
    if (shift || mode === 'measure') measure(i);
    else if (mode === 'flag') toggleFlag(i);
    else if (cells[i].revealed) chord(i);
    else reveal(i);
  }

  let press = null, longTimer = 0;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    const i = cellAt(e);
    if (i < 0) return;
    if (e.button === 2) { toggleFlag(i); return; }
    if (e.button === 1) { e.preventDefault(); audio(); measure(i); return; }
    press = { i, shift: e.shiftKey, long: false };
    clearTimeout(longTimer);
    if (e.pointerType !== 'mouse') {
      longTimer = setTimeout(() => {
        if (!press) return;
        press.long = true;
        toggleFlag(press.i);
        if (navigator.vibrate) navigator.vibrate(30);
      }, 420);
    }
  });
  canvas.addEventListener('pointerup', e => {
    clearTimeout(longTimer);
    const p = press;
    press = null;
    if (!p || p.long || e.button !== 0) return;
    const i = cellAt(e);
    if (i === p.i) primary(i, p.shift || e.shiftKey);
  });
  canvas.addEventListener('pointermove', e => {
    hover = cellAt(e);
    if (press && hover !== press.i) { clearTimeout(longTimer); press = null; }
  });
  canvas.addEventListener('pointerleave', () => { hover = -1; });

  document.getElementById('diffs').addEventListener('click', e => {
    const b = e.target.closest('[data-diff]');
    if (b) newGame(b.dataset.diff);
  });
  function setMode(m) {
    mode = m;
    document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  }
  document.getElementById('modes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (b) setMode(b.dataset.mode);
  });
  document.getElementById('newBtn').addEventListener('click', () => newGame());

  function toggleMute() {
    muted = !muted;
    el.mute.textContent = muted ? t('♪ OFF') : t('♪ ON');
    try { localStorage.setItem('minequeeper-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  try { if (localStorage.getItem('minequeeper-muted') === '1') toggleMute(); } catch (e) { /* ignore */ }
  el.mute.addEventListener('click', () => { toggleMute(); el.mute.blur(); });
  el.mute.textContent = muted ? t('♪ OFF') : t('♪ ON');

  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.code) {
      case 'KeyN': case 'KeyR': newGame(); break;
      case 'Digit1': newGame('easy'); break;
      case 'Digit2': newGame('normal'); break;
      case 'Digit3': newGame('hard'); break;
      case 'KeyM': toggleMute(); break;
    }
  });

  if (window.QA) QA.onChange(() => {
    setStatus(...lastStatus);
    el.mute.textContent = muted ? t('♪ OFF') : t('♪ ON');
  });

  // -------------------------------------------------------------- loop --
  newGame('easy');
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    for (let i = waves.length - 1; i >= 0; i--) if ((waves[i].t += dt) > 1.4) waves.splice(i, 1);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
    }
    render();
    updateHUD();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
