'use strict';
/*
 * Personal records for the whole quantum arcade, kept in this browser only.
 *
 * Every record is { v, mode, at }:
 *   mode 'max': higher is better (scores)
 *   mode 'min': lower is better (times, turns)
 *   mode 'add': a running counter (wins, games)
 * QR.set(game, key, value, mode) returns true when a max/min record was beaten.
 * QR.exportJSON()/QR.importJSON(text) move records between devices; importing
 * keeps the better value of each record (and the larger counter), so
 * importing the same file twice changes nothing.
 * Older per-game keys (e.g. 'quakman-high') are merged in on every load.
 */
(() => {
  const STORE = 'qa-records';
  const FORMAT = 'quantum-arcade-records';
  let data = {};

  function load() {
    try { data = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { data = {}; }
    if (typeof data !== 'object' || Array.isArray(data)) data = {};
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const beats = (mode, cur, v) => (mode === 'min' ? v < cur : v > cur);

  function put(game, key, value, mode, at) {
    if (typeof value !== 'number' || !isFinite(value)) return false;
    if (mode === 'max' && value <= 0) return false;
    const g = data[game] || (data[game] = {});
    const cur = g[key];
    if (mode === 'add') {
      g[key] = { v: (cur ? cur.v : 0) + value, mode, at: at || today() };
      return false;
    }
    if (cur && !beats(mode, cur.v, value)) return false;
    g[key] = { v: value, mode, at: at || today() };
    return true;
  }

  function set(game, key, value, mode = 'max') {
    load();
    const fresh = put(game, key, value, mode);
    save();
    return fresh;
  }

  function get(game, key) {
    load();
    return data[game] && data[game][key] ? data[game][key].v : undefined;
  }

  function merge(other) {
    let changed = 0;
    for (const game of Object.keys(other || {})) {
      const recs = other[game];
      if (!recs || typeof recs !== 'object') continue;
      for (const key of Object.keys(recs)) {
        const r = recs[key];
        if (!r || typeof r.v !== 'number' || !isFinite(r.v) || !['max', 'min', 'add'].includes(r.mode)) continue;
        const g = data[game] || (data[game] = {});
        const cur = g[key];
        const take = !cur || (r.mode === 'add' ? r.v > cur.v : beats(r.mode, cur.v, r.v));
        if (take) { g[key] = { v: r.v, mode: r.mode, at: typeof r.at === 'string' ? r.at.slice(0, 10) : today() }; changed++; }
      }
    }
    return changed;
  }

  function exportJSON() {
    load();
    return JSON.stringify({ format: FORMAT, version: 1, exported: new Date().toISOString(), records: data }, null, 2);
  }
  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.format !== FORMAT) throw new Error('not a quantum arcade records file');
    load();
    const n = merge(parsed.records);
    save();
    return n;
  }
  function clear() {
    data = {};
    save();
  }

  // Scores saved by the games before this module existed.
  function migrate() {
    const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const json = k => { try { return JSON.parse(read(k) || 'null'); } catch (e) { return null; } };
    for (const [k, game] of [['quakman-high', 'quak-man'], ['quetris-high', 'quetris'], ['breaquot-high', 'breaquot'], ['qu2048-best', 'qu2048']]) {
      const v = +read(k);
      if (v > 0) put(game, 'highScore', v, 'max');
    }
    const mq = json('minequeeper-best');
    if (mq) for (const d of ['easy', 'normal', 'hard']) if (typeof mq[d] === 'number') put('minequeeper', 'bestTime.' + d, mq[d], 'min');
    for (const [k, game] of [['lightsqout-progress', 'lights-qout'], ['qunairo-progress', 'qunairo']]) {
      const p = json(k);
      if (!p) continue;
      const levels = Object.values(p).filter(x => x && typeof x.stars === 'number');
      if (!levels.length) continue;
      put(game, 'stars', levels.reduce((s, x) => s + x.stars, 0), 'max');
      put(game, 'solved', levels.length, 'max');
    }
  }

  load();
  migrate();
  save();
  window.QR = { set, get, all: () => (load(), JSON.parse(JSON.stringify(data))), exportJSON, importJSON, clear };
})();
