# SpendWise appearance

A clear personal finance workspace with self-hosted Manrope, teal accents, compact navigation, and a prominent savings card. The same layout and visual hierarchy work in light and dark themes. Financial figures use tabular numbers; titles and prose align left, while table amounts align right.

| Token | Light | Dark |
| --- | --- | --- |
| Canvas | `#f4f7fa` | `#0d191f` |
| Surface | `#ffffff` | `#15272e` |
| Primary text | `#182d35` | `#e6f1f2` |
| Secondary text | `#536a75` | `#a5bac3` |
| Teal accent | `#087f73` | `#67d5bd` |
| Border | `#e2e9ed` | `#2e444d` |

Dark mode uses deep blue-green surfaces, lighter chart series, and a brighter teal accent with dark button text. Status colors supplement explicit labels. Forms, table rows, badges, menus, dialogs, tooltips, focus indicators, and native browser controls follow the selected theme. Chart colors, grids, and labels use shared CSS variables; data-table alternatives remain available.

The sun/moon control appears on authentication pages and the app's top bar. Your account → Appearance offers Light, Dark, and System. System is the default and follows live device changes. A browser-local preference survives reloads and sign-in changes and synchronizes between tabs. The external `public/theme.js` bootstrap applies the preference before application assets load, avoiding a bright initial flash while respecting the production Content Security Policy.

Theme controls have descriptive accessible names and a minimum 44px target. Appearance choices use native radio inputs, including keyboard navigation and visible focus. On mobile, the top-bar control shows its icon, the appearance choices use three equal columns, and the existing navigation becomes a focus-contained drawer. Authentication inputs remain 16px on mobile. Full transaction tables scroll inside their container.

Authentication keeps a teal brand panel and an abstract ledger illustration whose surfaces follow the theme. Continue with Google appears above the email form on both login and registration, with the multicolor Google mark and a 48px button. Both sign-in methods are disabled while a request is pending; popup errors appear above the controls. The illustration contains no fake balance or performance claim. Financial charts display only API data.

Browser verification covers both themes, responsive layouts from 320 to 1440 pixels, theme persistence, device changes, cross-tab synchronization, and sampled text contrast of at least 4.5:1. Screenshots and detailed results are in `docs/VERIFICATION.md` and `docs/screenshots/`.

CSV import follows upload, column mapping, editable review, and completion. The preview shows 20 rows per page with an internally scrolling table; summary totals, duplicate preferences, and confirmation controls fit mobile widths. Every input names its CSV row for assistive technology. Category suggestions are visibly identified and editable, and changes require a fresh check before saving.

Transaction CSV export uses the applied filters across all result pages. Report actions expose CSV and PDF separately, show progress, and display recoverable errors. PDFs use a light A4 paper layout with embedded Roboto, selectable text, and three vector charts, regardless of the application's theme or the device width.
