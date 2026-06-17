import { proxyActivities, sleep } from '@temporalio/workflow';
// Type-only import: the activity class (and its Prisma/OpenAI deps) must never
// be pulled into the deterministic workflow bundle.
import type { PostAnalyticsActivity } from '@gitroom/orchestrator/activities/post-analytics.activity';

// Local union (NOT imported from @prisma/client) so the deterministic workflow
// bundle never pulls a runtime value from the Prisma client.
type AgeBucket = 'H1' | 'H6' | 'H24' | 'D3' | 'D7';

const { collectPostSnapshots } = proxyActivities<PostAnalyticsActivity>({
  startToCloseTimeout: '5 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 2,
    initialInterval: '30 seconds',
  },
});

// Incremental gaps between wake-ups; cumulative ages = 1h, 6h, 24h, 3d, 7d.
const SCHEDULE: { delay: number; bucket: AgeBucket }[] = [
  { delay: 3_600_000, bucket: 'H1' }, // +1h  => age 1h
  { delay: 18_000_000, bucket: 'H6' }, // +5h  => age 6h
  { delay: 64_800_000, bucket: 'H24' }, // +18h => age 24h
  { delay: 172_800_000, bucket: 'D3' }, // +48h => age 3d
  { delay: 345_600_000, bucket: 'D7' }, // +96h => age 7d
];

export async function postAnalyticsCollectionWorkflow({
  postId,
}: {
  postId: string;
}) {
  for (const step of SCHEDULE) {
    await sleep(step.delay);
    try {
      await collectPostSnapshots(postId, step.bucket);
    } catch (err) {
      // Empty/failed cases are diagnosed + swallowed in the service layer; the
      // collector must never fail the workflow (and never the publish path).
    }
  }
}
