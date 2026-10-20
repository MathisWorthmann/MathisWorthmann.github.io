# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal game design portfolio website for Mathis Worthmann, live at `https://mathisworthmann.de/` and served via GitHub Pages with a custom apex domain. No build system, no package manager, no dependencies to install — everything is plain HTML, CSS, and JavaScript. The film blog lives separately at `https://filmblog.mathisworthmann.de/`.

## Architecture

The entire site lives in two files:

- **`index.html`** — all markup, all CSS (in a `<style>` block), and all JavaScript (in inline `<script>` blocks). The site is a single-page application that shows/hides content without any URL routing.
- **`translations.js`** — flat key/value object with English translations for every user-visible string, plus the language-switch runtime.

### Page navigation

Five "pages" are defined as `<div id="page-*" class="page">` elements. Only one has the `active` class at a time (controlled by `showPage(pageId)`). Page IDs: `home`, `boardgame`, `reign`, `energiekern`, `raetseljagd`.

Navigation uses hash routing (`route()` on `hashchange`): each case study has its own shareable hash, mapped in `casePages` — `#wettermaschine` → `boardgame`, `#reign`, `#energiekern`, `#raetseljagd`. Any other hash (`#projects`, `#about`, `#contact`, `#top`) shows the home page and scrolls to that section. Links are plain `<a href="#…">`, no `onclick`. The browser back button works; don't add iframes that change their `src`, since each change creates a history entry (the Rätseljagd demo iframe is created/removed instead).

### Localisation system

- The site is written in **German by default**. English is the secondary language.
- Elements that need translation carry a `data-i18n="<key>"` attribute.
- On page load, `storeOriginals()` saves each element's inner HTML into `data-original`.
- `applyTranslations()` reads from the `translations` object in `translations.js` and sets `innerHTML`.
- `restoreGerman()` reads `data-original` back.
- Language preference is persisted in `localStorage` under the key `'portfolio-lang'`.

**To add a translatable string:** add `data-i18n="my-key"` to the element in `index.html`, and add `"my-key": "English text"` to the `translations` object in `translations.js`. The German text is the HTML itself.

### Design tokens

CSS custom properties are defined on `:root` at the top of the `<style>` block:

| Variable | Purpose |
|---|---|
| `--bg` | Page background (`#0a0a0f`) |
| `--bg-card` / `--bg-card-hover` | Card backgrounds |
| `--text` / `--text-muted` | Body text |
| `--accent` | Lime-green highlight (`#c9f24d`) |
| `--accent-dim` | Muted accent (`#a3c43e`) |
| `--border` | Separator colour |
| `--font-display` | Syne (headings) |
| `--font-body` | Source Sans 3 (body) |

## Development

Open `index.html` directly in a browser — no server needed. For a local server (avoids CORS on fonts in some browsers): `python -m http.server 8000` or `npx serve .`.

Deploy by pushing to `main`; GitHub Pages serves from the repo root automatically.

## Content structure

All case study content (long-form text for all three projects) is stored as strings inside the `translations` object in `translations.js`. The corresponding German text is in the `index.html` DOM. When editing case study copy, update both places.
