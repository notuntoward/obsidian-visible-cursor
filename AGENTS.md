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
2. It extracts the actual visible character and styling from `visibleCell`
   (falling back to `' '` only if no visible cell is found) so the block cursor
   renders the first visible character cleanly without blotting it out with an
   empty block or rendering a garbled hidden-syntax glyph
3. It snaps `coordsLeft = cellLeft.left`, `coordsTop = cellLeft.top`, and
   `coordsBottom = cellLeft.bottom` to the visible cell's coordinates so the
   block cursor overlay begins at the visible character, not at the collapsed
   1px syntax anchor.

## Critical: Default CodeMirror cursor suppression (`.cm-cursor` peeking out)

CodeMirror 6 renders its default blinking cursor (`.cm-cursor`) inside
`.cm-cursorLayer` independently of native CSS `caret-color`. When Steady Links
collapses wikilink syntax, it places a 1px inline anchor widget immediately
before the visible alias. When the cursor lands on collapsed syntax, CodeMirror
positions `.cm-cursor` at that 1px anchor—just to the left of the visible alias.

If `.cm-cursorLayer` is not suppressed, the default blinking cursor peeks out on
the left edge of the custom block cursor.

### Mandatory Cursor Suppression Invariants

1. **Extension BaseTheme (`createCursorSuppressionTheme`)**:
   Registered via `EditorView.baseTheme` in `registerEditorExtension`. Hides
   `&.visible-cursor-hide-default .cm-cursorLayer, .cm-cursor, .cm-dropCursor`
   (`display: none !important; opacity: 0 !important; visibility: hidden !important;`).
   Using `baseTheme` ensures community themes and CSS snippets cannot override it.
2. **Global CSS (`styles.css`)**:
   Applies `.visible-cursor-hide-default .cm-cursorLayer` and
   `.cm-editor:has(.visible-cursor-hide-caret) .cm-cursorLayer` rules as a
   zero-delay defense before CM6 extensions mount.
3. **DOM Class Lifecycle in `CustomCursorViewPlugin.write()`**:
   When `measure` is active, adds `visible-cursor-hide-default` to `view.dom`
   and `visible-cursor-hide-caret` to `view.contentDOM`. When `measure` is
   null, on blur, destroy, or plugin unload, removes both classes so the
   native editor cursor is cleanly restored.

### The real fix (in Steady Links)

The proper fix for vertical motion is in the Steady Links plugin's
`cursorCorrector`.  After vertical motion, Obsidian normalises the cursor from
`textFrom` (visible alias start) back to `leading.from` (hidden `[[` syntax).
The Steady Links suppression logic redirects this back to `textFrom`.

However, on HOME and Emacs `moveToBeginning`, Steady Links intentionally places
the cursor at `span.leading.from` (column 0) so that line-kill commands
(`kill-line`, etc.) operate on column 0.  In that case, the cursor sits on
collapsed syntax at the line start, and this fallback cleanly renders the first
visible alias character inside the block cursor overlay.

### What NOT to do

- Do NOT try to fix this by remapping `visualPos` to a different source
  position in the measurement code.  That approach was tried 3 times and
  each time it garbled the rendered character or broke the cursor position.
- Do NOT remove the min-width fallback.  It is the safety net that prevents
  garbled rendering or blotting out the first visible character.
- Do NOT add code that detects whether Steady Links is installed.  The
  plugin must work identically with and without Steady Links.
- Do NOT remove `createCursorSuppressionTheme()`, `.visible-cursor-hide-default`,
  or the `.cm-cursorLayer` rules in `styles.css`. Relying only on `caret-color:
  transparent` does not suppress CodeMirror's `.cm-cursor`.
- Do NOT skip snapping `coordsLeft = cellLeft.left` when `visibleCell` is
  found; using `rawCoords.left` shifts the block cursor onto the collapsed
  anchor widget and creates a 1px boundary gap.

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

## Note: worktree builds (Agent Manager) and the vault junction

Visible Cursor also ships a pre-built `main.js` that the vault loads via a
junction at `<vault>/.obsidian/plugins/visible-cursor` pointing to the main
checkout, so builds inside a git worktree are not automatically visible.

For the workflow and the shared relink script, see the global rule in
`~/.config/kilo/AGENTS.md` under *When building an Obsidian plugin inside a
git worktree*.  The script at `$env:USERPROFILE\.config\kilo\tools\obsidian-relink.ps1`
re-points the vault junction in one command; do not ask the user to do
the delete/re-create manually.
