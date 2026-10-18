'use strict';
/*
 * Qunairo: a quantum Takuzu/Binairo. Rules, solver and generator live in
 * engine.js; this file is the UI. Fixed levels were generated offline with
 * the same engine and are stored as compact strings.
 */
(() => {
  const E = window.QunairoEngine;
  const t = (s, v) => (window.QA ? QA.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));

  // Chapter I: classical bits · II: Z and X axes · III: the whole sphere.
  const LEVELS = [
    '4|01|1100110000110011|6|3.8.f.g.i.m',
    '4|01|1100001101101001|1.5.c.e|3.6.c',
    '6|01|110010010011101100001101010011101100|k|0.4.5.g.p.q.r.x.10.15.1a.1c.1d.1h.1j.1l.1n',
    '6|01|101100110100001011011001100110010011|v|0.6.7.i.y.z.11.13.17.18.1d.1h.1j.1m.1n',
    '6|01|110010011001100101101010010110001101|5.6.l.y|4.b.g.p.u.11.13.18.19.1g.1m',
    '6|01|011010101010010101001101110010100101|1.h.k.l.n.y|2.8.a.e.u.x.1e.1i',
    '4|0123|3012032112032130|0.a|0.1.9.c.f.g.i',
    '4|0123|3021031212302103|3.5|4.7.c.d.f.g.h',
    '6|0123|301102321320213100012013100231230011|e.r.x|2.6.8.a.b.e.f.j.l.o.s.t.x.10.11.13.17.1b.1e.1g.1i.1n',
    '6|0123|022313213100321302203231332210130021|f.z|1.3.6.9.a.c.d.f.h.o.q.w.x.y.12.13.15.19.1c.1e.1f.1h.1n',
    '6|0123|020311112300302132033212213203101023|9.u|3.5.6.a.f.g.h.i.o.p.q.t.x.z.11.12.16.19.1c.1h.1i.1n',
    '6|0123|023011110203031322121003302110230132|6.u.y|1.2.3.5.6.a.d.e.f.k.p.r.u.x.y.15.18.1d.1j.1l.1m',
    '4|012345|5243310223104051|0.3.d|2.6.7.g.i.l',
    '4|012345|2103504132104352|2.e.f|1.2.3.e.g.l',
    '6|012345|534452450321131002025143241530320213|f.n.p.s|2.5.6.7.8.b.c.g.j.n.p.s.t.u.w.x.z.10.11.12.15.16.17.18.19.1c.1d',
    '6|012345|323021511004030112152340401253240135|4.g.j|0.1.2.5.6.7.b.d.e.h.o.p.q.s.u.x.y.12.13.15.16.17.19.1a.1d.1g.1k',
    '6|012345|525344101203023011430215432150514302|5.p.r|2.3.4.6.a.b.c.d.g.l.n.o.p.r.u.x.y.13.14.16.17.1a.1c.1d.1f.1k.1n',
    '6|012345|353422452013513204544532245323402135|7.d.y|1.2.4.5.6.7.8.b.f.l.n.r.t.w.x.z.10.12.17.18.1d.1e.1f.1j.1k.1m',
  ].map(E.decode);
  const CHAPTER_OF = i => Math.floor(i / 6);
  const CHAPTER_PAL = [[0, 1], [0, 1, 2, 3], [0, 1, 2, 3, 4, 5]];
  const RANDOMS = [LEVELS.length, LEVELS.length + 1, LEVELS.length + 2];
  const ROMAN = ['I', 'II', 'III'];

  const KETS = ['|0⟩', '|1⟩', '|+⟩', '|−⟩', '|+i⟩', '|−i⟩'];
  const GLYPH = ['↑', '↓', '→', '←', '⊙', '⊗'];
  const COLORS = ['#e8e5ff', '#ffe14d', '#3ff4ff', '#ff4fd8', '#4dff9a', '#ffb347'];
  const AXES = ['Z', 'X', 'Y'];
  const VEC = [[0, 1], [0, -1], [1, 0], [-1, 0], null, null];
  const MAX_MEASURES = 3;

  // ------------------------------------------------------------ canvas --
  const W = 520, H = 520;
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
  const sfx = {
    place(s) { tone(300 + s * 70, 0.07, 'triangle', 0.04); },
    clear() { tone(200, 0.05, 'triangle', 0.03); },
    nope() { tone(140, 0.12, 'square', 0.04, 90); },
    measure() { tone(1500, 0.05, 'square', 0.04); tone(300, 0.18, 'triangle', 0.05, 150, 0.05); },
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.15, 'triangle', 0.05, null, i * 0.09)); },
  };

  // ------------------------------------------------------------- state --
  let levelIdx = 0, P = null, grid = [], givenSet = new Set(), notes = [], history = [];
  let brush = 0, cursor = 0, hover = -1, measureAxis = -1, measuresLeft = MAX_MEASURES;
  let won = false, startT = 0, endT = 0, time = 0;
  let overlayKind = null, overlayInfo = null, lastStatus = null;
  const pulses = [];
  let progress = {};
  try { progress = JSON.parse(localStorage.getItem('qunairo-progress') || '{}') || {}; } catch (e) { progress = {}; }
  try { levelIdx = Math.min(RANDOMS[2], Math.max(0, +localStorage.getItem('qunairo-level') || 0)); } catch (e) { levelIdx = 0; }

  function save() {
    try {
      localStorage.setItem('qunairo-progress', JSON.stringify(progress));
      localStorage.setItem('qunairo-level', String(levelIdx));
    } catch (e) { /* storage unavailable */ }
  }

  const isRandom = i => i >= LEVELS.length;
  const chapterOf = i => (isRandom(i) ? i - LEVELS.length : CHAPTER_OF(i));

  const INTROS = [
    'Classical bits first: every row and column needs as many |0⟩ as |1⟩, with no three alike in a row.',
    '● joins opposite cells and ○ joins identical ones.',
    'A 6×6 classical grid. Three |0⟩ and three |1⟩ in every line.',
    'Use the ● and ○ clues to carry information across the grid.',
    'Givens and relations together.',
    'The last classical puzzle. Next come real qubits.',
    'New: the X axis, |+⟩ and |−⟩. ◐ means the neighbours sit on different axes.',
    'Each axis must balance separately: as many |+⟩ as |−⟩, as many |0⟩ as |1⟩.',
    'A 6×6 grid with two axes. Find out which axis each cell lies on first.',
    'Two axes, few givens.',
    'Think in two steps: the axis, then the pole.',
    'The last two-axis puzzle.',
    'The full Bloch sphere: |+i⟩ (⊙) and |−i⟩ (⊗) join in. Three axes, three balances.',
    'Three axes on a small grid.',
    'A 6×6 grid on the full sphere.',
    'Mostly relations: let the ◐ clues guide you.',
    'Nearly there.',
    'The final puzzle.',
  ];

  function loadLevel(i) {
    levelIdx = i;
    if (isRandom(i)) {
      const ch = i - LEVELS.length;
      P = E.makePuzzle(6, CHAPTER_PAL[ch], Math.floor(Math.random() * 1e9), { order: ch === 0 ? 'mix' : 'givens' });
    } else {
      P = LEVELS[i];
    }
    grid = Array(P.n * P.n).fill(-1);
    givenSet = new Set(P.givens);
    for (const g of P.givens) grid[g] = P.sol[g];
    notes = [...Array(P.n * P.n)].map(() => []);
    history = [];
    measuresLeft = MAX_MEASURES; measureAxis = -1;
    brush = P.palette[0]; cursor = 0; won = false;
    startT = performance.now(); endT = 0;
    showOverlay(null);
    setStatus(isRandom(i) ? 'Random puzzle. It has exactly one solution, reachable by deduction alone.' : INTROS[i]);
    buildPalette();
    save();
  }

  // --------------------------------------------------------------- play --
  function place(i, s) {
    if (won || i < 0 || givenSet.has(i)) { if (givenSet.has(i)) sfx.nope(); return; }
    audio();
    if (measureAxis >= 0) { measure(i); return; }
    const next = s === grid[i] ? -1 : s;
    if (next === grid[i]) return;
    history.push({ i, prev: grid[i] });
    grid[i] = next;
    pulses.push({ i, t: 0 });
    if (next < 0) sfx.clear(); else sfx.place(next);
    checkWin();
  }

  function clearCell(i) {
    if (won || i < 0 || givenSet.has(i) || grid[i] < 0) return;
    history.push({ i, prev: grid[i] });
    grid[i] = -1;
    sfx.clear();
  }

  function undo() {
    if (won || !history.length) return;
    const h = history.pop();
    grid[h.i] = h.prev;
    sfx.clear();
  }

  function measure(i) {
    if (measuresLeft <= 0) { setStatus('No measurements left for this puzzle.'); sfx.nope(); return; }
    if (givenSet.has(i)) { setStatus('That cell is a given: you already know its state.'); return; }
    const a = measureAxis, s = P.sol[i];
    const onAxis = E.axis(s) === a;
    const outcome = onAxis ? (s & 1) : (Math.random() < 0.5 ? 0 : 1);
    const pole = 2 * a + outcome;
    notes[i].push(pole);
    measuresLeft--;
    measureAxis = -1;
    sfx.measure();
    pulses.push({ i, t: 0, measure: true });
    setStatus('Measured along {axis}: {ket}. So the cell is not {opp}, and that is all you learn.',
      '', { axis: AXES[a], ket: KETS[pole], opp: KETS[pole ^ 1] });
    syncMeasure();
  }

  function checkWin() {
    if (grid.some((s, i) => s !== P.sol[i])) return;
    won = true;
    endT = performance.now();
    const used = MAX_MEASURES - measuresLeft;
    const stars = used === 0 ? 3 : used === 1 ? 2 : 1;
    const secs = Math.round((endT - startT) / 1000);
    if (!isRandom(levelIdx)) {
      const prev = progress[levelIdx];
      if (!prev || stars > prev.stars || (stars === prev.stars && secs < prev.secs)) progress[levelIdx] = { stars, secs };
      save();
    }
    sfx.win();
    setStatus('Solved! Every row and column averages to the centre of the Bloch sphere.', 'win');
    setTimeout(() => { if (won) showOverlay('win', { stars, secs, used }); }, 650);
  }

  // ------------------------------------------------------------ layout --
  function geom() {
    const n = P.n;
    const cs = Math.min(96, Math.floor(480 / n));
    return { n, cs, ox: (W - cs * n) / 2, oy: (H - cs * n) / 2 };
  }
  function cellAt(x, y) {
    const { n, cs, ox, oy } = geom();
    const c = Math.floor((x - ox) / cs), r = Math.floor((y - oy) / cs);
    if (c < 0 || c >= n || r < 0 || r >= n) return -1;
    return r * n + c;
  }

  // ------------------------------------------------------------ render --
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  function drawState(cx, cy, R, s, alpha = 1) {
    const color = COLORS[s];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = s === 0 ? 4 : 10;
    ctx.lineWidth = Math.max(2, R * 0.16);
    ctx.lineCap = 'round';
    if (VEC[s]) {
      const [x, z] = VEC[s];
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + x * R, cy - z * R); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + x * R, cy - z * R, Math.max(2.5, R * 0.17), 0, Math.PI * 2); ctx.fill();
    } else {
      const r = R * 0.42;
      ctx.lineWidth = Math.max(1.8, R * 0.12);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      if (s === 4) {
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2); ctx.fill();
      } else {
        const d = r * 0.62;
        ctx.beginPath();
        ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
        ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawClue(x, y, r, kind, bad) {
    ctx.save();
    const c = bad ? '#ff3b5c' : '#e8e5ff';
    ctx.fillStyle = '#05040f';
    ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 1.8;
    if (bad) { ctx.shadowColor = c; ctx.shadowBlur = 10; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (kind === E.OPP) ctx.fill();
    ctx.stroke();
    if (kind === E.HALF) {
      ctx.beginPath(); ctx.arc(x, y, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = '#04030c';
    ctx.fillRect(0, 0, W, H);
    const { n, cs, ox, oy } = geom();
    const G = E.geometry(n);
    const V = E.violations(n, grid, P.sol, P.edges);
    const hoverLines = hover >= 0 ? G.cellLines[hover] : [];

    // Line highlights: hovered row/column, and broken balance.
    G.lines.forEach((L, li) => {
      const r0 = Math.floor(L[0] / n), c0 = L[0] % n, isRow = li < n;
      const x = ox + (isRow ? 0 : c0 * cs), y = oy + (isRow ? r0 * cs : 0);
      const w = isRow ? cs * n : cs, h = isRow ? cs : cs * n;
      if (V.badLines.has(li)) { ctx.fillStyle = 'rgba(255,59,92,.13)'; ctx.fillRect(x, y, w, h); }
      else if (hoverLines.includes(li)) { ctx.fillStyle = 'rgba(108,92,255,.07)'; ctx.fillRect(x, y, w, h); }
    });

    for (let i = 0; i < n * n; i++) {
      const x = ox + (i % n) * cs, y = oy + Math.floor(i / n) * cs;
      const pad = Math.max(3, cs * 0.06), w = cs - pad * 2;
      const given = givenSet.has(i), s = grid[i];
      ctx.fillStyle = given ? '#15123c' : '#0c0a26';
      rrect(x + pad, y + pad, w, w, cs * 0.14); ctx.fill();
      let stroke = '#262058', lw = 1.2;
      if (V.badCells.has(i)) { stroke = '#ff3b5c'; lw = 2.4; }
      else if (i === cursor && !won) { stroke = measureAxis >= 0 ? '#ff4fd8' : '#6c5cff'; lw = 2; }
      else if (i === hover && !given && !won) { stroke = measureAxis >= 0 ? '#ff4fd8' : COLORS[brush]; lw = 1.6; }
      ctx.strokeStyle = stroke; ctx.lineWidth = lw;
      rrect(x + pad + 0.5, y + pad + 0.5, w - 1, w - 1, cs * 0.14); ctx.stroke();
      if (given) {
        ctx.strokeStyle = 'rgba(232,229,255,.18)'; ctx.lineWidth = 1;
        rrect(x + pad + 3.5, y + pad + 3.5, w - 7, w - 7, cs * 0.1); ctx.stroke();
      }

      const cx = x + cs / 2, cy = y + cs / 2, R = cs * 0.28;
      ctx.strokeStyle = 'rgba(150,144,198,.28)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
      const pulse = pulses.find(p => p.i === i);
      if (s >= 0) drawState(cx, cy, R * (pulse && !pulse.measure ? 1 + 0.2 * Math.sin(Math.min(1, pulse.t / 0.3) * Math.PI) : 1), s);
      else if (i === hover && !won && measureAxis < 0) drawState(cx, cy, R, brush, 0.25);

      if (s >= 0) {
        ctx.fillStyle = given ? '#9690c6' : COLORS[s];
        ctx.font = `bold ${Math.max(9, Math.round(cs * 0.14))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(KETS[s], x + cs - pad - 3, y + cs - pad - 1);
      }
      if (notes[i].length) {
        ctx.font = `bold ${Math.max(8, Math.round(cs * 0.12))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = '#ff4fd8';
        ctx.fillText(notes[i].map(p => `${AXES[p >> 1]}:${KETS[p]}`).join(' '), x + pad + 3, y + pad + 2);
      }
    }

    // Edge clues sit on the shared border of the two cells.
    const r = Math.max(4.5, cs * 0.075);
    for (const e of P.edges) {
      const [a, b] = G.edges[e];
      const ax = ox + (a % n) * cs + cs / 2, ay = oy + Math.floor(a / n) * cs + cs / 2;
      const bx = ox + (b % n) * cs + cs / 2, by = oy + Math.floor(b / n) * cs + cs / 2;
      drawClue((ax + bx) / 2, (ay + by) / 2, r, E.rel(P.sol[a], P.sol[b]), V.badEdges.has(e));
    }

    for (const p of pulses) {
      if (!p.measure) continue;
      const x = ox + (p.i % n) * cs + cs / 2, y = oy + Math.floor(p.i / n) * cs + cs / 2;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.t / 0.6);
      ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, cs * (0.3 + p.t), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // --------------------------------------------------------------- HUD --
  const $ = id => document.getElementById(id);
  const statusEl = $('status'), tallyEl = $('tally');
  function setStatus(key, cls = '', vars) {
    lastStatus = { key, cls, vars };
    statusEl.textContent = t(key, vars);
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }
  const set = (node, v) => { v = String(v); if (node._v !== v) { node._v = v; node.textContent = v; } };

  function tallyText(i) {
    if (i < 0) return '';
    const { n } = geom();
    const G = E.geometry(n);
    const axes = [...new Set(P.palette.map(E.axis))];
    const parts = G.cellLines[i].map((li, k) => {
      const cnt = [0, 0, 0, 0, 0, 0];
      for (const j of G.lines[li]) if (grid[j] >= 0) cnt[grid[j]]++;
      const body = axes.map(a => `${KETS[2 * a]}×${cnt[2 * a]} ${KETS[2 * a + 1]}×${cnt[2 * a + 1]}`).join(' · ');
      return `<b>${t(k === 0 ? 'row {n}' : 'column {n}', { n: k === 0 ? Math.floor(i / n) + 1 : (i % n) + 1 })}</b>: ${body}`;
    });
    return parts.join('&nbsp;&nbsp;│&nbsp;&nbsp;');
  }

  function updateHUD() {
    set($('level'), isRandom(levelIdx) ? '∞' : levelIdx + 1);
    set($('chapter'), ROMAN[chapterOf(levelIdx)]);
    const secs = Math.floor(((won ? endT : performance.now()) - startT) / 1000);
    set($('time'), secs);
    set($('measures'), '◆'.repeat(measuresLeft) + '◇'.repeat(MAX_MEASURES - measuresLeft));
    $('undoBtn').disabled = won || !history.length;
    $('prevBtn').disabled = levelIdx === 0;
    const tt = tallyText(hover >= 0 ? hover : cursor);
    if (tallyEl._h !== tt) { tallyEl._h = tt; tallyEl.innerHTML = tt; }
  }

  function buildPalette() {
    const pal = $('palette');
    pal.innerHTML = P.palette.map((s, k) =>
      `<button type="button" data-state="${s}" style="color:${COLORS[s]}" title="${k + 1}"><span class="g">${GLYPH[s]}</span>${KETS[s]}</button>`).join('')
      + `<button type="button" class="erase" data-state="-1" title="0">✕</button>`;
    syncPalette();
    syncMeasure();
  }
  function syncPalette() {
    document.querySelectorAll('#palette button').forEach(b => b.classList.toggle('on', +b.dataset.state === brush && measureAxis < 0));
  }
  function syncMeasure() {
    const axes = [...new Set(P.palette.map(E.axis))];
    $('measureSeg').innerHTML = axes.map(a =>
      `<button type="button" data-axis="${a}" class="${measureAxis === a ? 'on' : ''}" ${measuresLeft <= 0 ? 'disabled' : ''}>👁 ${t('MEASURE')} ${AXES[a]}</button>`).join('');
    syncPalette();
  }

  // ----------------------------------------------------------- overlay --
  const overlay = $('overlay');
  function showOverlay(kind, info) {
    overlayKind = kind; overlayInfo = info || null;
    if (!kind) { overlay.classList.remove('show'); overlay.innerHTML = ''; return; }
    let html = '';
    if (kind === 'win') {
      const stars = '★'.repeat(info.stars) + '☆'.repeat(3 - info.stars);
      const last = levelIdx === LEVELS.length - 1, rnd = isRandom(levelIdx);
      html = `<div class="card">
        <div class="big">⟨ψ⟩ = 0</div>
        <div class="bigstars">${stars}</div>
        <p>${t('Solved in {secs} s.', { secs: info.secs })} ${info.used ? t('Measurements used: {n}. Three stars needs none.', { n: info.used }) : t('No measurements needed: pure deduction.')}</p>
        <div class="row"><button class="go" type="button" data-act="next">${t(rnd ? 'ANOTHER ONE' : last ? 'RANDOM PUZZLE' : 'NEXT LEVEL')}</button></div>
        <div class="row">
          <button class="ghostbtn" type="button" data-act="retry">${t('RETRY')}</button>
          <button class="ghostbtn" type="button" data-act="levels">${t('LEVELS')}</button>
        </div>
      </div>`;
    } else if (kind === 'levels') {
      const chapters = [0, 1, 2].map(ch => {
        const btns = [0, 1, 2, 3, 4, 5].map(k => {
          const i = ch * 6 + k, p = progress[i];
          const stars = p ? '★'.repeat(p.stars) + '☆'.repeat(3 - p.stars) : '';
          return `<button type="button" data-level="${i}" class="${i === levelIdx ? 'cur' : ''}">${i + 1}<span class="stars">${stars}</span></button>`;
        }).join('');
        const name = [t('I · classical bits'), t('II · Z and X axes'), t('III · the whole sphere')][ch];
        return `<p class="chname">${name}</p><div class="levels six">${btns}</div>`;
      }).join('');
      const total = Object.values(progress).reduce((s, p) => s + p.stars, 0);
      html = `<div class="card wide">
        <div class="big">${t('LEVELS')}</div>
        <p>${t('Stars: {total} / {max}', { total, max: LEVELS.length * 3 })}</p>
        ${chapters}
        <p class="chname">${t('∞ random puzzles')}</p>
        <div class="row">
          ${RANDOMS.map((r, ch) => `<button class="ghostbtn" type="button" data-level="${r}">∞ ${ROMAN[ch]}</button>`).join('')}
          <button class="ghostbtn" type="button" data-act="close">${t('CLOSE')}</button>
        </div>
      </div>`;
    }
    overlay.innerHTML = html;
    overlay.classList.add('show');
  }

  overlay.addEventListener('click', e => {
    const lv = e.target.closest('[data-level]');
    if (lv) { loadLevel(+lv.dataset.level); return; }
    const b = e.target.closest('[data-act]');
    if (!b) { if (!won) showOverlay(null); return; }
    switch (b.dataset.act) {
      case 'next': loadLevel(isRandom(levelIdx) ? levelIdx : levelIdx + 1 >= LEVELS.length ? RANDOMS[2] : levelIdx + 1); break;
      case 'retry': if (isRandom(levelIdx)) { const keep = P; loadLevel(levelIdx); P = keep; resetGrid(); } else loadLevel(levelIdx); break;
      case 'levels': showOverlay('levels'); break;
      case 'close': showOverlay(null); break;
    }
  });

  function resetGrid() {
    grid = Array(P.n * P.n).fill(-1);
    for (const g of P.givens) grid[g] = P.sol[g];
    notes = [...Array(P.n * P.n)].map(() => []);
    history = []; measuresLeft = MAX_MEASURES; measureAxis = -1; won = false;
    startT = performance.now();
    showOverlay(null);
    buildPalette();
  }

  // ------------------------------------------------------------- input --
  const toBoard = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
  };
  canvas.addEventListener('pointermove', e => { hover = cellAt(...toBoard(e)); });
  canvas.addEventListener('pointerleave', () => { hover = -1; });
  canvas.addEventListener('click', e => {
    const i = cellAt(...toBoard(e));
    if (i < 0) return;
    cursor = i;
    place(i, brush);
  });
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const i = cellAt(...toBoard(e));
    if (i >= 0) { cursor = i; clearCell(i); }
  });
  $('palette').addEventListener('click', e => {
    const b = e.target.closest('[data-state]');
    if (!b) return;
    const s = +b.dataset.state;
    measureAxis = -1;
    if (s < 0) { clearCell(cursor); } else brush = s;
    syncMeasure();
  });
  $('measureSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-axis]');
    if (!b || measuresLeft <= 0) return;
    const a = +b.dataset.axis;
    measureAxis = measureAxis === a ? -1 : a;
    if (measureAxis >= 0) setStatus('Measure along {axis}: pick a cell.', '', { axis: AXES[a] });
    syncMeasure();
  });
  $('undoBtn').addEventListener('click', undo);
  $('resetBtn').addEventListener('click', () => { if (isRandom(levelIdx)) resetGrid(); else loadLevel(levelIdx); });
  $('levelsBtn').addEventListener('click', () => showOverlay('levels'));
  $('prevBtn').addEventListener('click', () => { if (levelIdx > 0) loadLevel(isRandom(levelIdx) ? LEVELS.length - 1 : levelIdx - 1); });
  $('nextBtn').addEventListener('click', () => loadLevel(Math.min(RANDOMS[2], levelIdx + 1)));

  const muteBtn = $('muteBtn');
  const muteLabel = () => { muteBtn.textContent = t(muted ? '♪ OFF' : '♪ ON'); };
  function toggleMute() {
    muted = !muted;
    muteLabel();
    try { localStorage.setItem('qunairo-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  try { if (localStorage.getItem('qunairo-muted') === '1') muted = true; } catch (e) { /* ignore */ }
  muteLabel();
  muteBtn.addEventListener('click', () => { toggleMute(); muteBtn.blur(); });

  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); }
      return;
    }
    const n = P.n;
    const move = (dr, dc) => {
      const r = Math.floor(cursor / n), c = cursor % n;
      cursor = Math.min(n - 1, Math.max(0, r + dr)) * n + Math.min(n - 1, Math.max(0, c + dc));
      e.preventDefault();
    };
    if (/^Digit[1-6]$/.test(e.code)) {
      const k = +e.code.slice(5) - 1;
      if (k < P.palette.length) { brush = P.palette[k]; measureAxis = -1; syncMeasure(); place(cursor, brush); }
      return;
    }
    switch (e.code) {
      case 'ArrowUp': move(-1, 0); break;
      case 'ArrowDown': move(1, 0); break;
      case 'ArrowLeft': move(0, -1); break;
      case 'ArrowRight': move(0, 1); break;
      case 'Digit0': case 'Delete': case 'Backspace': clearCell(cursor); break;
      case 'Space': case 'Enter': e.preventDefault(); place(cursor, brush); break;
      case 'KeyU': undo(); break;
      case 'KeyR': if (isRandom(levelIdx)) resetGrid(); else loadLevel(levelIdx); break;
      case 'KeyN': loadLevel(Math.min(RANDOMS[2], levelIdx + 1)); break;
      case 'KeyP': if (levelIdx > 0) loadLevel(isRandom(levelIdx) ? LEVELS.length - 1 : levelIdx - 1); break;
      case 'KeyL': showOverlay('levels'); break;
      case 'Escape': if (overlayKind && !won) showOverlay(null); measureAxis = -1; syncMeasure(); break;
      case 'KeyM': toggleMute(); break;
    }
  });

  if (window.QA) QA.onChange(() => {
    if (lastStatus) setStatus(lastStatus.key, lastStatus.cls, lastStatus.vars);
    muteLabel();
    syncMeasure();
    tallyEl._h = null;
    if (overlayKind) showOverlay(overlayKind, overlayInfo);
  });

  // -------------------------------------------------------------- loop --
  loadLevel(levelIdx);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    for (let k = pulses.length - 1; k >= 0; k--) if ((pulses[k].t += dt) > 0.6) pulses.splice(k, 1);
    render();
    updateHUD();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
