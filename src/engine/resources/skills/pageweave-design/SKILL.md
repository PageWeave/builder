---
name: pageweave-design
description: PageWeave design guidance for sites: themes (daisyUI semantic tokens), frontend rules (Tailwind + daisyUI 5, never Tailwind color names), dark-theme color-scheme requirement. Read before building or restyling pages.
---

# PageWeave design guide

> Synced from https://pageweave.dev/docs/design.md on 2026-09-16 via npm run sync:docs.

---
title: "Documentation — PageWeave"
---

> For the full documentation index, see [PageWeave Documentation](https://pageweave.dev/docs) or fetch [llms.txt](https://pageweave.dev/llms.txt).


# Frontend Design

PageWeave uses Tailwind CSS v4 + daisyUI 5. All pages support Liquid templating.

## Core Rules

- **MUST use daisyUI components** + semantic colors (`primary`, `base-100`) — NOT Tailwind color names (`red-500`, `blue-600`)
- **MUST use characterful fonts** — NEVER generic (Inter, Roboto, Arial, system-ui). Pair display + body fonts
- **NEVER generic AI aesthetics** — overused fonts, purple gradients on white, predictable card-grid layouts, cookie-cutter components

## Aesthetic Direction

Pick a clear style before coding. Commit fully:

- **Brutalist** — raw typography, high contrast, minimal decoration
- **Editorial** — magazine layouts, serif fonts, generous whitespace
- **Retro** — vintage color palettes, distressed textures, classic typography
- **Luxury** — refined details, gold accents, elegant spacing
- **Playful** — bold colors, rounded shapes, animated elements
- **Organic** — natural shapes, earth tones, flowing layouts
- **Industrial** — monospace fonts, grid systems, utilitarian

## Design Principles

### Typography
Use distinctive, characterful fonts. Pair display + body fonts deliberately.

### Color
Cohesive palette with dominant colors and sharp accents. Avoid timid evenly-distributed palettes.

### Motion
Staggered load reveals, hover micro-interactions, scroll-triggered effects. One orchestrated page load > scattered animations.

### Spatial Composition
Asymmetry, overlap, generous whitespace, diagonal flow, grid-breaking elements.

### Backgrounds
Gradients, textures, patterns, noise — never flat solid colors.

### Complexity Matching
Maximalist = elaborate code + animations. Minimalist = restraint, precision, spacing.

## CSS Cascade Order

1. daisyUI base styles
2. Tailwind custom CSS
3. Theme CSS (from `update_theme`)
4. html_head content

daisyUI 5 + Tailwind v4: utility classes read `--color-primary`, not `--p`. Set `--color-*` variants in custom themes.

