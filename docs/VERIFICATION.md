# SpendWise verification

Verified on **6 November 2026** in the SpendWise Windows workspace with Node 24.14.1, Java 21, Firebase Auth/Firestore emulators, and Playwright Chromium.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, no warnings or errors |
| `npm run test:client` | 56 tests passed across 7 files |
| `npm run test:server` | 35 integration tests passed against Firebase emulators |
| `npm run test:browser` | 29 workflow/authentication/theme/import/export checks passed; no browser JavaScript runtime errors |
| `npm run build` | Production Vite build passed |
| `npm run test:production` | SPA routing, assets, early theme bootstrap, protected APIs, Google popup CSP/COOP, actual PDF download under CSP over local HTTPS, and secret exclusion passed |
| `npm run firebase:check` | Supplied credentials reached live Firebase Authentication and Firestore |
| `npm run firebase:rules` | Rules published and verified; previous release backed up under ignored `.local/` |
| Live anonymous Firestore read | Rejected with HTTP 403 after rules publication |
| `npm run test:firebase` | 5 live browser checks passed; temporary account and Firestore records removed |

## Coverage

The backend suite uses actual Firebase emulators. It covers registration/sign-in, safe profiles, invalid/expired/wrong-project tokens, disabled accounts, revocation, bearer headers, browser origins, direct Firestore rule rejection, cross-account isolation, validation, category references and uniqueness, transaction CRUD, search/sort/pagination, budget scope, exact paise thresholds, concurrent writes, deduplicated alert history, read/unread state, renames, report totals, and leap years.

Import tests cover preview without writes, existing/file duplicates, explicit duplicate inclusion, exact-paise totals, atomic budget alerts, stale categories without partial saves, account isolation, concurrent retry receipts, and rejection of changed payloads reusing an import ID. A 400-row batch verifies the larger import-only JSON allowance. Export tests verify filters and rows beyond one visible page.

The client suite covers forms and accessible feedback, Firebase profile restoration, logout, startup retry, token refresh, stale profile responses, and account changes during in-flight requests. Google tests cover both authentication pages, competing attempts, verified profile loading, blocked/cancelled popups, provider configuration errors, account conflicts, and failed profile synchronization.

CSV tests cover UTF-8/BOM, quoted commas and newlines, semicolon/tab delimiters, column mapping, Indian and US date choices, INR amounts, category suggestions, invalid/oversized files, and spreadsheet-formula escaping. PDF tests check selected-month totals, complete category details, escaped SVG labels, and empty charts without invalid coordinates.

The browser suite covers complete registration/login, persistent sign-in after reload, transaction/category CRUD, budgets/alerts, accurate dashboard totals, search/reset, CSV export, responsive pages, dialog keyboard focus, protected routes, and cross-tab logout. It also exercises the actual Firebase Auth emulator popup: cancellation and retry, Google registration, verified profile creation, expense storage, reload, and returning Google sign-in to the same UID and saved records. Both disposable emulator accounts are cleaned up. Machine-readable results are in [browser-results.json](browser-results.json).

Theme checks verify that the device theme is applied before React renders; explicit preferences survive reload and override the device; System follows device changes; native appearance radios support keyboard selection; and theme changes synchronize between tabs and survive logout/login. The dark dashboard was checked at 320/375/768/1024/1440 pixels, and every financial page at 375 pixels. Sampled text contrast was at least 4.5:1 on navigation, buttons, financial indicators, inputs, dialogs, and chart tooltips.

Light and dark screenshots in `docs/screenshots/` were refreshed. The desktop/mobile dashboard, login screen, reports, and budget dialog were visually inspected. The appearance controls are available on the login page and top bar, with Light/Dark/System options under Your account → Appearance.

## CSV workflow and PDF inspection

The browser checked the template download, column mapping, Education suggestions, manual category changes, exclusion of an invalid date, and both file/existing-record duplicates. The reviewed fixture imported four records totaling ₹925.50 and skipped two duplicates. A deliberately lost response followed by a retry kept the saved record count unchanged and preserved all three budget-threshold alerts. A filtered export included all 17 matching records across pages, totaling ₹153.00.

The import screen was inspected at desktop and 375px mobile widths. Summary/confirmation controls fit the page, while the editable table scrolls internally. Sampled import text contrast met 4.5:1. Screenshots are `docs/screenshots/csv-import-dark-desktop.png` and `csv-import-dark-mobile.png`.

The actual browser download, `test-results/report-export.pdf`, was rendered with bundled Poppler and both A4 pages were visually inspected. Its three charts, category table, six-month figures, rupee symbols, negative savings, and page numbers render without clipped content or overlapping text. Text extraction with pypdf confirmed the ₹1,203.50 expense total and category amounts of ₹753.00, ₹325.00, ₹80.00, and ₹45.50. These are disposable emulator figures. Rendered QA pages remain in the ignored `test-results/` directory.

## Actual Firebase project

A separate live check used `personal-expense-tracker-fffff` and the supplied web configuration and private server credential file. It registered a temporary account in the browser, loaded the verified profile, saved an expense/budget, checked a 75% alert and integer-paise storage, reloaded the browser, and signed out/in again. It then removed its exact generated account and all Firestore data under that UID.

[firebase-live-results.json](firebase-live-results.json) records the passed checks and successful cleanup without storing credentials or the temporary account's email.

The Google provider was checked through the Firebase project configuration API: it is enabled, its OAuth client is configured, and `localhost` is authorized. A separate production browser check used a temporary local HTTPS proxy and confirmed that the built login page renders the Google button with the intended CSP/COOP headers. The live Google popup check could not complete reliably because Chromium received `net::ERR_CONNECTION_RESET` while loading `https://apis.google.com/js/api.js`. No real Google account was signed in and no live records were created by that check. The complete Google registration/returning-user workflow passed against the Firebase Auth and Firestore emulators.

## Scope

The CSV import/export update ran the backend and client suites, browser workflows, lint, the production build, and production smoke checks. Live authentication/financial workflow results above were recorded during the preceding Firebase migration. CSV verification uses disposable emulator accounts; production export verification uses synthetic figures without signing in or changing live financial records.

The production smoke check serves the built app through a temporary loopback HTTPS proxy with an in-memory self-signed certificate and verifies a PDF download without bypassing CSP. Public hosting was not deployed. Browser checks are targeted functional/responsive checks, not a formal accessibility audit. The emulator widget's optional public-CDN font/Material assets are blocked to keep its controls independent of network availability; its authentication logic and Firestore requests still use the real emulators.

Vite reports large optional PDF chunks (about 1.36 MB for the engine and 855 KB for fonts before compression); both load only when exporting a PDF. Separate development/emulator caches and explicit dependency preparation prevent the first development export from triggering a reload. Some upstream Firebase tooling emits deprecation/metadata lookup warnings. The separate live Google popup limitation is recorded above.
