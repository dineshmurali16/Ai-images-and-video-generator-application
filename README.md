# VisionAI Studio

VisionAI Studio is a production-oriented text-to-video workspace built with React/Vite, Express, Prisma, PostgreSQL, and the official Runway API. It includes a polished creator dashboard, authenticated personal libraries, asynchronous generation jobs, image-to-video, prompt enhancement, credits, protected downloads, and responsive dark/light UI.

## What is implemented

- Text-to-video and image-to-video generation through Runway's REST task API.
- Provider boundary in `server/providers/runway.js` so another provider can be added without changing the API or UI.
- Asynchronous jobs with provider polling, retry-safe status records, failure handling, credit refunds, and persisted MP4 output.
- JWT authentication, bcrypt password hashing, protected user-scoped resources, request rate limiting, Helmet, CORS, and validated inputs.
- Prisma models for users, videos, prompts, generation jobs, and usage credits.
- Secure image uploads held in memory and sent as a data URI to Runway; JPG, PNG, and WebP only with a configurable size cap.
- Prompt enhancement through the official OpenAI Responses API when `OPENAI_API_KEY` is configured.
- Protected stream/download endpoints. Provider URLs are not sent to the browser; completed output is copied to the configured private storage directory.
- Dashboard stats, prompt history, video gallery, delete, theme switcher, generation progress, preview player, and MP4 download support.

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Framer Motion, Lucide React.
- **Backend:** Node.js 20+, Express 5, REST APIs.
- **Data:** PostgreSQL and Prisma 6.
- **Video provider:** Runway API. The default model is `hailuo3`, which accepts text/image input, `16:9`, `9:16`, and `1:1` ratios, and the documented `768p`/`2k` outputs.

## Project structure

```text
visionai-studio/
├─ prisma/schema.prisma
├─ server/
│  ├─ auth.js
│  ├─ config.js
│  ├─ index.js
│  ├─ jobs.js
│  ├─ prisma.js
│  ├─ storage.js
│  ├─ validation.js
│  └─ providers/runway.js
├─ src/
│  ├─ App.jsx
│  ├─ api.js
│  ├─ data.js
│  ├─ main.jsx
│  └─ styles.css
├─ .env.example
├─ index.html
└─ package.json
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

You can use an existing PostgreSQL instance, or run the following local container:

```bash
docker run --name visionai-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=visionai \
  -p 5432:5432 \
  -d postgres:16
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Set at least:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/visionai?schema=public
JWT_SECRET=use-a-long-random-production-secret
RUNWAY_API_KEY=your-runway-api-key
```

Then initialize Prisma:

```bash
npm run db:generate
npm run db:push
```

### 4. Run the application

```bash
npm run dev
```

- Vite frontend: `http://localhost:5173`
- Express API: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

The dashboard opens in preview mode so the UI can be explored immediately. Create an account before calling the protected generation endpoints. Preview cards are presentation-only examples; the generation flow never substitutes fake output for a provider request.

## Runway requirements and provider behavior

1. Create a Runway developer account and API key from the [Runway developer console](https://dev.runwayml.com/).
2. Put the key in `RUNWAY_API_KEY`; it is only read by the Express process and is never bundled into Vite.
3. The integration uses:
   - `POST /v1/text_to_video` for text prompts.
   - `POST /v1/image_to_video` for uploaded reference images.
   - `GET /v1/tasks/:id` for status polling.
4. Runway model access, available ratios, output resolution, rate limits, credits, and pricing depend on the account and current API catalog. The default `hailuo3` configuration reflects the current documented API shape; set `RUNWAY_MODEL` to a model enabled for your workspace and update the mapping in `server/providers/runway.js` if that model uses different fields.
5. Provider pricing is external to VisionAI. One local VisionAI credit is reserved per generation in this MVP; production billing should map credits to the provider's estimated task cost rather than assuming a fixed price.
6. Runway output URLs can expire. The worker downloads each completed MP4 into `UPLOAD_DIR/videos` before marking the record complete. For horizontal scaling, replace `server/storage.js` with an S3/R2/GCS adapter and keep the same private stream/download contract.

The UI intentionally exposes 5 and 10-second presets. A 15-second option should only be added after selecting a provider/model whose current API contract and account plan support it.

## API surface

### Authentication

- `POST /api/auth/signup` — `{ name, email, password }`
- `POST /api/auth/login` — `{ email, password }`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Generation and media

- `POST /api/generations` — multipart form with `prompt`, `negativePrompt`, `style`, `aspectRatio`, `duration`, `resolution`, and optional `image`.
- `GET /api/generations/:id` — poll a user-owned job/video status.
- `GET /api/videos` — user-owned gallery.
- `GET /api/videos/:id/stream` — authenticated MP4 stream.
- `GET /api/videos/:id/download` — authenticated attachment download.
- `DELETE /api/videos/:id` — user-scoped deletion.
- `POST /api/videos/:id/share` — create/reuse an opaque private share token.
- `GET /api/share/:token/stream` — stream a video through its explicit share token.

### Workspace

- `GET /api/dashboard`
- `GET /api/prompts`
- `POST /api/prompts/enhance`

All protected endpoints require `Authorization: Bearer <jwt>`. Every video lookup includes the authenticated user's ID, preventing cross-account access.

## Sample prompts

```text
A futuristic sports car driving through Tokyo at night in heavy rain, cinematic lighting, realistic reflections, low tracking shot, neon signs streaking across the wet street, subtle lens bloom, natural motion, 4K detail.

A lone astronaut walks through a bioluminescent canyon on an alien moon, slow dolly forward, dust drifting through shafts of blue light, distant planets on the horizon, quiet sense of wonder, cinematic science fiction.

A tiny paper boat floats through a flooded watercolor city at sunrise, the camera follows at water level, warm reflected light, hand-painted textures, gentle ripples and drifting petals.
```

## Production deployment

- Build the frontend with `npm run build` and serve `dist/` from a CDN or from the Express process.
- Set `NODE_ENV=production`, a strong `JWT_SECRET`, a managed PostgreSQL `DATABASE_URL`, `CLIENT_URL`, `RUNWAY_API_KEY`, and a private persistent `UPLOAD_DIR`/object storage adapter.
- Run `npm run db:migrate` in the release step rather than `db:push` for tracked production migrations.
- Put the API behind HTTPS and a reverse proxy. Keep the API and storage private; only expose the authenticated stream/download endpoints.
- Move `processGeneration` to a durable queue such as BullMQ/Redis or a managed worker for multi-instance deployments. The current in-process worker is appropriate for a single-instance MVP and keeps the web request responsive.
- Configure centralized logs, provider webhook support where available, object lifecycle cleanup, antivirus scanning for uploads, and a billing ledger before accepting untrusted high-volume traffic.

## Verification

```bash
npm run build
npm run db:generate
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/visionai?schema=public"; npx prisma validate
```
