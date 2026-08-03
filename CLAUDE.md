This project is Postiz, a tool to schedule social media and chat posts to 28+ channels.
You can add posts to the calendar, they will be added into a workflow and posted at the right time.
You can find things like:
- Schedule posts
- Calendar view
- Analytics
- Team management
- Media library

This project is a monorepo with a root only package.json of dependencies.
Made with PNPM.
We have 3 important folders

- apps/backend - this is where the API code is (NESTJS)
- apps/orchestrator - this is temporal, it's for background jobs (NESTJS) it contains all the workflows and activities
- apps/frontend - this is the code of the frontend (Vite ReactJS)
- /libraries contains a lot of services shared between backend and orchestrator and frontend components.

We are using only pnpm, don't use any other dependency manager.
Never install frontend components from npmjs, focus on writing native components.

The project uses tailwind 3, before writing any component look at:
- /apps/frontend/src/app/colors.scss
- /apps/frontend/src/app/global.scss
- /apps/frontend/tailwind.config.js

All the --color-custom* are deprecated, don't use them.

And check other components in the system before to get the right design.

When working on the backend we need to pass the 3 layers:
Controller >> Service >> Repository (no shortcuts)
In some cases we will have
Controller >> Mananger >> Service >> Repository.

Most of the server logic should be inside of libs/server.
The backend repository is mostly used to write controller, and import files from libs.server.

For the frontend follow this:
- Many of the UI components lives in /apps/frontend/src/components/ui
- Routing is in /apps/frontend/src/app
- Components are in /apps/frontend/src/components
- always use SWR to fetch stuff, and use "useFetch" hook from /libraries/helpers/src/utils/custom.fetch.tsx

When using SWR, each one have to be in a seperate hook and must comply with react-hooks/rules-of-hooks, never put eslint-disable-next-line on it.

It means that this is valid:
const useCommunity = () => {
   return useSWR....
}

This is not valid:
const useCommunity = () => {
  return {
    communities: () => useSWR<CommunitiesListResponse>("communities", getCommunities),
    providers: () => useSWR<ProvidersListResponse>("providers", getProviders),
  };
}

- Linting of the project can run only from the root.
- Use only pnpm.

## Jocoding fork and production handoff

- Current work branch: `jocoding/workspace-analytics-fork`; origin is `TaeyoungPark1005/postiz-app`, upstream is `gitroomhq/postiz-app`.
- Production is `https://postiz.jocoding.io` on Raspberry Pi behind Cloudflare Tunnel. Do not use the old Tencent host (`ssh tencent`, `43.166.0.152`) as the current origin; that CVM expired and Postiz was moved off it.
- Cloudflare DNS currently routes `postiz.jocoding.io` to `a55a28da-05b7-4a80-8115-b414176104e9.cfargotunnel.com` (proxied CNAME, changed 2026-06-23). Current SSH target is `openclaw@192.168.123.105`.
- Production runs the Jocoding fork image/tag `taeyoung1005/postiz-app:jocoding-arm64` on the Raspberry Pi, not upstream vanilla Postiz. Re-check the live image digest and `docker-compose.override.yaml` before assuming a change is deployed.
- The fork is an internal Jocoding social operations tool. Public signup is disabled; `POSTIZ_INVITE_ONLY=true`, `POSTIZ_ALLOWED_EMAIL_DOMAINS=jocoding.net`, and `DISABLE_REGISTRATION=true` are expected in production.
- Product workspaces are project-level scopes such as `Jocohunt` and `PolaPop`. `Integration` records are organization-wide, while `WorkspaceChannel` maps a channel to a product workspace.

### Production operations

- Before deploy or debugging: check `git status`, current branch, remote drift, Cloudflare DNS/tunnel state for `postiz.jocoding.io`, then `ssh openclaw@192.168.123.105` and work from `/home/openclaw/postiz-restore`. Run `docker compose ps`, `docker exec postiz pm2 ls`, `docker exec postiz ss -ltnp`, `df -h /`, and `docker system df`. Do not try to revive Tencent for current Postiz outages.
- Repeated pulls/builds of this image can fill the 50GB root disk. Clean unused Docker images/build cache only, for example `docker image prune -af` and `docker builder prune -af`; do not prune volumes unless explicitly restoring from backup.
- Two deployment paths have been used. Earlier Tencent rollouts used GitHub Actions `dockerhub-jocoding.yml` to refresh Docker Hub then `docker compose pull postiz && docker compose up -d postiz`. On the Raspberry Pi, verify the current arm64 image/tag and compose path before reusing old amd64 build commands.
- Before risky server changes, run the existing secure backup flow from the jocoHunt repo if available, but set `REMOTE_HOST` to the current Raspberry Pi SSH target (`openclaw@192.168.123.105`) rather than `tencent`. Prior backups were stored under `/Users/taeyoungpark/SecureBackups/postiz/`.
- Public API base is `https://postiz.jocoding.io/api/public/v1`; auth header is the raw API key, not `Bearer <key>`.

### Workspace and channel pitfalls

- OAuth-created social channels are org-wide and are not automatically assigned to the currently intended product workspace.
- A channel can be mapped to multiple workspaces through `WorkspaceChannel`. Use the workspace selector controls to add/remove mappings; deleting the main integration deletes the channel globally.
- The fork added `DELETE /workspace-analytics/workspaces/:workspaceId/channels/:integrationId` to remove only the mapping and related snapshots while preserving the connected social account.
- Workspace isolation QA confirmed separate organizations see only their own product workspaces, but direct unauthorized summary access returned 500 instead of 403/404. Treat that as a known quality issue.
- Media library scoping uses `Media.productWorkspaceId`. Legacy media may have `NULL`; the current decision is to show `NULL` legacy media together with the selected workspace.

### TikTok and provider notes

- TikTok video music editing requires `content_posting_method=UPLOAD`; `DIRECT_POST` publishes directly and does not open the in-app editing/music flow.
- TikTok Pull from URL requires the actual media domain or URL prefix to be verified in the TikTok developer app. `postiz.jocoding.io` verification does not cover `polapop.jocoding.io`.
- YouTube provider support exists in the fork; production env lives in `/home/openclaw/postiz-restore/docker-compose.override.yaml`.
- X provider expects `X_API_KEY` and `X_API_SECRET` with callback `https://postiz.jocoding.io/integrations/social/x`; credentials were not present in the last handoff.

### Verification bar

- Local verification usually means `pnpm exec tsc --noEmit --pretty false --project apps/frontend/tsconfig.json`, `pnpm exec tsc --noEmit --pretty false --project libraries/nestjs-libraries/tsconfig.json`, `pnpm run build:frontend`, and `pnpm run build:backend`.
- `apps/backend` standalone tsc has pre-existing implicit-any errors in unrelated provider/agent files. Prefer the project checks above and name the baseline if it appears again.
- Production verification should include container health, PM2 `backend`/`frontend`/`orchestrator` online with restart 0, listening ports `3000`/`3002`/`4200`/`5000` inside `postiz`, Temporal `main` task-queue pollers, `https://postiz.jocoding.io/auth` 200, unauthenticated public API 401, and browser/API QA through the actual affected route.
