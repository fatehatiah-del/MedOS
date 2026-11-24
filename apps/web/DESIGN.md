---
name: MedOS
description: A medical-school study operating system, built to the category standard at Linear / Notion / Amboss craft.
colors:
  accent: "#2563eb"
  accent-hover: "#1d4fd7"
  accent-fg: "#ffffff"
  accent-soft: "#ebf1fe"
  canvas: "#f4f5f8"
  surface: "#ffffff"
  subtle: "#f1f3f6"
  hover: "#eaedf2"
  border: "#e3e6ec"
  border-strong: "#cbd0d9"
  fg: "#0e1117"
  fg-muted: "#474f5c"
  fg-subtle: "#657080"
  success: "#18794e"
  success-soft: "#e3f4ea"
  warning: "#935a0a"
  warning-soft: "#fcf0d9"
  danger: "#c0352b"
  danger-soft: "#fdecea"
  violet: "#6845c9"
  teal: "#0f7280"
  highlight: "#fde9a1"
  highlight-note: "#fadfca"
  course-pathology: "#c2416a"
  course-pathophysiology: "#c26b12"
  course-microbiology: "#1f9363"
  course-pharmacology: "#5450d6"
  course-public-health: "#0f8aa0"
  course-communication-skills: "#9147b8"
  dark-canvas: "#08090c"
  dark-surface: "#101217"
  dark-subtle: "#171a21"
  dark-border: "#22262f"
  dark-fg: "#e9ecf1"
  dark-fg-muted: "#a6aebb"
  dark-accent: "#7aa2ff"
  dark-accent-fg: "#08090c"
typography:
  display:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "72px"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.022em"
    fontFeature: '"cv11", "ss03", "calt"'
  headline:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.022em"
    fontFeature: '"cv11", "ss03", "calt"'
  page-title:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.022em"
    fontFeature: '"cv11", "ss03", "calt"'
  title:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.011em"
  body:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
    fontFeature: '"cv11", "ss03", "calt"'
  reading:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, Cascadia Code, SF Mono, Consolas, monospace"
    fontSize: "13.5px"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  tab-list: "10px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  gutter-mobile: "20px"
  gutter-tablet: "32px"
  gutter-desktop: "48px"
  surface-md: "20px"
  surface-lg: "24px"
  section-stack: "14px"
  marketing-section: "128px"
  app-container: "1080px"
  reader-container: "1560px"
  marketing-container: "1200px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-fg}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.subtle}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg-muted}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.fg}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "36px"
  badge-neutral:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.fg-muted}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "22px"
  badge-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "22px"
  surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.surface-md}"
  tabs-list:
    backgroundColor: "{colors.subtle}"
    rounded: "{rounded.tab-list}"
    padding: "2px"
  tab-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.lg}"
    height: "30px"
  nav-item:
    textColor: "{colors.fg-muted}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
---

# Design System: MedOS

## Overview

**Creative North Star: "The Quiet Workbench"**

MedOS looks like the best tools in its category and makes no attempt to look like anything else. The owner chose the category standard on purpose, after two rounds of bolder directions: white and cool-grey neutrals, near-black ink, one confident blue, Inter set tight, hairline borders. The craft bar is Linear, Notion and Amboss. Convention is the commitment here, and the work goes into executing it exactly.

The app is a frame and a workspace. The cool-grey canvas is the frame, holding the sidebar. The white workspace panel sits one step above it with a hairline border and rounded top corners, and every page lives inside that panel. Structure comes from spacing, type weight and 1px borders. Shadows stay at a whisper while things are at rest, and only floating layers (dialogs, menus, framed product screenshots) get real depth. Density is set for long study sessions on a laptop: 13px controls, 15px body and section titles, generous gaps between sections.

Dark is a second palette in its own right, not an inversion. It gets its own near-black canvas, a lighter blue accent with ink-coloured text on top, and its own chart fill. Students study at night, so dark mode gets the same care as light.

**Key Characteristics:**

- One typeface (Inter Variable) for everything, with tight negative tracking on headings and the cv11/ss03 stylistic sets.
- One blue accent for action, focus, selection and current state.
- A cool-grey canvas frame around a white workspace panel; hairlines before shadows.
- Course identity carried by small coloured dots, always next to the course name.
- Short, quiet motion; all of it turns off under reduced motion.
- Real product screenshots in a padded canvas frame stand in for illustration.

## Colors

A cool, clinical neutral ladder carrying a single saturated blue, plus muted status and course hues that only show up at small scale.

### Primary

- **Action Blue** (accent): primary buttons, links, focus outlines, text selection (24% mix), caret, progress fill, the active nav icon, the selected checkmark in menus, and the brand tile. In dark it becomes **Night Blue** (dark-accent), lighter so it reads on near-black, and text on it flips to ink (dark-accent-fg).
- **Pressed Blue** (accent-hover): hover state for anything filled with the accent.
- **Blue Wash** (accent-soft): accent badge fill, hover behind formulas, and soft "current" grounds.

### Neutral

- **Frame Grey** (canvas): the app frame behind the sidebar, the welcome page ground, and the bezel inside screenshot frames.
- **Paper White** (surface): the workspace panel, cards, inputs, dialogs, menus, and the active tab or nav pill.
- **Well Grey** (subtle): tab and segmented-control tracks, table headers, the search field, neutral badges, skeletons, the empty part of progress tracks.
- **Hover Grey** (hover): hover ground for ghost buttons, nav items and menu items.
- **Hairline** (border) and **Firm Hairline** (border-strong): every 1px divider and outline; border-strong is used on hover and for outline badges.
- **Ink** (fg), **Graphite** (fg-muted), **Slate** (fg-subtle): primary text, secondary text and descriptions, then metadata, placeholders and captions.

### Status and annotation

- **Success / Warning / Danger** each come as a strong ink-weight hue paired with a soft fill, always used together (soft fill as the ground, strong hue for text or icon). Danger also marks invalid inputs.
- **Violet** and **Teal** (with soft fills) are secondary semantic tints for Study Guide callouts and annotation; teal draws the wavy Review Later underline.
- **Marker Yellow** (highlight) and **Note Peach** (highlight-note) are reserved for the user's own marks over source text.

### Course identity

- Six course hues (course-pathology through course-communication-skills), each with a lighter dark-theme twin.

### Named Rules

**The One Blue Rule.** The accent is the only saturated hue that carries action: buttons, links, focus, selection, progress, current state. Never use it for a decorative fill, a background band or a section tint.

**The Semantic Token Rule.** The default Tailwind palette is wiped (`--color-*: initial`). Components can reach only semantic tokens (canvas, surface, fg, accent, status, course), so the light and dark palettes stay in charge. Never hard-code a hex in a component.

**The Course Dot Rule.** A course colour appears as a 10px round dot next to the course's name, and never alone, as a fill, or as a text colour. Colour never identifies a course by itself.

**The Two Palettes Rule.** Every token has a dark value chosen for the dark theme, not computed from the light one. A new token ships with both.

## Typography

**Display Font:** Inter Variable (with ui-sans-serif, system-ui, -apple-system, Segoe UI)
**Body Font:** Inter Variable
**Label/Mono Font:** ui-monospace / Cascadia Code / SF Mono / Consolas, only for code and LaTeX source

**Character:** One sans family at several weights does all the work. Headings get confidence from 600 weight and tight tracking, not from a second face. The cv11 (single-storey a) and ss03 stylistic sets give Inter a slightly softer, more legible texture.

### Hierarchy

- **Display** (600, 38px mobile / 60px tablet / 72px desktop, line-height 1.02-1.05, -0.022em): the welcome-page hero headline only.
- **Headline** (600, 32px mobile / 40px desktop, 1.1): welcome-page section headings; the closing heading goes to 52px.
- **Page title** (600, 26px / 30px, 1.15): the single h1 on each app page, via the page header. A context line (date, semester) sits _under_ it at 13.5px / 500 in Slate.
- **Title** (600, 15px, -0.011em): section headings, dialog and empty-state titles. Sentence case, one step above body.
- **Body** (400, 15px, leading 1.625): descriptions and running text; 17-19px on the welcome page. Measure is capped at about 62ch.
- **Reading** (400, 16px, 1.7): Study Guide and Notebook prose; tables in the reader drop to 14.5px / 1.55.
- **Label** (500, 13-13.5px): buttons, nav items, tabs, form labels, menu items.
- **Caption** (400-500, 12-12.5px): metadata, hints, counts, course-group labels.

Tables, times and anything marked numeric use tabular figures.

### Named Rules

**The One Family Rule.** Inter sets every heading and every word of UI. The serif (Source Serif 4) and mono stacks exist only as fonts a user can choose inside their Notebook, never as a system display voice.

**The Sentence Case Rule.** Headings, labels and buttons are sentence case at normal tracking. Nothing is uppercase, and no small tracked label sits above a heading.

## Layout

The signed-in app is a two-part frame. A 244px sticky sidebar (collapsing to a 64px icon rail) sits on the canvas. The workspace beside it is a white panel inset 8px from the top and right on large screens, with 12px top corners, a hairline border and a 56px sticky top bar (surface at 90% with backdrop blur). Below the `lg` breakpoint the sidebar becomes a left drawer and the panel goes full-bleed.

Page content lives in a container query (`@container`) capped at 1080px, so pages respond to the workspace's width rather than the viewport's. The Study Guide reader opts into a 1560px wide layout. Workspace padding is 20px on mobile, 32px from `sm` and 48px from `lg`, with 32-40px above the page header and 80px below the content.

Within a page, sections stack with a 14px gap from heading to content and larger gaps between sections. Dashboard-style pages use a main column plus a narrower right column. The welcome page uses a 1200px container with the same 20/32px gutters, 96-128px vertical section padding, and alternates canvas and surface bands separated by hairlines.

Breakpoints are Tailwind's defaults: sm 640, md 768, lg 1024, xl 1280.

## Elevation & Depth

The system is a hybrid that leans flat. Depth comes mostly from tone, a white surface set on a cool-grey canvas, and from 1px hairlines. Shadows are short and cool-tinted (built from the ink colour, never pure black in light mode) and come in three steps. Dark mode uses the same steps with much heavier black alpha.

### Shadow Vocabulary

- **Rest** (`--elevation-xs`, 0 1px 2px ink/5%): secondary buttons, inputs, the active tab or segment, the active nav pill, empty-state icon wells, the workspace panel.
- **Lifted** (`--elevation-sm`): the pricing panel and other cards that need to read as one object.
- **Floating** (`--elevation-lg`, a contact shadow plus a 44px soft drop): dialogs, sheets, dropdown menus, framed product screenshots, the focused skip link.
- **Primary button bevel**: a 1px inset white highlight on top plus a 1px ink drop, giving the filled button a faint physical edge.

### Named Rules

**The Hairline-First Rule.** Separate with a 1px border or a canvas/surface step before reaching for a shadow. Nothing at rest goes above Rest except an intentionally lifted card; Floating is only for things that actually float.

## Shapes

Corners are gently rounded and step up with the size of the object: 4px for keycaps, 6px for badges and menu items, 8px for buttons, inputs, nav items and tabs, 10px for tab tracks, 12px for surfaces, cards, notices, dialogs and menus, 16px for framed screenshots and the pricing panel. Course marks, progress bars and avatars are fully round. The brand tile is a rounded square (7-10px depending on size) holding a bold "M".

Borders are always 1px hairlines; the only thicker strokes are the 2px focus outline and the 3px blockquote rule in reader prose.

## Components

### Buttons

Compact and confident, with a tactile press.

- **Shape:** gently rounded (8px).
- **Sizes:** 32px (sm, 13px text), 36px (md, 13.5px text), 36px square icon. Marketing calls to action go to 44px / 15px; auth forms use 40px full width.
- **Primary:** Action Blue fill, white text, the bevel shadow; hover moves to Pressed Blue.
- **Secondary:** Paper White with a hairline and Rest shadow; hover firms the border and moves the fill to Well Grey. This is the default variant.
- **Ghost:** no fill, Graphite text; hover adds Hover Grey and Ink text.
- **States:** 150ms ease-out transitions on colour, border and shadow; press scales to 0.97; disabled is 50% opacity with no press. A trailing arrow icon is allowed on forward-moving calls to action.

### Chips / Badges

- **Style:** 22px tall, 6px radius, 12px / 500 text. Tones are neutral (Well Grey and Graphite), accent, success, warning and danger (soft fill with the strong hue), and outline (Firm Hairline).

### Cards / Containers

- **Corner Style:** 12px.
- **Background:** Paper White with a hairline border.
- **Shadow Strategy:** none, or Rest on clickable rows and cards; see Elevation.
- **Internal Padding:** 20px (md), or 24-28px (lg). List cards use `divide-y` hairlines between rows rather than nested cards.
- **Rule:** use a surface sparingly. Most structure comes from spacing and type.

### Inputs / Fields

- **Style:** 36px tall, 8px radius, hairline border, Paper White, Rest shadow, 14px text, Slate placeholder.
- **Focus:** the border turns Action Blue with a 3px accent ring at 20% (no browser outline).
- **Error / Disabled:** the border turns danger with a danger ring at 18%; disabled goes to Well Grey with no shadow.
- **Field:** a 13px / 500 label above, a 12px Slate hint below, 6px apart.

### Tabs and Segmented Control

A Well Grey track with a hairline and 2px padding (10px radius). Items are 30px, 13px / 500 Graphite. The active item becomes a Paper White pill with the Rest shadow and Ink text. The segmented control is built on native radios, so arrow keys work.

### Navigation

- **Sidebar items:** 32px tall, 8px radius, 13.5px / 500, 17px Lucide icons at 1.75 stroke. Rest is Graphite; hover adds Hover Grey. Active is a Paper White pill with a hairline ring, Rest shadow and an Action Blue icon.
- **Course group:** a 12px Slate "Courses" label (sentence case), then each course with its dot.
- **Rail:** labels move to screen-reader-only; titles become native tooltips; Settings and the collapse toggle stay pinned at the bottom.
- **Top bar:** a 288px search field styled as a Well Grey pill with Ctrl + K keycaps, then Ask AI, the timer, the semester line, the theme menu and the account menu.

### Dialogs and Menus

Paper White, 12px radius (sheets are flush to the edge), Floating shadow, over a 36% ink overlay. Centre dialogs pop in (180ms); drawers and sheets slide in (240ms). Menus have a 4px inset, 32px items at 13px, Hover Grey highlight and a 6px offset.

### Empty State and Notice

Empty states are centred: an optional 44px icon well (hairline, Rest shadow), a 15px / 600 title, a 14px Graphite description capped at about 24rem, and up to one action. Notices are inline 12px-radius boxes, neutral or with a warning or danger soft fill and a 25% border.

### Product Screenshot Frame (signature)

Real captures of real screens, never illustrations, in a 16px-radius Frame Grey bezel with 6-8px padding, a hairline and the Floating shadow; the image inside has 10px corners. Light and dark captures are both rendered and the theme decides which shows. On phones the hero switches to a readable crop of the main column. On the welcome page the learning-cycle tabs swap the framed screenshot for each step.

## Do's and Don'ts

### Do:

- **Do** reach only for semantic tokens (canvas, surface, subtle, fg, fg-muted, accent, status, course); give every new token both a light and a dark value.
- **Do** keep the accent for action, focus, selection and current state.
- **Do** set headings in Inter at 600 with the font-display tracking (-0.022em), and 15px section titles at -0.011em.
- **Do** separate with 1px hairlines and the canvas/surface step before adding a shadow; keep resting shadows at elevation-xs.
- **Do** show course identity as a 10px dot next to the course name.
- **Do** use real product screenshots in the canvas-bezel frame wherever the product needs to be shown.
- **Do** keep state transitions to 150ms ease-out and overlays to 180-240ms, and make sure everything is still under reduced motion.
- **Do** give every interactive element the 2px Action Blue focus outline at a 2px offset (inputs use the accent ring instead).

### Don't:

- **Don't** introduce a second typeface for headings or UI; serif and mono belong to Notebook content only.
- **Don't** set labels in uppercase or put small tracked kickers above headings; context lines go under the title.
- **Don't** use the accent as a decorative band, gradient or section background.
- **Don't** use course colours as fills, text colours or the only way to tell courses apart.
- **Don't** stand in for the product with abstract illustration, gradient blobs or feature-icon card grids; the welcome page lists features as hairline-divided text, not cards.
- **Don't** use pure-black shadows in light mode or shadows heavier than elevation-lg.
- **Don't** add badges, confetti or game-like reward visuals; progress is shown with plain bars and counts.
