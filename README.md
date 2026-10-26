# Instruent

A React + Vite + TypeScript rental marketplace app.

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm
- Google Chrome or any modern browser

## Install dependencies

```bash
npm install
```

## Authentication

RentReel uses email/password accounts with six-digit email verification and password-reset codes delivered through Resend. Access tokens are short-lived JWTs held in browser memory; refresh tokens are opaque, stored hashed in PostgreSQL, rotated on every refresh, and sent only as an HttpOnly cookie. The access token is sent to the API and Socket.IO over HTTPS.

Configure `DATABASE_URL`, `DIRECT_URL`, `CLIENT_URL`, `ALLOWED_ORIGINS`, `JWT_ACCESS_SECRET`, `OTP_HMAC_SECRET`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` in `.env`. Generate separate strong secrets with `openssl rand -base64 48`. Refresh tokens are opaque, so `JWT_REFRESH_SECRET` is not used. Optional Cloudinary variables are required together for room photo uploads; without them, the API reports that uploads are unavailable. Keep `.env` private; it is ignored by Git.

## Initialize the database

The Prisma 6 schema is split across `.prisma` files in `prisma/`; `prisma.config.ts` configures the schema and migrations directories. The direct connection URL must include `schema=rentreel` so migration history is scoped to RentReel, for example `...?sslmode=require&schema=rentreel`.

For a fresh database, apply checked-in migrations:

```bash
npm run db:migrate:dev
```

The custom-auth migration is additive. It keeps the existing nullable legacy identity column for the cutover period; migrated legacy users can use **Forgot password** to establish a password and verify mailbox ownership. After every legacy account has been migrated and the public-schema compatibility mapping is retired, remove that column only in a separately reviewed migration. Expired OTPs, reset grants, and refresh sessions are cleaned by the server's scheduled cleanup function; run it from a maintenance job at least daily.

Authentication rate limits use the existing in-memory `express-rate-limit` store plus account-keyed in-memory throttling. This is safe for a single Node instance but is not shared across replicas; use a Redis-backed store before horizontally scaling the API.

`DATABASE_URL` must use Neon pooled connection details; `DIRECT_URL` must use the Neon direct connection with `schema=rentreel`. The checked-in initial migration creates only the `rentreel` schema and its tables; existing tables in `public` are preserved. Never run a reset or force-reset command.

For production deployments, apply migrations with:

```bash
npm run db:migrate:deploy
```

## Run in development mode

Start the API and Socket.IO server in one terminal:

```bash
npm run server
```

To start the API and Vite client together during development, use:

```bash
npm run dev:all
```

`npm run dev` starts the same combined API and Vite development environment. Do not start only
the Vite server when using authenticated pages such as Reels, because `/api` requests require
the API server and otherwise appear as proxy 502 errors.

Start the Vite app in a second terminal:

```bash
npm run dev
```

Set `CLIENT_URL` and comma-separated `ALLOWED_ORIGINS` to the exact browser origins (for local Vite, `http://localhost:5173`). CORS permits only those origins. The development proxy forwards API, media, and Socket.IO traffic to the server on `PORT` (default `3000`). Register and verify an email account to create a real profile, publish photo posts or video reels, follow/unfollow users, and message other users in real time.

Authenticated users send a presence heartbeat every 45 seconds. A user is shown as online for the configured `PRESENCE_TIMEOUT_SECONDS` window (default `120`) after their last heartbeat. Set this server-side variable to adjust the inactivity timeout.

Room photos and videos are validated by the API and uploaded to Cloudinary with short-lived signed parameters. The server reserves each generated `publicId` in `MediaUpload`, verifies the uploaded Cloudinary asset before attaching it to a post, reel, or room, and stores its secure URL and `publicId` in PostgreSQL. Content deletion removes its Cloudinary asset; expired unattached reservations are cleaned up on a later upload.

The Create dialog supports up to 10 photos per post or one video reel. Publishing first uploads and verifies media with Cloudinary, then atomically saves the content and marks its upload reservations as attached in PostgreSQL. If publishing fails after upload, the verified media remains available for retry; real-time feed/reel events are sent only after the database transaction commits.

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the root `.env`. Find the Cloud name and API credentials in Cloudinary Console > Dashboard > API Keys. These values are read by the server only; never use a `VITE_` prefix for credentials. If `CLOUDINARY_CLOUD_NAME` is missing, the API returns an explicit 503 naming that variable instead of substituting a mock service.

Open:

```text
http://localhost:5173/
```

## Production build

```bash
npm run build
```

The build generates the Prisma client, type-checks the client and server, emits the runnable API server to `dist-server/`, and builds the browser app to `dist/`.

## Production deployment

Deploy the API, Socket.IO server, and built frontend together as one Node.js service. The Express server serves the `dist/` client in production, so the service must include both `dist/` and `dist-server/`. Configure the deployment platform to run the built JavaScript with Node rather than the development `tsx` scripts.

Set these server environment variables in the deployment platform (never commit credentials):

- `NODE_ENV=production`
- `PORT` to the service's assigned listening port
- `CLIENT_URL` to the exact public browser origin, including scheme
- `DATABASE_URL` and `DIRECT_URL` using the production PostgreSQL connection details documented above
- `APP_URL` and `ALLOWED_ORIGINS` set to the HTTPS deployment origins
- `JWT_ACCESS_SECRET` with at least 32 random characters
- `OTP_HMAC_SECRET` with a different value and at least 32 random characters
- `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` together if uploads are enabled

Run these commands in the build/release stage:

```bash
npm ci
npm run build
npm run db:migrate:deploy
npm run start:server:prod
```

Keep the generated Prisma client and its runtime dependencies available to the Node process. The deployment platform should route public HTTP and WebSocket traffic to the same service and port. Use `GET /api/health` as a database-aware health check; it returns `503` if the database is unavailable. The Express production fallback serves `index.html` for client-side routes, so refreshing a frontend route works when traffic reaches this service.

## Resend and HTTPS

Create a Resend account and API key, then verify the sending domain. Production email should use a sender on that verified domain after publishing the SPF, DKIM, and DMARC records Resend provides. The onboarding sender `onboarding@resend.dev` is limited and should not be used for production delivery. Use HTTPS in production so the refresh cookie remains Secure; configure CORS with the exact deployed frontend origin and keep the refresh cookie `HttpOnly`, `SameSite`, and scoped to `/api/auth`.

Legacy account cutover is non-destructive: existing users retain their profile data, request **Forgot password**, receive a mailbox OTP, and establish a password. After the reset succeeds, their email is marked verified if it was previously empty. Monitor the migration and only then plan a separate compatibility-column removal migration.

## Preview production build

```bash
npm run preview -- --host 0.0.0.0
```

## Common troubleshooting

- If TypeScript errors appear, run:

```bash
npm install
```

- If the browser shows a blank page, make sure the dev server is running and the app is using the correct local URL.

- For network access from other devices or machines, run:

```bash
npm run dev -- --host 0.0.0.0
```

## Project structure

```text
src/
  components/
  context/
  lib/
  types/
  App.tsx
  main.tsx
```

## Stack used

- React 19
- Vite 8
- TypeScript
- Tailwind CSS
- Lucide React
