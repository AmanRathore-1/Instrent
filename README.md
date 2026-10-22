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

## Clerk authentication

Copy `.env.example` to `.env` and fill in the variables required for the integrations you use. The frontend requires a Clerk publishable key:

```text
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

Keep `CLERK_SECRET_KEY` server-side only; do not rename it with a `VITE_` prefix or expose its value in frontend code. Enable the sign-in methods you want in the Clerk Dashboard. The app uses Clerk's sign-in component, which also provides sign-up when enabled, and has a **Sign out** button in the app header.

Every app profile is created from the signed-in Clerk account. There are no seeded/demo users. The API uses `DATABASE_URL` and `DIRECT_URL` to connect to PostgreSQL. RentReel stores its tables in the dedicated `rentreel` schema, leaving existing `public` tables untouched.

The server requires `DATABASE_URL`, `DIRECT_URL`, `CLIENT_URL`, `CLERK_SECRET_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY` at startup. Optional Cloudinary variables are required together for room photo uploads; without them, the API reports that uploads are unavailable. `CLERK_WEBHOOK_SIGNING_SECRET` is required only when configuring Clerk webhooks. Keep `.env` private; it is ignored by Git.

## Initialize the database

The Prisma 6 schema is split across `.prisma` files in `prisma/`; `prisma.config.ts` configures the schema and migrations directories. The direct connection URL must include `schema=rentreel` so migration history is scoped to RentReel, for example `...?sslmode=require&schema=rentreel`.

For a fresh database, apply checked-in migrations:

```bash
npm run db:migrate:dev
```

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

Start the Vite app in a second terminal:

```bash
npm run dev
```

Set `CLIENT_URL` to the exact browser origin (for local Vite, `http://localhost:5173`). CORS permits that origin only. The development proxy forwards API, media, and Socket.IO traffic to the server on `PORT` (default `4000`). Sign in with Clerk to create a real profile, publish photo posts or video reels, follow/unfollow users, and message other users in real time.

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
- `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` for the same Clerk application
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` together if uploads are enabled
- `CLERK_WEBHOOK_SIGNING_SECRET` only if Clerk webhooks are configured

Run these commands in the build/release stage:

```bash
npm ci
npm run build
npm run db:migrate:deploy
npm run start:server:prod
```

Keep the generated Prisma client and its runtime dependencies available to the Node process. The deployment platform should route public HTTP and WebSocket traffic to the same service and port. Use `GET /api/health` as a database-aware health check; it returns `503` if the database is unavailable. The Express production fallback serves `index.html` for client-side routes, so refreshing a frontend route works when traffic reaches this service.

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
