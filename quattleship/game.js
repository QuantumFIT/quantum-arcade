'use strict';
/*
 * Quattleship: Battleship with Elitzur–Vaidman interaction-free measurement.
 * Rules and the AI gunner live in engine.js; this file is the UI. A turn is
 * any number of Zeno probes (paid with energy), then exactly one torpedo.
 */
(() => {
  const GAME_ID = 'quattleship';
  const rec = (k, v, m) => (window.QR ? QR.set(GAME_ID, k, v, m) : false);
  const E = window.QuattleEngine, R = E.RULES, N = E.N;
  const t = (s, v) => (window.QA ? QA.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
  const COLS = 'ABCDEFGH';
  const cellName = i => COLS[i % N] + (Math.floor(i / N) + 1);

  // ------------------------------------------------------------ canvas --
  const DPR = (window.devicePixelRatio || 1) > 1 ? 2 : 1;
  function setup(id, w, h) {
    const c = document.getElementById(id), x = c.getContext('2d');
    c.width = w * DPR; c.height = h * DPR;
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    return [c, x];
  }
  const EW = 420, MW = 320;
  const [enemyCv, ectx] = setup('enemy', EW, EW);
  const [mineCv, mctx] = setup('mine', MW, MW);
  const [photonCv, pctx] = setup('photon', 120, 120);
  const layout = W => { const off = W * 0.06; return { off, cs: (W - off - 4) / N }; };

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
    step(k) { tone(500 + k * 40, 0.05, 'sine', 0.025); },
    collapse() { tone(1200, 0.04, 'square', 0.025); },
    water() { tone(300, 0.25, 'sine', 0.04, 900); },
    ship() { [880, 1100, 1320].forEach((f, i) => tone(f, 0.1, 'triangle', 0.04, null, i * 0.06)); },
    absorb() { tone(200, 0.4, 'sawtooth', 0.05, 80); tone(1500, 0.1, 'square', 0.04, 600, 0.05); },
    launch() { tone(200, 0.3, 'triangle', 0.05, 90); },
    splash() { tone(400, 0.3, 'sine', 0.03, 120); },
    hit() { tone(120, 0.4, 'sawtooth', 0.06, 40); },
    sunk() { tone(90, 0.8, 'square', 0.05, 30); },
    enemyShot() { tone(160, 0.15, 'square', 0.04, 70); },
    nope() { tone(140, 0.12, 'square', 0.04, 90); },
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.15, 'triangle', 0.05, null, i * 0.09)); },
    lose() { tone(500, 0.9, 'sawtooth', 0.04, 50); },
  };

  // ------------------------------------------------------------- state --
  let enemy, mine, gunner, marks, aiMarks, energy, alarm, turn, phase, started;
  let mode = 'probe', nSteps = 6, hover = -1, time = 0;
  let probeAnim = null, overlayKind = null, overlayInfo = null, lastStatus = null;
  let stats = null;
  const flashes = [];

  function newGame() {
    const rng = Math.random;
    enemy = E.placeFleet(rng);
    mine = E.placeFleet(rng);
    gunner = E.makeGunner(rng);
    marks = Array(N * N).fill(null);
    aiMarks = Array(N * N).fill(null);
    energy = R.energyStart; alarm = 0; turn = 1; phase = 'player'; started = false;
    probeAnim = null; flashes.length = 0;
    stats = { probes: 0, absorbed: 0, silent: 0, torpedoes: 0, misses: 0 };
    showOverlay(null);
    setStatus('Find the enemy fleet. Probe silently, then torpedo what you found.');
    setPhotonText('idle');
    sync();
  }

  function shuffleMine() {
    if (started) return;
    mine = E.placeFleet(Math.random);
    sfx.step(3);
  }

  // -------------------------------------------------------------- probe --
  function startProbe(i) {
    if (marks[i]) { setStatus('You already know what is in {cell}.', '', { cell: cellName(i) }); sfx.nope(); return; }
    if (energy < nSteps) { setStatus('Not enough energy: an N = {n} probe costs {n}. Lower N or fire a torpedo.', '', { n: nSteps }); sfx.nope(); return; }
    started = true;
    energy -= nSteps;
    stats.probes++;
    const res = E.probe(enemy.owner[i] >= 0, nSteps, Math.random);
    probeAnim = { i, n: nSteps, res, k: 0, t: 0, angle: 0, from: 0, flash: null };
    phase = 'probing';
    setStatus('Probing {cell} with N = {n}…', '', { cell: cellName(i), n: nSteps });
    setPhotonText('running', { n: nSteps });
    sync();
  }

  const STEP_T = 0.26;
  function tickProbe(dt) {
    const a = probeAnim;
    a.t += dt;
    if (a.t < STEP_T) return;
    a.t = 0;
    if (a.k >= a.res.trace.length) { finishProbe(); return; }
    const st = a.res.trace[a.k];
    a.from = a.angle;
    a.angle = st.angle;
    a.k++;
    sfx.step(a.k);
    if (st.collapsed) { a.flash = { kind: 'collapse', t: 0 }; a.pendingReset = true; sfx.collapse(); }
    if (st.absorbed) { a.flash = { kind: 'absorb', t: 0 }; }
  }

  function finishProbe() {
    const { i, n, res } = probeAnim;
    probeAnim = null;
    phase = 'player';
    const p = Math.round(E.pSilent(n) * 100);
    if (res.result === 'water') {
      marks[i] = 'water';
      sfx.water();
      setStatus('{cell}: water. The photon turned all the way to |1⟩, and nothing was there to stop it.', '', { cell: cellName(i) });
      setPhotonText('water', { n });
    } else if (res.result === 'ship') {
      marks[i] = 'ship';
      stats.silent++;
      sfx.ship();
      flashes.push({ i, t: 0, color: '#ff4fd8' });
      setStatus('{cell}: SHIP, found without touching it! The Zeno effect held the photon at |0⟩ ({p}% chance).', 'win', { cell: cellName(i), p });
      setPhotonText('ship', { n });
    } else {
      marks[i] = 'absorbed';
      stats.absorbed++;
      alarm = Math.min(R.alarmMax, alarm + R.absorbAlarm);
      sfx.absorb();
      flashes.push({ i, t: 0, color: '#ffb347' });
      setStatus('{cell}: the ship absorbed the photon at step {k} of {n}. It is a ship, but they noticed you: alarm +{a}.', 'lose', { cell: cellName(i), k: res.trace.length, n, a: R.absorbAlarm });
      setPhotonText('absorbed', { n, k: res.trace.length });
    }
    sync();
  }

  // ------------------------------------------------------------ torpedo --
  function torpedo(i) {
    if (marks[i] === 'hit' || marks[i] === 'miss' || marks[i] === 'ring') { setStatus('You already fired at {cell}.', '', { cell: cellName(i) }); sfx.nope(); return; }
    started = true;
    stats.torpedoes++;
    sfx.launch();
    const res = E.fire(enemy, i);
    marks[i] = res.hit ? 'hit' : 'miss';
    flashes.push({ i, t: 0, color: res.hit ? '#ff3b5c' : '#9690c6' });
    if (!res.hit) { stats.misses++; setTimeout(sfx.splash, 150); setStatus('{cell}: miss.', '', { cell: cellName(i) }); }
    else if (res.sunk) {
      setTimeout(sfx.sunk, 150);
      ringAround(res.sunk, marks);
      setStatus('{cell}: hit, and the ship sinks!', 'win', { cell: cellName(i) });
    } else { setTimeout(sfx.hit, 150); setStatus('{cell}: hit!', 'win', { cell: cellName(i) }); }
    if (E.fleetDead(enemy)) { endGame(true); return; }
    energy = Math.min(R.energyMax, energy + R.energyPerTurn);
    phase = 'ai';
    sync();
    setTimeout(aiTurn, 650);
  }

  // Ships never touch, so the ring around a sunk ship is known water.
  function ringAround(ship, arr) {
    for (const c of ship.cells) {
      const r = Math.floor(c / N), cc = c % N;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, c2 = cc + dc;
        if (rr < 0 || rr >= N || c2 < 0 || c2 >= N) continue;
        const j = rr * N + c2;
        if (!arr[j] || arr[j] === 'water') arr[j] = 'ring';
      }
    }
  }

  function aiTurn() {
    if (phase !== 'ai') return;
    const shots = E.aiShots(alarm);
    let k = 0;
    const shoot = () => {
      if (phase !== 'ai') return;
      const i = gunner.pick();
      const res = E.fire(mine, i);
      gunner.record(i, res.hit, res.sunk);
      aiMarks[i] = res.hit ? 'hit' : 'miss';
      if (res.sunk) ringAround(res.sunk, aiMarks);
      sfx.enemyShot();
      if (res.hit) setTimeout(sfx.hit, 120);
      mineFlash.push({ i, t: 0, color: res.hit ? '#ff3b5c' : '#9690c6' });
      k++;
      if (E.fleetDead(mine)) { endGame(false); return; }
      if (k < shots) { setTimeout(shoot, 420); return; }
      alarm = Math.max(0, alarm - R.alarmDecay);
      turn++;
      phase = 'player';
      const sunk = mine.ships.filter(s => s.sunk).length;
      setStatus(shots > 1 ? 'The enemy fired {k} shots (alarm). Your move.' : 'The enemy fired. Your move.', '', { k: shots, s: sunk });
      sync();
    };
    setStatus(shots > 1 ? 'The enemy is on alert and fires {k} shots…' : 'The enemy fires…', '', { k: shots });
    shoot();
  }

  function endGame(won) {
    phase = 'over';
    rec(won ? 'wins' : 'losses', 1, 'add');
    if (won) { rec('fewestTurns', turn, 'min'); rec('mostSilent', stats.silent, 'max'); }
    if (won) sfx.win(); else sfx.lose();
    setTimeout(() => showOverlay(won ? 'win' : 'lose', { ...stats, turns: turn }), 700);
    sync();
  }

  // ------------------------------------------------------------ render --
  const mineFlash = [];
  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
  }

  function drawBoard(c, W, data, opts) {
    const { off, cs } = layout(W);
    c.fillStyle = '#04030c';
    c.fillRect(0, 0, W, W);
    c.fillStyle = '#6f69a3';
    c.font = `bold ${Math.round(cs * 0.26)}px "JetBrains Mono", monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = 0; k < N; k++) {
      c.fillText(COLS[k], off + k * cs + cs / 2, off / 2);
      c.fillText(String(k + 1), off / 2, off + k * cs + cs / 2);
    }
    for (let i = 0; i < N * N; i++) {
      const x = off + (i % N) * cs, y = off + Math.floor(i / N) * cs;
      const m = data[i];
      c.fillStyle = m === 'water' ? '#071a26' : m === 'ring' || m === 'miss' ? '#0a0b1e' : m === 'hit' ? '#2a0a14' : '#0c0a26';
      rrect(c, x + 1.5, y + 1.5, cs - 3, cs - 3, 5); c.fill();
      c.strokeStyle = opts.hover === i ? (mode === 'probe' ? '#ff4fd8' : '#ff3b5c') : '#1d1850';
      c.lineWidth = opts.hover === i ? 2 : 1;
      rrect(c, x + 1.5, y + 1.5, cs - 3, cs - 3, 5); c.stroke();
    }
    // Ship hulls.
    for (const ship of opts.ships || []) {
      const xs = ship.cells.map(i => i % N), ys = ship.cells.map(i => Math.floor(i / N));
      const x = off + Math.min(...xs) * cs, y = off + Math.min(...ys) * cs;
      const w = (Math.max(...xs) - Math.min(...xs) + 1) * cs, h = (Math.max(...ys) - Math.min(...ys) + 1) * cs;
      c.fillStyle = ship.sunk ? 'rgba(255,59,92,.28)' : opts.ghost ? 'rgba(201,205,224,.12)' : 'rgba(154,163,199,.55)';
      c.strokeStyle = ship.sunk ? '#ff3b5c' : opts.ghost ? 'rgba(201,205,224,.4)' : '#c9cde0';
      c.lineWidth = 1.5;
      rrect(c, x + cs * 0.14, y + cs * 0.14, w - cs * 0.28, h - cs * 0.28, cs * 0.35); c.fill(); c.stroke();
    }
    for (let i = 0; i < N * N; i++) {
      const m = data[i];
      if (!m) continue;
      const cx = off + (i % N) * cs + cs / 2, cy = off + Math.floor(i / N) * cs + cs / 2;
      c.save();
      if (m === 'water') {
        c.strokeStyle = '#3ff4ff'; c.lineWidth = 1.5; c.globalAlpha = 0.8;
        c.beginPath(); c.arc(cx, cy, cs * 0.2, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#3ff4ff'; c.font = `bold ${Math.round(cs * 0.2)}px "JetBrains Mono", monospace`;
        c.fillText('|1⟩', cx, cy + cs * 0.33);
      } else if (m === 'ring' || m === 'miss') {
        c.fillStyle = m === 'miss' ? '#9690c6' : '#3a3470';
        c.beginPath(); c.arc(cx, cy, cs * (m === 'miss' ? 0.1 : 0.06), 0, Math.PI * 2); c.fill();
      } else if (m === 'ship' || m === 'absorbed') {
        const col = m === 'ship' ? '#ff4fd8' : '#ffb347';
        c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 12;
        c.beginPath();
        c.moveTo(cx, cy - cs * 0.24); c.lineTo(cx + cs * 0.22, cy); c.lineTo(cx, cy + cs * 0.24); c.lineTo(cx - cs * 0.22, cy);
        c.closePath(); c.fill();
        c.shadowBlur = 0;
        c.fillStyle = '#05040f'; c.font = `bold ${Math.round(cs * 0.26)}px "JetBrains Mono", monospace`;
        c.fillText(m === 'ship' ? '0' : '!', cx, cy + 1);
      } else if (m === 'hit') {
        c.strokeStyle = '#ff3b5c'; c.lineWidth = Math.max(2.5, cs * 0.08); c.lineCap = 'round';
        c.shadowColor = '#ff3b5c'; c.shadowBlur = 12;
        const d = cs * 0.22;
        c.beginPath(); c.moveTo(cx - d, cy - d); c.lineTo(cx + d, cy + d); c.moveTo(cx + d, cy - d); c.lineTo(cx - d, cy + d); c.stroke();
      }
      c.restore();
    }
    for (const f of opts.flashes) {
      const cx = off + (f.i % N) * cs + cs / 2, cy = off + Math.floor(f.i / N) * cs + cs / 2;
      c.save();
      c.globalAlpha = Math.max(0, 1 - f.t / 0.7);
      c.strokeStyle = f.color; c.lineWidth = 3;
      c.beginPath(); c.arc(cx, cy, cs * (0.25 + f.t * 0.9), 0, Math.PI * 2); c.stroke();
      c.restore();
    }
    if (opts.probe) {
      const i = opts.probe.i;
      const x = off + (i % N) * cs, y = off + Math.floor(i / N) * cs;
      c.save();
      c.strokeStyle = '#ff4fd8'; c.lineWidth = 2.5;
      c.globalAlpha = 0.6 + 0.4 * Math.sin(time * 14);
      rrect(c, x + 2, y + 2, cs - 4, cs - 4, 5); c.stroke();
      c.restore();
    }
  }

  function drawPhoton() {
    const W = 120, cx = 60, cy = 60, Rr = 44;
    pctx.fillStyle = '#04030c';
    pctx.fillRect(0, 0, W, W);
    pctx.strokeStyle = 'rgba(150,144,198,.4)'; pctx.lineWidth = 1;
    pctx.beginPath(); pctx.arc(cx, cy, Rr, 0, Math.PI * 2); pctx.stroke();
    pctx.beginPath(); pctx.ellipse(cx, cy, Rr, Rr * 0.28, 0, 0, Math.PI * 2); pctx.stroke();
    pctx.fillStyle = '#6f69a3';
    pctx.font = 'bold 10px "JetBrains Mono", monospace';
    pctx.textAlign = 'center'; pctx.textBaseline = 'middle';
    pctx.fillText('|0⟩', cx, 8); pctx.fillText('|1⟩', cx, W - 7);
    let theta = 0, color = '#e8e5ff';
    const a = probeAnim;
    if (a) {
      const k = Math.min(1, a.t / (STEP_T * 0.6));
      theta = a.from + (a.angle - a.from) * k;
      if (a.pendingReset && a.t > STEP_T * 0.6) { theta = 0; }
      if (a.flash && a.flash.kind === 'absorb') color = '#ffb347';
      else color = '#ff4fd8';
    } else if (photonState.angle !== undefined) {
      theta = photonState.angle; color = photonState.color;
    }
    // A state cos θ|0⟩ + sin θ|1⟩ sits at polar angle 2θ on the Bloch sphere.
    const ex = cx + Math.sin(2 * theta) * Rr, ey = cy - Math.cos(2 * theta) * Rr;
    pctx.save();
    pctx.strokeStyle = color; pctx.fillStyle = color;
    pctx.shadowColor = color; pctx.shadowBlur = 10;
    pctx.lineWidth = 3; pctx.lineCap = 'round';
    if (!(a && a.flash && a.flash.kind === 'absorb' && a.k >= a.res.trace.length)) {
      pctx.beginPath(); pctx.moveTo(cx, cy); pctx.lineTo(ex, ey); pctx.stroke();
      pctx.beginPath(); pctx.arc(ex, ey, 4, 0, Math.PI * 2); pctx.fill();
    } else {
      pctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 20);
      pctx.beginPath(); pctx.arc(cx, cy, 10, 0, Math.PI * 2); pctx.fill();
    }
    pctx.restore();
  }

  let photonState = { angle: 0, color: '#e8e5ff' };
  let photonInfo = { kind: 'idle', vars: {} };
  function setPhotonText(kind, vars = {}) {
    photonInfo = { kind, vars };
    if (kind === 'water') photonState = { angle: Math.PI / 2, color: '#3ff4ff' };
    else if (kind === 'ship') photonState = { angle: 0, color: '#ff4fd8' };
    else if (kind === 'absorbed') photonState = { angle: 0, color: '#ffb347' };
    else photonState = { angle: 0, color: '#e8e5ff' };
    renderPhotonText();
  }
  function renderPhotonText() {
    const { kind, vars } = photonInfo;
    const el = document.getElementById('photonTxt');
    const map = {
      idle: 'A photon waits in |0⟩. A probe turns it towards |1⟩ in N small steps.',
      running: 'The photon is on its way: N = {n} steps of π/2N, passing the cell after each one.',
      water: 'Nothing interrupted the photon: after N = {n} steps it reached |1⟩, which means <b>water</b>.',
      ship: 'Every pass measured the photon and knocked it back to |0⟩. It stayed at |0⟩, which means <b>a ship</b>, found without touching it.',
      absorbed: 'Step {k}: the measurement went the other way and the ship <b>absorbed</b> the photon.',
    };
    el.innerHTML = t(map[kind], vars);
  }

  // --------------------------------------------------------------- HUD --
  const $ = id => document.getElementById(id);
  const statusEl = $('status');
  function setStatus(key, cls = '', vars) {
    lastStatus = { key, cls, vars };
    statusEl.textContent = t(key, vars);
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }
  function oddsText() {
    const p = E.pSilent(nSteps);
    return t('<b>N = {n}</b> costs {n} energy. On water it is always safe. On a ship: <b>{p}%</b> silent detection, {q}% absorbed (alarm +{a}).',
      { n: nSteps, p: Math.round(p * 100), q: Math.round((1 - p) * 100), a: R.absorbAlarm });
  }
  function sync() {
    $('turn').textContent = turn;
    $('energy').textContent = `${energy} ⚡`;
    $('alarmBar').style.width = (alarm / R.alarmMax * 100) + '%';
    $('alarmTxt').textContent = t('enemy shots: {k}', { k: E.aiShots(alarm) });
    $('enemyLeft').textContent = `${enemy.ships.filter(s => !s.sunk).length}/${enemy.ships.length}`;
    $('nVal').textContent = nSteps;
    $('odds').innerHTML = oddsText();
    document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    document.querySelector('.controls').classList.toggle('torpedo', mode === 'torpedo');
    $('shuffleBtn').disabled = started;
  }

  // ----------------------------------------------------------- overlay --
  const overlay = $('overlay');
  function showOverlay(kind, info) {
    overlayKind = kind; overlayInfo = info || null;
    if (!kind) { overlay.classList.remove('show'); overlay.innerHTML = ''; return; }
    const s = info;
    const line = t('Turns: {turns} · probes: {probes} (silent detections: {silent}, absorbed: {absorbed}) · torpedoes: {torpedoes}, misses: {misses}', s);
    overlay.innerHTML = `<div class="card">
      <div class="big" style="color:${kind === 'win' ? '#3ff4ff' : '#ff3b5c'}">${t(kind === 'win' ? 'VICTORY' : 'FLEET LOST')}</div>
      <p>${t(kind === 'win' ? 'The whole enemy fleet is on the bottom.' : 'The enemy sank your whole fleet.')}</p>
      <p>${line}</p>
      <p>${t('Your record: won {w}, lost {l} · fewest turns to win: {f}', { w: (window.QR && QR.get(GAME_ID, 'wins')) || 0, l: (window.QR && QR.get(GAME_ID, 'losses')) || 0, f: (window.QR && QR.get(GAME_ID, 'fewestTurns')) || '–' })}</p>
      <div class="row"><button class="go" type="button" data-act="new">${t('PLAY AGAIN')}</button>
      <button class="ghostbtn" type="button" data-act="look">${t('SEE THE BOARD')}</button></div>
    </div>`;
    overlay.classList.add('show');
  }
  overlay.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'new') newGame();
    if (b.dataset.act === 'look') showOverlay(null);
  });

  // ------------------------------------------------------------- input --
  function cellAt(cv, W, e) {
    const r = cv.getBoundingClientRect();
    const { off, cs } = layout(W);
    const x = (e.clientX - r.left) / r.width * W - off, y = (e.clientY - r.top) / r.height * W - off;
    const c = Math.floor(x / cs), rr = Math.floor(y / cs);
    return c < 0 || c >= N || rr < 0 || rr >= N ? -1 : rr * N + c;
  }
  enemyCv.addEventListener('pointermove', e => { hover = cellAt(enemyCv, EW, e); });
  enemyCv.addEventListener('pointerleave', () => { hover = -1; });
  enemyCv.addEventListener('click', e => {
    const i = cellAt(enemyCv, EW, e);
    if (i < 0 || phase !== 'player') return;
    audio();
    if (mode === 'probe') startProbe(i); else torpedo(i);
  });
  $('modes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (b) { mode = b.dataset.mode; sync(); }
  });
  $('nSlider').addEventListener('input', e => { nSteps = +e.target.value; sync(); });
  $('newBtn').addEventListener('click', newGame);
  $('shuffleBtn').addEventListener('click', shuffleMine);

  const muteBtn = $('muteBtn');
  const muteLabel = () => { muteBtn.textContent = t(muted ? '♪ OFF' : '♪ ON'); };
  function toggleMute() {
    muted = !muted;
    muteLabel();
    try { localStorage.setItem('quattleship-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  try { if (localStorage.getItem('quattleship-muted') === '1') muted = true; } catch (e) { /* ignore */ }
  muteLabel();
  muteBtn.addEventListener('click', () => { toggleMute(); muteBtn.blur(); });

  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^Digit[0-9]$/.test(e.code)) { nSteps = +e.code.slice(5) || 10; $('nSlider').value = nSteps; sync(); return; }
    switch (e.code) {
      case 'KeyP': mode = 'probe'; sync(); break;
      case 'KeyT': mode = 'torpedo'; sync(); break;
      case 'KeyN': newGame(); break;
      case 'KeyM': toggleMute(); break;
    }
  });

  if (window.QA) QA.onChange(() => {
    if (lastStatus) setStatus(lastStatus.key, lastStatus.cls, lastStatus.vars);
    renderPhotonText();
    muteLabel();
    sync();
    if (overlayKind) showOverlay(overlayKind, overlayInfo);
  });

  // -------------------------------------------------------------- loop --
  newGame();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (probeAnim) {
      tickProbe(dt);
      if (probeAnim && probeAnim.flash) probeAnim.flash.t += dt;
      if (probeAnim && probeAnim.pendingReset && probeAnim.t > STEP_T * 0.6) { probeAnim.angle = 0; probeAnim.from = 0; probeAnim.pendingReset = false; }
    }
    for (const list of [flashes, mineFlash]) for (let k = list.length - 1; k >= 0; k--) if ((list[k].t += dt) > 0.7) list.splice(k, 1);
    const over = phase === 'over';
    drawBoard(ectx, EW, marks, {
      hover: phase === 'player' ? hover : -1, flashes, probe: probeAnim,
      ships: enemy.ships.filter(s => s.sunk || over), ghost: over,
    });
    drawBoard(mctx, MW, aiMarks, { hover: -1, flashes: mineFlash, ships: mine.ships });
    drawPhoton();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
