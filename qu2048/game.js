'use strict';
/*
 * Qu2048: 2048 where every tile is an amplitude with a phase.
 *
 * A tile is { id, kind: 'n' | 'Z' | 'H', e, ph }: number tiles have value
 * 2^e and phase ph = ±1. Sliding works as in 2048, except that two equal
 * tiles merge only with the same phase; with opposite phases they cancel.
 * The rules (slide, canMove, spawn) are pure functions on a 16-cell grid.
 */
(() => {
  const GAME_ID = 'qu2048';
  const rec = (k, v, m) => (window.QR ? QR.set(GAME_ID, k, v, m) : false);
  const t = (s, v) => (window.QA ? QA.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
  const N = 4, WIN_E = 11, UNDOS = 3;
  const DIRS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

  // ------------------------------------------------------------ engine --
  let nextId = 1;
  const num = (e, ph) => ({ id: nextId++, kind: 'n', e, ph });

  // Cell indices of each line, ordered from the edge the tiles slide towards.
  function lines(dir) {
    const out = [];
    for (let k = 0; k < N; k++) {
      const L = [];
      for (let j = 0; j < N; j++) {
        if (dir === 'left') L.push(k * N + j);
        if (dir === 'right') L.push(k * N + (N - 1 - j));
        if (dir === 'up') L.push(j * N + k);
        if (dir === 'down') L.push((N - 1 - j) * N + k);
      }
      out.push(L);
    }
    return out;
  }

  // a sits nearer the edge, b slides into it.
  function combine(a, b) {
    if (a.kind === 'n' && b.kind === 'n') {
      if (a.e !== b.e) return null;
      return a.ph === b.ph ? { type: 'merge', tile: { ...a, e: a.e + 1 } } : { type: 'annihilate' };
    }
    const n = a.kind === 'n' ? a : b.kind === 'n' ? b : null, g = n === a ? b : a;
    if (!n) return null;
    if (g.kind === 'Z') return { type: 'phase', tile: { ...n, ph: -n.ph } };
    if (g.kind === 'H' && n.e >= 2) return { type: 'split', tile: { ...n, e: n.e - 1 }, spawn: { e: n.e - 1, ph: -n.ph } };
    return null;
  }

  function slide(grid, dir) {
    const out = Array(N * N).fill(null), moves = [], events = [], splits = [];
    let moved = false, gained = 0;
    for (const L of lines(dir)) {
      const stack = [];
      for (const from of L) {
        const b = grid[from];
        if (!b) continue;
        const last = stack[stack.length - 1];
        const res = last && !last.merged ? combine(last.tile, b) : null;
        const slot = stack.length - 1;
        if (!res) { stack.push({ tile: b, merged: false, ids: [[b.id, from]] }); continue; }
        moved = true;
        if (res.type === 'annihilate') {
          stack.pop();
          events.push({ k: 'annihilate', e: b.e, at: L[slot], ids: [...last.ids, [b.id, from]] });
          gained += 2 ** b.e;
          continue;
        }
        if (res.type === 'merge') gained += 2 ** res.tile.e;
        if (res.type === 'split') splits.push(res.spawn);
        events.push({ k: res.type, e: res.tile.e, ph: res.tile.ph, id: res.tile.id });
        stack[slot] = { tile: res.tile, merged: true, ids: [...last.ids, [b.id, from]] };
      }
      stack.forEach((s, k) => {
        out[L[k]] = s.tile;
        for (const [id, from] of s.ids) {
          moves.push({ id, from, to: L[k] });
          if (from !== L[k]) moved = true;
        }
      });
      for (const ev of events) if (ev.k === 'annihilate' && !ev.done) {
        ev.done = true;
        for (const [id, from] of ev.ids) moves.push({ id, from, to: ev.at, dies: true });
      }
    }
    return { grid: out, moved, moves, events, splits, gained };
  }

  function canMove(grid) {
    for (let i = 0; i < N * N; i++) {
      if (!grid[i]) return true;
      const r = Math.floor(i / N), c = i % N;
      for (const j of [c < N - 1 ? i + 1 : -1, r < N - 1 ? i + N : -1]) {
        if (j < 0 || !grid[j]) continue;
        if (combine(grid[i], grid[j]) || combine(grid[j], grid[i])) return true;
      }
    }
    return false;
  }

  function spawn(grid, rng, score, forced) {
    const empty = grid.map((x, i) => (x ? -1 : i)).filter(i => i >= 0);
    if (!empty.length) return null;
    const i = empty[Math.floor(rng() * empty.length)];
    let tile;
    if (forced) tile = num(forced.e, forced.ph);
    else {
      const has = k => grid.some(x => x && x.kind === k);
      const maxE = Math.max(0, ...grid.map(x => (x && x.kind === 'n' ? x.e : 0)));
      const r = rng();
      if (!has('Z') && score >= 300 && r < 0.03) tile = { id: nextId++, kind: 'Z' };
      else if (!has('H') && maxE >= 7 && r > 0.96) tile = { id: nextId++, kind: 'H' };
      else tile = num(rng() < 0.9 ? 1 : 2, rng() < 0.125 ? -1 : 1);
    }
    grid[i] = tile;
    return { i, tile };
  }

  // ------------------------------------------------------------ canvas --
  const W = 480, H = 480, GAP = 12, CELL = (W - GAP * (N + 1)) / N, ANIM = 0.12;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const DPR = (window.devicePixelRatio || 1) > 1 ? 2 : 1;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const cellXY = i => [GAP + (i % N) * (CELL + GAP), GAP + Math.floor(i / N) * (CELL + GAP)];
  const TILE_COLORS = ['', '#2fd6c3', '#3ff4ff', '#4d9cff', '#7b6cff', '#b06cff', '#ff4fd8', '#ff5c8a', '#ff8a3d', '#ffb347', '#ffe14d', '#ffffff', '#ffffff'];

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
    slide() { tone(180, 0.05, 'triangle', 0.025); },
    merge(e) { tone(220 * 2 ** (e / 4), 0.12, 'triangle', 0.05, 330 * 2 ** (e / 4)); },
    annihilate() { tone(500, 0.3, 'sine', 0.05, 80); tone(505, 0.3, 'sine', 0.05, 82); },
    phase() { tone(900, 0.2, 'sawtooth', 0.025, 300); },
    split() { tone(500, 0.2, 'sine', 0.04, 1000); tone(500, 0.2, 'sine', 0.03, 250); },
    nope() { tone(140, 0.08, 'square', 0.03, 100); },
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.15, 'triangle', 0.05, null, i * 0.09)); },
    over() { tone(500, 0.8, 'sawtooth', 0.04, 60); },
  };

  // ------------------------------------------------------------- state --
  let grid, score, annihilations, undosLeft, history, won, over, keepPlaying;
  let anim = null, time = 0, overlayKind = null, lastStatus = null;
  const pops = new Map(), births = new Map(), particles = [];
  let best = 0;
  try { best = +localStorage.getItem('qu2048-best') || 0; } catch (e) { best = 0; }

  function newGame() {
    grid = Array(N * N).fill(null);
    score = 0; annihilations = 0; undosLeft = UNDOS; history = [];
    won = false; over = false; keepPlaying = false; anim = null;
    pops.clear(); births.clear(); particles.length = 0;
    for (let k = 0; k < 2; k++) { const s = spawn(grid, Math.random, 0, { e: 1, ph: 1 }); births.set(s.tile.id, 0); }
    showOverlay(null);
    setStatus('Slide the tiles. Equal tiles with the same phase merge; opposite phases annihilate.');
  }

  const fmtTile = tl => (tl.kind === 'n' ? `${tl.ph < 0 ? '−' : ''}|${2 ** tl.e}⟩` : tl.kind);

  function move(dir) {
    if (over || anim || overlayKind === 'win') return;
    audio();
    const res = slide(grid, dir);
    if (!res.moved) { sfx.nope(); return; }
    history.push({ grid: grid.map(x => x && { ...x }), score, annihilations });
    if (history.length > 20) history.shift();
    const oldGrid = grid;
    grid = res.grid;
    score += res.gained;
    if (score > best) { best = score; try { localStorage.setItem('qu2048-best', String(best)); } catch (e) { /* ignore */ } }
    rec('highScore', score, 'max');
    rec('bestTile', 2 ** Math.max(1, ...grid.map(x => (x && x.kind === 'n' ? x.e : 0))), 'max');

    let msg = null;
    for (const ev of res.events) {
      if (ev.k === 'annihilate') {
        annihilations++;
        msg = { key: 'Destructive interference: |{v}⟩ − |{v}⟩ = 0. +{v} points and a free cell.', vars: { v: 2 ** ev.e } };
      } else if (ev.k === 'merge') {
        pops.set(ev.id, 0);
      } else if (ev.k === 'phase') {
        pops.set(ev.id, 0);
        msg = msg || { key: 'Phase flip: the tile is now {tile}.', vars: { tile: fmtTile({ kind: 'n', e: ev.e, ph: ev.ph }) } };
      } else if (ev.k === 'split') {
        pops.set(ev.id, 0);
        msg = msg || { key: 'Hadamard split: |{v2}⟩ → |{v}⟩ and −|{v}⟩.', vars: { v2: 2 ** (ev.e + 1), v: 2 ** ev.e } };
      }
    }
    anim = { t: 0, moves: res.moves, from: oldGrid, events: res.events };
    for (const s of res.splits) { const p = spawn(grid, Math.random, score, s); if (p) births.set(p.tile.id, -ANIM); }
    const sp = spawn(grid, Math.random, score);
    if (sp) births.set(sp.tile.id, -ANIM);
    if (sp && sp.tile.kind !== 'n') msg = msg || { key: sp.tile.kind === 'Z' ? 'A Z tile appeared: push a tile into it to flip its phase.' : 'An H tile appeared: push a 4 or more into it to split it in two.' };

    const sounds = res.events.map(e => e.k);
    if (sounds.includes('annihilate')) sfx.annihilate();
    else if (sounds.includes('split')) sfx.split();
    else if (sounds.includes('phase')) sfx.phase();
    else if (sounds.includes('merge')) sfx.merge(Math.max(...res.events.filter(e => e.k === 'merge').map(e => e.e)));
    else sfx.slide();
    if (msg) setStatus(msg.key, '', msg.vars);

    for (const ev of res.events) if (ev.k === 'annihilate') setTimeout(() => burst(ev.at, ev.e), ANIM * 1000);

    if (!won && grid.some(x => x && x.kind === 'n' && x.e >= WIN_E)) {
      won = true;
      rec('wins', 1, 'add');
      setTimeout(() => { sfx.win(); showOverlay('win'); }, 300);
    }
    if (!canMove(grid)) {
      over = true;
      rec('games', 1, 'add'); rec('mostAnnihilations', annihilations, 'max');
      setTimeout(() => { sfx.over(); showOverlay('over'); }, 400);
    }
  }

  function undo() {
    if (anim || !history.length || undosLeft <= 0 || overlayKind === 'win') return;
    const h = history.pop();
    grid = h.grid; score = h.score; annihilations = h.annihilations;
    undosLeft--; over = false;
    showOverlay(null);
    setStatus('Undone. Undos left: {n}.', '', { n: undosLeft });
  }

  function burst(i, e) {
    const [x, y] = cellXY(i);
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 200;
      particles.push({ x: x + CELL / 2, y: y + CELL / 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.5 + Math.random() * 0.4, color: k % 2 ? TILE_COLORS[Math.min(12, e)] : '#ffffff' });
    }
  }

  // ------------------------------------------------------------ render --
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  function drawTile(tl, x, y, scale = 1, alpha = 1) {
    const s = CELL * scale, ox = x + (CELL - s) / 2, oy = y + (CELL - s) / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (tl.kind !== 'n') {
      const c = tl.kind === 'Z' ? '#ff4fd8' : '#3ff4ff';
      ctx.fillStyle = '#0a0720';
      rrect(ox, oy, s, s, 12); ctx.fill();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = c; ctx.lineWidth = 3;
      rrect(ox + 2, oy + 2, s - 4, s - 4, 10); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 14;
      ctx.font = `bold ${Math.round(s * 0.45)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tl.kind, ox + s / 2, oy + s / 2 + 2);
      ctx.restore();
      return;
    }
    const c = TILE_COLORS[Math.min(12, tl.e)];
    const v = 2 ** tl.e;
    if (tl.ph > 0) {
      ctx.fillStyle = c;
      ctx.shadowColor = c; ctx.shadowBlur = tl.e >= 7 ? 22 : 8;
      rrect(ox, oy, s, s, 12); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      rrect(ox, oy, s, s * 0.12, 12); ctx.fill();
      ctx.fillStyle = '#05040f';
    } else {
      ctx.fillStyle = '#0a0720';
      rrect(ox, oy, s, s, 12); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 3.5;
      ctx.shadowColor = c; ctx.shadowBlur = 12;
      rrect(ox + 2, oy + 2, s - 4, s - 4, 10); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = c;
    }
    const label = (tl.ph < 0 ? '−' : '') + v;
    const fs = label.length <= 2 ? 0.42 : label.length === 3 ? 0.36 : label.length === 4 ? 0.29 : 0.24;
    ctx.font = `bold ${Math.round(s * fs)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, ox + s / 2, oy + s * 0.46);
    ctx.globalAlpha = alpha * 0.75;
    ctx.font = `bold ${Math.round(s * 0.13)}px "JetBrains Mono", monospace`;
    ctx.fillText(`${tl.ph < 0 ? '−' : '+'}|${v}⟩`, ox + s / 2, oy + s * 0.8);
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = '#0c0a26';
    rrect(0, 0, W, H, 14); ctx.fill();
    for (let i = 0; i < N * N; i++) {
      const [x, y] = cellXY(i);
      ctx.fillStyle = '#07061a';
      rrect(x, y, CELL, CELL, 12); ctx.fill();
    }
    if (anim) {
      const k = Math.min(1, anim.t / ANIM), ease = 1 - (1 - k) ** 3;
      const byId = new Map();
      for (const tl of anim.from) if (tl) byId.set(tl.id, tl);
      for (const m of anim.moves) {
        const tl = byId.get(m.id);
        if (!tl) continue;
        const [x0, y0] = cellXY(m.from), [x1, y1] = cellXY(m.to);
        drawTile(tl, x0 + (x1 - x0) * ease, y0 + (y1 - y0) * ease, 1, m.dies ? 1 - 0.5 * ease : 1);
      }
    } else {
      grid.forEach((tl, i) => {
        if (!tl) return;
        const [x, y] = cellXY(i);
        let scale = 1;
        if (pops.has(tl.id)) scale = 1 + 0.14 * Math.sin(Math.min(1, pops.get(tl.id) / 0.18) * Math.PI);
        if (births.has(tl.id)) scale = Math.max(0, Math.min(1, births.get(tl.id) / 0.15));
        drawTile(tl, x, y, scale);
      });
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  // --------------------------------------------------------------- HUD --
  const $ = id => document.getElementById(id);
  const statusEl = $('status');
  function setStatus(key, cls = '', vars) {
    lastStatus = { key, cls, vars };
    statusEl.textContent = t(key, vars);
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }
  const set = (node, v) => { v = String(v); if (node._v !== v) { node._v = v; node.textContent = v; } };
  function updateHUD() {
    set($('score'), score);
    set($('best'), best);
    const maxE = Math.max(1, ...grid.map(x => (x && x.kind === 'n' ? x.e : 0)));
    set($('maxTile'), 2 ** maxE);
    set($('annih'), annihilations);
    const u = $('undoBtn');
    u.disabled = !history.length || undosLeft <= 0;
    const lbl = `${t('UNDO')} ×${undosLeft}`;
    if (u._v !== lbl) { u._v = lbl; u.textContent = lbl; }
  }

  // ----------------------------------------------------------- overlay --
  const overlay = $('overlay');
  function showOverlay(kind) {
    overlayKind = kind;
    if (!kind) { overlay.classList.remove('show'); overlay.innerHTML = ''; return; }
    let html = '';
    if (kind === 'win') {
      html = `<div class="card">
        <div class="big">|2048⟩</div>
        <p>${t('You built a |2048⟩ with {n} annihilations along the way.', { n: annihilations })}</p>
        <div class="row">
          <button class="go" type="button" data-act="continue">${t('KEEP PLAYING')}</button>
          <button class="ghostbtn" type="button" data-act="new">${t('NEW GAME')}</button>
        </div>
      </div>`;
    } else if (kind === 'over') {
      html = `<div class="card">
        <div class="big" style="color:#ff3b5c">${t('NO MOVES LEFT')}</div>
        <p class="big">${score}</p>
        <p>${t('Nothing can merge or cancel any more. Annihilations: {n}.', { n: annihilations })}</p>
        <div class="row">
          <button class="go" type="button" data-act="new">${t('NEW GAME')}</button>
          ${undosLeft > 0 && history.length ? `<button class="ghostbtn" type="button" data-act="undo">${t('UNDO')} ×${undosLeft}</button>` : ''}
        </div>
      </div>`;
    }
    overlay.innerHTML = html;
    overlay.classList.add('show');
  }
  overlay.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'new') newGame();
    if (b.dataset.act === 'continue') { keepPlaying = true; showOverlay(null); }
    if (b.dataset.act === 'undo') undo();
  });

  // ------------------------------------------------------------- input --
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); }
      return;
    }
    if (KEYS[e.code]) { e.preventDefault(); move(KEYS[e.code]); return; }
    if (e.code === 'KeyU') undo();
    if (e.code === 'KeyN') newGame();
    if (e.code === 'KeyM') toggleMute();
  });
  let touch0 = null;
  const stage = $('stage');
  stage.addEventListener('pointerdown', e => { touch0 = [e.clientX, e.clientY]; });
  stage.addEventListener('pointerup', e => {
    if (!touch0) return;
    const dx = e.clientX - touch0[0], dy = e.clientY - touch0[1];
    touch0 = null;
    if (Math.hypot(dx, dy) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  $('newBtn').addEventListener('click', newGame);
  $('undoBtn').addEventListener('click', undo);

  const muteBtn = $('muteBtn');
  const muteLabel = () => { muteBtn.textContent = t(muted ? '♪ OFF' : '♪ ON'); };
  function toggleMute() {
    muted = !muted;
    muteLabel();
    try { localStorage.setItem('qu2048-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  try { if (localStorage.getItem('qu2048-muted') === '1') muted = true; } catch (e) { /* ignore */ }
  muteLabel();
  muteBtn.addEventListener('click', () => { toggleMute(); muteBtn.blur(); });

  if (window.QA) QA.onChange(() => {
    if (lastStatus) setStatus(lastStatus.key, lastStatus.cls, lastStatus.vars);
    muteLabel();
    $('undoBtn')._v = null;
    if (overlayKind) showOverlay(overlayKind);
  });

  // -------------------------------------------------------------- loop --
  newGame();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (anim && (anim.t += dt) >= ANIM) anim = null;
    for (const m of [pops, births]) for (const [id, v] of m) { if (v + dt > 0.3) m.delete(id); else m.set(id, v + dt); }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
    }
    render();
    updateHUD();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
