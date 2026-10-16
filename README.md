# Quak-Man

A quantum version of Pac-Man that runs in the browser. It's a static page with no build step: plain HTML, CSS and a single canvas script.

## Play

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

**Controls:** arrows/WASD (swipe on touch) to move · `Space` to measure · `T` to tunnel · `P` to pause · `M` to mute

## Quantum mechanics

| Feature | In the game |
|---|---|
| **Superposition** (H gate, cyan) | You split into `(|L⟩+|R⟩)/√2`: two copies, mirrored across the maze. The mirror copy moves with mirrored left/right controls, and both copies eat dots. After 10 s the state decoheres and collapses at random. |
| **H·H = I** | Eating a second H while superposed interferes you back into the original branch, deterministically. |
| **Measurement** | When a `|+⟩` ghost touches one of your copies, the wavefunction collapses. With 50% chance you were in the other copy and survive. `Space` measures on demand. |
| **Phase flip** (Z gate, magenta) | Ghosts go `|+⟩ → |−⟩`, and `|−⟩` ghosts are edible. Z is its own inverse, so it also flips `|−⟩` ghosts back to `|+⟩`. Over time, `|−⟩` ghosts decohere back to `|+⟩`. |
| **Destructive interference** | When a `|+⟩` ghost and a `|−⟩` ghost collide, both annihilate (+600). |
| **Entanglement** | Ghosts come in Bell pairs (Blinky–Inky and Pinky–Clyde), drawn with a wavy link. Eat one and its partner collapses too ("spooky action"). |
| **Schrödinger's ghost** | Clyde splits into two places while unobserved. Line of sight collapses him at random, and touching an unobserved copy has a 50% chance that "nobody's home". |
| **EPR portals** | Opposite corners of the maze are entangled teleporters. |
| **Quantum tunneling** | `T` makes you pass through a wall of thickness `w` with probability `e^(−0.6·w)`. You get 3 tries per level, and when superposed each copy tries on its own. |

## Deploying to GitHub Pages

In the repository settings, go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, then pick `master` and `/ (root)`. The site will be published at <https://ondrik.github.io/Quak-Man/>.
