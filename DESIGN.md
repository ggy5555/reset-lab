# RESET LAB 3.0 — Design System (Phase A)

## Product principles

RESET LAB is a personal, offline-first productivity interface, not a gamified activity tracker.

1. **Clarity first:** highlight the action or figure needed now.
2. **Monochrome hierarchy:** use contrast, whitespace and typography, not decorative gradients.
3. **Measured time is evidence:** never represent unmeasured minutes as zero activity or recorded time.
4. **State transparency:** server login, Notion read permission, pending transfer and confirmed write are distinct.
5. **Functional preservation:** UI polish must not change timestamps, elapsed-time arithmetic, persistence or sync behavior.

## Implemented tokens

The Phase A layer is appended to the existing `public/index.html` stylesheet. This is deliberate: current `server/server.mjs` serves only `/`, `/index.html`, and `/sync.js`. Splitting CSS into `/style.css` without a separately approved route change would break styles under the existing Content Security Policy and static-file allowlist.

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#151515` | Headings and primary text |
| `--ink2` | `#464646` | Supporting text |
| `--muted` | `#777874` | Labels and hints |
| `--line` | `#e5e5e3` | Card and section borders |
| `--bg` | `#f5f5f3` | Application background |
| `--surface` | `#ffffff` | Cards |
| `--surface-alt` | `#fbfbfa` | Form surfaces |
| `--focus` | `#454545` | Keyboard focus ring |
| `--r` | `12px` | Card radius |
| `--sidebar-width` | `228px` | Desktop navigation |
| `--content-width` | `1360px` | Maximum content grid width |
| `--motion-fast` | `140ms` | UI hover/focus state changes |

Spacing tokens: 4 / 8 / 12 / 16 / 24 / 32 pixels. Prefer CSS gap and padding over repeated inline margins.

## Typography

- Body: 14px, line height 1.55. Native font stack: `Pretendard`, `Noto Sans KR`, `Apple SD Gothic Neo`, `system-ui`, `sans-serif`.
- Sidebar labels: 11px, weight 750, tracking 0.075em; on mobile 9px labels remain visible beneath icons.
- Eyebrows: 10px, tracking 0.18em.
- Page title: 28–37px fluid scale, strong weight and compact negative tracking.
- Section title: 14px, weight 780.
- Card title: 11px uppercase-like labeling, tracking 0.095em.
- Metric: 32–42px fluid, tabular lining numerals; active timer up to 52px.
- Supporting labels: 11–12px, restrained contrast.

Avoid fetching font files from third parties in this phase: the current CSP allows local scripts/styles but does not authorize external font hosts. A future approved static asset route can self-host properly licensed WOFF2 subsets.

Font references: Pretendard (SIL Open Font License) and SUIT (SIL Open Font License) via [눈누](https://noonnu.cc/). The chosen native fallback stack introduces **no new network requests**.

## Components

- **Primary action:** black background with white text; only one dominant action per local region.
- **Secondary action:** white background and thin gray border.
- **Disabled action:** preserves original disabled semantics with reduced emphasis.
- **Cards:** 12px radius, thin border, neutral surface, extremely subtle shadow.
- **Indicators:** neutrals and explicit text; never rely solely on hue to distinguish sync status.
- **Timer values:** `font-variant-numeric: tabular-nums lining-nums` with no digit-width jitter.
- **Timeline:** unmeasured intervals stay empty; overlapping undecided segments retain diagonal pattern and their existing meaning.
- **Empty state:** neutral textual explanation, not zero-like invented measurements.

## Layout and responsive behavior

- Desktop: fixed 228px dark sidebar. Content left gutter follows sidebar. HOME hero timer receives extra width and dark emphasis; three summary cards form a compact support row.
- Below 1200px: HOME hero occupies its own row; summary metrics form three columns.
- Below 900px: TIME session creation and active session panels stack.
- Below 700px: navigation becomes horizontally scrollable at 77px height with **text labels kept visible**; major grids stack, HOME metrics use two columns.
- Below 380px: top status chips wrap beneath the page title, preserving readability.
- Data tables remain horizontally scrollable rather than squeezing columns below a readable width.

## Motion and accessibility

- CSS-only state transitions, 140ms, for hover/focus/button feedback. No animation is coupled to `Date.now()`, `setInterval`, recorded intervals, or sync scheduling.
- Explicit `:focus-visible` outlines for buttons, inputs, selects, links and summaries.
- `prefers-reduced-motion: reduce` suppresses animation/transitions.
- Existing `[hidden]{display:none!important}` is retained so study-only controls remain conditionally hidden.
- Native buttons, checkboxes, labels and select inputs remain in the DOM with their existing IDs.

## SCREEN contracts

- HOME: hero current timer, three support metrics, 24h timeline, tasks and active sessions.
- TIME LAB: session form and active sessions, 24h clock, daily mix, original minute buckets and session history.
- ANALYTICS: original self-study / academy / class definitions, subject/weekly/monthly comparisons.
- WELLNESS: original logged sleep/movement and voluntary daily notes; no body or compliance scores.
- PLANNER: original tasks, checklists, repeat metadata and deadlines.
- SYSTEM: original local backup/restore, Notion login, permission check and manual sync. Added explicit copy distinguishing server connection from confirmed Notion write.

STUDY remains inside TIME LAB in this repository revision. Adding a separate route is **out of scope** for Phase A.

## Refactor boundary, future work

No changes to `public/sync.js`, `server/`, `render.yaml`, time arithmetic, localStorage key (`reset_lab_3_prototype_v1`), JSON schema, Notion mappings or REST endpoints in Phase A.

Dynamic subjects, task editing, user-specific configurations and two-way Notion syncing belong to subsequent Phase B/C feature branches; they require migration and authentication design beyond this visual PR.

## Reference direction

- [getdesign.md](https://getdesign.md/) for editorial software hierarchy (conceptual inspiration, not a copied layout).
- [Dribbble dashboard exploration](https://dribbble.com/search/monochrome-dashboard) for visual research only.
- [눈누 Pretendard](https://noonnu.cc/font_page/694) and [눈누 SUIT](https://noonnu.cc/) for font licensing checks.

Design choices belong to RESET LAB and should not replicate existing dashboard compositions.
