# Employee Attendance & Location Tracking System — Design Spec

**Date:** 2026-09-14
**Status:** Approved for planning

## 1. Overview

A single React Native Android app used by both employees and admins of a
company (role-based screens, same login) backed by a NestJS + MongoDB API.
Employees clock in/out at office locations using geofence detection, and
their location is tracked continuously while clocked in so admins can see
who is where. Admins manage employees, offices, and view attendance
reports/live map — all inside the same mobile app, no separate web
dashboard.

**Scale target:** the backend must be designed to handle ~10,000 users at
the code level (indexing, pagination, stateless auth) from the first
commit, not retrofitted later.

## 2. Non-goals (explicitly out of scope for this build)

- Leave/vacation management, payroll, or shift scheduling
- Push notifications beyond local on-device clock-in/out prompts
- Full offline-first sync — only basic retry-on-failure for location pings
- Real-time WebSocket updates for the admin live map (MVP uses polling;
  documented as a future upgrade path, not built now)
- iOS support (Android only, per the project's own name/location)

## 3. Repo structure

```
employee-management-system/            (repo root)
  backend/    — NestJS + TypeScript + MongoDB (Mongoose)
  mobile/     — React Native (bare CLI) + TypeScript + NativeWind
  docs/superpowers/{specs,plans}/
```

No monorepo workspace tooling (Nx/Turborepo/Yarn workspaces) — `backend`
and `mobile` share no code, so two independent `package.json`s is simpler.

## 4. Roles & Auth

- Sign-in is **Google OAuth 2.0** only (`@react-native-google-signin/google-signin`
  on mobile). No password auth.
- Mobile sends the Google ID token to `POST /auth/google`. Backend verifies
  it server-side with `google-auth-library`, checks the email/domain against
  an allowlist (`ALLOWED_GOOGLE_DOMAIN` env var), and either finds the
  existing `User` or creates a new one with `role: 'employee'` by default.
- Backend issues its own **JWT access token (15 min TTL)** and **refresh
  token (30 day TTL)** — the app never sends the Google token on every
  request, only at initial login and token refresh.
- `POST /auth/refresh` exchanges a valid refresh token for a new access
  token.
- Refresh tokens are stored hashed in the `User` document (or a separate
  `RefreshToken` collection keyed by user) so they can be revoked.
- Mobile stores tokens in the device keychain via `react-native-keychain`,
  never in plain AsyncStorage.
- The **first admin** is provisioned via a seed script reading
  `ADMIN_EMAILS` (comma-separated) from environment config — no
  chicken-and-egg UI problem. Existing admins can promote other users to
  admin via `PATCH /users/:id`.
- Two roles: `employee`, `admin`. Every admin-only route is protected by
  **both** a JWT auth guard and a roles guard — never rely on the client
  to hide admin screens as the only protection.

## 5. Data model (MongoDB / Mongoose)

```
User
  _id, googleId, email, name, role: 'employee' | 'admin'
  officeIds: ObjectId[]        // offices this employee can clock into
  refreshTokenHash: string | null
  createdAt

Office
  _id, name, address
  location: { type: 'Point', coordinates: [lng, lat] }   // GeoJSON
  radiusMeters: number
  createdAt

AttendanceRecord
  _id, userId, officeId
  clockIn:  { time: Date, location: { lat, lng } }
  clockOut: { time: Date, location: { lat, lng } } | null
  status: 'open' | 'closed'
  createdAt

LocationPing
  _id, userId
  location: { type: 'Point', coordinates: [lng, lat] }
  timestamp: Date
```

**Required indexes (created in the schema definition, not added later):**

| Collection | Index | Purpose |
|---|---|---|
| Office | `2dsphere` on `location` | geofence proximity queries |
| AttendanceRecord | compound `{ userId: 1, 'clockIn.time': -1 }` | fast per-user history + report queries |
| LocationPing | compound `{ userId: 1, timestamp: -1 }` | latest-ping-per-user lookups |
| LocationPing | TTL `{ timestamp: 1 }`, `expireAfterSeconds: 5184000` (60 days) | prevents unbounded growth from continuous tracking |

## 6. API surface (NestJS modules)

**AuthModule**
- `POST /auth/google` — body `{ idToken }` → `{ accessToken, refreshToken, user }`
- `POST /auth/refresh` — body `{ refreshToken }` → `{ accessToken }`

**UsersModule**
- `GET /users` — admin only, paginated (`?page=&limit=`, max `limit=100`)
- `GET /users/me`
- `PATCH /users/:id` — admin only, update `role` / `officeIds`

**OfficesModule**
- `GET /offices` — paginated
- `POST /offices` — admin only — body `{ name, address, lat, lng, radiusMeters }`
- `PATCH /offices/:id` — admin only
- `DELETE /offices/:id` — admin only

**AttendanceModule**
- `POST /attendance/clock-in` — body `{ officeId, lat, lng }` — rejects if
  the user already has an `open` record, or if `lat/lng` is outside
  `office.radiusMeters` of the office
- `POST /attendance/clock-out` — body `{ lat, lng }` — closes the user's
  current open record
- `GET /attendance/me` — paginated, optional `?from=&to=` date filter
- `GET /attendance` — admin only, paginated, filter by `userId`/`officeId`/date range
- `GET /attendance/summary` — admin only — aggregation pipeline returning
  total hours per employee for a given date range

**LocationModule**
- `POST /location/ping` — body `{ lat, lng, timestamp }` — **rejected with
  409 if the caller has no open AttendanceRecord** (pings only accepted
  while clocked in)
- `GET /location/live` — admin only — latest `LocationPing` per user that
  currently has an open `AttendanceRecord` (used for the admin live map;
  polled by the client every 20–30s, not pushed)

**Cross-cutting:**
- Global `ValidationPipe` (class-validator DTOs on every request body)
- `@nestjs/throttler`: `POST /auth/google` limited to 5/min per IP,
  `POST /location/ping` limited to 1 per 30s per authenticated user
- All list endpoints paginated; no endpoint may return an unbounded array

## 7. Mobile app — geofencing & location flow

- **Geofence detection:** a foreground Android service (started via
  `react-native-geolocation-service` position watching, wrapped by a
  service so it survives backgrounding — Android requires a visible
  notification for background location) computes the employee's distance
  to each of their assigned offices using the haversine formula.
- **Crossing behavior:** entering/leaving an office radius triggers a
  **local notification** (via `notifee`) prompting the employee to confirm
  clock-in/out — never a silent automatic clock-in.
- **Confirmed clock-in** opens an `AttendanceRecord` via
  `POST /attendance/clock-in` and starts a repeating timer that posts to
  `POST /location/ping` every 60–120 seconds.
- **Confirmed clock-out** stops the ping timer and calls
  `POST /attendance/clock-out`.
- **Ping resilience:** on a failed ping request, retry with exponential
  backoff (up to ~3 attempts); after that, drop the ping rather than
  building an offline queue — acceptable data loss for this MVP per the
  non-goals above.

## 8. Mobile app — structure

- **Navigation:** `RootNavigator` → `AuthStack` (Google sign-in screen) or
  `AppStack`. `AppStack` renders `EmployeeTabs` (Home/clock status,
  Attendance History, Profile) or `AdminTabs` (Live Map, Employees,
  Offices, Reports) based on `user.role` from the auth session — same
  binary, same login screen, different tabs after auth.
- **Session state:** React Context holding the decoded user + access
  token; tokens persisted via `react-native-keychain`; access token
  auto-refreshed via `POST /auth/refresh` on 401.
- **Server state:** TanStack Query (React Query) for all API data
  (employee list, offices, attendance, reports) — handles caching,
  loading/error states, and refetch-on-focus for the polling-based admin
  screens.
- **Styling:** NativeWind (Tailwind CSS syntax via `className`).
- **Maps:** `react-native-maps` for the admin live map screen.

## 9. Global constraints (apply to every task)

- TypeScript strict mode in both `backend` and `mobile`
- No endpoint returns an unbounded list — pagination is mandatory
- Every Mongo collection's indexes are defined alongside its schema, in
  the same task that creates the schema
- JWT access token TTL 15 min, refresh token TTL 30 days
- Every admin-only route has both an auth guard and a roles guard
- All secrets (Google client ID, JWT signing secret, Mongo URI) come from
  environment variables, never hardcoded, `.env` is gitignored
- `POST /location/ping` is only ever accepted while the caller has an open
  `AttendanceRecord`

## 10. Build order

1. **Backend** (NestJS API — auth, users, offices, attendance, location)
2. **Mobile app** (React Native — depends on the backend's API contract
   defined in section 6)

Each is planned and executed as its own implementation plan, since they
are different tech stacks with independently testable deliverables (the
backend is fully testable via its own test suite / HTTP calls before any
mobile code exists).
