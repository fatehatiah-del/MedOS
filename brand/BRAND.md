# Med OS brand kit

Source of truth: Figma file "Med OS — Logo" (https://www.figma.com/design/jOhgXmhUgIkTMoP4LuF7kr).

## Files in this folder

| File | Use |
|---|---|
| `medos-wordmark.svg` | Main logo ("MedOS", the O is a gradient ring with a heartbeat). Use on light backgrounds. Text is outlined, so no font is needed. |
| `medos-wordmark-on-dark.svg` | Same, with light text, for dark backgrounds. |
| `medos-mark.svg` | The ring and heartbeat on their own, with no background. Pair it with the wordmark in headers, or use it alone where space is tight. |
| `medos-app-icon.svg` | App icon: the mark on an ink rounded square. Use for the PWA/app icon, apple-touch-icon and social avatars. |
| `favicon.svg` | Simplified icon for 16–32 px (solid ring, thicker strokes). Use only as the browser favicon. |
| `tokens.css` | CSS custom properties: brand colours plus light and dark UI themes. |
| `tokens.json` | The same values as JSON. |
| `tailwind.medos.js` | The same colours as a Tailwind `colors` object. |

## Colours

Logo colours (use these only for the logo and brand moments):

- Ink `#121638`: text and icon background
- Paper `#F4F5FB`: light background
- Iris gradient `#3D7BFF` → `#7B5CFF` at 135°: the ring
- Pulse `#FF4F82`: the heartbeat

UI colours: see `tokens.css`. Every text/background pair in it passes WCAG AA (4.5:1 or higher).

- Primary (buttons, links, focus) is `#4B5BF5` in light mode and `#7B8CFF` in dark mode. The raw logo blue `#3D7BFF` fails contrast with white text, so don't use it for buttons.
- Pulse pink is the accent: badges, highlights, chart series, small decorations. It must not be used for body text on light backgrounds; use `--color-accent-text` (`#D6336A`) instead. Don't use it for errors; errors use `--color-danger`.
- Use the iris gradient sparingly: the logo, maybe one hero element. Never put it behind body text.

## Typography

Font: **Instrument Sans** (Google Fonts, free). The logo uses Bold (700). Suggested UI use: 400 for body, 500–600 for labels and buttons, 700 for headings.

## Logo rules

- Minimum size: wordmark 80 px wide; icon 16 px (use `favicon.svg` below 32 px).
- Clear space around the logo: at least the height of the O on all sides.
- Don't recolour, stretch, rotate, add shadows, or retype the wordmark in a live font. Use the SVGs.
- Write the name as "Med OS" in body text and "MedOS" only inside the logo.

---

## Prompt for Claude Code

Copy this folder into the Med OS project first (for example to `brand/`). Then paste the prompt below into Claude Code in that project:

```
Apply the new Med OS brand to this site. The brand kit is in ./brand (read brand/BRAND.md first; it is the spec).

1. Explore the project: framework, styling approach (CSS, CSS modules, Tailwind v3/v4, styled-components...), where the global styles, theme/colour definitions, logo, favicon and <head> metadata live. Summarise what you found before changing anything.
2. Logo and icons:
   - Copy the SVGs to the public/static assets folder.
   - Replace the current logo in the header/nav, footer and any auth/loading screens with medos-wordmark.svg (medos-wordmark-on-dark.svg on dark surfaces; switch with the theme). Keep an accessible name ("Med OS").
   - Set favicon.svg as the favicon, and generate PNG fallbacks (favicon-32.png, apple-touch-icon 180x180, icon-192.png and icon-512.png) from medos-app-icon.svg. Update the web manifest if one exists.
   - Set <meta name="theme-color"> to #F4F5FB for light and #0B0E24 for dark.
3. Colours:
   - Add tokens.css (or the Tailwind mapping in tailwind.medos.js) as the single source of colour.
   - Replace hard-coded colours and old theme values across the codebase with the semantic tokens (bg, surface, surface-2, border, text, text-muted, primary, accent, success, warning, danger, focus-ring). Map each old colour by role, not by hue.
   - Support dark mode through the tokens (prefers-color-scheme, plus data-theme="dark"/"light" if the site has a toggle).
4. Font: load Instrument Sans (400, 500, 600, 700) from Google Fonts or self-host it, and make it the default sans font.
5. Check: run the dev server, look at the main pages in light and dark mode, check contrast and focus states, and fix anything that broke. Run the existing lint, type-check and tests.
6. Report what changed (files and components), any colours you couldn't map confidently, and anything left to decide.

Keep changes focused on branding (logo, colours, font). Don't redesign layouts in this pass.
```
