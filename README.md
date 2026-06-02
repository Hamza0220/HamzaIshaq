# GGI Backend — Hamza Ishaq

> **Stack:** TypeScript · Express.js · PostgreSQL (Neon) · Prisma · Auth0 · Zod · Jest · Pino

A production-grade backend system implementing AI Chat and Subscription management with security-first design, Clean Architecture, and Domain-Driven Design.

---

## Table of Contents

1. [Architecture Decisions](#architecture-decisions)
2. [Security Model](#security-model)
3. [Setup Instructions](#setup-instructions)
4. [API Endpoints](#api-endpoints)
5. [Environment Variables](#environment-variables)
6. [Running Tests](#running-tests)

---

## Architecture Decisions

### Clean Architecture with DDD

The codebase is organized in strict layers — each layer only depends on the one below it. Framework and ORM code never leaks into business logic.

```
Controller Layer      ← HTTP in/out only, no business logic
       ↓
Domain Services       ← Use-cases, orchestration
       ↓
Domain Policies       ← Business rules (QuotaPolicy, BillingPolicy)
       ↓
Domain Entities       ← Pure TypeScript interfaces/classes
       ↓
Repositories          ← Data-access abstraction (Prisma)
       ↓
Infrastructure        ← Prisma, Auth0, Mock OpenAI, config
```

**Hard rule enforced:** `src/modules/*/domain/**` files contain zero imports from Express, Prisma, or any framework. Entities and services are plain TypeScript — unit-testable without spinning up a server or database.

### Module Structure

```
src/
├── modules/
│   ├── chat/
│   │   ├── domain/entities/     ← ChatMessage interface
│   │   ├── domain/services/     ← ChatService (quota logic)
│   │   ├── domain/policies/     ← QuotaPolicy (3 free / bundle selection)
│   │   ├── repositories/        ← ChatRepository (Prisma)
│   │   └── controllers/         ← ChatController (Express routes)
│   └── subscriptions/
│       ├── domain/entities/     ← SubscriptionBundle, tier helpers
│       ├── domain/services/     ← SubscriptionService (create/cancel/renew)
│       ├── domain/policies/     ← BillingPolicy (payment simulation)
│       ├── repositories/        ← SubscriptionRepository (Prisma)
│       └── controllers/         ← SubscriptionController + AdminSubscriptionController
├── shared/
│   ├── middleware/              ← auth, rbac, nonce, rateLimit, validation, errorHandler
│   ├── errors/                  ← Typed AppError subclasses
│   └── utils/                   ← logger, requestId
└── infrastructure/
    ├── auth/                    ← Auth0 JWKS setup
    ├── config/                  ← Zod-validated env vars
    ├── database/prisma/         ← schema.prisma + migrations
    ├── openai/                  ← mockOpenAI with simulated latency
    └── swagger/                 ← OpenAPI spec
```

### Key Design Decisions

**Why Auth0?**
Auth0 provides production-grade OAuth2/OIDC out of the box — JWT issuance, JWKS key rotation, email+password, and Google OAuth are all handled without any custom auth code. The requirement explicitly forbids custom authentication implementations.

**Why Prisma with Serializable Transactions?**
Quota deduction under concurrent requests must be atomic. Prisma's `$transaction` with `isolationLevel: 'Serializable'` prevents race conditions where two simultaneous requests could both pass the quota check and over-deduct.

**Why Zod with `.strict()`?**
`.strict()` rejects any extra/unknown fields on the request body, preventing mass-assignment attacks. Zod also provides compile-time TypeScript types from runtime schemas — a single source of truth.

**Why Pino?**
Pino is the fastest Node.js JSON logger. Every request is tagged with `requestId`, `userId`, `method`, `path`, `statusCode`, and `responseTime` — sufficient for distributed tracing and debugging in production.

---

## Security Model

Security is enforced in 7 independent layers — a request must pass all of them.

```
LAYER 1 — Transport
  └── Helmet sets HSTS, X-Content-Type-Options, X-Frame-Options, CSP

LAYER 2 — Network
  └── CORS restricted to ALLOWED_ORIGINS
  └── Per-IP rate limiting on all endpoints

LAYER 3 — Authentication
  └── Auth0 JWT verified server-side on every protected request
  └── Validates: issuer, audience, expiry, RS256 signature (via JWKS)

LAYER 4 — Anti-Replay (extra mechanism beyond token possession)
  └── X-Request-Timestamp: rejected if older than 5 minutes
  └── X-Nonce: rejected if the same value was seen before
  └── Satisfies requirement: "token alone must not be sufficient"

LAYER 5 — Authorization (RBAC — enforced at TWO levels)
  └── Controller level: requireRole('ADMIN') middleware on admin routes
  └── Domain policy level: QuotaPolicy.enforceOwnership() in ChatService
                           SubscriptionService ownership checks before
                           cancel/toggleAutoRenew operations

LAYER 6 — Input
  └── Zod strict() — unknown fields rejected, types validated
  └── HTML tag stripping — XSS sanitization on question field
  └── 10 kb request size limit
  └── Content-Type: application/json enforced on POST/PATCH/PUT

LAYER 7 — Data
  └── Atomic Serializable transactions — concurrent quota safety
  └── Prisma ORM — parameterized queries, no SQL injection possible
```

### Rate Limits

| Endpoint group | Window | Max requests | Key |
|---|---|---|---|
| Auth endpoints | 15 minutes | 10 | Per IP |
| Chat endpoints | 1 minute | 20 | Per authenticated user (Auth0 sub) |
| Subscription endpoints | 1 minute | 30 | Per IP |

### Auth0 Custom Claim (Role Injection)

An Auth0 **M2M / Credentials Exchange Action** injects the role into every access token:

```javascript
// Auth0 Action — credentials-exchange trigger
exports.onExecuteCredentialsExchange = async (event, api) => {
  const namespace = 'https://api.ggi-backend.com/';
  api.accessToken.setCustomClaim(namespace + 'role', 'ADMIN');
};
```

The `rbac.middleware.ts` reads `payload['https://api.ggi-backend.com/role']` — role is part of the signed JWT, not a mutable request header.

---

## Setup Instructions

### Prerequisites

- Node.js >= 18.x
- PostgreSQL database (or use the provided Neon connection string)
- Auth0 account (free tier)

### 1. Clone & Install

```bash
git clone https://github.com/<your-username>/HamzaIshaq-GGI-Backend.git
cd HamzaIshaq-GGI-Backend
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env
# Fill in all values — see Environment Variables section below
```

### 3. Database Migration

```bash
npx prisma migrate dev --name init
```

### 4. Auth0 Setup

```
1. Go to manage.auth0.com → Create Account
2. Applications → Create Application → Machine to Machine
   Name: GGI Backend
3. APIs → Create API
   Name: GGI API
   Identifier: https://api.ggi-backend.com
4. APIs → GGI API → Application Access tab
   → Authorize "GGI Backend" app → grant all permissions
5. Actions → Triggers → credentials-exchange
   → Create Action "Add Role to Token" (M2M / Node 22):

   exports.onExecuteCredentialsExchange = async (event, api) => {
     const ns = 'https://api.ggi-backend.com/';
     const adminClientId = '<your_AUTH0_CLIENT_ID>';
     api.accessToken.setCustomClaim(
       ns + 'role',
       event.client.client_id === adminClientId ? 'ADMIN' : 'USER'
     );
   };

   → Deploy → Add to credentials-exchange flow → Apply
6. Copy Domain, Client ID, Client Secret, Audience to .env
```

### 5. Run Development Server

```bash
npm run dev
# Server: http://localhost:3000
# Swagger: http://localhost:3000/api-docs
```

### 6. Get Access Token (Postman / curl)

```
POST https://<AUTH0_DOMAIN>/oauth/token
Content-Type: application/json

{
  "client_id":     "<AUTH0_CLIENT_ID>",
  "client_secret": "<AUTH0_CLIENT_SECRET>",
  "audience":      "https://api.ggi-backend.com",
  "grant_type":    "client_credentials"
}
```

Use the returned `access_token` as `Authorization: Bearer <token>`.

---

## API Endpoints

### Public

```
GET  /health          → Server health check (no auth)
GET  /api-docs        → Swagger UI
```

### Chat (Bearer token required)

```
POST   /api/v1/chat              → Send question, receive AI response
GET    /api/v1/chat/history      → Own chat history
GET    /api/v1/chat/:id          → Single chat message
```

Chat POST also requires:
```
X-Request-Timestamp: <unix_ms>
X-Nonce: <unique_string>
```

### Subscriptions (Bearer token required)

```
POST   /api/v1/subscriptions                    → Create bundle
GET    /api/v1/subscriptions                    → List own bundles
GET    /api/v1/subscriptions/:id                → Get bundle
PATCH  /api/v1/subscriptions/:id/cancel         → Cancel bundle
PATCH  /api/v1/subscriptions/:id/auto-renew     → Toggle auto-renew
```

### Admin (Bearer token + ADMIN role required)

```
GET  /api/v1/admin/metrics                              → System metrics
GET  /api/v1/admin/users                                → All users
GET  /api/v1/admin/chats                                → All chat messages
GET  /api/v1/admin/subscriptions                        → All subscriptions
POST /api/v1/admin/subscriptions/process-renewals       → Trigger renewal job
```

### Subscription Tiers

| Tier | Messages | Monthly | Yearly |
|---|---|---|---|
| BASIC | 10 | $9.99 | $99.99 |
| PRO | 100 | $29.99 | $299.99 |
| ENTERPRISE | Unlimited | $99.99 | $999.99 |

---

## Environment Variables

```env
# App
NODE_ENV=development
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=verify-full

# Auth0
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://api.ggi-backend.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20
```

---

## Running Tests

```bash
# All tests (unit + integration)
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Lint
npm run lint

# Format
npm run format
```

### Test Coverage

| Suite | Tests | What is tested |
|---|---|---|
| `QuotaPolicy.test.ts` | 13 | Free tier limits, bundle selection logic, ENTERPRISE unlimited |
| `BundleSelection.test.ts` | 7 | Highest-remaining bundle picked, edge cases |
| `ConcurrentQuota.test.ts` | 3 | Concurrent requests with 1 quota slot — exactly 1 succeeds |
| `BillingPolicy.test.ts` | 8 | Date calculations, shouldRenew conditions |
| `SubscriptionEntity.test.ts` | 9 | maxMessages and price helpers for all tiers |
| `Cancellation.test.ts` | 6 | Cancel sets fields, preserves history, ownership errors |
| `AuthMiddleware.test.ts` | 3 | 401 on all protected routes without token |
| `ChatApi.test.ts` | 5 | Valid request 200, 401 no token, 400 validation errors |
| `NonceValidation.test.ts` | 4 | Missing headers, expired timestamp, reused nonce |
| `RateLimit.test.ts` | 1 | 429 after 20 requests/minute |
| `SecurityHeaders.test.ts` | 4 | Helmet headers present on all responses |
| `SubscriptionApi.test.ts` | 7 | CRUD, validation, 403 for USER on admin routes |
| **Total** | **70** | |

### Auth0 in Tests

Auth0 is **mocked, not bypassed**. `tests/mocks/auth0.mock.ts` replaces `express-oauth2-jwt-bearer`'s `auth()` with a controlled implementation that:
- Returns `401` when no Bearer token is present (same as real middleware)
- Injects a controlled `req.auth.payload` with configurable role
- Never makes network calls to Auth0
