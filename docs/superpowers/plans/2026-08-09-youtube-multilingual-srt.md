# YouTube Multilingual SRT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let web and Public API users attach up to 20 language-tagged UTF-8 SRT files to one YouTube post, then upload each track independently after the video release ID has been persisted.

**Architecture:** A shared upload service validates and stores SRT assets outside the Media table. YouTube caption intent remains in post settings while `YoutubeCaptionTrack` rows hold operational state. The existing video workflow persists `releaseId` first and then starts one detached child workflow per pending language; each child performs an idempotent YouTube list/update-or-insert operation with three activity attempts.

**Tech Stack:** NestJS, class-validator/class-transformer, Prisma/PostgreSQL, Temporal, googleapis YouTube Data API v3, React 19/Next.js, react-hook-form, SWR, Jest/Testing Library.

## Global Constraints

- Support authenticated web UI and raw-key Public API upload endpoints.
- Accept only `.srt`, UTF-8, maximum 5 MiB, at least one valid indexed cue.
- Accept at most 20 tracks and reject duplicate normalized BCP-47 languages.
- Persist `PENDING`, `UPLOADING`, `UPLOADED`, or `FAILED`, attempt count, last error, retry generation, and YouTube caption ID.
- Persist the successful video release ID before any caption workflow starts.
- A caption failure must not fail or retry `videos.insert`, another language, or the successful Post.
- Retry a caption activity at most three times; manual retry selects only `FAILED` tracks and increments `retryGeneration`.
- Do not deploy production or perform a real YouTube upload in this slice.
- Preserve existing YouTube posts whose settings omit `captions`.
- The repository's root Jest configuration is a known baseline failure because `@nx/jest` is absent; focused tests use a self-contained config and the baseline failure remains explicitly reported.

---

### Task 1: Focused test harness and strict SRT upload service

**Files:**
- Create: `jest.youtube-captions.config.cjs`
- Create: `tests/youtube-captions/caption-upload.service.spec.ts`
- Create: `libraries/nestjs-libraries/src/upload/captions/srt.validation.ts`
- Create: `libraries/nestjs-libraries/src/upload/captions/caption-upload.service.ts`
- Modify: `libraries/nestjs-libraries/src/upload/upload.module.ts`
- Modify: `apps/backend/src/api/routes/media.controller.ts`
- Modify: `apps/backend/src/public-api/routes/v1/public.integrations.controller.ts`

**Interfaces:**
- Produces: `validateSrtFile(file: Express.Multer.File): string`
- Produces: `CaptionAsset { path; originalName; size; mimeType: 'application/x-subrip' }`
- Produces: `CaptionUploadService.upload(file): Promise<CaptionAsset>`
- Produces: `POST /media/upload-caption` and `POST /public/v1/upload-caption`

- [ ] **Step 1: Add the focused Jest config and failing validation/upload tests**

The config must map every `@gitroom/*` alias, transform TypeScript/TSX with `ts-jest`, default to the Node environment, and match only `tests/youtube-captions/**/*.spec.ts?(x)`. Tests use literal SRT fixtures and prove valid multi-cue input, case-insensitive extension, exact 5 MiB boundary, invalid extension/MIME/UTF-8, missing cue, malformed timing, reverse range, and empty cue text. The service test injects a fake `IUploadProvider`, asserts the upload receives forced `application/x-subrip`, and asserts the returned asset retains the incoming original filename and byte size.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec jest --config jest.youtube-captions.config.cjs tests/youtube-captions/caption-upload.service.spec.ts --runInBand`

Expected: FAIL because `validateSrtFile` and `CaptionUploadService` do not exist.

- [ ] **Step 3: Implement the minimal parser and shared upload service**

Use `TextDecoder('utf-8', { fatal: true })`. Split cues on blank lines after normalizing CRLF, require a numeric first line, match `HH:MM:SS,mmm --> HH:MM:SS,mmm`, convert timestamps to milliseconds, require end > start, and require non-whitespace text. Validate before calling storage. Copy the Multer object with `mimetype: 'application/x-subrip'` so Cloudflare and local storage keep an `.srt` suffix.

Register a `CAPTION_STORAGE` provider in `UploadModule` and inject it into `CaptionUploadService`; export the service. Both controllers delegate directly to that service and do not call `MediaService`, so no Media row is created.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add jest.youtube-captions.config.cjs tests/youtube-captions/caption-upload.service.spec.ts libraries/nestjs-libraries/src/upload apps/backend/src/api/routes/media.controller.ts apps/backend/src/public-api/routes/v1/public.integrations.controller.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat: validate and upload YouTube SRT captions"
```

### Task 2: YouTube caption settings contract

**Files:**
- Create: `tests/youtube-captions/youtube-caption-settings.dto.spec.ts`
- Create: `libraries/nestjs-libraries/src/dtos/posts/providers-settings/youtube-caption.validators.ts`
- Modify: `libraries/nestjs-libraries/src/dtos/posts/providers-settings/youtube.settings.dto.ts`

**Interfaces:**
- Produces: `YoutubeCaptionFileDto`
- Produces: `YoutubeCaptionSettingsDto`
- Extends: `YoutubeSettingsDto.captions?: YoutubeCaptionSettingsDto[]`
- Produces: `normalizeBcp47Language(value): string | null`
- Produces: `isTrustedCaptionPath(path): boolean`

- [ ] **Step 1: Write failing DTO behavior tests**

Use Nest `ValidationPipe` with transform enabled. Assert that `EN-us` becomes `en-US`, valid `es-419` and `zh-Hans` pass, and invalid language, missing file metadata, non-SRT path, arbitrary host/path, duplicate canonical language, and 21 tracks fail. Set `FRONTEND_URL=https://postiz.example` and `CLOUDFLARE_BUCKET_URL=https://media.example` in the test and hand-write expected transformed values.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest --config jest.youtube-captions.config.cjs tests/youtube-captions/youtube-caption-settings.dto.spec.ts --runInBand`

Expected: FAIL because caption DTOs and validators do not exist.

- [ ] **Step 3: Add the DTOs and validators**

Use `Intl.getCanonicalLocales()` for normalization, `@Transform` for the stored language, a custom validator for BCP-47 syntax, `@ArrayMaxSize(20)`, `@ArrayUnique(track => track.language.toLowerCase())`, and nested validation. A trusted path is an HTTP(S) URL whose prefix is either `${FRONTEND_URL}/uploads/` or `${CLOUDFLARE_BUCKET_URL}/` and whose pathname ends in `.srt` case-insensitively. Require positive `size <= 5 * 1024 * 1024` and MIME `application/x-subrip`.

- [ ] **Step 4: Verify GREEN and run Task 1 regression**

Run: `pnpm exec jest --config jest.youtube-captions.config.cjs tests/youtube-captions/caption-upload.service.spec.ts tests/youtube-captions/youtube-caption-settings.dto.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add tests/youtube-captions/youtube-caption-settings.dto.spec.ts libraries/nestjs-libraries/src/dtos/posts/providers-settings
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat: add YouTube multilingual caption settings"
```

### Task 3: Caption-track persistence and migration

**Files:**
- Create: `tests/youtube-captions/youtube-caption-track.service.spec.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/schema.prisma`
- Create: `libraries/nestjs-libraries/src/database/prisma/migrations/20260809000000_youtube_caption_tracks/migration.sql`
- Create: `libraries/nestjs-libraries/src/database/prisma/youtube-captions/youtube-caption.repository.ts`
- Create: `libraries/nestjs-libraries/src/database/prisma/youtube-captions/youtube-caption.service.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/database.module.ts`

**Interfaces:**
- Produces enum: `YoutubeCaptionStatus = PENDING | UPLOADING | UPLOADED | FAILED`
- Produces model: `YoutubeCaptionTrack` unique on `(postId, language)` and related to `Post`
- Produces service methods: `syncPending`, `listForPost`, `listPending`, `getUploadTask`, `markUploading`, `markUploaded`, `markFailed`, `retryFailed`

- [ ] **Step 1: Write failing service tests against a strict repository fake**

Prove `syncPending` upserts canonical tracks and removes no-longer-desired pending tracks, `listForPost` enforces `organizationId`, `markUploading` increments attempts, uploaded state stores YouTube ID and clears error, errors are sanitized to 500 characters without token/stack content, and retry changes only `FAILED` rows while incrementing generation once.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest --config jest.youtube-captions.config.cjs tests/youtube-captions/youtube-caption-track.service.spec.ts --runInBand`

Expected: FAIL because persistence types do not exist.

- [ ] **Step 3: Add schema, SQL migration, repository, and service**

Store original name, path, size, MIME, optional display name, status, attempts, last error, retry generation, YouTube caption ID, and timestamps. Add `youtubeCaptionTracks YoutubeCaptionTrack[]` to `Post`. Repository methods must always join/filter through Post organization for HTTP-facing reads. `syncPending` must not overwrite an `UPLOADED` row when the desired file metadata is unchanged.

- [ ] **Step 4: Generate Prisma client and verify GREEN**

Run: `pnpm run prisma-generate`

Run the Step 2 test again. Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add libraries/nestjs-libraries/src/database/prisma tests/youtube-captions/youtube-caption-track.service.spec.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat: persist YouTube caption track state"
```

### Task 4: Synchronize post creation and expose status/retry APIs

**Files:**
- Create: `tests/youtube-captions/posts-caption-lifecycle.spec.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts`
- Modify: `apps/backend/src/api/routes/posts.controller.ts`

**Interfaces:**
- Consumes: `YoutubeCaptionService.syncPending(postId, orgId, captions)`
- Produces: `GET /posts/:id/captions`
- Produces: `POST /posts/:id/captions/retry`

- [ ] **Step 1: Write failing lifecycle tests**

Instantiate `PostsService` with strict fakes and prove the first Post ID returned by `createOrUpdatePost` is synchronized before `startWorkflow` is invoked. Prove captions omitted from settings cause no rows and no behavior change. Instantiate `PostsController` and prove list/retry pass the authenticated organization ID to the caption service.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest --config jest.youtube-captions.config.cjs tests/youtube-captions/posts-caption-lifecycle.spec.ts --runInBand`

Expected: FAIL because caption synchronization and routes are absent.

- [ ] **Step 3: Wire synchronization and HTTP routes**

Inject `YoutubeCaptionService` into `PostsService` and `PostsController`. After `createOrUpdatePost` succeeds, call `syncPending` for YouTube settings before calling `startWorkflow`. Routes return operational rows only for a Post in the authenticated organization. `retryFailed` uses Temporal client start with workflow ID `youtube-caption:<postId>:<language>:<retryGeneration>` and `USE_EXISTING`, and returns the requeued rows.

- [ ] **Step 4: Verify GREEN and run all focused service tests**

Run: `pnpm exec jest --config jest.youtube-captions.config.cjs tests/youtube-captions --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts apps/backend/src/api/routes/posts.controller.ts tests/youtube-captions/posts-caption-lifecycle.spec.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat: sync and retry YouTube caption tracks"
```

### Task 5: Idempotent YouTube caption provider operation

**Files:**
- Create: `tests/youtube-captions/youtube-caption-provider.spec.ts`
- Create: `libraries/nestjs-libraries/src/integrations/social/youtube-caption.client.ts`
- Modify: `libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts`

**Interfaces:**
- Produces: `upsertYoutubeCaption(youtubeClient, { videoId, language, name, body })`
- Produces: `YoutubeProvider.uploadCaption(accessToken, input): Promise<string>`

- [ ] **Step 1: Write failing provider tests**

With a hand-built YouTube client fake, prove no matching normalized language calls `captions.insert` with `part: ['snippet']`, `sync: false`, SRT media stream, video ID, language, and name. Prove a matching language calls `captions.update` with its caption ID and never inserts. Replay the same input and prove list-before-write prevents a second language track.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest --config jest.youtube-captions.config.cjs tests/youtube-captions/youtube-caption-provider.spec.ts --runInBand`

Expected: FAIL because the upsert helper is absent.

- [ ] **Step 3: Implement the helper and provider method**

`captions.list` requests `part: ['id', 'snippet']` for the target video, compares canonicalized snippet language, and updates the first match. `YoutubeProvider.uploadCaption` creates the authenticated client, downloads only the trusted caption URL as a stream, and wraps the YouTube operation in `runInConcurrent` so existing refresh/bad-body error translation remains active. Never log caption contents or tokens.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add libraries/nestjs-libraries/src/integrations/social/youtube* tests/youtube-captions/youtube-caption-provider.spec.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat: upsert YouTube caption tracks idempotently"
```

### Task 6: Detached per-language Temporal workflows

**Files:**
- Create: `tests/youtube-captions/youtube-caption-workflow.spec.ts`
- Create: `apps/orchestrator/src/activities/youtube-caption.activity.ts`
- Create: `apps/orchestrator/src/workflows/youtube-caption.workflow.ts`
- Create: `apps/orchestrator/src/workflows/youtube-caption.workflow-id.ts`
- Modify: `apps/orchestrator/src/app.module.ts`
- Modify: `apps/orchestrator/src/workflows/index.ts`
- Modify: `apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.1.ts`

**Interfaces:**
- Produces: `youtubeCaptionWorkflow({ trackId }): Promise<void>`
- Produces: `youtubeCaptionWorkflowId(postId, language, generation): string`
- Produces activities: `uploadYoutubeCaption`, `failYoutubeCaption`, `getPendingYoutubeCaptions`

- [ ] **Step 1: Write failing activity/workflow tests**

Test the pure workflow-ID builder and an exported `startYoutubeCaptionChildren` helper with a fake starter. Assert updatePost appears before caption enumeration/start in the observable call order, one child per language uses `ABANDON`, and a failure from one child starter is swallowed without changing Post state or blocking later languages. Test the activity with provider/service fakes: success marks uploading then uploaded; terminal failure sanitizer instructs reconnect for OAuth/scope failures and sends one language-specific notification.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest --config jest.youtube-captions.config.cjs tests/youtube-captions/youtube-caption-workflow.spec.ts --runInBand`

Expected: FAIL because workflow and activity do not exist.

- [ ] **Step 3: Implement the activity and child workflow**

The child proxies `uploadYoutubeCaption` with `maximumAttempts: 3`, constant backoff, and a 10-minute timeout. It catches the final activity failure and calls `failYoutubeCaption` once. The upload activity loads Post release ID and YouTube integration, refreshes an expired token through `RefreshIntegrationService`, calls provider `uploadCaption`, and marks success. Missing release ID is non-retryable.

- [ ] **Step 4: Start children only after video persistence**

In `postWorkflowV101`, immediately after the main post's `await updatePost(...)`, enumerate pending caption rows only when the provider identifier is YouTube. Await each `startChild` only until it starts, use `parentClosePolicy: 'ABANDON'`, inherit/use the `youtube` task queue, and catch each start independently. Do not place caption code inside `postSocial` or its retry loop before `updatePost`.

- [ ] **Step 5: Verify GREEN and focused regression**

Run: `pnpm exec jest --config jest.youtube-captions.config.cjs tests/youtube-captions --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit the task**

```bash
git add apps/orchestrator tests/youtube-captions/youtube-caption-workflow.spec.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat: upload YouTube captions in detached workflows"
```

### Task 7: Web UI multi-language uploader, status, and retry

**Files:**
- Create: `tests/youtube-captions/youtube-caption-fields.spec.tsx`
- Create: `apps/frontend/src/components/new-launch/providers/youtube/youtube.caption.fields.tsx`
- Modify: `apps/frontend/src/components/new-launch/providers/youtube/youtube.provider.tsx`

**Interfaces:**
- Produces component: `YoutubeCaptionFields`
- Consumes form field: `captions[]`
- Consumes HTTP: `/media/upload-caption`, `/posts/:id/captions`, `/posts/:id/captions/retry`

- [ ] **Step 1: Write failing UI behavior tests**

Render the real component under `FormProvider` and `ExistingDataContextProvider`. Prove Add track creates a language/name/file row, Remove deletes it, Add is disabled at 20, selecting a non-SRT/oversized file reports an actionable message without fetching, valid selection uploads FormData and stores the returned asset, duplicate canonical languages display an error, operational `FAILED` displays its sanitized error and Retry failed invokes only the retry endpoint.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest --config jest.youtube-captions.config.cjs tests/youtube-captions/youtube-caption-fields.spec.tsx --runInBand`

Expected: FAIL because the UI component is absent.

- [ ] **Step 3: Implement the component in the existing Postiz visual system**

Use `useFieldArray`, `useFetch`, and SWR. Keep the panel quiet and consistent with existing `Input`, `Button`, dark surfaces, 8px radii, and table borders. Each row has BCP-47 language input with common-language datalist, optional track name, `.srt` file control, current filename, status badge, error text, and remove action. A section-level Add track button is disabled at 20. Use a small colored left status rail as the single visual signature; do not introduce a new page theme, font, gradient, or animation. Preserve keyboard focus and text labels.

- [ ] **Step 4: Embed below Thumbnail and verify GREEN**

Render `<YoutubeCaptionFields />` in `YoutubeSettings`. Run the Step 2 command, then all focused tests. Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add apps/frontend/src/components/new-launch/providers/youtube tests/youtube-captions/youtube-caption-fields.spec.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat: add multilingual SRT controls to YouTube UI"
```

### Task 8: Verification, documentation, and completion gate

**Files:**
- Modify: `MEMORY.md`
- Modify if evidence requires correction: files from Tasks 1-7

**Interfaces:**
- Produces: current-state project memory and fresh local verification evidence

- [ ] **Step 1: Run the full focused test suite**

Run: `pnpm exec jest --config jest.youtube-captions.config.cjs tests/youtube-captions --runInBand`

Expected: all focused suites and tests PASS with zero open-handle warnings.

- [ ] **Step 2: Run Prisma and TypeScript gates**

Run:

```bash
pnpm run prisma-generate
pnpm exec tsc --noEmit --pretty false --project apps/frontend/tsconfig.json
pnpm exec tsc --pretty false --project libraries/nestjs-libraries/tsconfig.lib.json
```

Expected: exit 0, or record exact unrelated baseline errors and prove no errors point to changed files.

- [ ] **Step 3: Run production builds**

Run separately so failures are attributable:

```bash
pnpm run build:frontend
pnpm run build:backend
pnpm run build:orchestrator
```

Expected: exit 0 for each, or exact baseline failure recorded.

- [ ] **Step 4: Run repository hygiene checks**

Run:

```bash
git diff --check
git status --short --branch
```

Review every changed file and compare each acceptance criterion in the approved design to code/tests. Confirm no secrets, deployment changes, generated build output, or unrelated user changes are staged.

- [ ] **Step 5: Update current-state memory and commit**

Replace the existing 2026-08-09 design-only MEMORY section with the implemented architecture, exact verification results, known baseline limitations, and explicit rollout boundary. Keep `MEMORY.md` below 500 lines and remove superseded statements.

```bash
git add MEMORY.md
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "docs: record YouTube caption implementation status"
```

- [ ] **Step 6: Apply completion skills**

Use `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. Because this repository instruction forbids subagents in this run, perform the final requirement/diff review inline and state that the normal reviewer dispatch was unavailable. Do not push, deploy, or create a PR without a new user instruction.
