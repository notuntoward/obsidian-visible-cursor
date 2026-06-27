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

## Critical: Agent Manager worktree builds are invisible to the vault
symlink

When Kilo spins up Agent Manager sessions in `worktree` mode, the new
worktree lives under `.kilo/worktrees/<name>/` as a separate git
worktree with its own `main.js`. The Obsidian vault's symlink at
`.obsidian/plugins/visible-cursor` points to the main checkout
(`~/repos/obsidian-visible-cursor/`), so Obsidian continues to load the
old `main.js` after a worktree build.

The same class of bug happens with any other git worktree outside the
main checkout — the build happened in a different directory, so the
canonical `main.js` is stale.

### How to avoid confusing the user when asking to test in Obsidian

1. **Print the exact filesystem path of the built `main.js`** before
   every "reload the plugin in Obsidian" instruction, so the user can
   verify Obsidian is loading what they expect. Example:

   > Reload Visible Cursor in Obsidian. The fresh `main.js` is at:
   > `C:\Users\scott\repos\obsidian-visible-cursor\.kilo\worktrees\foo\main.js`

2. **Unit-test and browser-test from the worktree as normal** (Vitest
   and Playwright resolve to `main.ts`; they are unaffected by the
   vault symlink). Reserve **real-Obsidian testing** for after one of:
   - **Agent Manager Apply** lands worktree changes in the main repo,
     followed by `npm run build` in the main checkout, OR
   - **Re-linking the vault symlink** to the worktree:
     ```powershell
     Remove-Item -LiteralPath "$env:USERPROFILE\...\.obsidian\plugins\visible-cursor"
     New-Item -ItemType Junction `
              -Path "$env:USERPROFILE\...\.obsidian\plugins\visible-cursor" `
              -Target "$env:USERPROFILE\repos\obsidian-visible-cursor\.kilo\worktrees\<name>"
     ```

3. **Prefer `local` mode for Agent Manager fan-outs** when isolation
   is not required. Local-mode sessions share the checkout directory,
   so the existing vault symlink always resolves to fresh changes.
   Use `worktree` mode only when session isolation is necessary
   (conflicting edits, multi-branch experiments).

### What NOT to do

- Do NOT ask the user to "reload the plugin in Obsidian" after a
  worktree build without first confirming what path Obsidian is
  actually loading from.
- Do NOT silently build in a worktree and assume the vault picked up
  the change.
- Do NOT assume `npm run build` in the worktree automatically updated
  `main.js` at the canonical path visible to the vault.
