---
name: Slabline
description: A graphite prediction-market workspace with truthful collectible position shares.
colors:
  graphite: "#0b1118"
  surface: "#151e28"
  raised: "#1c2733"
  border: "#293541"
  text: "#f3f6fa"
  muted: "#8e9cac"
  ice-blue: "#80c9ff"
  ice-blue-hover: "#b1ddff"
  positive: "#58d6a7"
  negative: "#f0818b"
typography:
  headline:
    fontFamily: '"Inter Variable", Inter, Arial, sans-serif'
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Inter Variable", Inter, Arial, sans-serif'
    fontSize: "20px"
    fontWeight: 650
    letterSpacing: "-0.02em"
  body:
    fontFamily: '"Inter Variable", Inter, Arial, sans-serif'
    fontSize: "14px"
    lineHeight: 1.45
  label:
    fontFamily: '"Inter Variable", Inter, Arial, sans-serif'
    fontSize: "13px"
    fontWeight: 600
rounded:
  control: "7px"
  icon-control: "10px"
  preview: "12px"
  panel: "14px"
  market-card: "15px"
  share-dialog: "18px"
spacing:
  compact: "8px"
  control-gap: "10px"
  group: "12px"
  section: "20px"
  panel: "24px"
  dialog: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ice-blue}"
    textColor: "{colors.graphite}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  button-primary-hover:
    backgroundColor: "{colors.ice-blue-hover}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "#e7e9ee"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "#c3c6d0"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  share-trigger:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.icon-control}"
    width: "44px"
    height: "44px"
  share-dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.share-dialog}"
    padding: "28px"
    width: "min(760px, calc(100vw - 40px))"
---

# Design System: Slabline

## Overview

**Creative North Star: "The collector inventory desk"**

Slabline is an Operate interface: evaluate a market, understand a depth-based payout, and inspect attainable collectible listings. Dense, aligned information sits on dark graphite surfaces, with restrained ice-blue controls and a text-free split-slab identity. Inter and tabular figures keep amounts comparable; subject imagery makes the market and collectible recognizable.

Gemini Predictions and Polymarket Crypto were the user's original layout references: horizontal navigation, compact market cards, a narrow filter rail, and a separate detail ticket. Slabline's approved branding and composition now govern the visual system. User-pinned references live under `design/slabline`; the approved composition is binding, and exact data takes precedence over miniature generated text. There is no marketing hero or olive/cream palette. This documentation merges the incumbent interface guidance with the built share system; it does not reopen alternative visual directions.

**Key Characteristics:**

- Graphite page, charcoal surfaces, slate boundaries, and ice-blue interaction accents.
- Compact market browsing followed by an explicit detail and order workflow.
- Canonical split-slab geometry and contained, identifiable subject imagery.
- Exact position facts with visibly separate target and collected states.

## Colors

A cool graphite foundation makes the ice-blue accent legible without overwhelming financial data. Frontmatter records the current reusable palette from `apps/web/src/app/slabline.css`; earlier theme files contain local legacy colors and are not a second brand palette.

### Primary

Ice Blue identifies the brand mark and primary account controls, selected navigation accents, focus outlines, and open-position share amounts. Ice Blue Hover lightens primary controls on interaction.

### Secondary

Positive mint and Negative rose distinguish successful and lost share states. Incumbent outcome controls retain green/red semantic treatments; state text remains present alongside color.

### Neutral

Graphite anchors the page and share canvas. Surface contains market cards and the share dialog; Raised separates hover states. Border draws quiet dividers. Text carries primary information and Muted carries labels, context, and supporting amounts.

**The Semantic Accent Rule.** Preserve status wording alongside outcome color; an accent alone must not imply a confirmed payout or collectible receipt.

## Typography

Use Inter Variable with Inter, Arial, and sans-serif fallbacks throughout the interface. Body copy is compact and readable; headings increase weight and tighten tracking without introducing a separate display face. Tabular figures align monetary values and quantities.

The general hierarchy is recorded in frontmatter. Share-dialog headings are 26px on desktop and 24px on phones. Event titles may use a larger responsive size where content needs it; do not turn the exchange into a display-type landing page.

The PNG renderer bundles local Inter Medium (500) and the approved 650 outlines; the latter are registered as 600 for the renderer's supported weight steps. Its market title wraps to two lines, starting at 42px and fitting toward 32px. Amounts start at 80px and fit using the same font's measured advances. Descriptive labels can truncate; numeric facts must retain their full value.

**The Exact Figures Rule.** Fit financial text to its allotted space using the bundled font metrics; do not abbreviate or alter a value to imitate generated reference lettering.

## Layout

The first working surface is persistent navigation and a searchable market list, then selected event/chart, order ticket, and collectible preview. Desktop browsing retains compact three-column market cards and a narrow filter rail. Detail separates the chart from its ticket; phones stack these in task order with a compact header and bottom navigation. Avoid routine refresh timestamps and repetitive provider captions in browsing; expose concise update errors and keep practice/test and transaction states visible.

The share trigger sits immediately right of the position value with a 44px square hit area. The desktop share dialog is centered, at most 760px wide, with 28px padding and a viewport-limited scrolling interior. Its preview always contains the entire 1200 × 630 PNG. Beneath it: profile visibility, target selection, copy/download/link actions, then platform actions and feedback.

At widths of 639px and below, the dialog becomes a full-width bottom sheet with 20px padding, rounded upper corners, internal scrolling, and top/bottom safe-area allowance. At the reviewed 390px phone width, the full preview remains visible without cropping. Actions use two columns and at least 48px height; desktop share actions use at least 44px height.

The exported card is a fixed 1200 × 630 composition: event artwork/title above identity, a large amount and profit block at left, trade facts in the middle, and the selected slab at right. The lower strip contains only Slabline identity. With no slab, the facts region expands. Public snapshot pages display this same landscape asset responsively.

## Elevation & Depth

The interface primarily uses tonal layering and one-pixel borders. Share overlays dim the surrounding page with `#000a`; the dialog is distinguished by its surface, border, and stacking order, without an added box shadow. Its entrance uses a short 120ms ease-out fade and 6px vertical settle. The profile switch uses the same duration; both stop animating under reduced-motion preferences.

The export's approved background uses large split-slab geometry, a quiet lower grid, and an ice-blue corner. These are authored brand material, not general-purpose decoration to add to every panel.

## Shapes

Controls use compact rounded corners; market cards and larger panels have broader curvature. The share preview is softly rounded and the desktop dialog is more generously rounded. The mobile sheet has 20px upper corners and square lower corners. Status pills and the profile switch remain fully rounded.

The canonical mark is the two-piece split-slab vector in `apps/web/public/brand` and `SlablineMark`. Preserve its 100:140 proportions and diagonal split. It appears at 28px high in the header, 20px in the quiet footer, and 56px in the chart as neutral gray at 10% opacity. The export footer uses its own 32px mark. Do not replace this geometry with a generic slab icon or render a word inside it.

## Components

### Buttons and fields

Primary buttons use ice blue on graphite. Outline buttons carry a slate border, while outline and ghost hover states use Raised. The common button has a 7px radius and 13px semibold label. Preserve the larger share-action touch dimensions above. Disabled controls visibly fade and cannot invoke unavailable actions. Focus uses a two-pixel ice-blue outline with a four-pixel offset. Search fields are dark and compact; text remains editable without changing the surrounding layout.

### Navigation and market containers

Desktop navigation is horizontal with an active underline; the phone layout uses bottom navigation and horizontal category browsing. Market cards are compact bordered surfaces, with recognizable outcome artwork and readable values. Keep Gemini's matching outcome imagery, including sneakers and helmets, contained in its assigned frame. The trade ticket remains separate from the market chart.

### Position share dialog

A labeled share icon opens a modal with an accessible title, description, close control, and live status/error messages. The preview precedes settings and actions. Profile visibility switches between the chosen identity and Anonymous. Target selection remains distinct from the confirmed-collected receipt state. Clipboard or compose failures provide download/link recovery; opening the dialog itself does not publish a public link or open a social composer.

### Position PNG and immutable snapshot

The server template combines the approved background with actual snapshot fields and provider-supplied subject/slab artwork. Slab photos use contain sizing; missing artwork gets a truthful unavailable state. A selection is labeled SLAB; confirmed ownership uses COLLECTED only when the snapshot records that state. A won position alone does not mean a collectible was received.

Open shares say payout if correct; finalized states use their own labels. Per the final user direction, exports omit currency/environment qualifiers, fee notes, capture time and receipt footnotes. Amounts retain the dollar symbol; average entry rounds to exactly two decimals using exact arithmetic. Snapshot data retains its original precision, environment and fee semantics. Financial figures, costs, average entry and shares come from the snapshot rather than the reference image.

**The One Snapshot Rule.** Preview, copy, download, and public presentation reuse the prepared PNG. Publication is explicit; the published bytes and chosen profile visibility remain immutable rather than changing with a later catalog or account update.

## Do's and Don'ts

### Do:

- **Do** preserve the canonical split-slab proportions and the header, footer, and watermark roles.
- **Do** use Inter, tabular figures, graphite surfaces, and ice-blue interaction accents.
- **Do** contain the full share preview and selected slab photo without cropping.
- **Do** keep state labels accurate, use SLAB for selections, and reserve COLLECTED for confirmed receipts. Keep export copy concise.
- **Do** preserve provider truth, practice/test labels, and concise recoverable errors.

### Don't:

- **Don't** add a marketing hero or restore the obsolete olive/cream direction.
- **Don't** replace actual position values or provider slab imagery with generated reference content.
- **Don't** imply Gemini ownership, endorsement, confirmed execution, or collectible receipt through branding or status styling.
- **Don't** crop the landscape PNG on mobile or regenerate separate image variants for preview and download.

This records the built interface and replay/export evidence, not authenticated provider verification. Product and integration truth remain governed by PRODUCT.md, ARCHITECTURE.md, and docs/INTEGRATION_VERIFICATION.md.
