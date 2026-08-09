import { proxyActivities } from '@temporalio/workflow';
import type { YoutubeCaptionActivity } from '@gitroom/orchestrator/activities/youtube-caption.activity';

const uploadActivities = proxyActivities<YoutubeCaptionActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'youtube',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

const failureActivities = proxyActivities<YoutubeCaptionActivity>({
  startToCloseTimeout: '1 minute',
  taskQueue: 'main',
  retry: { maximumAttempts: 1 },
});

export async function youtubeCaptionWorkflow({
  trackId,
}: {
  trackId: string;
}) {
  try {
    await uploadActivities.uploadYoutubeCaption(trackId);
  } catch (error) {
    await failureActivities.failYoutubeCaption(
      trackId,
      error instanceof Error ? error.message : String(error)
    );
  }
}
