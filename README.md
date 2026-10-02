# DocTranslate

DocTranslate reads a scanned PDF or image, translates the text, and gives back a PDF that keeps the original page size and text positions.

The browser uploads the file straight to private storage. A small API on Render OCRs and translates one page at a time. The browser draws the translated page, so Arabic, Hebrew, and other complex scripts use the browser’s text engine.

## Stack

| Piece | Choice |
| --- | --- |
| Web | Next.js App Router, Tailwind, next-intl (`en`, `fr`, `ar` with RTL) |
| API | NestJS, one in-process worker, no Redis |
| Shared | TypeScript package for types, grouping, shrink-to-fit, and the hash chain |
| Data | Supabase Auth, Postgres, and private Storage. A memory driver runs locally with no cloud account |
| Providers | OCR and translation are swappable. The mock providers are the default, so the app runs without API keys |

There is no blockchain network in the default setup. An optional Integrity module stores SHA-256 hashes in an append-only hash chain. Anchoring that chain to Polygon Amoy or Sepolia stays off until `ANCHOR_ENABLED=true`.

## Repository layout

```
apps/web          Next.js UI, deployed to Vercel
apps/api          NestJS API, deployed to Render
packages/shared   Types, schemas, and layout algorithms
supabase/migrations
```

Sample pages used by tests are generated in `packages/shared/src/samples.ts`: English prose, Arabic (right to left), and a German table.

## Run it locally

Requirements: Node.js 22 and pnpm 10.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

Open http://localhost:3000, choose **Continue in local demo**, and upload a PDF, JPG, PNG, or WEBP. The demo account is a fixed development user. `AUTH_MODE=dev` is refused when `NODE_ENV=production`.

Useful commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @doctranslate/web test:e2e
pnpm build
```

API docs are at http://localhost:3001/docs while `NODE_ENV` is not production. Set `SWAGGER_ENABLED=true` to keep them on in production.

## Environment

Web (`apps/web/.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` (local default `http://localhost:3001`)
- `NEXT_PUBLIC_AUTH_MODE` (`dev` or `supabase`)

API (`apps/api/.env.example`):

- `DATA_DRIVER` `memory` or `supabase`
- `AUTH_MODE` `dev` or `supabase`
- `WEB_ORIGIN` comma-separated browser origins
- `OCR_PROVIDER` `mock` (default), `ocrspace`, `google`, or `tesseract`
- `TRANSLATION_PROVIDER` `mock` (default), `google`, `deepl`, `anthropic`, or `libretranslate`
- `OCR_FALLBACK_PROVIDER` and `TRANSLATION_FALLBACK_PROVIDER` optional second engines
- `PDF_RENDERER` `client` (default) or `server`
- `MAX_UPLOAD_BYTES` (default 15 MB), `MAX_PAGES` (default 20), `MONTHLY_PAGE_QUOTA` (default 100, `0` means unlimited)
- `RETENTION_HOURS` (default 24)
- `ANCHOR_ENABLED` (default false), plus `ANCHOR_RPC_URL`, `ANCHOR_PRIVATE_KEY`, `ANCHOR_CHAIN` (`amoy` or `sepolia`)

Provider keys are only required when you select that provider. The mock engines prefix translations with the target language code, which is enough to exercise the layout.

## Supabase

1. Create a project.
2. Run `supabase/migrations/001_init.sql`, then `002_auth.sql`, in the SQL editor.
3. In Authentication, enable email magic links and Google. Add redirect URLs for `https://<your-vercel-domain>/auth/callback` and `http://localhost:3000/auth/callback`.
4. Copy the project URL, anon key, service role key, and JWT secret into the env files.
5. Set `DATA_DRIVER=supabase`, `AUTH_MODE=supabase`, and `NEXT_PUBLIC_AUTH_MODE=supabase`.

The migration creates `jobs`, `job_pages`, `audit_log`, and `user_preferences`. Row Level Security limits each user to their own rows. The `documents` bucket is private; the API issues signed upload and download URLs. Audit rows cannot be updated or deleted. Deleting an account removes documents and preferences and leaves the hash chain, which stores hashes and actions, not document text.

## Deploy the API on Render

`render.yaml` describes a free Docker web service. Health checks use `/health`.

1. Connect this repository in Render and use the blueprint, or create a web service with the root `Dockerfile`.
2. Set the env vars listed in `render.yaml`. Required for a real deploy:
   - `NODE_ENV=production`
   - `AUTH_MODE=supabase`
   - `DATA_DRIVER=supabase`
   - `API_PUBLIC_URL` the public Render URL
   - `WEB_ORIGIN` the Vercel origin
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `TOKEN_SECRET` a long random string
3. Leave `PDF_RENDERER=client` and `ANCHOR_ENABLED=false` on the free instance.
4. Confirm `GET /health` returns `{"status":"ok"}`. `GET /wake` is a cheap endpoint the browser can hit while the free instance is waking up.

The container does not include Puppeteer or Chromium. Server-side PDF rendering needs those packages and more RAM than the free instance has.

## Deploy the web app on Vercel

1. Import the repository.
2. Set the project **Root Directory** to `apps/web`.
3. Enable **Include source files outside of the Root Directory in the Build Step** so the `packages/shared` workspace package is available.
4. Install command: `cd ../.. && pnpm install`
5. Build command: `cd ../.. && pnpm --filter @doctranslate/shared build && cd apps/web && pnpm build`
6. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_AUTH_MODE=supabase`.

File bytes never go through Vercel. The browser asks the API for a signed upload URL and sends the file to Supabase Storage, or to the API’s direct-upload route when you are on the memory driver.

## How a translation is built

1. The API checks the file type from magic bytes, rejects active PDF features such as JavaScript and embedded files, and stores a SHA-256 of the original.
2. Each PDF page is rasterized at about 150 DPI, one page at a time. If the PDF already has a text layer, that text and its positions are used and OCR is skipped.
3. Words are grouped into lines and paragraphs. Table-like rows stay separate. Reading order follows the script direction.
4. The selected translation provider rewrites each block. A running glossary is passed from page to page when the provider supports it.
5. Text is shrunk to the original box and may grow slightly downward when the translation is longer and the space below is empty.
6. The API stores the blocks (position, font, direction, background color). The web app paints the original page, covers each old text block with the sampled background color, and draws the translation. Download PDF opens a print view sized to the page. Download JSON saves the blocks.

You can click a block in the preview and change the translation or font size before exporting.

## Integrity

`POST /verify` with `{ "hash": "<sha256>" }` reports whether that digest matches a job you own or an audit entry. `GET /audit` returns your append-only entries and whether their hashes still chain. With `ANCHOR_ENABLED=true` and a funded testnet wallet, the latest chain hash can be written as the data of a zero-value transaction. Leave the flag false unless you intend to spend testnet gas.

## Decisions

- Local development uses the memory database, dev auth, and mock providers.
- Translated PDFs are produced in the browser. `PDF_RENDERER=server` is implemented and stays off because Puppeteer and `@sparticuz/chromium` are optional packages, not installed by default.
- CJK fonts (Japanese, Korean, Simplified Chinese, Traditional Chinese) load from a Google Fonts stylesheet. Latin, Arabic, Hebrew, Devanagari, and Thai ship as font files.
- The hash chain is serialized in the API process. Run a single Render instance so two processes do not append at the same time.
- Dangerous PDF actions are recorded and the file is handled as a raster plus text, not opened as an interactive PDF.

## Known limitations on free tiers

- Render’s free web service sleeps after about 15 minutes. The first request can take up to a minute. The UI says so when a request is slow. Work in progress is stored in Postgres (or memory, locally), and the worker resumes unfinished jobs on boot.
- The free instance has about 512 MB of RAM and a fraction of a CPU. Pages are handled one at a time. Very large scans can still run out of memory. The default cap is 15 MB and 20 pages.
- The disk is ephemeral. Files live in Supabase Storage, not on the instance.
- Vercel request bodies are limited to about 4.5 MB, which is why uploads go directly to storage.
- OCR and translation vendors enforce their own free quotas. When a call fails and a fallback provider is set, the API tries that provider. The mock provider does not call a vendor.
- Monthly page quota defaults to 100 pages per user. Set `MONTHLY_PAGE_QUOTA=0` to disable it.
- Files and extracted text are deleted after `RETENTION_HOURS` (24 by default). The hash chain remains.
- A printed PDF depends on the browser’s print dialog. Page size follows the translated page. Choose “background graphics” in the print dialog so the page image is included.
