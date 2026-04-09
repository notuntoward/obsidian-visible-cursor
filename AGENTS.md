# Agent Instructions for obsidian-visible-cursor

## Critical: Block cursor rendering on hidden link syntax positions

When the Steady Links plugin is active with "keep links steady" enabled,
vertical movement (ArrowUp/ArrowDown) onto a line that starts with a wikilink
can leave the CM6 selection on a position inside hidden link syntax (e.g. the
`[` characters of `[[`).  At these positions:

- `coordsAtPos()` returns coordinates with ~1px width (collapsed syntax)
- The source document character at that position is `[` or `]` (hidden)
- Rendering that character inside the block cursor overlay produces a garbled
  glyph on top of the visible alias text

### The fix (in this plugin)

`main.ts` contains a min-width fallback in `buildMeasureReq()` that detects
when the measured character width is less than 50% of `defaultCharacterWidth`.
When this triggers:

1. It probes forward using `findNextRenderableCell()` to find the actual
   visible character's width and uses that instead of `defaultCharacterWidth`
2. It replaces `char` with `' '` (space) so the block cursor renders as a
   clean solid rectangle without a garbled hidden-syntax glyph

### The real fix (in Steady Links)

The proper fix is in the Steady Links plugin's `cursorCorrector`.  After
vertical motion, Obsidian normalises the cursor from `textFrom` (visible
alias start) back to `leading.from` (hidden `[[` syntax).  The Steady Links
suppression logic must redirect this back to `textFrom`, NOT stay at
`leading.from`.

If Steady Links is working correctly, the cursor never lands on hidden
syntax, so the min-width fallback in this plugin never fires.  The fallback
exists as a safety net for the case where Steady Links is not installed or
has a regression.

### What NOT to do

- Do NOT try to fix this by remapping `visualPos` to a different source
  position in the measurement code.  That approach was tried 3 times and
  each time it garbled the rendered character or broke the cursor position.
- Do NOT remove the min-width fallback or the `char = ' '` replacement.
  They are the safety net that prevents garbled rendering if Steady Links
  regresses.
- Do NOT add code that detects whether Steady Links is installed.  The
  plugin must work identically with and without Steady Links.

### How to verify

The Vitest suite (`npm run test:run`) must pass all 145+ tests.
The Playwright suite (`npm run test:browser`) must pass all 3+ tests.

To test in real Obsidian with Steady Links active:

```markdown
(blank line)
[[test-notes/Note-09.md#Note Nine |Wote Nine]]
(blank line)
```

1. Enable block cursor in this plugin's settings
2. Enable "keep links steady" in Steady Links settings
3. Put cursor on the blank line above the wikilink, press ArrowDown
4. The block cursor should correctly cover the first visible alias character
   (`W`) with no garbling
5. A single ArrowRight should move to the second visible character
6. ArrowUp from the blank line below should produce the same result
7. Check DevTools console for `cursor-measure:min-width-fallback` — if this
   log appears, Steady Links is NOT correctly redirecting to textFrom and
   has regressed

## Testing infrastructure

- **Vitest** (`npm run test:run`): 145+ unit tests for settings, color,
  flash, navigation state
- **Playwright** (`npm run test:browser`): 3+ browser tests using a real
  CM6 editor with `CustomCursorViewPlugin`
- **Vitest config** (`vitest.config.ts`): aliases `obsidian` to mock and
  `../main` to source `main.ts` (not built `main.js`)
- **Vite config** (`vite.config.ts`): same `obsidian` alias for Playwright
  browser harness

### Import resolution

The `../main` import in `tests/homeNavigation.test.ts` resolves to `main.ts`
via the Vitest alias in `vitest.config.ts`.  Do NOT change this import to
`../main.ts` (breaks `tsc`) or `../main.js` (breaks Vitest aliasing).
