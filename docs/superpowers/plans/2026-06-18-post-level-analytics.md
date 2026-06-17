# Post-level Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect per-post performance metrics over time (1h/6h/24h/3d/7d after publish), store them keyed by `postId` + `ageBucket`, classify each post's hook with AI, and surface post-level / time-of-day / hook-pattern views + AI insights inside the existing workspace-analytics screen.

**Architecture:** A Temporal child workflow (`postAnalyticsCollectionWorkflow`) starts when a post publishes successfully (has `releaseId`), wakes at 5 fixed ages, and calls a libs service that reuses the existing `PostsService.checkPostAnalytics` provider plumbing, then writes `AnalyticsMetricSnapshot` rows with `postId` + `ageBucket` for every `WorkspaceChannel` the post's integration maps to. AI lives in `OpenaiService` (classify on publish; insight/suggestion on demand). The backend `summary()` is extended to aggregate post-level rows from the DB; the frontend adds three views.

**Tech Stack:** NestJS, Prisma 6.5.0 (`db push`, no migration files), Temporal (`@temporalio` via `nestjs-temporal-core`), OpenAI SDK `^6.2.0` + `zod ^3.25.76` (`chat.completions.parse` + `zodResponseFormat`), Vite React + SWR + `useFetch`, Tailwind 3.

## Global Constraints

- 3-layer rule: Controller → Service → Repository. Server logic lives in `libraries/nestjs-libraries` (= libs/server). Collector lives in `apps/orchestrator`.
- Prisma changes are applied with `pnpm run prisma-generate` then `pnpm run prisma-db-push` (prisma 6.5.0). There are NO migration files in this repo.
- Frontend: native components only, import UI from `@gitroom/react/form/*`; SWR each in its own hook complying with rules-of-hooks; use `useFetch` from `libraries/helpers/src/utils/custom.fetch.tsx`; Tailwind tokens (`bg-newTableHeader`, `border-newTableBorder`, `text-newTableText`, primary `#612bd3`). No `--color-custom*`.
- OpenAI model is referenced via a single constant `HOOK_ANALYSIS_MODEL = 'gpt-5.4-nano'` so it is swappable.
- Provider call MUST never break the publish path: collection start is wrapped in try/catch; providers without `postAnalytics` (dribbble, gmb, all text/messenger providers) are skipped + logged (follow commit `c89d3f1d` `console.warn` diagnostic pattern).
- This repo has ZERO unit tests and uses nx jest projects that currently resolve to nothing. Verification = tsc + build (per CLAUDE.md) plus pure-function sanity scripts run with the repo's TypeScript. Do not fabricate a jest harness.

**Verification bar (run at the end of every phase):**
- `pnpm exec tsc --noEmit --pretty false --project apps/frontend/tsconfig.json`
- `pnpm exec tsc --noEmit --pretty false --project libraries/nestjs-libraries/tsconfig.json`
- `pnpm run build:frontend`
- `pnpm run build:backend`
- (`apps/backend` standalone tsc has a pre-existing implicit-any baseline in unrelated provider/agent files — ignore those.)

---

## File Structure

**Create:**
- `apps/orchestrator/src/workflows/post-analytics-collection.workflow.ts` — the timer workflow.
- `apps/orchestrator/src/activities/post-analytics.activity.ts` — `@Activity` wrapper calling the libs service.
- `libraries/nestjs-libraries/src/database/prisma/workspace-analytics/post-analytics.service.ts` — collection + aggregation logic (post-level).
- `apps/frontend/src/components/workspace-analytics/workspace-analytics.post-table.tsx` — post performance table.
- `apps/frontend/src/components/workspace-analytics/workspace-analytics.heatmap.tsx` — day×hour heatmap.
- `apps/frontend/src/components/workspace-analytics/workspace-analytics.hooks.tsx` — hook-type cards + AI insight/suggestion UI.

**Modify:**
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma` — new enums + columns + index.
- `libraries/nestjs-libraries/src/database/prisma/workspace-analytics/workspace-analytics.repository.ts` — `postId:null` fix, `SnapshotInput`, post-level read/write methods, channels-for-integration lookup, post-for-collection lookup.
- `libraries/nestjs-libraries/src/database/prisma/workspace-analytics/workspace-analytics.service.ts` — extend `summary()` aggregations.
- `libraries/nestjs-libraries/src/database/prisma/workspace-analytics/workspace-analytics.types.ts` — new response types.
- `libraries/nestjs-libraries/src/database/prisma/workspace-analytics/workspace-analytics.helpers.ts` — bucket + time-of-day helpers.
- `libraries/nestjs-libraries/src/openai/openai.service.ts` — 3 AI methods + model constant.
- `libraries/nestjs-libraries/src/database/prisma/database.module.ts` — register `PostAnalyticsService`.
- `apps/backend/src/api/routes/workspace-analytics.controller.ts` — 2 AI endpoints.
- `apps/orchestrator/src/app.module.ts` — register `PostAnalyticsActivity`.
- `apps/orchestrator/src/workflows/index.ts` — export new workflow.
- `apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.1.ts` — start collection child after publish success.
- `apps/frontend/src/components/workspace-analytics/workspace-analytics.types.ts` — extend `AnalyticsSummary` + parsers.
- `apps/frontend/src/components/workspace-analytics/workspace.analytics.tsx` — render new views + AI hooks.

---

## Phase 1 — Data foundation + collection (works without AI)

### Task 1.1: Prisma schema — enums, columns, index

**Files:** Modify `libraries/nestjs-libraries/src/database/prisma/schema.prisma`

- [ ] Add two enums (near `AnalyticsCanonicalMetric`, ~line 477):
```prisma
enum AnalyticsAgeBucket {
  H1
  H6
  H24
  D3
  D7
}

enum PostHookType {
  QUESTION
  NUMBER
  EMPATHY
  SHOCK
  STORY
  HOWTO
  OTHER
}
```
- [ ] `Post` model (~line 421, after `error`): add
```prisma
  hookType                   PostHookType?
  hookTypeConfidence         Float?
  hookClassifiedAt           DateTime?
```
- [ ] `AnalyticsMetricSnapshot` model: add `ageBucket AnalyticsAgeBucket?` after `measuredAt`, and add index `@@index([postId, canonicalMetric, ageBucket])`.
- [ ] Run `pnpm run prisma-generate`. Expected: "Generated Prisma Client". (DB push deferred to phase end; generate is what unblocks tsc.)

### Task 1.2: Repository — protect post rows + post-level read/write

**Files:** Modify `workspace-analytics.repository.ts`

- [ ] `SnapshotInput` interface: add `postId?: string | null;` and `ageBucket?: AnalyticsAgeBucket;` (import enum from `@prisma/client`).
- [ ] `replaceSnapshots` deleteMany: add `postId: null` to the `where` so channel-aggregate refresh never deletes post-level rows. (deleteMany where becomes `{ workspaceId, channelId, postId: null, measuredAt: { gte: from } }`.)
- [ ] Add `_post: PrismaRepository<'post'>` to constructor.
- [ ] Add method `listChannelsForIntegration(integrationId)`:
```ts
listChannelsForIntegration(integrationId: string) {
  return this._workspaceChannel.model.workspaceChannel.findMany({
    where: { integrationId },
    select: { id: true, workspaceId: true, providerIdentifier: true },
  });
}
```
- [ ] Add method `getPostForCollection(postId)`:
```ts
getPostForCollection(postId: string) {
  return this._post.model.post.findUnique({
    where: { id: postId },
    select: {
      id: true, organizationId: true, integrationId: true,
      releaseId: true, content: true, title: true, publishDate: true,
      hookType: true,
      integration: { select: { providerIdentifier: true } },
    },
  });
}
```
- [ ] Add method `replacePostSnapshots(workspaceId, channelId, postId, ageBucket, snapshots)`:
```ts
async replacePostSnapshots(
  workspaceId: string, channelId: string, postId: string,
  ageBucket: AnalyticsAgeBucket, snapshots: SnapshotInput[]
) {
  await this._snapshot.model.analyticsMetricSnapshot.deleteMany({
    where: { workspaceId, channelId, postId, ageBucket },
  });
  if (!snapshots.length) return { count: 0 };
  return this._snapshot.model.analyticsMetricSnapshot.createMany({ data: snapshots });
}
```
- [ ] Add `listPostSnapshots(workspaceId, from)` returning all post-level rows (`postId not null`) in range with `post` + `channel` included, for aggregation:
```ts
listPostSnapshots(workspaceId: string, from: Date) {
  return this._snapshot.model.analyticsMetricSnapshot.findMany({
    where: { workspaceId, postId: { not: null }, measuredAt: { gte: from } },
    include: { post: true, channel: true },
    orderBy: { measuredAt: 'asc' },
  });
}
```

### Task 1.3: Helpers — bucket math + time-of-day

**Files:** Modify `workspace-analytics.helpers.ts`

- [ ] Add `AGE_BUCKET_OFFSETS` (ordered) and helpers:
```ts
export const AGE_BUCKET_MS: Record<AnalyticsAgeBucket, number> = {
  H1: 3_600_000, H6: 21_600_000, H24: 86_400_000, D3: 259_200_000, D7: 604_800_000,
};
export const AGE_BUCKET_ORDER: AnalyticsAgeBucket[] = ['H1','H6','H24','D3','D7'];
export const hourKey = (d: Date) => d.getUTCHours();        // 0-23
export const weekdayKey = (d: Date) => d.getUTCDay();        // 0-6 (Sun=0)
```
- [ ] Sanity-check with a tiny script (Task 1.7).

### Task 1.4: PostAnalyticsService (libs) — collection

**Files:** Create `post-analytics.service.ts`; register in `database.module.ts`

- [ ] Service injects `PostsService`, `WorkspaceAnalyticsRepository`. Method:
```ts
async collectPostSnapshots(postId: string, ageBucket: AnalyticsAgeBucket) {
  const post = await this._repo.getPostForCollection(postId);
  if (!post || !post.releaseId || post.releaseId === 'missing') {
    console.warn('post-analytics: skip (no releaseId)', { postId, ageBucket });
    return { collected: 0 };
  }
  const channels = await this._repo.listChannelsForIntegration(post.integrationId);
  if (!channels.length) {
    console.warn('post-analytics: skip (no workspace channel)', { postId });
    return { collected: 0 };
  }
  const analytics = await this._postsService.checkPostAnalytics(post.organizationId, postId, 7);
  if (!Array.isArray(analytics) || !analytics.length) {
    console.warn('post-analytics: empty analytics', { postId, ageBucket, providerIdentifier: post.integration.providerIdentifier });
    return { collected: 0 };
  }
  const measuredAt = new Date();
  let collected = 0;
  for (const channel of channels) {
    const rows = analytics.flatMap((metric) =>
      metric.data.slice(-1).map((point) => ({
        workspaceId: channel.workspaceId, channelId: channel.id, postId,
        providerIdentifier: channel.providerIdentifier,
        canonicalMetric: normalizeMetric(metric.label), rawMetric: metric.label,
        value: Number(point.total) || 0, measuredAt, ageBucket,
      })));
    await this._repo.replacePostSnapshots(channel.workspaceId, channel.id, postId, ageBucket, rows);
    collected += rows.length;
  }
  return { collected };
}
```
- Note: `checkPostAnalytics` may return `{ missing: true }`; treat non-array as empty.
- `metric.data.slice(-1)` collapses provider time-series to the latest cumulative value (post-level metrics are cumulative totals).

### Task 1.5: Orchestrator activity + workflow

**Files:** Create `post-analytics.activity.ts`, `post-analytics-collection.workflow.ts`; modify `app.module.ts`, `workflows/index.ts`

- [ ] Activity:
```ts
@Injectable() @Activity()
export class PostAnalyticsActivity {
  constructor(private _postAnalyticsService: PostAnalyticsService) {}
  @ActivityMethod()
  async collectPostSnapshots(postId: string, ageBucket: AnalyticsAgeBucket) {
    return this._postAnalyticsService.collectPostSnapshots(postId, ageBucket);
  }
}
```
- [ ] Workflow (mirror autopost/streak `sleep` usage; never throw):
```ts
const { collectPostSnapshots } = proxyActivities<PostAnalyticsActivity>({
  startToCloseTimeout: '5 minute',
  retry: { maximumAttempts: 3, backoffCoefficient: 2, initialInterval: '30 seconds' },
});
const SCHEDULE: { delay: number; bucket: AnalyticsAgeBucket }[] = [
  { delay: 3_600_000, bucket: 'H1' }, { delay: 18_000_000, bucket: 'H6' },
  { delay: 64_800_000, bucket: 'H24' }, { delay: 172_800_000, bucket: 'D3' },
  { delay: 345_600_000, bucket: 'D7' },
];
export async function postAnalyticsCollectionWorkflow({ postId }: { postId: string }) {
  for (const step of SCHEDULE) {
    await sleep(step.delay);          // delays are INCREMENTAL gaps between buckets
    try { await collectPostSnapshots(postId, step.bucket); } catch (e) { /* logged in activity */ }
  }
}
```
(Incremental gaps: 1h, +5h→6h, +18h→24h, +48h→3d, +96h→7d.)
- [ ] Register activity in `app.module.ts` (`activities` array + providers). Export workflow in `workflows/index.ts`.

### Task 1.6: Trigger collection after publish

**Files:** Modify `post.workflow.v1.0.1.ts`

- [ ] Import `startChild`, `postAnalyticsCollectionWorkflow`, `makeId`. After the success loop that calls `updatePost(...)` (~line 172), for the root `postId`, start the collection child guarded:
```ts
try {
  await startChild(postAnalyticsCollectionWorkflow, {
    parentClosePolicy: 'ABANDON',
    args: [{ postId }],
    workflowId: `post_analytics_${postId}_${makeId(6)}`,
  });
} catch (e) {}
```
- Only start when at least one post was published with a real `releaseId` (guard on `postsResults` success).

### Task 1.7: Phase-1 verification

- [ ] Pure-function sanity: a throwaway `ts` script asserting `AGE_BUCKET_MS`/order and `hourKey`/`weekdayKey` on a known UTC date; run via repo tooling; delete after.
- [ ] Run the 4 verification-bar commands; all green (libs + frontend tsc, both builds).
- [ ] `pnpm run prisma-db-push` against the dev DB (additive: nullable columns + new index → safe).
- [ ] Commit.

---

## Phase 2 — AI hook classification + backend aggregation + frontend views

### Task 2.1: OpenaiService — classify hook

**Files:** Modify `openai.service.ts`

- [ ] Add constant `export const HOOK_ANALYSIS_MODEL = 'gpt-5.4-nano';`
- [ ] Add zod enum + method:
```ts
const HookClassification = z.object({
  hookType: z.enum(['QUESTION','NUMBER','EMPATHY','SHOCK','STORY','HOWTO','OTHER']),
  confidence: z.number().min(0).max(1),
});
async classifyHookType(intro: string): Promise<{ hookType: PostHookType; confidence: number }> {
  const res = await openai.chat.completions.parse({
    model: HOOK_ANALYSIS_MODEL,
    messages: [
      { role: 'system', content: '<Korean classifier prompt: map the social-post opening to one hook type>' },
      { role: 'user', content: intro.slice(0, 500) },
    ],
    response_format: zodResponseFormat(HookClassification, 'hookClassification'),
  });
  const parsed = res.choices[0].message.parsed;
  return { hookType: (parsed?.hookType as PostHookType) ?? 'OTHER', confidence: parsed?.confidence ?? 0 };
}
```

### Task 2.2: Classify on publish (collection service, H1 bucket only)

**Files:** Modify `post-analytics.service.ts`, repository

- [ ] Repo: `setHookClassification(postId, hookType, confidence)` → `post.update` of the 3 hook columns + `hookClassifiedAt: new Date()`.
- [ ] In `collectPostSnapshots`, when `ageBucket === 'H1'` and `post.hookType == null`, derive `intro` from `post.content` (strip to first 200 chars), call `OpenaiService.classifyHookType`, persist via repo. Wrap in try/catch (AI failure must not block snapshot writes).
- [ ] Inject `OpenaiService` into `PostAnalyticsService`.

### Task 2.3: Backend aggregation in `summary()`

**Files:** Modify `workspace-analytics.service.ts`, `workspace-analytics.types.ts`

- [ ] Load `listPostSnapshots(workspace.id, from)`. Compute (pure helpers):
  - `postPerformance`: per `postId` → `{ postId, intro, channelLabel, publishedAt, hookType, valueByBucket: {H24, D7} }` for the selected `metric`, sorted desc by D7 (fallback H24). Cap 50.
  - `timeOfDay`: 7×24 grid of average selected-metric value at `H24` bucket, keyed by `weekdayKey(publishDate)`×`hourKey(publishDate)`.
  - `hookTypePerformance`: per `hookType` → avg selected-metric `H24` value + count.
- [ ] Add these three keys to the `summary()` return and to types.

### Task 2.4: Frontend — post table, heatmap, hook cards

**Files:** Create 3 components; modify `workspace-analytics.types.ts`, `workspace.analytics.tsx`

- [ ] Extend `AnalyticsSummary` type + `parseAnalyticsSummary` with `postPerformance`, `timeOfDay`, `hookTypePerformance` (+ array parsers, defensive defaults `[]`).
- [ ] `workspace-analytics.post-table.tsx`: table (intro / channel / published / 24h / 7d), sorted, Tailwind tokens matching `.cards.tsx`.
- [ ] `workspace-analytics.heatmap.tsx`: 7×24 grid, cell color intensity by value (purple scale on `#612bd3`).
- [ ] `workspace-analytics.hooks.tsx`: hook-type cards (avg + count). (AI insight/suggestion wired in Phase 3.)
- [ ] Render all three under the existing charts in `workspace.analytics.tsx`.

### Task 2.5: Phase-2 verification

- [ ] Run verification bar (4 commands). Commit.

---

## Phase 3 — AI insights + suggestions (on demand)

### Task 3.1: OpenaiService — insight + suggestion

**Files:** Modify `openai.service.ts`

- [ ] `summarizeHookInsights(payload): Promise<string>` — Korean summary from top/bottom post intros + hook stats (`chat.completions.parse`, single-string zod, model `HOOK_ANALYSIS_MODEL`).
- [ ] `suggestHooks(topic, examples): Promise<string[]>` — array zod (like `separatePosts`).

### Task 3.2: Backend AI endpoints

**Files:** Modify `workspace-analytics.controller.ts`, `workspace-analytics.service.ts`

- [ ] Service `hookInsights(org, user, workspaceId, query)` — reuse `getWorkspaceForUser` auth, gather top/bottom posts from post snapshots, call `summarizeHookInsights`.
- [ ] Service `hookSuggestions(org, user, workspaceId, body)` — auth, gather good patterns, call `suggestHooks`.
- [ ] Controller: `POST /workspaces/:workspaceId/insights`, `POST /workspaces/:workspaceId/hook-suggestions` (same `@GetOrgFromRequest`/`@GetUserFromRequest` decorators, no extra guard — matches existing routes).

### Task 3.3: Frontend — wire AI UI

**Files:** Modify `workspace-analytics.hooks.tsx`, `workspace.analytics.tsx`

- [ ] SWR/loader hooks (own hooks, rules-of-hooks) for insights (on demand button → POST) and a topic input → suggestion list.

### Task 3.4: Phase-3 verification + production checklist

- [ ] Run verification bar (4 commands).
- [ ] Production (when deployed): container health, PM2 online/restart 0, `/auth` 200, unauthenticated public API 401, real analytics-route QA. (`OPENAI_API_KEY` must be present for AI paths.)
- [ ] Commit.

---

## Self-Review notes

- Spec §5 (schema) → Task 1.1. §6 (collector) → 1.4/1.5/1.6. §7 (AI) → 2.1/3.1. §8 (API) → 2.3/3.2. §9 (frontend) → 2.4/3.3. §4 (age-based strategy) → 1.5 SCHEDULE. §2 reuse (`checkPostAnalytics`, `toSeries`, `topPosts`) honored.
- Correctness fix not in spec but required: `replaceSnapshots` `postId:null` guard (Task 1.2) — otherwise channel refresh wipes post rows.
- Type consistency: `AnalyticsAgeBucket` (Prisma enum) used identically across repo/service/activity/workflow; `PostHookType` across schema/openai/service; new summary keys (`postPerformance`,`timeOfDay`,`hookTypePerformance`) identical in libs types and frontend types.
- Risk: `gpt-5.4-nano` may not be a live model; isolated behind `HOOK_ANALYSIS_MODEL` + try/catch so it never blocks snapshot collection or publishing.
