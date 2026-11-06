# SpendWise demonstration notes

SpendWise helps a user record income and expenses, set monthly spending limits, and understand their money through charts and reports. Its stack is React, Vite, Express, Firebase Authentication, and Cloud Firestore.

## Explain the main responsibilities

- React renders forms and pages, validates input for quick feedback, and formats rupees with `Intl.NumberFormat('en-IN')`.
- Firebase Authentication creates accounts through Google or email/password, persists browser sign-in, and refreshes ID tokens.
- Express verifies Firebase ID tokens and checks every requested action against the verified UID.
- Firestore stores the user profile, custom categories, transactions, budgets, and alert history in per-user document paths.
- Zod enforces strict input schemas on the server. Firebase Admin gives the API authenticated access to Firebase services.

## Trace an expense

A user records a ₹750 expense under Food and groceries. The client sends the category ID, amount, date, description, and payment method to `POST /api/transactions` with a Firebase bearer token. The server verifies the token and category, converts the amount to 75,000 paise, then starts a Firestore transaction for the user.

It stages the new record, recomputes budget spending, creates any newly crossed threshold alerts, and commits everything together. The response returns the saved ID and rupee amount. The next dashboard request sees the updated records and recomputes its cards and charts from one consistent snapshot.

## Authentication versus authorization

Authentication establishes identity. Firebase verifies the Google sign-in or password and issues an ID token; the API verifies its signature, project, expiry, and account status.

Authorization decides which records that identity can access. The API constructs all paths beneath `users/{verifiedUid}`. A record ID belonging to another account cannot escape that namespace, and a browser-supplied `user_id` is rejected. Frontend route protection improves navigation; server checks enforce access.

The Firebase browser configuration is public application configuration. The service-account JSON contains private server credentials and remains outside the client bundle and Git. Firestore rules deny direct browser access so financial changes always pass through the validated API.

## Documents and relationships

A Firestore document has a string ID and fields. Collections contain documents, and user documents own subcollections. Transaction and budget documents reference category IDs. The API validates these references, prevents deletion of referenced categories, and resolves the current category name for reports.

Built-in categories are stable application data shared by all users. Private categories are saved only under their owner's UID. An overall monthly budget uses `category_id: null`.

## Why use integer paise?

Binary floating-point values can represent decimal fractions imperfectly. Storing ₹123.45 as `12345` paise makes the stored value exact, and totals use integer addition. The API converts totals to rupees for display. Threshold comparisons use the underlying amounts so a displayed percentage rounded to 75% does not trigger an alert early.

## Atomic writes and concurrent requests

Two browser tabs may save expenses at the same time. Every financial transaction reads and updates the same user's root revision before committing its records. Firestore locks/retries conflicting work. The second operation sees the first operation's committed state, so budgets and alerts reflect both expenses.

The same mechanism protects duplicate category names and duplicate monthly budgets. It also lets referenced-category checks and record writes succeed or fail together.

## Budget thresholds

| Spending | Status | New historical alert |
| --- | --- | --- |
| Below 75% | NORMAL | None |
| At least 75% | WARNING | 75% |
| At least 90% | HIGH | 90% |
| At least 100% | EXCEEDED | 100% |

A single expense that crosses several thresholds creates one alert for each. The document ID contains the budget ID and threshold, preventing duplicates. Reducing or deleting an expense keeps historical alerts but marks them inactive when the current spending falls below the threshold. Changing a budget's scope clears history for the old scope.

## Reports

Monthly summaries total only records in the chosen calendar month. Budgets count expenses, not income. Reports group expense amounts by category or day and include six months of income/expense totals. Missing days/months become zeros so the graphs remain clear, and leap-year February has 29 daily entries.

Transaction CSV export includes every row matching the applied filters, across all pages. Report CSV and PDF exports each use a fresh dashboard snapshot for internally consistent totals. The PDF has selectable text, embedded fonts, vector charts, and complete category/monthly tables, so it remains readable when printed or viewed from a mobile download.

## Trace a CSV import

Choose Import from CSV from Transactions or Add transaction. Upload a UTF-8 file, map its date/amount columns, and review the suggestions. A description such as "University course fees" suggests Education using built-in keywords; the user can change it. Missing or ambiguous categories need a choice. Each file is limited to 400 rows and 1 MB.

The preview endpoint validates dates, amounts, category ownership, and possible duplicates without saving. After edits, Check changes refreshes the preview. Import saves all accepted records and their budget alerts atomically. A UUID receipt stores the request hash and result; retrying after a lost response returns that result without adding the batch twice. The default skips matching records, while an explicit option allows legitimate identical expenses.

## Demonstration sequence

1. Run `npm run firebase:check` and `npm run dev`; open `http://localhost:5173`.
2. Select Continue with Google, or register/sign in with email and password. Either method opens the same Firebase-backed workspace flow.
3. Add salary income and create a monthly overall budget.
4. Add an expense that crosses 75%, then edit it to cross 90%.
5. Show the dashboard, alert history, read/unread filter, and reports.
6. Reduce the expense and explain historical versus currently active alerts.
7. Add a custom category. Open Import from CSV, download the template, replace the sample records, and upload it. Review Education/Transport suggestions, correct a row, check changes, and import.
8. Re-upload the same file to show the duplicate preview without saving it again. Search transactions and export all matching records as CSV.
9. Open Reports, select a month, and download both CSV and PDF. Show the PDF's three charts, category breakdown, and six-month figures.
10. Switch between light and dark themes. Reload to show persistent sign-in, then log out and show protected-route redirection.

## Explain verification and limits

The backend suite uses actual local Firebase Auth and Firestore emulators and tests account isolation, token rejection, CRUD, exact amounts, concurrency, alert history, and aggregation. Component tests exercise form validation and sign-in state races. Browser tests exercise complete workflows and responsive pages. Production smoke tests check SPA routing, protected APIs, Firebase CSP permissions, and secret exclusion.

This is a personal tracker with per-user snapshot queries. Larger datasets would benefit from indexed date queries and maintained aggregate documents. Recorded balances are not connected to bank accounts. Account/profile details are read-only in the UI.
