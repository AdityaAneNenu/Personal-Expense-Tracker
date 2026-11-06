# SpendWise

Personal Expense Tracker and Budget Management System built with React, Vite, Express, **Firebase Authentication**, and **Cloud Firestore**. Track income and expenses in INR, set monthly budgets, and view reports from your saved records.

## Run locally

Requirements: Node.js 22.12+ and a Firebase project with an enabled Firestore database and Authentication's **Email/Password** and **Google** providers.

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env` in the project root if `.env` does not already exist.
3. Fill in the Firebase web configuration and point `FIREBASE_SERVICE_ACCOUNT_PATH` to your service-account JSON. Absolute Windows paths work with forward slashes. Both the client and API use this one root configuration file.
4. Check the connection and publish the application's Firestore access rules:

   ```powershell
   npm run firebase:check
   npm run firebase:rules
   ```

5. Start the app:

   ```powershell
   npm run dev
   ```

Open **http://localhost:5173**. The API runs at **http://localhost:3001**. Use **Continue with Google** on either the login or registration page, or register/sign in with email and password. Google sign-in creates your workspace on the first visit and opens the same saved records on subsequent visits. Built-in categories are immediately available; no schema setup or data seeding is required.

This workspace's root `.env` is configured for `personal-expense-tracker-fffff`. The service-account JSON remains at the external path specified in that file. Keep the file there, or update the path if you move it.

## Features

- Firebase Google sign-in and email/password registration, persistent sign-in across reloads, and logout across tabs.
- Protected API requests authenticated with Firebase ID tokens; expired, revoked, and disabled identities are rejected.
- Income and expense creation, viewing, editing, deletion, filtering, substring search, sorting, and pagination.
- CSV import with column mapping, editable category suggestions, validation, duplicate detection, and safe retries.
- Built-in categories and private custom categories with duplicate and reference checks.
- Overall and category budgets for each calendar month.
- One historical alert per budget threshold: 75%, 90%, and 100%, with read/unread state and current active status.
- Dashboard summaries, six-month reports, daily spending trends, category breakdowns, filtered transaction CSV exports, and downloadable PDF reports with charts.
- Responsive pages and accessible forms, dialogs, loading states, and error feedback.
- Light, dark, and system themes across the app, including authentication, charts, and dialogs.

Use the sun/moon button on the login page or top bar to switch themes. **Your account → Appearance** offers **Light**, **Dark**, and **System**. The default follows your device; your selection is saved in this browser, survives reloads and sign-in changes, and synchronizes across tabs.

## Import and export

Open **Transactions → Import from CSV**, or use **Import from CSV** on the Add transaction page.

1. Choose a UTF-8 `.csv` file, or download the template and replace its three sample expenses with your own. Each file can contain **up to 400 transaction rows and 1 MB**.
2. Match the date and amount columns. Description, category, type, and payment method are optional. Amounts are positive INR values; a missing type becomes Expense and a missing payment method becomes Other.
3. Choose the date convention: **Day / Month / Year** is the default; **Month / Day / Year** is available. `YYYY-MM-DD` is always recognized. Quoted commas, multiline descriptions, Indian amount grouping, and comma/semicolon/tab delimiters are supported.
4. Review the rows. Category names match your existing categories first; built-in suggestions recognize descriptions such as course fees, groceries, and metro fares. Change any suggestion, assign unrecognized categories, fix invalid values, or uncheck unwanted rows. Bulk assignment fills selected rows without a category. **No Gemini key is needed.**
5. Select **Check changes** after editing, then **Import**. Previewing makes no writes. Saving commits transactions and budget alerts together; a failed batch saves nothing. If the response is interrupted, retry on the same screen safely.

**Skip possible duplicates** is on by default. Matching uses date, amount, type, category, payment method, and normalized description, both within the file and against saved records. Turn it off only when matching rows represent separate expenses you want to keep. An import that would update too many budget alerts is rejected before saving; split that file into smaller batches.

**Transactions → Export CSV** downloads every record matching the applied filters and sort order, including pages that are not currently visible. Its columns match the import template. CSV cells are quoted and spreadsheet formulas are escaped.

**Reports → Export CSV / Export PDF** uses the selected month. The report CSV includes six-month totals, category totals, and daily spending. The PDF downloads as an A4 report with income/expenses/savings, three vector charts, a complete category table, and six-month figures. Each export uses one fresh financial snapshot. The PDF uses a light paper layout in either app theme; its engine and embedded fonts load only when requested.

## Configuration

| Setting | Purpose |
| --- | --- |
| `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID` | Required Firebase web configuration |
| `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_MEASUREMENT_ID` | Remaining public web configuration; analytics is not initialized |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Server-only path to the private service-account JSON |
| `GOOGLE_APPLICATION_CREDENTIALS` | Alternative service-account path supported by the server |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Alternative inline server credentials; supply both, preserving escaped newlines |
| `FIREBASE_DATABASE_ID` | Firestore database, normally `(default)` |
| `PORT` | Express port, default `3001` |
| `CLIENT_ORIGIN` | Exact permitted browser origin, default `http://localhost:5173` |
| `API_PROXY_TARGET` | Development API proxy target, default `http://127.0.0.1:3001` |
| `VITE_API_URL` | API origin for a separately hosted client; leave blank for the included proxy/combined server |

`VITE_FIREBASE_*` aliases are supported for the public Firebase fields. Vite explicitly maps only those public fields into the browser; service-account credentials are server-only. On Google Cloud, Application Default Credentials can replace a local JSON file. `.env` and service-account JSON filenames are ignored by Git.

After changing web configuration, restart Vite or rebuild production assets. Use the configured `CLIENT_ORIGIN` when opening the app. For a hosted site, add its domain to Firebase Authentication's authorized domains.

Google is already enabled with its OAuth configuration in this workspace's Firebase project, and `localhost` is an authorized domain. For another project, enable **Authentication → Sign-in method → Google**, choose the support email, and save. Firebase manages the Google OAuth configuration; no Google client secret belongs in the frontend `.env`. If a browser blocks the account chooser, allow pop-ups for the app and retry.

## Firestore access and data

The Express API verifies a Firebase ID token from `Authorization: Bearer <token>` and scopes all data to that verified UID. Financial data lives in:

```text
users/{firebaseUid}
  categories/{categoryId}
  transactions/{transactionId}
  budgets/{budgetId}
  alerts/{budgetId_threshold}
  imports/{importId}
```

The user document holds the display profile and a revision counter. Import receipts record a request hash and result so a retry cannot save the same batch twice. Passwords and refresh tokens are managed by Firebase Authentication. The browser SDK manages local sign-in persistence; the application does not maintain its own session cookies or token store.

Firestore rules deny direct browser database access. The server's Admin SDK uses IAM permissions and enforces ownership, validation, category references, unique budgets, and budget-alert consistency. `npm run firebase:rules` publishes `firestore.rules` to the configured project's default database and backs up the prior rules to the ignored `.local/` directory.

Amounts are stored as **integer paise** and converted to rupees at the API boundary. Firestore transactions serialize each user's financial writes and commit record changes and threshold alerts together. Reports use consistent read-only snapshots.

For this personal tracker, services load the relevant per-user collections and filter in memory to support substring search and consistent reports without composite-index setup. For large transaction histories, add indexed period queries and maintained aggregate documents.

## API

Successful responses use `{ "data": ... }`; failures use `{ "error": { "code": "...", "message": "..." } }`. IDs are strings. All endpoints below require a Firebase ID token except `/api/health`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Firestore connectivity and configured project |
| GET | `/api/auth/me` | Verified Firebase profile and profile synchronization |
| GET, POST | `/api/categories` | List/create categories |
| PUT, DELETE | `/api/categories/:id` | Edit/delete a private category |
| GET, POST | `/api/transactions` | List/create transactions |
| POST | `/api/transactions/import/preview` | Validate selected CSV rows and find possible duplicates without writing |
| POST | `/api/transactions/import` | Atomically save a reviewed batch with a retry-safe import ID |
| GET | `/api/transactions/export` | All matching transactions for CSV export, without pagination |
| GET, PUT, DELETE | `/api/transactions/:id` | View/edit/delete a transaction |
| GET, POST | `/api/budgets` | List/create monthly budgets |
| PUT, DELETE | `/api/budgets/:id` | Edit/delete a budget |
| GET | `/api/dashboard/summary` | Monthly dashboard |
| GET | `/api/reports/monthly` | Six months and daily spending |
| GET | `/api/reports/category-breakdown` | Monthly expenses by category |
| GET | `/api/alerts` | Threshold history and current status |
| PATCH | `/api/alerts/:id/read` | Mark an alert read |

Registration, Google popup sign-in, email/password login, token refresh, and logout go directly through the Firebase browser SDK. Both sign-in methods then load the verified profile from `/api/auth/me`. Financial queries accept `month`/`year`; transaction queries support `start_date`, `end_date`, `category_id`, `type`, `search`, `sort_by`, `sort_order`, `page`, and `page_size` (maximum 100).

## Verification

```powershell
npm run lint
npm run test:client
npm run test:server
npm run test:browser
npm run build
npm run test:production
```

The API and browser suites automatically start **Auth and Firestore emulators** under `demo-spendwise`. They refuse to use live credentials or a real project. These emulators require **Java 21+**; the wrapper also recognizes a runtime installed under `.local/java/` (configured in this workspace). The Firebase CLI is installed with the project.

`npm test` runs the API and component suites. Browser verification uses a visible Chromium window by default; set `PW_HEADLESS=true` for CI. Browser checks create isolated emulator accounts and clean them up. Screenshots and the latest browser result are in `docs/`.

Browser checks also verify Google popup cancellation, account creation, repeat sign-in, and saved expenses using the Auth emulator. CSV checks cover review, corrections, duplicates, retry after a lost response, complete filtered exports, and a PDF download. Theme checks cover restoration before React renders, saved preferences, device-theme changes, cross-tab synchronization, sampled text contrast, and layouts from 320 to 1440 pixels. Test and development servers use separate Vite caches; PDF dependencies are prepared at startup to avoid interrupting the first download.

The production smoke test checks the early theme bootstrap, protected APIs, Firebase popup CSP/COOP headers, and exclusion of private server credentials from browser bundles. It also downloads a PDF from the built exporter under the production CSP through a temporary local HTTPS proxy. The proxy's self-signed certificate exists only in memory, and the PDF uses synthetic figures without signing in or writing records. The test uses a read-only health check against the configured live Firebase project.

`npm run test:firebase` is a separate, explicit live browser smoke check. It creates a temporary account in the configured Firebase project, verifies registration/login and saved expenses/budget alerts, then deletes that exact account and its records. Results are saved to `docs/firebase-live-results.json` without credentials.

## Production

```powershell
npm run build
$env:NODE_ENV = 'production'
$env:CLIENT_ORIGIN = 'https://your-spendwise-domain.example'
npm start
```

Express serves `client/dist` and the API together. Place it behind an HTTPS reverse proxy. Configure the actual site domain in Firebase Authentication and keep the service-account JSON available only to the server. If you host the client separately, set `VITE_API_URL` before building and allow the API origin in the host's Content Security Policy. Return `NODE_ENV` to `development` for local HTTP work.

The included server permits Firebase's popup helper scripts from `https://apis.google.com`, its authentication frames from `https://*.firebaseapp.com`, and uses `Cross-Origin-Opener-Policy: same-origin-allow-popups`. Preserve these settings when adding a proxy or hosting the client separately so the Google account chooser can communicate with the app.

## Project guide

- `client/src/context/AuthContext.jsx`: Firebase sign-in lifecycle and profile state.
- `client/src/context/ThemeContext.jsx`, `client/public/theme.js`: saved/system appearance and theme restoration before the app loads.
- `client/src/lib/firebase.js`, `api.js`: public Firebase setup and bearer-authenticated requests.
- `client/src/pages/ImportTransactions.jsx`, `client/src/lib/csv.js`: CSV parsing, mapping, review, suggestions, and downloads.
- `client/src/lib/reportPdf.js`: downloadable financial reports with vector charts and embedded fonts.
- `server/src/config/firebase.js`: private Admin SDK initialization.
- `server/src/services/store.js`: per-user Firestore snapshots and atomic mutations.
- `server/src/services/imports.js`: import validation, duplicate checks, and receipt-backed batch saving.
- `server/src/services/`: finance rules, reports, categories, profiles, and alerts.
- `server/tests/api.test.js`: Firebase emulator integration tests.
- `docs/ARCHITECTURE.md`: contracts and consistency rules.
- `VIVA_NOTES.md`: explanation for demonstrating the project.

If startup fails, run `npm run firebase:check`; check the root `.env`, the JSON path, and the Firebase project's enabled services. A rejected browser origin requires `CLIENT_ORIGIN` to match the address you opened. Enable missing sign-in providers in Firebase Console → Authentication → Sign-in method → Email/Password or Google.
