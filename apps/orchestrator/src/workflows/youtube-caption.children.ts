import { youtubeCaptionWorkflowId } from '@gitroom/helpers/utils/youtube.caption.workflow';

export { youtubeCaptionWorkflowId };

export type PendingYoutubeCaption = {
  id: string;
  postId: string;
  language: string;
  retryGeneration: number;
};

type CaptionChildOptions = {
  workflowId: string;
  taskQueue: 'youtube';
  parentClosePolicy: 'ABANDON';
};

export const completePostAndStartYoutubeCaptions = async (input: {
  postId: string;
  releaseId: string;
  releaseURL: string;
  providerIdentifier: string;
  updatePost: (
    postId: string,
    releaseId: string,
    releaseURL: string
  ) => Promise<unknown>;
  getPending: (postId: string) => Promise<PendingYoutubeCaption[]>;
  startChild: (
    track: PendingYoutubeCaption,
    options: CaptionChildOptions
  ) => Promise<unknown>;
}) => {
  await input.updatePost(input.postId, input.releaseId, input.releaseURL);

  if (
    input.providerIdentifier.split('-')[0].toLowerCase() !== 'youtube'
  ) {
    return;
  }

  try {
    const tracks = await input.getPending(input.postId);
    for (const track of tracks) {
      try {
        await input.startChild(track, {
          workflowId: youtubeCaptionWorkflowId(
            track.postId,
            track.language,
            track.retryGeneration
          ),
          taskQueue: 'youtube',
          parentClosePolicy: 'ABANDON',
        });
      } catch {
        // Starting one language must not affect the published video or siblings.
      }
    }
  } catch {
    // Caption persistence/dispatch is deliberately outside video success.
  }
};
