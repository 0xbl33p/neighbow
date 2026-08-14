# NEIGHBOW 🦄🌈

*ride your own rainbow*

My entry for [js13kGames 2026](https://js13kgames.com/2026/) — theme: **Unicorns and Rainbows**.

A one-button endless gallop. Your unicorn's horn paints a rainbow into the sky **ahead** of you — and rainbows are solid. Paint a ramp, fall onto it, ride it, launch off the end. Chain it forever.

## How to play

- **HOLD** (tap / click / `Space` / `↑` / `W`) — fly upward while your horn beams a rainbow ribbon ahead of you
- **RELEASE** — fall. Land on the rainbow you just painted to **RIDE** it (×2 star score), and get flung off its end
- Painting drains your rainbow meter — refill it on grass or by catching **stars**
- Star combos build while you stay off the grass — riding keeps the chain alive
- Dodge the grumpy **storm clouds**, don't fall into the void
- `M` mutes

## Build

```
npm install
node build.mjs
```

Outputs `dist/index.html` (self-contained) and `dist/game.zip`. The zip is the competition package — currently well under the 13,312-byte limit.

`index.html` in the repo root runs the unminified source (`src/game.js`) directly for development.

## Tech

Vanilla JS, one canvas, zero dependencies at runtime. Canvas-drawn everything (unicorn, terrain, sky cycle), procedural WebAudio music and SFX. Minified with terser, packed with roadroller.

---

by [@0xbl33p](https://x.com/0xbl33p)
