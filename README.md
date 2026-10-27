# HCM Lite

AI-assisted Human Capital Management for **Admin, HR and Employees**: built for the Saylani Hackathon (24 Oct 2026).

The app starts **empty**: no seed or dummy data. Admin sets up the company, HR registers employees, and every number on the dashboards and in AI answers comes from what people do in the app.

- **Live app:** https://hcm-lite-one.vercel.app
- **API:** https://hcm-lite-api.vercel.app/api/health
- **API reference:** [docs/API.md](docs/API.md) · **Challenge brief:** [docs/Saylani_Hackathon_HCM_Lite_Brief.pdf](docs/Saylani_Hackathon_HCM_Lite_Brief.pdf)

---

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS v4 (design tokens: navy / white / teal), React Router, Recharts, sonner, `@vladmandic/face-api` (camera check-in + blink liveness) |
| Backend | Node.js 20+, Express 5, Mongoose 9 (MongoDB 7), Zod validation, JWT + bcrypt, PDFKit, express-rate-limit, helmet |
| AI | Google Gemini (`gemini-3.5-flash-lite`) via its OpenAI-compatible API with tool calling. Key lives **only** on the server. |
| Tests & CI | `node:test`: business-rule unit tests, API integration tests (demo script, role matrix, data scope, sessions, integrity) against throwaway databases, and the blink detector. A load / stress script. GitHub Actions runs tests, build and `npm audit` on every push |

## Run it locally (about 5 minutes)

Prerequisites: Node.js 22 (see `.nvmrc`; 20.6+ works), Docker (or any MongoDB 7).

```bash
# 1. Database
docker compose up -d                      # MongoDB on localhost:27017

# 2. Backend
cd backend
cp .env.example .env                      # then set AI_API_KEY (see below)
npm install
npm run dev                               # http://localhost:5000/api/health

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                               # http://localhost:5173
```

Open http://localhost:5173. A fresh database shows the **first-run setup** screen.

### Create the first Admin

Either:
- fill in the first-run screen (company name + Admin name, email, password), **or**
- set `COMPANY_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` in `backend/.env` before the first start; the Admin is created on boot.

Then Admin creates HR logins; HR registering an employee creates that employee's login. Both get a **temporary password that must be changed at first sign-in**.

### Set the AI key

In `backend/.env`:

```env
AI_API_KEY=your-gemini-api-key
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-3.5-flash-lite
```

Without a key everything works except the AI features, which show a friendly fallback.

### Run the tests

```bash
cd backend && npm test     # 22 tests: business rules + API integration (needs MongoDB, see step 1)
cd frontend && npm test    # blink (liveness) detector
cd backend && npm run load # optional load / stress check (a few minutes)
```

| Suite | What it proves |
| --- | --- |
| `tests/rules.test.js` | Attendance status, Haversine distance, working days, tax slabs, payslip maths (unit) |
| `tests/demo-flow.test.js` | The whole judging script through the real API: setup → HR → employees → check-in → leave → payroll → finalize → payslip PDF, with the "cannot" rules along the way |
| `tests/rbac.test.js` | **Role matrix**: 22 endpoints × 3 roles match the brief's access table; employees only ever read their own rows; forged / unsigned / `alg: none` tokens, NoSQL-operator logins and deactivated accounts are rejected; dashboard filters are validated; the AI payroll tool never shows an employee draft pay; concurrent dashboards agree and a new record shows on the next request |
| `tests/auth.test.js` | Six simultaneous first-run setups create exactly one Admin; password change, Admin reset and logout revoke older sessions; tokens from before that change keep working |
| `tests/integrity.test.js` | Single-HR company: Admin reviews the HR officer's leave and corrections, nobody reviews their own; exit date defaults to today and stops pay; org records in use cannot be deleted |

Each API suite uses its own throwaway database (`hcm-lite-test`, `-rbac`, `-auth`, `-integrity`), created and dropped by the test, and never calls the real AI provider. They are skipped automatically if MongoDB is not running.

`npm run load` seeds a separate `hcm-lite-test-load` database with 200 employees and 90 days of activity, then measures the heaviest endpoints at 1 and 10 concurrent users plus a 100-user stress run (results below). `SNAPSHOT=out.json npm run load` saves every endpoint's answer instead, to prove an optimization changes no numbers.

## 5-minute demo script

1. **Fresh install → Admin**: first-run setup → *Company settings* (office hours, grace, weekend, "Use my current location" + radius) → *Organization* (add a department; leave types Annual 14 / Sick 8 / Casual 10 / Unpaid are already set up) → *Users & logins* → **New HR login** (temporary password shown once).
2. **HR**: sign in, change password → *Employees* → **Register employee** ×2-3 (each shows a temporary password; CSV import with dry run is also there).
3. **Employee**: sign in, change password → dashboard **Check in** (or **Camera**: face + GPS geofence).
4. **Employee** → *Leave* → Smart leave: *"Need next Monday and Tuesday off for my sister's wedding"* → form pre-filled (casual, correct dates) → **Apply**. **HR** → *Leave approvals* → Approve with comment.
5. **HR** → Dashboard → **Summarize**; header **Ask assistant** → *"Who is on leave today?"* → *Payroll* → pick month → **Create draft**. **Admin** → *Payroll* → open run → **Finalize** (locked).
6. **Employee** → *Payslips* → PDF; ask the assistant *"What is Sara's salary?"* → politely refused. **Admin** → *Audit log* (expand a row for before/after JSON).

## Roles and access

Access is enforced **on the server** for every request (`authenticate` + `authorize(roles)` + `scopedEmployeeId` data-scope guard); the menus only hide what a role can't use. The AI assistant calls the same services with the caller's scope. Nobody reviews their own leave or attendance correction, and nobody (HR included) edits their own salary, status or job details.

| | Admin | HR | Employee |
| --- | --- | --- | --- |
| Company settings, org lists | Manage | View | - |
| HR logins, deactivate / reset any login | Manage | - | - |
| Employees | View all | Register, edit, CSV import/export | Own (edit phone & address) |
| Attendance | Board + calendars; review corrections **from HR staff** | Board, approve corrections, own check-in | Own check-in, calendar, request correction |
| Leave | View; review leave **from HR staff** | Approve / reject with comment, own leave | Apply, cancel, balance, smart leave |
| Payroll | **Finalize (locks month)** | Salary structure, create/recompute draft | Own finalized payslips (PDF) |
| Dashboards | Company | HR | Personal |
| AI assistant | All company data | HR data | Own data + policy |
| Audit log | View (read-only) | - | - |

## Functionality checklist (brief §8)

| # | Functionality | Status |
| --- | --- | --- |
| 01 | First-run setup (UI or env) | ✅ |
| 02 | Login / logout / change password, role menus and dashboards | ✅ forced change of temporary password |
| 03 | Company settings incl. office location + radius | ✅ |
| 04 | Departments, designations, leave types + quotas, holidays | ✅ |
| 05 | Create HR logins; deactivate / reset any login | ✅ |
| 06 | Register employee (creates login), edit; employee edits phone & address | ✅ |
| 07 | Directory with server-side search, filters, paging; Employee 360 | ✅ |
| 08 | CSV import with dry-run error report (row + field + reason); CSV export | ✅ |
| 09 | Web check-in / check-out (server time, 409 on second check-in) | ✅ |
| 10 | Attendance calendar + daily board | ✅ |
| 11 | Attendance correction request / approve | ✅ |
| 12 | Apply / cancel leave, balance, history (working days only; overlap / over-balance = 422) | ✅ |
| 13 | Approve / reject leave with comment | ✅ |
| 14 | Salary structure (basic → HRA 40%, medical 10%, gross 1.5×) | ✅ |
| 15 | Monthly payroll draft (prorating, absent / unpaid / half-day deductions, tax slabs) | ✅ |
| 16 | Admin finalizes payroll; finalized month is locked | ✅ |
| 17 | Payslips with PDF download | ✅ |
| 18 | Dashboards with date-range + department filters (server-side aggregation) | ✅ |
| 19 | AI chat with tools, scoped to the user | ✅ |
| 20 | AI dashboard summary (3-5 bullets from on-screen KPIs) | ✅ |
| 21 | Smart leave (sentence → validated JSON → pre-filled form; user confirms) | ✅ |
| 22 | Policy Q&A from the business rules in the system prompt | ✅ |
| 23 | Announcements | ✅ |
| 24 | In-app notifications (leave / correction decisions, payslips, announcements) | ✅ |
| 25 | Audit log with actor, action, entity, before/after JSON (append-only) | ✅ |

### Bonus

| Bonus | Status |
| --- | --- |
| Camera attendance: face detection (exactly one face) + GPS, Haversine geofence checked on the server, GPS accuracy ≤ 100 m | ✅ web (laptop / phone browser) |
| Face matching against the employee's enrolled face descriptor | ✅ (no photo stored, only the 128-number descriptor) |
| Liveness check: blink once (eye-aspect-ratio on face landmarks), enforced by the server | ✅ |
| Attrition risk score | ✅ HR dashboard |
| Absence anomaly flags | ✅ HR dashboard |
| Late penalty rule (3 lates = 0.5 day) | ✅ applied in payroll, shown per payslip |
| AI understands Roman Urdu | ✅ chat and smart leave |
| Dark mode / PWA | ✅ both (installable, offline app shell) |

## AI assistant (M8)

- `POST /api/ai/chat`: the model picks from 7 tools (`get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`). The backend runs each tool through the **same services and permission checks** as the REST API, so answers match the dashboards and an employee can never read a colleague's data.
- `POST /api/ai/summary`: Admin / HR; only the KPI JSON on screen is sent.
- `POST /api/ai/smart-leave`: output validated with Zod against real leave-type codes and dates, retried once, otherwise the normal form is shown. **The AI never saves anything**; the user presses Apply.
- Guardrails: key in `AI_API_KEY` on the server only; 45 s timeout with a friendly fallback; 20 requests per user per hour; every call logged in `ai_logs`; answers labelled *AI-generated*. For employees every tool is forced to their own employee id and payroll tools read finalized payslips only.

## Business rules

| Rule | Where |
| --- | --- |
| Late after start + grace (09:15); half day under 5 h; missing checkout; absent with no record and no approved leave | `backend/src/modules/attendance/attendance.rules.js` |
| Working days skip weekends + holidays; quotas; overlap / over-balance → 422 | `backend/src/modules/leave/leave.service.js` |
| Gross = 1.5 × basic; per day = gross ÷ working days; deductions; prorating; tax slabs on gross × 12 | `backend/src/modules/payroll/payroll.rules.js` |
| Metrics (attendance rate, late %, absenteeism, leave utilization, attrition, payroll cost) | `backend/src/modules/analytics/analytics.service.js` |

Settings are stored in the database and apply to new records only. Times are stamped by the server in the office time zone (`TZ_OFFSET_MINUTES`, default Pakistan +05:00).

## Project structure

```
.github/workflows/ci.yml   tests + build + dependency audit on every push
docs/                      API reference, challenge brief
backend/
  api/index.js     Vercel serverless entry (same Express app)
  src/
    config/        env + MongoDB connection
    middlewares/   authenticate, authorize, validate (Zod), error handler
    models/        Mongoose schemas (users, employees, attendance, leave, payroll, settings, audit, ai_logs, ...)
    modules/       one folder per module: *.routes.js → *.service.js (rules) → models
      setup/ auth/ settings/ org/ users/ employees/ attendance/ leave/ payroll/ analytics/ ai/ comms/
    utils/         audit, notifications, scope guard, dates, errors
  tests/           unit + API integration suites (shared harness in helpers.js)
  scripts/load.js  load / stress check (npm run load)
frontend/
  src/
    api/           axios client (JWT, errors, file download)
    components/    shared UI, charts, AI chat / summary, check-in widget, calendar, forms
    config/        role-based menus
    context/       auth
    layouts/       app shell (sidebar, notifications, dark mode, assistant)
    pages/         admin/ hr/ employee/ shared/ + dashboard, login, setup
    utils/         liveness (blink) detector + its test
  public/          app icon, PWA manifest, service worker
docker-compose.yml MongoDB for local development
```

## Security

- bcrypt password hashes; JWT auth; login rate limit; helmet security headers (HSTS, CSP, no-sniff, frame protection); CORS limited to `CLIENT_URL`; real client IPs behind the proxy (`trust proxy`).
- Every route checks the role **and** the data scope; employees only ever read rows with their own `employee_id`.
- Deactivated users are rejected on every request; temporary passwords block all routes except change-password.
- Each token carries a per-user version: changing the password, an Admin reset and logout revoke every older session (logout signs out all devices).
- First-run setup can only ever create one Admin, even under concurrent requests (unique index).
- Zod validation on every write; CSV import validated row by row.
- Audit log is append-only (updates and deletes are blocked at the model level) and readable by Admin only.
- Errors never expose internals: unexpected errors return a generic message; bad JSON is a clear `400`.
- Secrets live only in `.env` / the hosting provider's env settings (git-ignored and excluded from Vercel uploads via `.vercelignore`); only `.env.example` is committed. The browser bundle contains no keys; all AI calls go through the server.

## Deployment (how the live app is hosted)

- **Database:** MongoDB Atlas M0 (free). Network access allows Vercel's dynamic IPs.
- **Backend:** Vercel project from `backend/`. `api/index.js` wraps the same Express app as a serverless function and `vercel.json` sends every path to it. Env vars: `MONGO_URI`, `JWT_SECRET`, `AI_API_KEY` (optional: `AI_BASE_URL`, `AI_MODEL`, `AI_HOURLY_LIMIT`, `TZ_OFFSET_MINUTES=300`).
- **Frontend:** Vercel project from `frontend/` (Vite build). `vercel.json` proxies `/api/*` to the backend (same origin, no CORS setup) and sends every other path to `index.html`.

Both Vercel projects are connected to this GitHub repository (root directories `backend/` and `frontend/`), so **every push to `main` redeploys the live app automatically**. Pull requests and other branches get preview deployments.

## Performance

Measured with `npm run load` (200 employees, 90 days, ~12,000 attendance records; one local Node process with the load generator in the same process, so numbers are pessimistic). p50 response times:

| Endpoint | 1 user | 10 users |
| --- | --- | --- |
| HR dashboard (90 days) | ~430 ms | ~350 ms (identical requests share one computation) |
| HR dashboard (month) | ~100-230 ms | ~600 ms |
| Attendance board | ~50 ms | ~330 ms |
| Admin dashboard / employee search | ~30 / ~10 ms | ~60 / ~50 ms |
| Payroll draft (whole month) | ~150 ms | - |

Stress, 100 concurrent users: the same dashboard 0.6 s and every request different 2.0 s, **0 errors**. Before optimization the 90-day dashboard took 2.5 s for one user and the stress run dropped 22 connections. Dashboards are computed live on every request (no cache), so they always match the records just entered.

## Deviations from the brief

| Brief | This app | Why |
| --- | --- | --- |
| AI timeout 15 s | 45 s | Raised during development (commit `9c40b70`) so tool-calling answers have time to finish; the friendly fallback still shows on timeout |
| Admin: leave approvals "View" | Admin reviews leave and attendance corrections **from HR staff only** | With a single HR officer, nobody else could approve HR's own requests |
| (not specified) | Password change, Admin reset and logout end older sessions | Otherwise an old or stolen token stays valid until it expires |

## Not done / known limits

- No native mobile app; camera attendance runs in the web app (works in phone browsers).
- Liveness is a blink check only; a replayed video of the person could still pass.
- Face-detection models load from the jsDelivr CDN, so camera check-in needs internet.
- A leave spanning two calendar years counts against the start year's quota.
- Tax slabs are the brief's illustrative slabs, not official FBR tables.
- The sign-in token is kept in the browser's `localStorage`, so a cross-site-scripting bug could read it (React escapes rendered output, but an `httpOnly` cookie would be stronger).
- On Vercel each serverless instance keeps its own login rate limit, dashboard request sharing and once-a-day "missing checkout" pass; the AI limit (20 / hour) is stored in the database and holds across instances.
- Multi-step writes (payroll recompute, applying leave) are not wrapped in database transactions; two simultaneous identical requests could race.
- One fixed office time zone (`TZ_OFFSET_MINUTES`, default UTC+5), no daylight saving.
- An HR officer registering their **own** employee profile sets their own starting salary (later edits by themselves are blocked); in a company with one HR there is nobody else who could.
- Employees marked exited **before** the exit-date default was added, with no exit date, are still paid until someone saves their record again.
- UI fixes are verified by hand in the browser (desktop and 375 px); there are no automated component tests.
