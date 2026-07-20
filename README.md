# Visible Cursor

[![Build](https://github.com/notuntoward/obsidian-visible-cursor/actions/workflows/build.yml/badge.svg)](https://github.com/notuntoward/obsidian-visible-cursor/actions/workflows/build.yml)
[![CodeQL](https://github.com/notuntoward/obsidian-visible-cursor/actions/workflows/codeql.yml/badge.svg)](https://github.com/notuntoward/obsidian-visible-cursor/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://github.com/notuntoward/obsidian-visible-cursor/actions/workflows/scorecard.yml/badge.svg)](https://github.com/notuntoward/obsidian-visible-cursor/actions/workflows/scorecard.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/notuntoward/obsidian-visible-cursor/badge)](https://securityscorecards.dev/viewer/?uri=github.com/notuntoward/obsidian-visible-cursor)

Never lose your cursor again! Options for more visible cursors plus configurable cursor flashes after movement.

> **Note:** Screenshots and demo GIF will be added before the community plugin submission. See [`screenshots/README.md`](screenshots/README.md) for capture instructions.

<!-- TODO: Uncomment when screenshots are captured
![Plugin Demo](screenshots/demo.gif)
*Flash effects help you track cursor movement across your notes*
-->

## The Problem

Obsidian's default cursor can be difficult to track when:

- Scrolling through long documents
- Switching between notes or panes
- Working on large displays or with smaller text

## The Solution

**Visible Cursor** provides visual cues when your cursor moves, making it impossible to lose track of your position.

<!-- TODO: Uncomment when screenshots are captured
![Before and After](screenshots/before-after.png)
*Left: Default Obsidian cursor easily lost • Right: Visible Cursor with flash effect*
-->

## Visual Examples

### Custom Cursor Styles

<!-- ![Cursor Styles](screenshots/cursor-styles.png) -->
*Choose between block cursor (left) or bar cursor (right)*

### Line Highlight Options

<!-- ![Line Highlights](screenshots/line-highlights.png) -->
*Flash effects: Left-to-right, Centered, Right-to-left*

## Installation

### Manual Installation

Download the latest release from the [GitHub releases page](https://github.com/notuntoward/obsidian-visible-cursor/releases). Extract `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/visible-cursor/`, then reload Obsidian.

## Implementation Note for Reviewers

This plugin uses CodeMirror 6 geometry and DOM APIs to render its custom cursor and line-flash effects accurately. In particular, those features depend on low-level editor-view capabilities such as cursor coordinate measurement and access to the rendered editor DOM.

Obsidian's public editor API does not currently expose the underlying CodeMirror [`EditorView`](main.ts:1024) needed for those operations. Because of that, the plugin accesses the CM6 view through a single helper, [`VisibleCursorPlugin.getCMView()`](main.ts:1024), which isolates the only internal-API dependency in the codebase.

That access is intentionally limited and defensive:

- It is used only for rendering-related features that require CM6 view geometry.
- It is centralized in one location so future Obsidian changes require a single update point.
- Failure is non-destructive: if the CM6 view is unavailable, features that need it simply no-op rather than throwing, modifying note content, or interfering with normal editing.

- Global capture-phase event listeners (`pointerdown`, `pointerup`, `pointercancel`, `click`) are used to distinguish user-initiated mouse clicks from editor-driven focus changes. Without capture-phase access, the plugin cannot reliably determine whether a click position change is a deliberate user action versus a side effect of Obsidian managing focus internally. Keyboard events and IME compositions are sandboxed locally via CodeMirror's `domEventHandlers` and `view.composing` properties. All listeners are cleaned up in `onunload()` and do not interfere with normal editing.

If Obsidian exposes an equivalent public API in the future, this plugin should switch to that public surface.

## Settings Guide

### Cursor Appearance

<!-- ![Cursor Settings](screenshots/settings-cursor.png) -->

**Show custom cursor**
- "Always on" for persistent highlighting (including at end of line)
- "Only during flash" for temporary emphasis  
- "Off" to disable (use Obsidian default)

**Custom cursor style**
- "Block" - Full character highlight
- "Bar" - 3px wide cursor line

### Flash Effect

<!-- ![Flash Settings](screenshots/settings-flash.png) -->

**Line highlight** (default: centered)
- "Left" for left-to-right fade
- "Centered" for cursor-focused highlighting
- "Right" for right-to-left fade
- "Off" for character decoration only

**Flash duration** (default: 1s)
- Control how long the flash effect lasts (0.2s - 1.5s)

**Flash size** (default: 15 characters)
- Adjust the width of the line highlight (4-15 characters)

### Flash Triggers

<!-- ![Trigger Settings](screenshots/settings-triggers.png) -->

**On scroll** (default: ON)
- Show flash when the view scrolls significantly

**On file switch** (default: ON)
- Show flash when switching between notes or panes

**On navigation repeat end** (default: OFF)
- Show flash at the end of a keyboard repeat sequence (holding movement keys) if a large cursor movement occurred.
### Colors

<!-- ![Color Settings](screenshots/settings-colors.png) -->


**Use theme colors** (default: ON)
- Matches your Obsidian theme accent color
- Updates automatically when theme changes
- Turn off for manual light/dark control

## What's New in v1.0.15

- **On navigation repeat end setting**: Toggle to trigger a flash after holding down movement keys (arrows, Vim, Emacs repeats) if a large cursor movement occurred.
- **Indentation & Bullet width fix**: Block cursor no longer stretches across list markers/indentation space.
- **Reliable scroll flashing & keyboard scrolling bypass**: Bypasses scroll-stop flashes during active keyboard navigation, and ensures reliable scroll-stop flashes on trackpad/mouse scroll.
- **Smart Jump filtering**: Restricts cursor position jump flashes to transitions of more than one logical line (`lineDiff > 1`) to eliminate false flashes on headings or link navigation.
- **Localized Event Sandboxing**: Removed global keyboard and composition listeners, replacing them with CodeMirror 6's localized `domEventHandlers` and `view.composing`.

## Changelog

### v1.0.15
- **New**: "On navigation repeat end" setting toggle
- **Fixed**: Custom block cursor width fallback on tabs, list markers, and widgets
- **Fixed**: Avoid flashes on standard single-line arrowing, Vim keys, and Emacs keys
- **Fixed**: Bypass scroll-stop flashes for keyboard-driven scrolling
- **Refactored**: Removed global keyboard/composition listeners, localizing them in CodeMirror
- **Refactored**: Consolidated CSS animation/gradient construction within FlashRenderer

### v1.0.14
- **New**: Flash after cursor jump keys (Home, End, Ctrl+Home, Ctrl+End, Ctrl+A, Ctrl+E)
- **Renamed**: "blink on cursor jumps" → "Flash on long single move repeats"
- **Fixed**: Arrow keys now properly trigger flashes
- **Renamed**: Plugin name: "Obsidian Beacon" → "Visible Cursor"
- **Replaced**: All "beacon" references with "cue"
- **Replaced**: All "blink" references with "flash"

### v1.0.13
- Fixed: End-of-line block cursor using WidgetDecoration
- Widget creates actual DOM element instead of trying to style non-existent character

### v1.0.12
- Fixed: Theme colors update when theme changes
- Fixed: Uses pixel distance to prevent unwanted flashing

See GitHub for full changelog.
