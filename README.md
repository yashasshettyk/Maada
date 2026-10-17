# Adka Shree Beeramarlara Maada — Accounts & Receipts

A bilingual (English / ಕನ್ನಡ) app for the Maada's money: donations, seves (e.g. Sankranti Seve) with partial payments, events with itemised expenses, a single central ledger, reports, and premium Kannada receipts that can be saved as PNG/PDF and shared to WhatsApp.

It runs as an **Android app** (Capacitor) and in a **web browser**, both talking to one **API on Vercel** backed by **Postgres** (Neon or Supabase).

```
Android APK ─┐
             ├─▶  Vercel: static web app + /api (one serverless function)  ─▶  Postgres (Neon / Supabase)
Web browser ─┘
```

## What it does

| Area | Highlights |
|---|---|
| Dashboard | Available balance (from the ledger), received / spent for a period, pending seve money, income-vs-expense chart (day / month / year), recent activity, quick actions |
| Seves | Seve types with Kannada receipt titles, devotee entries, partial payments, status (pending / partially paid / paid / overpaid), one-step **Seve receipt** |
| Donations | Record, edit, delete; purpose suggestions in Kannada; receipt on save |
| Events & expenses | Item, quantity, rate and shop for each expense; category breakdown; event income and balance; **internal expense bill** for the committee |
| Accounts | Every movement of money with filters (income, expenses, donations, seve payments, event expenses, other income), date range, category, search, period totals |
| Receipts | Donation receipt, Sankranti Seve receipt, expense bill — 2700×1800 PNG / PDF, native share sheet, direct WhatsApp, cancel & reissue with history |
| Reports | Monthly, yearly, income sources, donations by purpose, top donors, seve collections, pending seve payments, event and category expenses — CSV per table and a full PDF |
| Settings | Language, opening balance, receipt wording (all Kannada text editable), number prefixes, seve types, categories, backup/restore, CSV export, sample data |

There is no login. Access is protected with a shared key (see **Security**).

## Money rules (how correctness is guaranteed)

* Amounts are stored as **integer paise** (`BIGINT`) — no floating point anywhere.
* One ledger table (`transactions`) holds exactly one row per real money movement. A unique `(source_type, source_id)` constraint makes double counting impossible; the opening balance can exist only once.
* **Balance = opening balance + income − expenses**, always computed from the ledger. No stored balances.
* A seve's amount is not income until money is received; each payment creates its own ledger row.
* Every create sends an id generated on the phone, so pressing Save twice (or a retry after a bad connection) never creates a duplicate.
* Payments lock their seve entry while saving, so simultaneous payments cannot overshoot the amount due.
* Receipt numbers come from a per-type, per-year sequence updated atomically (`ದೇ-2026-00001`, `ಸೇ-2026-00001`, `EXP-2026-00001`).
* A receipt stores a **snapshot** of what was printed. Editing a donation or payment cancels the old receipt (kept on file) and issues a new one that references it; deleting a record cancels its receipt.
* All related writes happen in one database transaction — a failure leaves nothing half-saved.

## Project layout

```
api/index.ts            Vercel serverless entry (Web Request → Hono app)
server/                 API: routes, ledger & receipt services, DB drivers, migrations runner
db/migrations/          SQL schema (applied automatically, or with `npm run db:migrate`)
shared/                 Money, dates, English & Kannada amount-in-words (used by server and app)
src/                    React app (Vite + Tailwind): pages, components, receipt renderer, i18n
src/receipts/           Canvas renderers for the receipts / bill, PNG & PDF export
android/                Capacitor Android project (+ WhatsApp share plugin)
design/receipts/        Approved receipt designs (reference)
public/branding/        Temple photograph and app icons
tests/                  Vitest: financial scenarios, receipts, backup, failures
```

## Run it locally

Requirements: Node 20+.

```bash
npm install
npm run dev          # API on :3001 (embedded Postgres in .data/) + app on http://localhost:5173
```

No database install is needed for development — the API uses an embedded Postgres (PGlite) stored in `.data/pglite`. To use a real database instead, set `DATABASE_URL` before `npm run dev`.

To explore with example records: **More → Settings → Sample data → Load sample data**. Remove them again with **Remove sample data** before real use.

```bash
npm test             # all financial / receipt / backup tests (real Postgres via PGlite)
npm run build        # type-check + production build into dist/
```

## Deploy

### 1. Create the database

**Neon** (recommended): create a project at <https://neon.tech>, then copy the **pooled** connection string (host contains `-pooler`), e.g.
`postgresql://user:password@ep-xxx-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require`

**Supabase**: Project → Settings → Database → Connection string → **Transaction pooler** (port 6543), with `?sslmode=require`.

Pick a region close to India (e.g. `ap-south-1` Mumbai). The schema is created automatically on the first request. You can also apply it yourself:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

### 2. Environment variables

Copy `.env.example` for reference. In **Vercel → Project → Settings → Environment Variables** add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the pooled connection string from step 1 |
| `MAADA_API_KEY` | a long random secret, e.g. output of `openssl rand -hex 32` |
| `VITE_API_KEY` | **the same value** as `MAADA_API_KEY` (built into the web app) |
| `ALLOWED_ORIGINS` | optional, extra web origins allowed to call the API |

### 3. Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel: **Add New → Project**, import the repository. Framework preset: **Other** (settings come from `vercel.json`).
3. Add the variables from step 2, then **Deploy**.
4. Open `https://<your-project>.vercel.app/api/health` — it should return `{"ok":true,...}` — then open the site.

Strongly recommended: turn on **Vercel → Settings → Deployment Protection** (Vercel Authentication or Password Protection) for the web version, so only committee members can open it in a browser. The Android app talks to the API directly and keeps working.

### 4. Point the Android app at the API

```bash
cp .env.android.example .env.android
# edit .env.android:
#   VITE_API_BASE_URL=https://<your-project>.vercel.app
#   VITE_API_KEY=<same value as MAADA_API_KEY>
```

The API automatically accepts requests from the Android app's origin (`https://localhost`).

## Build the Android app

Requirements: [Android Studio](https://developer.android.com/studio) (includes the Android SDK and JDK 21).

```bash
npm install
npm run android:sync        # builds the app with .env.android and copies it into android/
npm run android:open        # opens the project in Android Studio
```

### Installable test APK (debug)

```bash
npm run android:debug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

### Release APK

1. Create a signing key once (keep it and its passwords safe — you need the same key for every update):
   ```bash
   keytool -genkey -v -keystore maada-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias maada
   ```
   Put `maada-release.jks` in the repository root (it is git-ignored).
2. `cp android/keystore.properties.example android/keystore.properties` and fill in the passwords.
3. Build:
   ```bash
   npm run android:apk
   # → android/app/build/outputs/apk/release/app-release.apk
   ```

In Android Studio you can equally use **Build → Generate Signed App Bundle / APK**.

### Test on a phone

1. On the phone: **Settings → About phone → tap Build number 7 times**, then **Developer options → USB debugging**.
2. Connect by USB and run `adb install -r android/app/build/outputs/apk/release/app-release.apk`
   (or copy the APK to the phone and open it; allow "Install unknown apps" when asked).
3. Open **Beeramarlara Maada**, check the dashboard loads, record a test donation, open its receipt and try **Share**, **WhatsApp**, **Save image** and **Save PDF**. Saved files go to `Documents/Maada/`.
4. Delete the test donation (its receipt is kept as cancelled) or restore a backup.

## Backup and restore

* **Settings → Data & backup → Download backup** saves a single JSON file with every record (donations, seves, payments, events, expenses, income, ledger, receipts with their snapshots and numbering, history). Do this regularly and keep copies off the phone.
* **Restore from backup** first checks the file (links between records, ledger amounts matching their records, no duplicate receipt numbers) and shows what it found; only after you confirm does it replace all data, in a single all-or-nothing step.
* **Export all entries (CSV)** gives a spreadsheet of the ledger.
* Neon and Supabase also keep their own point-in-time backups of the database.

## Security

* No login screens, by design. The API requires the shared key (`MAADA_API_KEY`) on every request when it is set; the app sends it automatically.
* The key is built into the web app and the APK, so treat them as private: share the APK only with committee members, and protect the website with Vercel Deployment Protection.
* Write requests are rate-limited per client (default 120 per minute, stored in the database so it holds across serverless instances).
* Request size limits, strict input validation on the server, CORS limited to known origins, secure headers.
* Never commit `.env*`, `android/keystore.properties` or `*.jks` (all git-ignored).

## Receipt wording and the temple photograph

* All Kannada text on receipts — the Maada name, headings, thank-you lines, footer and number prefixes — is editable in **Settings → Receipt wording**. Changes apply to receipts issued afterwards; existing receipts keep the wording they were issued with.
* Seve receipt titles come from **Settings → Seve types** (e.g. `Sankranti Seve` → `ಸಂಕ್ರಾಂತಿ ಸೇವೆ`). Add more seves there.
* The temple photograph is `public/branding/maada-temple.webp` (transparent background). To replace it, swap that file (keep a transparent PNG/WebP of similar proportions) and rebuild.
* Please have a fluent Kannada reader review the receipt wording once before printing receipts for devotees.

## API overview

All routes are under `/api` and return JSON; errors are `{ "error": { "code", "message", "details" } }`.

`GET /health` · `GET|PUT /settings` · `PUT|DELETE /settings/opening-balance` · `GET|POST|PATCH|DELETE /categories` ·
`GET|POST|PUT|DELETE /rituals` · `GET|POST|PUT|DELETE /ritual-entries` · `POST /ritual-entries/:id/payments` · `PUT|DELETE /ritual-payments/:id` ·
`GET|POST|PUT|DELETE /donations` · `GET|POST|PUT|DELETE /events` · `POST /events/:id/bill` · `GET|POST|PUT|DELETE /expenses` · `GET|POST|PUT|DELETE /incomes` ·
`GET /transactions` (filters + pagination) · `GET /dashboard` · `GET /dashboard/chart` · `GET /reports` ·
`GET|POST /receipts` · `POST /receipts/:id/cancel` · `POST /receipts/:id/reissue` ·
`GET /backup` · `POST /backup/validate` · `POST /backup/restore` · `GET /admin/integrity` · `GET|POST|DELETE /admin/demo-data`
