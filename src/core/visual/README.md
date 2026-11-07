# Generated visual bonuses

At the NSB Finals, some double elimination rounds use visual bonuses: the bonus comes with a figure (on a monitor,
or on a worksheet in earlier elimination matches), and the team has 30 seconds, with the warning at 25, for the
captain to begin the answer (2027 Rules 5-1, 5-4, 5-5). DOE publishes no samples, so Rebound generates practice
visual bonuses from templates. Each template draws an SVG figure and asks a bonus question about it whose answer
the code computes exactly.

```
types.ts        VisualTemplate and VisualDraft: what a template is and what it returns
rng.ts          seeded random numbers: the only source of randomness a template may use
svg.ts          figure building blocks: figure(), line(), text(), arrow(), angleArc(), plane() for graphs, ...
exact.ts        exact answers: fractionText(), radicalText(), piText(), decimalText()
choices.ts      multipleChoice() and orderedChoices() for W–Z options
index.ts        the registry, question ids ("vis-<template id>-<seed>") and draftToQuestion()
testkit.ts      checkTemplate(): the checks every template must pass
templates/      one file per subject, each exporting its templates; tests next to them
```

## Rules for a template

1. **Ids are forever.** `id` is `"<subject>-<name>"` (for example `physics-resistor-network`). Question ids contain it and
   review cards keep them, so never rename, reuse or delete a template id. To change what a template produces,
   add a new template and stop listing the old one only if you must (old ids then stop resolving).
2. **Deterministic.** `make(rng)` uses only `rng` for randomness (no `Math.random`, no dates). The same seed
   must give the same figure, question and answer on every device.
3. **The figure carries the information.** As in a real visual bonus, the numbers or features needed for the
   answer are in the figure, and the stem asks about it ("In ohms, what is the equivalent resistance between
   points A and B?"). A stem that restates everything makes the figure decoration. Keep stems short and
   readable aloud (400 characters at most).
4. **One unambiguous answer**, scientifically right. Double-check the science, conventions and edge cases
   (degenerate shapes, a value of 0, a figure that could be read two ways). DOE conventions apply (2027 Rules,
   Appendix): g = 9.8 m/s², c = 3 × 10⁸ m/s, speed of sound 340 m/s, angles in radians unless degrees are
   stated, fair coins and dice.
5. **Answers in NSB's exact, simplest form** (Rule A-2): integers as integers; reduced fractions (use
   `fractionText`), not repeating decimals; simplified, rationalized radicals (`radicalText`); multiples of π
   (`piText`); no scientific notation unless asked. Prefer whole-number or short exact answers. Put the unit in
   the stem ("in meters per second") and give a bare number as the answer: units are optional for the team,
   and the checker refuses a wrong unit.
6. **Words in capitals, as DOE prints them** ("WAXING GIBBOUS", "CUMULONIMBUS"), with an `accept` list for
   other correct forms (a symbol for an element, a common name). The checker does not drop extra words
   ("cumulonimbus clouds" does not match "CUMULONIMBUS"), so add such variants to `accept`, or ask
   identification questions as multiple choice.
7. **Multiple choice** uses `multipleChoice()` (or `orderedChoices()` for numbers). Distractors are plausible
   and clearly wrong; never two right answers. Choice texts are short, in sentence case.
8. **Figures** use `figure(480, h)` with `h` between 240 and 420, and the helpers in `svg.ts`. Lines and text in
   `INK` (currentColor) so figures work in light and dark mode and print in black; `ACCENT` for the single
   thing the question points at; shaded regions with `SOFT` opacity. Text at least 13 units high (figures shrink
   to about 340 pixels wide on a phone). Keep labels clear of lines and of each other. Figures need not be to
   scale (Rule A-1 g), but draw them roughly to scale so they never mislead.
9. **Alt text** says what the figure shows for a screen reader, without giving the answer.
10. **Topic**: set `topic` to the matching topic id in `src/core/taxonomy.ts` (same subject).

## Checking a template

- `templates/<subject>.test.ts` runs `checkTemplate()` on every template: determinism, the printed answer
  (and each accepted answer) graded correct by the answer checker, choices, well-formed and safe SVG, alt text,
  variety over 80 seeds. Add focused tests for anything computed (a few fixed cases worked out by hand).
- Look at the figures: `npx tsx scripts/checks/visual-gallery.ts <out dir> <template id prefix> [samples]` renders
  each template's samples to a PNG (light mode, plus one in dark mode). Check every template this way.
