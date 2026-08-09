# YouTube Multilingual SRT Upload Design

**Date:** 2026-08-09  
**Status:** Approved for implementation planning  
**Repository:** `/Users/taeyoungpark/Desktop/postiz-app`

## Goal

Allow a Postiz YouTube post to carry multiple language-specific SRT files from
both the web UI and Public API. Postiz publishes the video first, then uploads
each subtitle track to the resulting YouTube video independently. Subtitle
failures must never cause the video to be uploaded twice.

## Current State

The Jocoding fork currently uploads YouTube videos with title, description,
tags, thumbnail, category, default language, playlist, privacy, made-for-kids,
and synthetic-media settings. `YoutubeSettingsDto` has no subtitle contract,
and `YoutubeProvider.post()` does not call the YouTube captions API. The live
deployment, this checkout, and upstream `main` all lack SRT/VTT publishing.

The existing YouTube OAuth scopes already include `youtube` and
`youtube.force-ssl`, which are sufficient for caption API operations. An old
integration token that predates those scopes may require one reconnection.

## Scope

### Included

- Multiple SRT tracks on one YouTube post.
- Web UI upload, language selection, validation, status display, and retry.
- Public API upload and post settings contract for Cinelo and other clients.
- Dedicated caption storage that does not pollute the media library.
- Post-publish, per-language caption jobs with independent retry state.
- Idempotent YouTube insert/update behavior.
- Per-language status, error visibility, and retry of failed tracks only.
- Automated unit, workflow, API, and UI tests plus project type/build gates.

### Excluded

- VTT, TTML, SCC, or automatic subtitle translation.
- Multi-language audio tracks.
- Editing SRT cues inside Postiz.
- Production deployment or a real YouTube upload in this implementation slice.
- Changes to non-YouTube providers.

## Approaches Considered

### 1. Upload subtitles inside `YoutubeProvider.post()`

This is the smallest code change, but it couples caption failure to the video
activity. Existing activity retry behavior could run `videos.insert()` again
and create a duplicate video after a caption failure. Rejected.

### 2. Start independent post-publish caption jobs

Postiz records the successful YouTube video ID first. It then starts one
caption workflow per language. Each workflow retries and reports failure
without changing the successful video post state. This is the approved design.

### 3. Let Cinelo upload captions directly to YouTube

This avoids Postiz orchestration changes, but duplicates OAuth tokens across
systems and requires Cinelo to poll Postiz for the final YouTube ID. Rejected
for ongoing multi-channel operation.

## User Experience

The YouTube settings panel gains a `Subtitle tracks` section.

Each row contains:

- BCP-47 language selector/input, such as `en`, `ja`, `es-419`, or `pt-BR`.
- Optional human-readable track name.
- One `.srt` file picker.
- Remove action.
- After publication: status badge and last error, when present.

The user can add up to 20 tracks. A post cannot contain two tracks with the
same normalized language code. After publication, failed rows expose a
`Retry failed` action. The action starts jobs only for tracks whose current
status is `FAILED`.

Statuses are:

- `PENDING`: accepted with the scheduled post.
- `UPLOADING`: a caption workflow is active.
- `UPLOADED`: YouTube accepted the track.
- `FAILED`: all configured attempts failed.

The video post remains successful regardless of caption state.

## Upload and Settings Contracts

### Caption upload endpoints

- Authenticated UI: `POST /media/upload-caption`
- Public API: `POST /api/public/v1/upload-caption`

Both endpoints accept multipart field `file` and call one shared caption upload
service. A successful response is:

```json
{
  "path": "https://postiz.example/uploads/2026/08/09/track.srt",
  "originalName": "story.en.srt",
  "size": 1842,
  "mimeType": "application/x-subrip"
}
```

Caption uploads are stored through the configured `UploadFactory` provider but
are not written to the normal `Media` library table.

### YouTube post settings

`YoutubeSettingsDto` gains an optional `captions` array:

```json
{
  "__type": "youtube",
  "title": "Example",
  "type": "public",
  "captions": [
    {
      "language": "en",
      "name": "English",
      "file": {
        "path": "https://postiz.example/uploads/2026/08/09/story.en.srt",
        "originalName": "story.en.srt",
        "size": 1842,
        "mimeType": "application/x-subrip"
      }
    },
    {
      "language": "ja",
      "name": "日本語",
      "file": {
        "path": "https://postiz.example/uploads/2026/08/09/story.ja.srt",
        "originalName": "story.ja.srt",
        "size": 2011,
        "mimeType": "application/x-subrip"
      }
    }
  ]
}
```

The same DTO and validation rules apply to web-created and Public API posts.

## Validation

Caption upload validation is fail-closed before a post can be scheduled.

- File extension must be `.srt`, case-insensitive.
- Maximum file size is 5 MiB.
- Accepted incoming MIME types are `application/x-subrip`, `text/plain`, and
  `application/octet-stream`; extension and content validation remain
  mandatory because clients report SRT MIME inconsistently.
- Content must decode as UTF-8 without replacement characters.
- The file must contain at least one cue.
- Every cue must contain a numeric cue index, a valid
  `HH:MM:SS,mmm --> HH:MM:SS,mmm` timing line, nonempty text, and an end time
  strictly after its start time.
- Caption language must be a syntactically valid BCP-47 tag and is normalized
  for duplicate comparison.
- A post may contain at most 20 caption tracks.
- Caption file URLs must use the existing trusted Postiz upload path contract;
  arbitrary internal or local URLs are rejected.

## Persistence

A YouTube-specific caption-track record is persisted per post and normalized
language. It stores:

- internal ID and Post ID;
- language and optional display name;
- uploaded file metadata;
- state, attempt count, and last error;
- retry generation used to form a unique Temporal workflow ID;
- YouTube caption ID after success;
- timestamps.

The database enforces one track per `(postId, language)`. Desired caption
settings remain in the Post settings JSON for reproducibility, while the
caption-track record is the source of truth for operational state and retry.

## Publication and Caption Workflows

1. Post creation validates settings and upserts caption-track rows as
   `PENDING`, making scheduled caption state visible before publication.
2. The normal YouTube workflow publishes the video.
3. Postiz stores the YouTube video ID and release URL and marks the post
   successful using the existing path.
4. It selects the caption-track rows for that post and starts one child
   workflow per track. The workflow ID is
   `youtube-caption:<postId>:<language>:<retryGeneration>`.
5. The caption activity refreshes the integration token through the existing
   token-refresh path when required.
6. It calls YouTube `captions.list` for the video and language.
7. If a matching track exists, it calls `captions.update`; otherwise it calls
   `captions.insert` with the SRT stream.
8. It records `UPLOADED` and the returned YouTube caption ID.

Each caption workflow has at most three attempts. Workflows are independent,
so one language failure cannot retry the video or another caption. Activity
retries reuse the same workflow ID. A user retry increments `retryGeneration`
before starting a new workflow, while list-before-write keeps the YouTube side
idempotent.

## Failure Handling

- Upload or SRT validation errors block scheduling and identify the affected
  file and rule.
- Video upload failure follows the existing Postiz post failure path; caption
  workflows do not start.
- Caption failure updates only that caption track.
- After the third failed attempt, Postiz marks the track `FAILED`, stores a
  sanitized last error, and sends an in-app notification listing the language.
- The video Post remains successful and retains its YouTube release URL.
- `Retry failed` selects only `FAILED` tracks and starts new idempotent caption
  workflows. Already uploaded tracks are not requeued.
- OAuth scope errors instruct the user to reconnect the YouTube integration.

## Security and Data Handling

- Caption endpoints use the same organization authentication boundaries as
  their existing media-upload counterparts.
- Public API caption uploads require the raw Postiz API key through the
  existing middleware.
- File contents and OAuth tokens are never written to application logs.
- YouTube/API errors are sanitized before persistence and notification.
- Caption files are treated as untrusted text and never rendered as HTML.
- Caption file paths are constrained to Postiz-managed upload locations before
  the worker fetches them.

## Testing Strategy

### Validation and DTO tests

- Valid UTF-8 SRT with multiple cues passes.
- Invalid extension, oversize file, invalid UTF-8, missing cue, malformed
  timestamp, reverse time range, empty text, invalid BCP-47, duplicate
  language, and more than 20 tracks fail with specific messages.

### Upload API tests

- UI and Public API endpoints return the same caption asset shape.
- Public API authentication and organization isolation remain enforced.
- Caption assets are not created in the normal media library.

### YouTube provider/activity tests

- Missing language track calls `captions.insert` with the correct video ID,
  language, name, and stream.
- Existing language track calls `captions.update` instead of insert.
- A replay does not create duplicate language tracks.
- Refresh-required errors use the existing reconnect/refresh behavior.

### Workflow tests

- Caption child workflows start only after the video release ID is persisted.
- Each language gets an independent stable workflow ID.
- One failed language does not change the successful video post or other
  caption states.
- Only failed tracks are selected by retry.
- Final failure produces one sanitized notification.

### UI tests

- Users can add and remove multiple tracks.
- Duplicate languages and invalid files are blocked.
- Status badges and the retry action reflect caption state.
- Existing YouTube posts without captions remain unchanged.

### Project gates

- Focused Jest tests for caption validation, provider behavior, workflow, API,
  and UI.
- `pnpm exec tsc --noEmit --pretty false --project apps/frontend/tsconfig.json`
- `pnpm exec tsc --noEmit --pretty false --project libraries/nestjs-libraries/tsconfig.json`
- `pnpm run build:frontend`
- `pnpm run build:backend`
- `pnpm run build:orchestrator`
- `git diff --check`

## Rollout Boundary

This slice ends with code, migrations, and automated verification in the local
checkout. It does not build or deploy the production image and does not upload
a real YouTube video. A later approved rollout must back up the Raspberry Pi
Postiz database, deploy the fork image, reconnect any integration missing the
caption scope, and publish a private video with at least two SRT tracks before
enabling Cinelo production traffic.

## Acceptance Criteria

- Web UI and Public API accept up to 20 valid SRT tracks on one YouTube post.
- The video is published exactly once before caption jobs start.
- YouTube receives one idempotent track per configured language.
- One caption failure never fails or duplicates the video.
- Failed language tracks retry independently and remain visible/retryable.
- Existing YouTube posts without captions preserve their current behavior.
- All focused tests and project gates listed above pass or any unrelated
  baseline failure is reported with exact evidence.
