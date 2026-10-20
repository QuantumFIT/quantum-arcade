# Quantum Arcade

Classic computer games rebuilt around quantum mechanics: superposition, phase flips, entanglement, measurement and tunneling, each turned into a game mechanic. Every game is a static page with no build step: plain HTML, CSS and canvas JavaScript.

**Play:** <https://quantum.fit.vut.cz/quantum-arcade/>

| Game | Folder | Quantum twist |
|---|---|---|
| **Quak-Man** | [`quak-man/`](quak-man/) | Pac-Man: superposed mirrored copies, Z gates that flip ghosts to edible `|−⟩`, entangled ghost pairs, Schrödinger's Clyde, EPR portals, tunneling |
| **Quetris** | [`quetris/`](quetris/) | Tetris: pieces superposed over two shapes that collapse on contact, `|−⟩` antimatter that annihilates blocks, entangled piece pairs, tunneling |
| **MineQueeper** | [`minequeeper/`](minequeeper/) | Minesweeper: numbers are expectation values, superposed and entangled mines, anti-mines that count −1, a measurement tool |
| **Breaquot** | [`breaquot/`](breaquot/) | Breakout: the ball is a wave packet split by beam splitters and steel barriers it can tunnel through, phase plates, interference, a paddle that measures |
| **Hexxaqon** | [`hexxaqon/`](hexxaqon/) | Hexxagon: pieces split into superpositions that collapse when observed (and capture on landing), interference, entangled clones, Z-shields; vs. an expectation-value AI or a friend |
| **Lights Qout** | [`lights-qout/`](lights-qout/) | Lights Out logic puzzle: every cell is a qubit in `|0⟩ |1⟩ |+⟩ |−⟩`; X and Z presses act on crosses, Hadamards on single cells; 16 levels plus endless random puzzles |
| **Qunairo** | [`qunairo/`](qunairo/) | Takuzu/Binairo logic puzzle that grows from 0/1 bits to the six Bloch-sphere poles: every row and column balanced on every axis, overlap clues ○ ● ◐ between neighbours, honest measurement hints; 18 deduction-checked levels plus random ones |
| **Qu2048** | [`qu2048/`](qu2048/) | 2048 with phases: equal tiles with the same phase merge, opposite phases annihilate; Z tiles flip a tile's phase and H tiles split it into `|v⟩` and `−|v⟩` |
| **Quattleship** | [`quattleship/`](quattleship/) | Battleship with the Elitzur–Vaidman bomb tester: Zeno probes of N steps detect ships without touching them with probability `cos²ᴺ(π/2N)`; absorbed photons raise the alarm and the enemy's rate of fire |

Each game's page lists its full rules and controls in a side panel.

Every page is available in **English and Czech**. Use the CS/EN switch in the top-right corner, or add `?lang=cs` / `?lang=en` to a link.

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Layout

- `index.html` is the arcade landing page.
- Each game lives in its own folder (`index.html`, `style.css`, `game.js`, `favicon.svg`) and links back to the arcade.
- `i18n.js` is the shared language switch. Each page loads its own Czech dictionary from `i18n.cs.js` first:
  - Static text is marked with `data-i18n="key"`.
  - Script text goes through `QA.t('English text', {vars})`.
  - `QA.onChange(fn)` lets a page redraw text it generated itself.
- To add a game, create a new folder, add a card for it to `index.html`, and include its `i18n.cs.js` together with `../i18n.js`.

## Deploying

GitHub Pages serves the repository root from `master` (**Settings → Pages → Deploy from a branch**, then `master` and `/ (root)`). `.nojekyll` turns off Jekyll processing.
