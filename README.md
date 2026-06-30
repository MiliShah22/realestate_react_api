# Estatiq API

A multi-tenant **SaaS GraphQL API** powering the Estatiq real-estate platform: the customer/franchise React app, the admin panel, and any future client (mobile app, partner integrations) all talk to this single API.

```
Customer/Franchise React App  ─┐
Admin Panel (React)            ├──►  GraphQL  ──►  Apollo Server  ──►  PostgreSQL (RLS)
Future: Mobile App              ┘                        │
                                                            └──►  Redis (sessions/cache)
```

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 18+, ESM | Modern, no build step needed for the API itself |
| API | Apollo Server 4 + Express | GraphQL with full control over context/auth middleware |
| DB | PostgreSQL 16 | Native Row-Level Security, JSONB, full-text search, generated columns |
| Query builder | Knex.js | Raw SQL when needed (RLS session vars, full-text search) without an ORM's abstraction tax |
| Cache/Sessions | Redis (ioredis) | Rate limiting, future caching layer |
| Auth | JWT (access) + opaque refresh tokens (DB-stored, hashed) | Revocable sessions, short-lived access tokens |
| Batching | DataLoader | Solves GraphQL's N+1 problem per-request |

## Multi-Tenancy Model: Row-Level Security (defense in depth)

Every tenant-owned table (`properties`, `leads`, `reviews`, `subscriptions`, `invoices`, `commission_ledger`, plus `users` for franchise staff) carries a `tenant_id`. Two layers enforce isolation:

1. **Application layer** — every resolver that touches tenant data goes through `withTenant(ctx.rls, trx => ...)`, which sets Postgres session variables (`app.current_tenant_id`, `app.is_platform_admin`) inside a transaction.
2. **Database layer (Postgres RLS)** — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` policies physically filter every query to that tenant, **even if a resolver has a bug** and forgets to filter. `SUPER_ADMIN`/`SUPPORT_AGENT` sessions set `is_platform_admin = true`, which bypasses RLS for cross-tenant reporting.

This means a SQL injection or a missed `WHERE tenant_id = ?` in application code still **cannot** leak another franchise's data — the database itself refuses to return rows outside the session's tenant.

## SaaS Primitives

| Table | Purpose |
|---|---|
| `plans` | Pricing tiers (Starter/Growth/Enterprise) — listing limits, staff seat limits, commission rate |
| `tenants` | One row per franchise. Has `status` (TRIAL/ACTIVE/PAST_DUE/SUSPENDED/CANCELLED), trial expiry, plan, commission override |
| `subscriptions` | Billing cycle history per tenant (links to Stripe/Razorpay subscription IDs) |
| `invoices` | Generated invoices, payment status |
| `commission_ledger` | Per-deal commission revenue — the platform's cut on top of subscription fees |
| `audit_logs` | Append-only trail of sensitive actions (suspensions, plan changes, status changes) |

Revenue has **two streams**, both queryable via `revenueBreakdown` for the admin Reports page: subscription revenue (MRR from `invoices`) and commission revenue (`commission_ledger`).

## Project Structure

```
db/
  knexfile.js                Knex connection config
  migrations/                12 migrations, run in order — full schema history
  seeds/01_initial_data.js   Demo data matching the frontend's demo accounts
src/
  server.js                  Express + Apollo Server entrypoint
  db/
    connection.js            Shared Knex instance
    withTenant.js             RLS session-variable transaction helper
  graphql/
    context.js                Per-request context: auth, RLS scope, loaders
    schema/                   Domain-split GraphQL SDL (auth, tenant, property, lead, misc, shared)
    resolvers/                Domain-split resolvers, merged in resolvers/index.js
  loaders/index.js            DataLoader instances (N+1 prevention)
  utils/                      jwt, password, format, logger
```

## Getting Started

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Install deps
npm install

# 3. Configure env
cp .env.example .env

# 4. Run migrations
npm run migrate

# 5. Seed demo data (same accounts the frontends already use)
npm run seed

# 6. Start the API
npm run dev
```

GraphQL endpoint: `http://localhost:4000/graphql` (Apollo Sandbox UI in development).
Health check: `http://localhost:4000/health`

## Demo Accounts (seeded)

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@estatiq.in` | `Admin@123` |
| Franchise Owner | `franchise@estatiq.in` | `Franchise@123` |
| Customer | `customer@estatiq.in` | `Customer@123` |

These match the demo credentials already wired into the React frontend and admin panel — log in there once this API is running behind them to see the full flow live.

## Connecting the Frontends

Both React apps currently read/write `localStorage` for demo data. To wire them to this API:

1. Add an Apollo Client (or plain `fetch`) pointed at `http://localhost:4000/graphql`.
2. Replace `localStorage` reads in `AuthContext`/`AppContext` with `login`/`signup`/`me` GraphQL operations.
3. Replace the static `PROPERTIES`/`USERS`/`LEADS` arrays in `data.js` with `properties`/`users`/`leads` queries.
4. Store the returned `accessToken` in memory (or a secure cookie) and send it as `Authorization: Bearer <token>` on every request; use `refreshToken` to silently renew.

## Key GraphQL Operations

```graphql
# Auth
mutation { signup(input: {...}) { accessToken refreshToken user { id role } } }
mutation { login(input: { email: "...", password: "...", role: CUSTOMER }) { accessToken } }
mutation { changePassword(currentPassword: "...", newPassword: "...") { success } }
mutation { requestPasswordReset(email: "...") { success } }

# Properties (public search)
query { properties(filter: { city: "Bengaluru", bhk: ["2 BHK"] }) { items { id title priceDisplay } pageInfo { totalCount } } }

# Franchise dashboard
query { dashboardStats { totalProperties activeUsers monthlyRevenuePaise newLeads } }
query { myTenant { name listingCount activeLeadCount staffCount } }

# Admin platform reports
query { revenueBreakdown { subscriptionRevenuePaise commissionRevenuePaise totalRevenuePaise } }
query { tenants(pagination: { page: 1, pageSize: 20 }) { items { name status } pageInfo { totalCount } } }
```

## Security Notes

- Passwords hashed with bcrypt (10 rounds), never logged or returned.
- Refresh tokens stored **hashed** (SHA-256) — a DB leak doesn't expose usable tokens.
- Refresh token rotation: every `refreshToken` call revokes the old token and issues a new one.
- Password reset invalidates **all** existing sessions for that user.
- `requestPasswordReset` always returns success regardless of whether the email exists (no user enumeration).
- CORS is an explicit allow-list (`CORS_ORIGINS` env var), never `*`, since requests carry bearer tokens.
- Production `formatError` strips internal error details/stack traces from `INTERNAL_SERVER_ERROR` responses.

## What's Stubbed for Local Dev

- **Email/SMS delivery**: password reset links and OTP codes are `console.log`'d instead of sent (see `TODO` comments in `auth.js` resolver). Wire up `nodemailer`/Twilio in production.
- **OTP verification**: in non-production envs, any 6-digit code is accepted for `verifyOtp` to make local testing painless (see `resolvers/auth.js`).
- **Payments**: `invoices`/`subscriptions` tables are ready for Stripe/Razorpay webhook integration, but webhook handlers aren't implemented yet — `external_payment_id`/`external_subscription_id` columns are there waiting for them.
