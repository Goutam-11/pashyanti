# Pashyanti — Halftone Relay

A pixel-matrix (halftone dot screen) direction for the chat surface, built as
selectable HTML prototypes. Nothing here touches the app build; it is the
look we pick *before* `pashyanti/web/src` changes.

Open `chat-lab.html` first. It is the only file you need to judge the
direction; the other three sheets answer one question each.

| File | Answers |
|---|---|
| `chat-lab.html` | The whole screen, live: 3 variants, 6 palettes, 4 bubble treatments, real states. Start here. |
| `palettes.html` | Which colours. Six families with measured contrast, flip controls, drop-in CSS. |
| `bubbles.html` | How a line sits on the lattice. Ten treatments, buys/costs, a winner and a reject. |
| `backgrounds.html` | How much character the field carries. Six backgrounds in identical 430×760 frames. |

`chat-lab.css` holds every token and treatment; `chat-lab.js` is the fake call,
the state machine and the peacock renderer; `peacock-data.js` is generated from
`pashyanti/web/src/components/peacock.ts` (do not hand-edit).

## Using the lab

The panel on the right is a real Tweaks panel. Everything is live.

- **Variant** — A *Lattice* (paper, stepped corners), B *Signal* (dark, acid
  matrix, dissolve edges), C *Quiet* (light, indigo, ledger + Devanagari serif).
  Switching a variant also sets its palette, bubble treatment and background.
- **Palette** — six families, named after `palettes.html` where they match
  (Peacock Matrix, Chuna Lime-Wash, Indigo Resist, Monsoon Slate, Madder) plus
  one lab-only take, Ultraviolet. The ratio under the swatches is computed from
  the live CSS, not typed.
- **Dot pitch** — 4 / 6 / 8 / 10 px. The lattice, the mascot and the ghost all
  follow it.
- **Lattice** — faint, screen, bold. The screen is the designed strength;
  faint is for daylight legibility, bold for a poster.
- **Background** — dot peacock (stamped on the field's own grid), lattice only,
  dithered wash, off.
- **Bubbles** — stepped, dissolve, stamp, ledger.
- **Preview state** — live transcript, empty, missed segment, call summary.
- **Frame** — 430 phone or 780 wide (responsive proof).

Every knob is a URL too, so a direction can be shared:

```
chat-lab.html?v=c
chat-lab.html?v=b&palette=violet&bubbles=stair&bg=lattice&preview=empty
chat-lab.html?frame=wide
```

Two combinations the study sheets argue for:

- **Showpiece** (the demo frame): default `chat-lab.html` — Signal, dissolve
  edges, the dot peacock in the empty space below the words.
- **Product-safe**: `chat-lab.html?v=b&bubbles=stair&bg=lattice` — the same
  dark field with the stepped corners the bubble sheet picked, and the field
  carried by the lattice alone so no second peacock competes with Sakhi.

## Editing

- **Colours** live in one block per palette in `chat-lab.css`
  (`.app[data-palette="lime"] { ... }`). Ten tokens: field, panel, ink, ink-2,
  line, signal, accent, accent-ink, hot, cool. The palette sheet prints the
  same blocks ready to paste into `pashyanti/web/src/index.css`.
- **Bubble treatments** are one block each under the `Treatment:` comments in
  `chat-lab.css`; the stepped corner is generated in `stairPolygon()` in
  `chat-lab.js` so the steps stay 4 px at any text length.
- **The mascot** is not redrawn: `peacock-data.js` carries the exact traced
  paths from `peacock.ts`, and `drawMascot()` rasterises them to a dot screen
  at whatever size the layout asks for. Listening pulses the arcs, speaking
  swaps the beak for the mandibles, unsure shows the `?` disc — the shipped
  state rules, in dots.

## Measured, not guessed

- Text on its own ground: **8.6:1** minimum across the six palettes; reply
  text on the accent block: **7.3:1** minimum. The palette note recomputes on
  every switch.
- Caller text 23 px / 1.42, reply 22–23 px, metadata 9–10 px pixel caps,
  controls 44 px. Same floor as the product.
- The field is never behind a word: panels are opaque, so the lattice only
  reaches gutters. The one exception is the empty state, where the mascot is
  the art and the watermark is switched off.

## Not done yet

This is a prototype, not a port. Picking a direction is the next decision;
then the tokens move into `web/src/index.css`, the bubble rules into the
semantic classes there, and `Mascot.tsx` gains the dot renderer. No React
component has been changed in this worktree.
