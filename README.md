# Quantum Arcade

Classic computer games rebuilt around quantum mechanics: superposition, phase flips, entanglement, measurement and tunneling, each turned into a game mechanic. Every game is a static page with no build step: plain HTML, CSS and canvas JavaScript.

**Play:** <https://ondrik.github.io/quantum-arcade/>

| Game | Folder | Quantum twist |
|---|---|---|
| **Quak-Man** | [`quak-man/`](quak-man/) | Pac-Man: superposed mirrored copies, Z gates that flip ghosts to edible `|−⟩`, entangled ghost pairs, Schrödinger's Clyde, EPR portals, tunneling |
| **Quetris** | [`quetris/`](quetris/) | Tetris: pieces superposed over two shapes that collapse on contact, `|−⟩` antimatter that annihilates blocks, entangled piece pairs, tunneling |
| **MineQueeper** | [`minequeeper/`](minequeeper/) | Minesweeper: numbers are expectation values, superposed and entangled mines, anti-mines that count −1, a measurement tool |
| **Breaquot** | [`breaquot/`](breaquot/) | Breakout: the ball is a wave packet split by beam splitters and steel barriers it can tunnel through, phase plates, interference, a paddle that measures |
| **Hexxaqon** | [`hexxaqon/`](hexxaqon/) | Hexxagon: pieces split into superpositions that collapse when observed (and capture on landing), interference, entangled clones, Z-shields; vs. an expectation-value AI or a friend |
| **Lights Qout** | [`lights-qout/`](lights-qout/) | Lights Out logic puzzle: every cell is a qubit in `|0⟩ |1⟩ |+⟩ |−⟩`; X and Z presses act on crosses, Hadamards on single cells; 16 levels plus endless random puzzles |

Each game's page lists its full rules and controls in a side panel.

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Layout

- `index.html` is the arcade landing page.
- Each game lives in its own folder (`index.html`, `style.css`, `game.js`, `favicon.svg`) and links back to the arcade.
- To add a game, create a new folder and add a card for it to `index.html`.

## Deploying

GitHub Pages serves the repository root from `master` (**Settings → Pages → Deploy from a branch**, then `master` and `/ (root)`). `.nojekyll` turns off Jekyll processing.
