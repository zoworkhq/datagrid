# Accessibility — what is qualified, and what is not

**Status:** partial. Structural conformance is automated and gated. Assistive
technology qualification has not been done.

This document exists because "ARIA exists" is not the same claim as "this works
with a screen reader", and a library aimed at an all-day clinical surface should
not let a reader confuse the two. Everything below is either measured in CI or
listed as absent.

---

## What is automated, and where

| Check | Where | Runs on |
| --- | --- | --- |
| Structural axe (roles, required children, names) | `packages/grid-dom/src/a11y.test.ts` | every commit |
| One ARIA tree, compared across adapters | `packages/grid-element/src/parity.test.tsx`, `packages/grid-angular/src/parity.test.ts` | every commit |
| Exactly one tab stop in the body | unit + real browser | every commit |
| Absolute `aria-rowindex` / `aria-colindex` under virtualisation | unit + real browser | every commit |
| `aria-rowcount="-1"` for an unknown total | unit + real browser | every commit |
| Every advertised key binding does something | `packages/grid-dom/src/bindings.test.ts` | every commit |
| Real key presses, real focus ring, real browser | `examples/playground/smoke.browser.mjs` | every commit |
| Focus stays inside the viewport when it travels | smoke, at 250 columns | every commit |
| Focus survives recycling and horizontal scroll | unit + real browser | every commit |

The browser suite is Chromium. It presses keys through the browser's own
dispatch rather than synthesising events at a node it focused itself — a
distinction that has mattered here: a binding can be "handled" in a unit test
and unreachable in a browser.

---

## What is NOT covered

These are absent, not failing. Nothing in CI tests any of them.

### Assistive technology

No screen reader has been run against this library. The
NVDA / JAWS / VoiceOver × Chromium / Firefox / WebKit matrix is nine
combinations and **zero have been qualified.** Announcement order, the live
region's behaviour under a rapid update feed, and how each reader handles a
virtualised `role="grid"` with an unknown row count are all unknown.

This is the single largest gap, and it is the one that governs leaving
`experimental`.

### Anything that needs layout

jsdom has no layout, so every rule that depends on geometry is unrun by the unit
suite. The browser suite has layout but does not assert these:

- **Colour contrast.** The theme is designed against the brief's tokens and the
  smoke test asserts the chrome carries no hue, which is not a contrast ratio.
- **Target size.** The drag handle is 9px wide. That is almost certainly below
  the 24px minimum for a pointer target, and it has a keyboard equivalent
  (`Control+Shift+Arrow`) rather than a measurement.
- **Focus not obscured.** A pinned column is `position: sticky` with a z-index
  above the scrolling cells. Whether a focused cell can end up *behind* one at
  some scroll position has been reasoned about and not tested.

### Display and input conditions

- **Forced colours / high contrast.** Untested. The pinned-column background is
  a token, and a forced-colours mode will replace it — whether the frozen edge
  survives that is unknown.
- **Zoom to 400% and reflow.** Untested.
- **`prefers-reduced-motion`.** The grid animates almost nothing; the drag
  indicator has a 120ms opacity transition that does not respect it.
- **Touch and pointer-coarse.** The drag handles are pointer-driven with
  `touch-action: none`. Not tested on a touch device.
- **Voice control.** Untested.

---

## What a consumer should do

1. **Do not treat the automated checks as a conformance claim.** They are a
   regression guard on structure.
2. **Qualify the combinations you actually support**, and publish that list.
   Two screen readers on one engine is a stronger claim than nine untested.
3. **Own the contrast.** The library ships tokens, not a palette; the ratios are
   whatever your theme makes them.
4. **Re-check target sizes** if you enable drag-to-resize, and keep the keyboard
   route available — it is not a fallback, it is the primary route for anyone
   who cannot drag.

---

## How to close it

This is planned work, not a discovery. In rough order of value:

1. A manual pass with one screen reader on one engine, written up as a matrix
   with the failures listed. One qualified combination beats nine assumed ones.
2. Contrast and target-size checks in the browser suite, where layout exists.
3. Forced-colours and 400% zoom passes, which need a human looking.
4. The remaining reader × engine combinations, prioritised by what consumers
   actually deploy.

Until step 1 is done, this library should be described as having a **tested
accessibility structure and an unqualified assistive-technology story**, and any
document that says otherwise is wrong.
