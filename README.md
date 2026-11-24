<p align="center">
  <img src="apps/web/public/favicon.svg" width="80" alt="TickMark Logo" />
</p>

<h1 align="center">TickMark</h1>

<p align="center">
  <strong>Anti-fraud university attendance using near-ultrasound acoustic pulses &amp; WebAuthn biometrics</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Fastify-5-000000?logo=fastify" alt="Fastify 5" />
  <img src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white" alt="TypeScript 7" />
  <img src="https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/WebAuthn-FIDO2-6C63FF?logo=webauthn&logoColor=white" alt="WebAuthn" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/PWA-ready-5A0FC8?logo=pwa" alt="PWA" />
</p>

---

## The Problem

Traditional attendance systems suffer from **buddy punching** — students checking in for absent classmates. QR codes can be photographed, shared links can be forwarded, and manual roll calls waste lecture time.

## The Solution

TickMark combines **three independent anti-fraud layers** to ensure the student is physically present in the classroom:

```
┌─────────────────────────────────────────────────────────────────┐
│                     ANTI-FRAUD PIPELINE                        │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────────┐    │
│  │ 🔊 Near- │───▶│ 🔑 HMAC-256 │───▶│ 👆 WebAuthn/Passkey │    │
│  │ Ultrasound│    │ 5-sec token  │    │ Biometric signature │    │
│  │ (ggwave)  │    │ rotation     │    │ (TouchID/FaceID)    │    │
│  └──────────┘    └──────────────┘    └────────────────────┘    │
│       │                 │                       │               │
│  Proves PHYSICAL   Can't be relayed       Proves IDENTITY      │
│  room presence     (5s expiry window)     (hardware-bound)     │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | What it proves | How it works |
|-------|---------------|--------------|
| **Near-Ultrasound** | Physical presence in the room | Professor's device broadcasts data-over-sound via [ggwave](https://github.com/ggerganov/ggwave) at ~18 kHz. Ultrasonic waves don't penetrate walls. |
| **HMAC-SHA256 Tokens** | Temporal validity | Tokens rotate every **5 seconds**, making relay/sharing infeasible. Truncated to 48-bit for compact acoustic encoding. |
| **WebAuthn/Passkeys** | Student identity | Each check-in requires a biometric assertion (TouchID, FaceID, Windows Hello). One active device per student, enforced at database level. |

**Bonus:** A **Pulse Verification** system groups tokens into attendance "pulses" (gaps > 60s), so students must prove presence _throughout_ the lecture — not just scan once and leave.

---

## Architecture

```
                        ┌────────────────────────┐
                        │     Vercel CDN          │
                        │  ┌──────────────────┐   │
  Student ──────────────│─▶│  @tickmark/web   │   │
  (PWA + Mic)           │  │  Vite 8 · MPA    │   │
                        │  │  ggwave · WebAuthn│   │
  Professor ────────────│─▶│  idb-keyval (sync)│   │
  (PWA + Speaker)       │  └──────┬───────────┘   │
                        │         │ /api/*         │
  Admin ────────────────│─▶       ▼                │
                        │  ┌──────────────────┐    │
                        │  │ @tickmark/server  │    │
                        │  │ Fastify 5         │    │
                        │  │ Vercel Serverless │    │
                        │  └──────┬───────────┘    │
                        └─────────│────────────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │   PostgreSQL     │
                        │   (Supabase)     │
                        │   RLS enabled    │
                        └──────────────────┘
```

### Monorepo Structure

```
tickmark/
├── apps/
│   ├── server/              # Fastify REST API
│   │   ├── migrations/      # 6 sequential SQL migrations
│   │   └── src/
│   │       ├── lib/         # Auth guards, password hashing, HMAC tokens
│   │       └── routes/      # admin, auth, attendance, dashboard, enrollment,
│   │                        # report, sessions
│   └── web/                 # Vite multi-page PWA
│       ├── src/
│       │   ├── main.ts      # Student enrollment & check-in
│       │   ├── prof.ts      # Professor session & pulse broadcast
│       │   ├── admin.ts     # Admin user/course management
│       │   ├── audio.ts     # ggwave encode/decode engine
│       │   ├── checkin.ts   # WebAuthn signing + IndexedDB offline queue
│       │   ├── listen.ts    # Ultrasound listener & auto-trigger
│       │   └── token.ts     # Web Crypto HMAC token generation
│       └── public/          # PWA manifest, service worker, favicon
├── packages/
│   └── shared/              # Shared types (planned)
├── package.json             # npm workspaces root
└── tsconfig.base.json       # Shared TypeScript strict config
```

---

## Features

### 👨‍🎓 Student App
- **One-time enrollment** via admin-generated hex code + platform biometric (Passkey)
- **Tap to listen** — microphone captures ultrasonic pulse, auto-triggers biometric verification
- **Offline resilience** — signed assertions stored in IndexedDB, synced when network returns
- **Online event listener** — automatic background sync on reconnection

### 👩‍🏫 Professor App
- **Session management** — start/end sessions with one click
- **45-second pulse broadcast** — audible chime followed by continuous ultrasonic token transmission
- **Live dashboard** — 2-second polling for present count, offline records, capacity alerts
- **Fraud detection** — highlights suspicious rows and flags over-capacity scenarios

### 🔧 Admin Panel
- **User management** — create students, professors, and admins
- **Course management** — create courses, set room capacity limits
- **Bulk import** — paste CSV/TSV roster to import up to 2,000 students in one transaction
- **Enrollment codes** — batch-generate and export registration codes as CSV

### 📊 Reporting
- **Pulse-based analysis** — attendance grouped by time-continuous pulses
- **Delay detection** — flags offline submissions > 45 minutes for review
- **Per-student breakdown** — confirmed pulse count, attendance percentage, offline usage

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Backend** | [Fastify](https://fastify.dev/) 5, Node.js, TypeScript 7 |
| **Database** | PostgreSQL (Supabase-compatible) with Row Level Security |
| **Authentication** | WebAuthn/FIDO2 via [@simplewebauthn](https://simplewebauthn.dev/), scrypt password hashing |
| **Cryptography** | HMAC-SHA256 (5s slot tokens), `node:crypto` with `timingSafeEqual` |
| **Frontend** | Vanilla TypeScript, Vite 8 (MPA), Web Audio API |
| **Audio** | [ggwave](https://github.com/ggerganov/ggwave) — near-ultrasound data-over-sound (WASM) |
| **Offline** | [idb-keyval](https://github.com/nicolo-ribaudo/idb-keyval) (IndexedDB), custom sync engine |
| **PWA** | Service Worker (network-first + cache fallback), Web App Manifest |
| **Deployment** | Vercel (serverless backend + static frontend) |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 22
- **PostgreSQL** ≥ 15 (or a [Supabase](https://supabase.com/) project)
- **npm** ≥ 10

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/tickmark.git
cd tickmark
npm install
```

### 2. Configure the Server

```bash
cp apps/server/.env.example apps/server/.env
```

Edit `apps/server/.env`:

```env
# PostgreSQL connection string
DATABASE_URL=postgresql://postgres:PASSWORD@HOST:5432/postgres

# Server port (local dev only; ignored on Vercel)
PORT=3000

# Secret token for admin API endpoints (change this!)
ADMIN_TOKEN=your-secure-admin-token

# WebAuthn Relying Party ID (your domain, or localhost for dev)
RP_ID=localhost

# Allowed origins (comma-separated)
ORIGINS=http://localhost:5173

# Max offline check-ins per student per course before flagging
OFFLINE_QUOTA=4

# Minutes of offline delay before flagging for professor review
REVIEW_DELAY_MIN=45
```

### 3. Run Database Migrations

```bash
npm run migrate -w @tickmark/server
```

This creates all 6 tables: `users`, `courses`, `enrollments`, `credentials`, `class_sessions`, `attendance_records`, plus auth and enrollment support tables.

### 4. Start Development Servers

In **two separate terminals**:

```bash
# Terminal 1 — API server (port 3000)
npm run dev -w @tickmark/server

# Terminal 2 — Frontend dev server (port 5173)
npm run dev -w @tickmark/web
```

The Vite dev server automatically proxies `/api/*` requests to the backend.

### 5. Create the First Admin

```bash
curl -X POST http://localhost:3000/admin/people \
  -H "Content-Type: application/json" \
  -H "x-admin-token: your-secure-admin-token" \
  -d '{
    "universityId": "admin001",
    "fullName": "System Admin",
    "role": "admin",
    "password": "secure-password-here"
  }'
```

Then navigate to `http://localhost:5173/admin` and log in.

---

## User Flows

### Student Enrollment (One-Time)

```
Admin generates enrollment code
         │
         ▼
Student opens app → enters 12-char hex code
         │
         ▼
Browser prompts biometric (TouchID/FaceID/Windows Hello)
         │
         ▼
Public key registered → device bound to student
```

### Attendance Check-In (Each Lecture)

```
Professor starts session → taps "Pulse"
         │
         ▼
Speaker broadcasts near-ultrasound tokens (45s, every ~300ms)
         │                                        ┌─────────────────┐
         ▼                                        │ Student's phone  │
Tokens encoded via ggwave ──── ultrasonic ────▶   │ captures via mic │
(HMAC-SHA256, 5s rotation)     sound waves        │ ggwave decodes   │
                                                  │ auto-fills token │
                                                  │ triggers WebAuthn│
                                                  │ biometric prompt │
                                                  │       │          │
                                                  │       ▼          │
                                                  │ Signed assertion │
                                                  │ → server or      │
                                                  │ → IndexedDB      │
                                                  │   (if offline)   │
                                                  └─────────────────┘
```

---

## API Reference

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | — | Server uptime check |
| `GET` | `/health/db` | — | Database connectivity check |

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/login` | — | Staff login (sets `tm_session` cookie) |
| `POST` | `/auth/logout` | — | Invalidate session |
| `GET` | `/auth/me` | Staff | Current user profile |
| `GET` | `/prof/courses` | Staff | Professor's course list |

### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/admin/users` | Admin | List users (filter by `?role=`) |
| `POST` | `/admin/people` | Admin | Create user with role & password |
| `POST` | `/admin/users/:id/password` | Admin | Reset staff password |
| `GET` | `/admin/courses` | Admin | List all courses |
| `POST` | `/admin/courses` | Admin | Create a course |
| `GET` | `/admin/courses/:id/students` | Admin | Course roster with device status |
| `POST` | `/admin/courses/:id/import` | Admin | Bulk import students (≤ 2,000) |
| `POST` | `/admin/courses/:id/enrollment-codes` | Admin | Generate enrollment codes |

### Sessions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/admin/courses/:id/sessions` | Staff* | Start a new session |
| `GET` | `/admin/sessions/:id/token` | Staff* | Get current 5-second HMAC token |
| `POST` | `/admin/sessions/:id/end` | Staff* | End a session |
| `GET` | `/admin/sessions/:id/attendance` | Staff* | Raw attendance records |

### Enrollment (Student)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/enroll/options` | — | WebAuthn registration challenge |
| `POST` | `/enroll/verify` | — | Verify registration & store key |

### Attendance

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/attendance` | — | Submit signed attendance token |

### Dashboard & Reports

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/admin/courses/:id/capacity` | Staff* | Set room capacity |
| `GET` | `/admin/sessions/:id/summary` | Staff* | Live session stats |
| `GET` | `/admin/sessions/:id/report` | Staff* | Pulse-based attendance report |

> **Staff\***: Professors can access their own courses/sessions; Admins can access all.

---

## Deployment

### Vercel (Recommended)

The project is designed for Vercel with zero additional configuration:

**Backend** (`apps/server`):
```bash
# In Vercel dashboard, set the root directory to apps/server
# Framework: Other
# Build Command: npm run build
# Output Directory: dist
# Add all environment variables from .env.example
```

**Frontend** (`apps/web`):
```bash
# In Vercel dashboard, set the root directory to apps/web
# Framework: Vite
# Build Command: npm run build
# Output Directory: dist
```

The frontend's [`vercel.json`](apps/web/vercel.json) proxies `/api/*` to the backend deployment, solving CORS and ensuring session cookies are first-party.

---

## Database Schema

```
┌──────────────┐     ┌──────────────┐     ┌───────────────────┐
│    users     │     │   courses    │     │   enrollments     │
├──────────────┤     ├──────────────┤     ├───────────────────┤
│ id (UUID PK) │◀────│ professor_id │     │ course_id (FK)    │
│ university_id│     │ id (UUID PK) │◀────│ student_id (FK)   │
│ full_name    │     │ code         │     │ (composite PK)    │
│ role         │     │ title        │     └───────────────────┘
│ password_hash│     │ room_capacity│
│ created_at   │     │ created_at   │
└──────┬───────┘     └──────┬───────┘
       │                    │
       │              ┌─────┴──────────┐
       │              │ class_sessions │
       │              ├────────────────┤
       │              │ id (UUID PK)   │
       │              │ course_id (FK) │
       │              │ short_id       │
       │              │ session_key    │
       │              │ started_at     │
       │              │ ended_at       │
       │              └───────┬────────┘
       │                      │
┌──────┴───────┐    ┌────────┴──────────┐
│ credentials  │    │attendance_records │
├──────────────┤    ├───────────────────┤
│ id (UUID PK) │◀───│ credential_id(FK) │
│ user_id (FK) │    │ id (UUID PK)      │
│ credential_id│    │ class_session_id  │
│ public_key   │    │ student_id (FK)   │
│ sign_count   │    │ token             │
│ active       │    │ assertion (JSONB) │
│ device_name  │    │ mode (online/     │
└──────────────┘    │      offline)     │
                    │ slot_time         │
 ⚡ Partial unique  │ received_at       │
 index enforces     └───────────────────┘
 1 active device
 per student
```

---

## Security

| Mechanism | Implementation |
|-----------|---------------|
| **SQL Injection** | All queries use parameterized placeholders (`$1`, `$2`, ...) |
| **Password Storage** | `node:crypto.scrypt` with 16-byte random salt |
| **Token Verification** | `crypto.timingSafeEqual` (constant-time comparison) |
| **Timing Attacks** | Dummy hash on failed login to prevent user enumeration |
| **Device Binding** | Partial unique index: `one_active_credential_per_user` |
| **Data Isolation** | PostgreSQL Row Level Security enabled on all tables |
| **Session Cookies** | `httpOnly`, `sameSite: strict`, `secure` in production |
| **Offline Abuse** | Per-student course quota + delay-based review flagging |

---

## How the Token System Works

```
 Time ──────────────────────────────────────────────▶
       │ 5s │ 5s │ 5s │ 5s │ 5s │ 5s │ 5s │ 5s │
       ├────┤────┤────┤────┤────┤────┤────┤────┤
Token: │ t1 │ t2 │ t3 │ t4 │ t5 │ t6 │ t7 │ t8 │
       └────┴────┴────┴────┴────┴────┴────┴────┘

Token format: {shortId}.{slot_base36}.{HMAC_6bytes_b64url}
Example:      a1b2c3.n7e9f.xYz12_-A

HMAC = SHA256(session_key, "{shortId}.{slot}") → first 6 bytes → base64url
```

Each token is valid for exactly **5 seconds**. The 48-bit truncated HMAC provides ~2.8 × 10¹⁴ possibilities per slot — infeasible to brute-force within the 5-second window.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `git commit -m "feat: add QR fallback"`
4. Push and open a Pull Request

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built with 🔊 ultrasound and 👆 biometrics — because attendance shouldn't be a trust exercise.
</p>
