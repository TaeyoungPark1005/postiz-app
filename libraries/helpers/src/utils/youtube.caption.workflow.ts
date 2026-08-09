export const youtubeCaptionWorkflowId = (
  postId: string,
  language: string,
  retryGeneration: number
) => `youtube-caption:${postId}:${language}:${retryGeneration}`;
