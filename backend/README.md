# Employee Attendance Backend

NestJS + MongoDB API for the employee attendance & location tracking system.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in real values:
   - `MONGO_URI` — a running MongoDB instance (`docker run -d -p 27017:27017 mongo:7` for local dev)
   - `GOOGLE_CLIENT_ID` — OAuth 2.0 client ID from Google Cloud Console
   - `ALLOWED_GOOGLE_DOMAIN` — restrict sign-in to this email domain
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — any random 32+ character strings
   - `ADMIN_EMAILS` — comma-separated emails to promote to admin

## Running

- `npm run start:dev` — dev server with hot reload
- `npm run test` — unit tests (Vitest)
- `npm run test:e2e` — end-to-end tests (Vitest + an in-memory MongoDB via
  `mongodb-memory-server` — no external database needed)
- `npm run build` — production build (also the source of truth for full
  TypeScript type-checking; `test`/`test:e2e` transpile only)

## Bootstrapping the first admin

1. Have the intended admin sign in once via the mobile app (or `POST /auth/google` directly) — this creates their `User` document with the default `employee` role.
2. Set `ADMIN_EMAILS` in `.env` to include their email.
3. Run `npm run seed:admins`.

## API summary

See `docs/superpowers/specs/2026-09-14-employee-attendance-system-design.md`
section 6 for the full endpoint list.
