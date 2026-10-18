'use strict';
/*
 * Qunairo engine: rules, a deduction-only solver and a puzzle generator.
 * Shared by the page (window.QunairoEngine) and the offline level builder
 * (module.exports).
 *
 * States 0..5 are the six Bloch-sphere poles:
 *   0 |0⟩ (+Z)  1 |1⟩ (−Z)  2 |+⟩ (+X)  3 |−⟩ (−X)  4 |+i⟩ (+Y)  5 |−i⟩ (−Y)
 * Rules for a solved n×n grid:
 *   1. Balance: in every row and column, each axis has as many + as − poles.
 *   2. No three identical states next to each other in a row or column.
 *   3. Edge clues give the overlap |⟨a|b⟩|² of two neighbours:
 *      1 = identical, 0 = opposite (same axis), ½ = unbiased (different axes).
 */
(function (root) {
  const SAME = 1, OPP = 0, HALF = 2;
  const axis = s => s >> 1;
  const rel = (a, b) => (a === b ? SAME : axis(a) === axis(b) ? OPP : HALF);
  const bit = s => 1 << s;
  const popcount = m => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
  const only = m => 31 - Math.clz32(m);

  // COMPAT[v][r]: mask of states w with rel(v, w) === r.
  const COMPAT = [];
  for (let v = 0; v < 6; v++) {
    COMPAT[v] = [0, 0, 0];
    for (let w = 0; w < 6; w++) COMPAT[v][rel(v, w)] |= bit(w);
  }

  const geomCache = {};
  function geometry(n) {
    if (geomCache[n]) return geomCache[n];
    const edges = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n - 1; c++) edges.push([r * n + c, r * n + c + 1]);
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n; c++) edges.push([r * n + c, (r + 1) * n + c]);
    const lines = [];
    for (let r = 0; r < n; r++) lines.push([...Array(n).keys()].map(c => r * n + c));
    for (let c = 0; c < n; c++) lines.push([...Array(n).keys()].map(r => r * n + c));
    const triples = [];
    for (const L of lines) for (let k = 0; k + 2 < n; k++) triples.push([L[k], L[k + 1], L[k + 2]]);
    const cellLines = [...Array(n * n)].map(() => []);
    lines.forEach((L, li) => L.forEach(i => cellLines[i].push(li)));
    const cellTriples = [...Array(n * n)].map(() => []);
    triples.forEach(T => T.forEach(i => cellTriples[i].push(T)));
    const cellEdges = [...Array(n * n)].map(() => []);
    edges.forEach(([a, b], e) => { cellEdges[a].push([b, e]); cellEdges[b].push([a, e]); });
    return (geomCache[n] = { n, edges, lines, triples, cellLines, cellTriples, cellEdges });
  }

  // Could cell i take value v, given the current domains? Only necessary
  // conditions are checked, so a "no" is always a sound deduction.
  function consistent(G, dom, clue, i, v) {
    for (const [j, e] of G.cellEdges[i]) {
      const r = clue[e];
      if (r !== undefined && !(dom[j] & COMPAT[v][r])) return false;
    }
    const b = bit(v);
    for (const T of G.cellTriples[i]) {
      let same = 0;
      for (const k of T) if (k === i || dom[k] === b) same++;
      if (same === 3) return false;
    }
    for (const li of G.cellLines[i]) {
      const diff = [0, 0, 0];
      let free = 0;
      const canFix = [0, 0, 0, 0, 0, 0];
      for (const k of G.lines[li]) {
        const m = k === i ? b : dom[k];
        if (popcount(m) === 1) {
          const s = only(m);
          diff[axis(s)] += s & 1 ? -1 : 1;
        } else {
          free++;
          for (let s = 0; s < 6; s++) if (m & bit(s)) canFix[s]++;
        }
      }
      let need = 0;
      for (let a = 0; a < 3; a++) {
        const d = diff[a];
        if (d > 0 && canFix[2 * a + 1] < d) return false;
        if (d < 0 && canFix[2 * a] < -d) return false;
        need += Math.abs(d);
      }
      if (need > free || (free - need) % 2) return false;
    }
    return true;
  }

  // Remove every value that fails `consistent`, until nothing changes.
  function propagate(G, dom, clue) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < dom.length; i++) {
        const m = dom[i];
        if (popcount(m) <= 1) continue;
        let keep = m;
        for (let v = 0; v < 6; v++) if ((m & bit(v)) && !consistent(G, dom, clue, i, v)) keep &= ~bit(v);
        if (keep !== m) {
          dom[i] = keep;
          changed = true;
          if (!keep) return false;
        }
      }
    }
    return true;
  }

  function mulberry(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // A random solved grid using only the states in `palette`.
  function randomSolution(n, palette, rng) {
    const G = geometry(n);
    const pal = palette.reduce((m, s) => m | bit(s), 0);
    for (let attempt = 0; attempt < 200; attempt++) {
      const dom = Array(n * n).fill(pal);
      let steps = 0;
      const fill = i => {
        if (i === n * n) return true;
        if (++steps > 20000) return false;
        for (const v of shuffle([...palette], rng)) {
          if (!(dom[i] & bit(v))) continue;
          const saved = dom[i];
          dom[i] = bit(v);
          if (consistent(G, dom, [], i, v) && fill(i + 1)) return true;
          dom[i] = saved;
        }
        return false;
      };
      if (fill(0)) {
        const sol = dom.map(only);
        // Prefer grids that really use every axis of the palette in each line.
        const axes = new Set(palette.map(axis));
        const mixed = G.lines.every(L => axes.size === 1 || new Set(L.map(i => axis(sol[i]))).size > 1);
        if (mixed || attempt > 40) return sol;
      }
    }
    throw new Error('no solution grid');
  }

  function initialDomains(n, palette, sol, givens) {
    const pal = palette.reduce((m, s) => m | bit(s), 0);
    const dom = Array(n * n).fill(pal);
    for (const i of givens) dom[i] = bit(sol[i]);
    return dom;
  }
  function clueArray(G, sol, shown) {
    const clue = [];
    for (const e of shown) clue[e] = rel(sol[G.edges[e][0]], sol[G.edges[e][1]]);
    return clue;
  }
  function deducible(n, palette, sol, givens, shown) {
    const G = geometry(n);
    const dom = initialDomains(n, palette, sol, givens);
    if (!propagate(G, dom, clueArray(G, sol, shown))) return false;
    return dom.every((m, i) => m === bit(sol[i]));
  }

  // Start from every given and every edge clue, then drop clues one by one
  // while the deduction-only solver can still solve the puzzle.
  function makePuzzle(n, palette, seed, opts = {}) {
    const rng = mulberry(seed);
    const G = geometry(n);
    const sol = randomSolution(n, palette, rng);
    const givens = new Set(sol.keys());
    const shown = new Set(G.edges.keys());
    const gList = shuffle([...givens], rng), eList = shuffle([...shown], rng);
    // 'givens' first gives relation-heavy puzzles, 'mix' keeps some of both.
    const G2 = gList.map(g => ['g', g]), E2 = eList.map(e => ['e', e]);
    const order = opts.order === 'mix' ? shuffle([...G2, ...E2], rng) : [...G2, ...E2];
    for (const [kind, x] of order) {
      const set = kind === 'g' ? givens : shown;
      set.delete(x);
      if (!deducible(n, palette, sol, givens, shown)) set.add(x);
    }
    return { n, palette, sol, givens: [...givens].sort((a, b) => a - b), edges: [...shown].sort((a, b) => a - b) };
  }

  // Compact level strings: "n|palette|solution|givens|edges", where givens
  // and edges are lists of indices in base 36.
  function encode(p) {
    return [p.n, p.palette.join(''), p.sol.join(''), p.givens.map(x => x.toString(36)).join('.'), p.edges.map(x => x.toString(36)).join('.')].join('|');
  }
  function decode(str) {
    const [n, pal, sol, g, e] = str.split('|');
    const list = s => (s ? s.split('.').map(x => parseInt(x, 36)) : []);
    return { n: +n, palette: [...pal].map(Number), sol: [...sol].map(Number), givens: list(g), edges: list(e) };
  }

  // Rule violations in a (partially) filled grid, for live feedback.
  function violations(n, grid, sol, edges) {
    const G = geometry(n);
    const badCells = new Set(), badLines = new Set(), badEdges = new Set();
    for (const T of G.triples) {
      const [a, b, c] = T;
      if (grid[a] >= 0 && grid[a] === grid[b] && grid[b] === grid[c]) T.forEach(i => badCells.add(i));
    }
    G.lines.forEach((L, li) => {
      if (L.some(i => grid[i] < 0)) return;
      const d = [0, 0, 0];
      for (const i of L) d[axis(grid[i])] += grid[i] & 1 ? -1 : 1;
      if (d.some(x => x)) badLines.add(li);
    });
    for (const e of edges) {
      const [a, b] = G.edges[e];
      if (grid[a] >= 0 && grid[b] >= 0 && rel(grid[a], grid[b]) !== rel(sol[a], sol[b])) badEdges.add(e);
    }
    return { badCells, badLines, badEdges };
  }

  const API = {
    SAME, OPP, HALF, axis, rel, geometry, propagate, consistent, makePuzzle, deducible,
    encode, decode, violations, mulberry, randomSolution,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.QunairoEngine = API;
})(typeof window !== 'undefined' ? window : this);
