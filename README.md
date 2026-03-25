# Visible Cursor

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

Download the latest release from the [GitHub releases page](https://github.com/notuntoward/obsidian-cursor-cues/releases). Extract `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/visible-cursor/`, then reload Obsidian.

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

**Flash duration** (default: 0.5s)
- Control how long the flash effect lasts (0.2s - 1.5s)

**Flash size** (default: 8 characters)
- Adjust the width of the line highlight (4-15 characters)

### Flash Triggers

<!-- ![Trigger Settings](screenshots/settings-triggers.png) -->

**On scroll** (default: ON)
- Show flash when the view scrolls significantly

**On file switch** (default: ON)
- Show flash when switching between notes or panes
### Colors

<!-- ![Color Settings](screenshots/settings-colors.png) -->


**Use theme colors** (default: ON)
- Matches your Obsidian theme accent color
- Updates automatically when theme changes
- Turn off for manual light/dark control

## What's New in v1.0.14

### New Features
- Added "Flash after cursor jump keys" option for Home, End, Ctrl+Home, Ctrl+End, Ctrl+A, Ctrl+E
- Renamed "blink on cursor jumps" to "Flash on long single move repeats" for clarity
- Arrow keys now trigger flashes (via document-level keydown/keyup listeners with capture phase)

### Renamed Throughout
- All "blink" terminology replaced with "flash"
- All "beacon" terminology replaced with "cue"
- Plugin renamed from "Obsidian Beacon" → "Visible Cursor"

## Changelog

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
