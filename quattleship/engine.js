'use strict';
/*
 * Quattleship engine: fleets, the Elitzur–Vaidman Zeno probe, the alarm
 * rule and the AI gunner. Shared by the page (window.QuattleEngine) and the
 * offline balance simulations (module.exports).
 */
(function (root) {
  const N = 8;
  const FLEET = [4, 3, 3, 2, 2];
  // Tuned with simulated games: torpedo-only play wins ~55% against the AI,
  // Zeno probes with N >= 6 ~85%, cheap N = 1 "classical touch" probes ~0%.
  const RULES = {
    energyStart: 12, energyPerTurn: 4, energyMax: 30,
    absorbAlarm: 4, alarmDecay: 1, alarmMax: 12, alarmPerShot: 4,
  };

  const idx = (r, c) => r * N + c;
  const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
  function neighbors4(i) {
    const r = Math.floor(i / N), c = i % N, out = [];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (inside(r + dr, c + dc)) out.push(idx(r + dr, c + dc));
    return out;
  }

  function mulberry(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Random fleet; ships may not touch, not even diagonally.
  function placeFleet(rng) {
    for (;;) {
      const owner = Array(N * N).fill(-1), ships = [];
      let ok = true;
      for (const len of FLEET) {
        let placed = false;
        for (let tries = 0; tries < 200 && !placed; tries++) {
          const horiz = rng() < 0.5;
          const r0 = Math.floor(rng() * (horiz ? N : N - len + 1)), c0 = Math.floor(rng() * (horiz ? N - len + 1 : N));
          const cells = [...Array(len).keys()].map(k => (horiz ? idx(r0, c0 + k) : idx(r0 + k, c0)));
          const clash = cells.some(i => {
            const r = Math.floor(i / N), c = i % N;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
              if (inside(r + dr, c + dc) && owner[idx(r + dr, c + dc)] >= 0) return true;
            }
            return false;
          });
          if (clash) continue;
          cells.forEach(i => { owner[i] = ships.length; });
          ships.push({ len, cells, hits: 0, sunk: false });
          placed = true;
        }
        if (!placed) { ok = false; break; }
      }
      if (ok) return { owner, ships };
    }
  }

  // Probability that a Zeno probe of N steps detects a ship without being absorbed.
  const pSilent = n => Math.cos(Math.PI / (2 * n)) ** (2 * n);

  // Run a probe: each step rotates the photon by π/2N towards |1⟩; a ship in
  // the path measures it, absorbing it with probability sin²(π/2N) and
  // otherwise knocking it back to |0⟩.
  function probe(shipThere, n, rng) {
    const step = Math.PI / (2 * n);
    const trace = [];
    let angle = 0;
    for (let k = 1; k <= n; k++) {
      angle += step;
      if (!shipThere) { trace.push({ angle }); continue; }
      if (rng() < Math.sin(step) ** 2) { trace.push({ angle, absorbed: true }); return { result: 'absorbed', trace }; }
      trace.push({ angle, collapsed: true });
      angle = 0;
    }
    return { result: shipThere ? 'ship' : 'water', trace };
  }

  // Hunt/target gunner. `known` holds cells already shot at.
  function makeGunner(rng) {
    const shot = new Set(), hitCells = [];
    const parity = (rng() < 0.5) ? 0 : 1;
    function pick() {
      // Target mode: extend lines through unsunk hits, else try their neighbours.
      const open = hitCells.filter(h => !h.sunk);
      if (open.length) {
        const cells = open.map(h => h.i);
        const cand = [];
        if (cells.length >= 2) {
          const rows = new Set(cells.map(i => Math.floor(i / N))), cols = new Set(cells.map(i => i % N));
          if (rows.size === 1 || cols.size === 1) {
            const sorted = cells.slice().sort((a, b) => a - b), step = rows.size === 1 ? 1 : N;
            for (const e of [sorted[0] - step, sorted[sorted.length - 1] + step]) {
              if (e < 0 || e >= N * N || shot.has(e)) continue;
              if (step === 1 && Math.floor(e / N) !== Math.floor(sorted[0] / N)) continue;
              cand.push(e);
            }
          }
        }
        if (!cand.length) for (const i of cells) for (const j of neighbors4(i)) if (!shot.has(j)) cand.push(j);
        if (cand.length) return cand[Math.floor(rng() * cand.length)];
      }
      let pool = [];
      for (let i = 0; i < N * N; i++) if (!shot.has(i) && ((Math.floor(i / N) + i % N) % 2 === parity)) pool.push(i);
      if (!pool.length) for (let i = 0; i < N * N; i++) if (!shot.has(i)) pool.push(i);
      return pool[Math.floor(rng() * pool.length)];
    }
    function record(i, hit, sunkShip) {
      shot.add(i);
      if (hit) hitCells.push({ i, sunk: false });
      if (sunkShip) {
        for (const h of hitCells) if (sunkShip.cells.includes(h.i)) h.sunk = true;
        // Ships don't touch, so the ring around a sunk ship is water.
        for (const c of sunkShip.cells) {
          const r = Math.floor(c / N), cc = c % N;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inside(r + dr, cc + dc)) shot.add(idx(r + dr, cc + dc));
        }
      }
    }
    return { pick, record, shot };
  }

  function fire(fleet, i) {
    const s = fleet.owner[i];
    if (s < 0) return { hit: false };
    const ship = fleet.ships[s];
    ship.hits++;
    if (ship.hits === ship.len) ship.sunk = true;
    return { hit: true, sunk: ship.sunk ? ship : null };
  }
  const fleetDead = fleet => fleet.ships.every(s => s.sunk);
  const aiShots = alarm => 1 + Math.floor(alarm / RULES.alarmPerShot);

  const API = { N, FLEET, RULES, idx, neighbors4, mulberry, placeFleet, pSilent, probe, makeGunner, fire, fleetDead, aiShots };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.QuattleEngine = API;
})(typeof window !== 'undefined' ? window : this);
