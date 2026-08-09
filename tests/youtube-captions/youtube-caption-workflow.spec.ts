jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({ IntegrationManager: class IntegrationManager {} })
);

import {
  completePostAndStartYoutubeCaptions,
  youtubeCaptionWorkflowId,
} from '@gitroom/orchestrator/workflows/youtube-caption.children';
import {
  formatYoutubeCaptionFailure,
  YoutubeCaptionActivity,
} from '@gitroom/orchestrator/activities/youtube-caption.activity';

const track = (overrides: Record<string, unknown> = {}) => ({
  id: 'track-en',
  postId: 'post-1',
  language: 'en-US',
  name: 'English',
  filePath: 'https://postiz.example/uploads/story.en.srt',
  retryGeneration: 0,
  ...overrides,
});

describe('YouTube caption child workflow dispatch', () => {
  it('builds a stable workflow ID from post, language, and generation', () => {
    expect(youtubeCaptionWorkflowId('post-1', 'pt-BR', 3)).toBe(
      'youtube-caption:post-1:pt-BR:3'
    );
  });

  it('persists the video release before starting one detached child per language', async () => {
    const calls: string[] = [];
    const updatePost = jest.fn(async () => {
      calls.push('release-persisted');
    });
    const getPending = jest.fn(async () => {
      calls.push('captions-read');
      return [track(), track({ id: 'track-ja', language: 'ja' })];
    });
    const startChild = jest.fn(async (captionTrack, options) => {
      calls.push(`started:${captionTrack.language}`);
      expect(options.parentClosePolicy).toBe('ABANDON');
      expect(options.taskQueue).toBe('youtube');
    });

    await completePostAndStartYoutubeCaptions({
      postId: 'post-1',
      releaseId: 'video-123',
      releaseURL: 'https://youtube.example/video-123',
      providerIdentifier: 'youtube',
      updatePost,
      getPending,
      startChild,
    });

    expect(calls).toEqual([
      'release-persisted',
      'captions-read',
      'started:en-US',
      'started:ja',
    ]);
    expect(startChild).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'track-en' }),
      expect.objectContaining({
        workflowId: 'youtube-caption:post-1:en-US:0',
      })
    );
  });

  it('isolates child-start failures so another language and the video stay successful', async () => {
    const updatePost = jest.fn().mockResolvedValue(undefined);
    const getPending = jest.fn().mockResolvedValue([
      track(),
      track({ id: 'track-ja', language: 'ja' }),
    ]);
    const started: string[] = [];
    const startChild = jest.fn(async (captionTrack) => {
      started.push(captionTrack.language);
      if (captionTrack.language === 'en-US') {
        throw new Error('English worker unavailable');
      }
    });

    await expect(
      completePostAndStartYoutubeCaptions({
        postId: 'post-1',
        releaseId: 'video-123',
        releaseURL: 'https://youtube.example/video-123',
        providerIdentifier: 'youtube',
        updatePost,
        getPending,
        startChild,
      })
    ).resolves.toBeUndefined();

    expect(updatePost).toHaveBeenCalledTimes(1);
    expect(started).toEqual(['en-US', 'ja']);
  });

  it('keeps caption read failures outside the successful video path', async () => {
    const updatePost = jest.fn().mockResolvedValue(undefined);
    const getPending = jest.fn().mockRejectedValue(new Error('DB unavailable'));
    const startChild = jest.fn();

    await expect(
      completePostAndStartYoutubeCaptions({
        postId: 'post-1',
        releaseId: 'video-123',
        releaseURL: 'https://youtube.example/video-123',
        providerIdentifier: 'youtube',
        updatePost,
        getPending,
        startChild,
      })
    ).resolves.toBeUndefined();
    expect(updatePost).toHaveBeenCalledTimes(1);
    expect(startChild).not.toHaveBeenCalled();
  });
});

describe('YoutubeCaptionActivity', () => {
  const uploadTask = () => ({
    ...track(),
    status: 'PENDING',
    post: {
      id: 'post-1',
      releaseId: 'video-123',
      organizationId: 'org-1',
      integration: {
        id: 'integration-1',
        providerIdentifier: 'youtube',
        token: 'access-token',
        tokenExpiration: new Date(Date.now() + 60 * 60 * 1000),
      },
    },
  });

  const setup = () => {
    const captionService = {
      listPending: jest.fn(),
      getUploadTask: jest.fn().mockResolvedValue(uploadTask()),
      markUploading: jest.fn().mockResolvedValue(undefined),
      markUploaded: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const provider = {
      uploadCaption: jest.fn().mockResolvedValue('youtube-caption-1'),
    };
    const integrationManager = {
      getSocialIntegration: jest.fn().mockReturnValue(provider),
    };
    const refreshService = { refresh: jest.fn() };
    const notificationService = { inAppNotification: jest.fn() };
    return {
      captionService,
      provider,
      refreshService,
      notificationService,
      activity: new YoutubeCaptionActivity(
        captionService as any,
        integrationManager as any,
        refreshService as any,
        notificationService as any
      ),
    };
  };

  it('marks uploading, upserts the provider track, and records success', async () => {
    const { activity, captionService, provider } = setup();

    await expect(activity.uploadYoutubeCaption('track-en')).resolves.toBe(
      'youtube-caption-1'
    );

    expect(captionService.markUploading).toHaveBeenCalledWith('track-en');
    expect(provider.uploadCaption).toHaveBeenCalledWith('access-token', {
      videoId: 'video-123',
      language: 'en-US',
      name: 'English',
      path: 'https://postiz.example/uploads/story.en.srt',
    });
    expect(captionService.markUploaded).toHaveBeenCalledWith(
      'track-en',
      'youtube-caption-1'
    );
  });

  it('marks a terminal OAuth failure and notifies once with reconnect guidance', async () => {
    const { activity, captionService, notificationService } = setup();

    await activity.failYoutubeCaption(
      'track-en',
      'Request had insufficient authentication scopes: access_token=secret'
    );

    expect(captionService.markFailed).toHaveBeenCalledWith(
      'track-en',
      'Reconnect the YouTube integration, then retry this caption.'
    );
    expect(notificationService.inAppNotification).toHaveBeenCalledTimes(1);
    expect(notificationService.inAppNotification).toHaveBeenCalledWith(
      'org-1',
      'YouTube caption upload failed (en-US)',
      'Reconnect the YouTube integration, then retry this caption.',
      false,
      false,
      'fail'
    );
  });

  it('sanitizes ordinary final errors without leaking tokens', () => {
    const message = formatYoutubeCaptionFailure(
      'Provider failed Authorization: Bearer secret-token\nprivate stack'
    );
    expect(message).not.toContain('secret-token');
    expect(message).not.toContain('private stack');
  });
});
