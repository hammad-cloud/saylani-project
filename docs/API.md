# HCM Lite API reference

Base URL: `/api` (local: `http://localhost:5000/api`, live: `https://hcm-lite-api.vercel.app/api`).

- **Auth:** `Authorization: Bearer <JWT>` from `POST /auth/login`. Accounts with a temporary password can only call `/auth/me` and `/auth/change-password` until they change it.
- **Roles:** A = Admin, H = HR, E = Employee. "own" means the server limits the data to the caller's own `employee_id` (an Employee asking for someone else gets `403`).
- **Errors:** JSON `{ "message": "...", "errors"?: [{ "field", "message" }] }`. `401` not signed in, `403` wrong role/scope, `404` not found, `409` conflict (e.g. second check-in), `422` validation or business rule (e.g. overlap, over-balance), `429` rate limit.

## Setup and auth

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | Liveness check |
| GET | `/setup/status` | public | `{ setupComplete }` |
| POST | `/setup` | public, once | Company name + first Admin. `409` after the first run |
| POST | `/auth/login` | public | Rate limited (20 / 15 min) |
| GET | `/auth/me` | signed in | Current user |
| POST | `/auth/change-password` | signed in | Clears the temporary-password flag. Returns a fresh `token`; every older token of that user stops working |
| POST | `/auth/logout` | signed in | Revokes all of the user's tokens on the server (every device) |

## Organization (M2)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET / PUT | `/settings` | GET: A, H · PUT: A | Office hours, grace, weekend, office location, radius |
| GET | `/departments`, `/designations`, `/leave-types`, `/holidays` | A, H | |
| POST / PUT / DELETE | same paths (`/:id` for PUT, DELETE) | A | Audited. Deleting a department, designation or leave type still in use is `409` with the reason |
| GET | `/users` | A | `?role=&search=` |
| POST | `/users/hr` | A | Returns the temporary password once |
| PATCH | `/users/:id/status` | A | `{ isActive }` |
| POST | `/users/:id/reset-password` | A | Returns a new temporary password once; signs that user out everywhere |

## Employees (M3)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/employees` | A, H (all) · E (own) | `?search=&department=&status=&page=&limit=` |
| POST | `/employees` | H | Creates the employee **and** their login (temporary password) |
| PUT | `/employees/:id` | H | Not on your own record (`403`). Setting `status: "exited"` without `exitDate` uses today |
| GET | `/employees/:id` | A, H · E (own) | Employee 360 |
| GET / PATCH | `/employees/me` | GET: anyone with a profile · PATCH: H, E | PATCH accepts phone and address only |
| POST | `/employees/import` | H | `{ csv, dryRun }`. Dry run returns `{ row, field, reason }` errors |
| GET | `/employees/export` | H | CSV download |

## Attendance (M4)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/attendance/today` | H, E | Own record for today |
| POST | `/attendance/check-in` | H, E | `{ source: "web" }` or `{ source: "camera", lat, lng, accuracy, faceCount, liveness, descriptor? }`. Server time; `409` on a second check-in |
| POST | `/attendance/check-out` | H, E | |
| POST | `/attendance/face/enroll` | H, E | 128-number face descriptor (no photo) |
| GET | `/attendance/calendar` | A, H · E (own) | `?year=&month=&employee=` |
| GET | `/attendance/board` | A, H | `?date=&department=` |
| GET / POST | `/attendance/corrections` | GET: A, H, E (own) · POST: H, E | |
| PATCH | `/attendance/corrections/:id` | H, A | `{ approve, comment? }`. Nobody reviews their own; Admin reviews HR staff requests only |

## Leave (M5)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/leaves` | A, H · E (own) | `?status=&employee=&from=&to=` |
| GET | `/leaves/balance` | A, H · E (own) | `?employee=&year=` |
| POST | `/leaves` | H, E | Working days only; `422` on overlap or over-balance |
| POST | `/leaves/:id/cancel` | H, E (own) | |
| PATCH | `/leaves/:id` | H, A | `{ approve, comment? }`. Nobody approves their own leave; Admin reviews HR staff requests only |

## Payroll (M6)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/payroll/runs` | A, H | |
| POST | `/payroll/runs` | H | `{ year, month }`: create or recompute a draft. `409` if finalized |
| GET | `/payroll/runs/:id` | A, H | Run + payslips |
| POST | `/payroll/runs/:id/finalize` | A | Locks the month, notifies employees |
| GET | `/payroll/payslips` | A, H · E (own, finalized only) | |
| GET | `/payroll/payslips/:id` and `/:id/pdf` | same as above | PDF download |

## Dashboards (M7)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/analytics/admin` | A | `?from=&to=&department=` (ISO dates, at most 366 days; bad values are `422`) |
| GET | `/analytics/hr` | A, H | same filters |
| GET | `/analytics/me` | anyone with a profile | Personal dashboard |
| GET | `/analytics/attendance`, `/leave`, `/payroll`, `/insights` | A, H | same filters |

## AI assistant (M8)

All AI calls run on the server (the key never reaches the browser), time out after 45 s, are limited to `AI_HOURLY_LIMIT` per user per hour, and are logged in `ai_logs`.

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/ai/chat` | everyone | `{ messages }`. Tools run with the caller's role and scope |
| POST | `/ai/summary` | A, H | `{ kpis }` → 3 to 5 bullets from those numbers only |
| POST | `/ai/smart-leave` | H, E | `{ text }` → validated `{ form, workingDays, remaining }`. Never saves |

## Comms and audit (M9)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET / POST | `/announcements` | GET: everyone · POST: A, H | |
| GET | `/notifications` | everyone (own) | |
| POST | `/notifications/read-all` | everyone (own) | |
| GET | `/audit-logs` | A | `?entity=&action=&page=`. Read-only; entries cannot be changed or deleted |
