import {
  YoutubeCaptionService,
  sanitizeYoutubeCaptionError,
} from '@gitroom/nestjs-libraries/database/prisma/youtube-captions/youtube-caption.service';

const desiredCaption = (overrides: Record<string, unknown> = {}) => ({
  language: 'en-US',
  name: 'English',
  file: {
    path: 'https://postiz.example/uploads/story.en.srt',
    originalName: 'story.en.srt',
    size: 1842,
    mimeType: 'application/x-subrip' as const,
  },
  ...overrides,
});

const storedTrack = (overrides: Record<string, unknown> = {}) => ({
  id: 'track-en',
  postId: 'post-1',
  language: 'en-US',
  name: 'English',
  filePath: 'https://postiz.example/uploads/story.en.srt',
  originalName: 'story.en.srt',
  fileSize: 1842,
  mimeType: 'application/x-subrip',
  status: 'PENDING',
  attemptCount: 0,
  retryGeneration: 0,
  lastError: null,
  youtubeCaptionId: null,
  ...overrides,
});

const setup = () => {
  const repository = {
    listForPost: jest.fn().mockResolvedValue([]),
    deleteNotDesired: jest.fn().mockResolvedValue(undefined),
    upsertPending: jest
      .fn()
      .mockImplementation(async (_postId, _organizationId, caption) =>
        storedTrack({
          language: caption.language,
          filePath: caption.file.path,
        })
      ),
    listPending: jest.fn().mockResolvedValue([]),
    getUploadTask: jest.fn(),
    markUploading: jest.fn(),
    markUploaded: jest.fn(),
    markFailed: jest.fn(),
    listFailed: jest.fn().mockResolvedValue([]),
    claimFailed: jest.fn(),
  };
  const start = jest.fn().mockResolvedValue(undefined);
  const temporal = {
    client: {
      getRawClient: () => ({ workflow: { start } }),
    },
  };
  return {
    repository,
    start,
    service: new YoutubeCaptionService(repository as any, temporal as any),
  };
};

describe('YoutubeCaptionService', () => {
  it('synchronizes desired tracks and removes only non-desired mutable rows', async () => {
    const { repository, service } = setup();

    await service.syncPending('post-1', 'org-1', [
      desiredCaption(),
      desiredCaption({ language: 'ja', name: '日本語' }),
    ] as any);

    expect(repository.deleteNotDesired).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      ['en-US', 'ja']
    );
    expect(repository.upsertPending).toHaveBeenCalledTimes(2);
    expect(repository.upsertPending).toHaveBeenNthCalledWith(
      1,
      'post-1',
      'org-1',
      desiredCaption()
    );
  });

  it('does not reset an uploaded track when its desired metadata is unchanged', async () => {
    const { repository, service } = setup();
    repository.listForPost.mockResolvedValue([
      storedTrack({ status: 'UPLOADED', youtubeCaptionId: 'caption-123' }),
    ]);

    await service.syncPending('post-1', 'org-1', [desiredCaption()] as any);

    expect(repository.upsertPending).not.toHaveBeenCalled();
  });

  it('resets an uploaded track when the post will publish a new video', async () => {
    const { repository, service } = setup();
    repository.listForPost.mockResolvedValue([
      storedTrack({ status: 'UPLOADED', youtubeCaptionId: 'caption-123' }),
    ]);

    await service.syncPending(
      'post-1',
      'org-1',
      [desiredCaption()] as any,
      true
    );

    expect(repository.upsertPending).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      desiredCaption()
    );
  });

  it('resets a track to pending when its file changes', async () => {
    const { repository, service } = setup();
    repository.listForPost.mockResolvedValue([
      storedTrack({ status: 'UPLOADED', youtubeCaptionId: 'caption-123' }),
    ]);
    const changed = desiredCaption({
      file: {
        ...desiredCaption().file,
        path: 'https://postiz.example/uploads/story.en.v2.srt',
      },
    });

    await service.syncPending('post-1', 'org-1', [changed] as any);

    expect(repository.upsertPending).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      changed
    );
  });

  it('always scopes HTTP-facing track reads to the organization', async () => {
    const { repository, service } = setup();
    await service.listForPost('post-1', 'org-1');
    expect(repository.listForPost).toHaveBeenCalledWith('post-1', 'org-1');
  });

  it('increments upload attempts and records a clean success state', async () => {
    const { repository, service } = setup();
    await service.markUploading('track-en');
    await service.markUploaded('track-en', 'youtube-caption-1');
    expect(repository.markUploading).toHaveBeenCalledWith('track-en');
    expect(repository.markUploaded).toHaveBeenCalledWith(
      'track-en',
      'youtube-caption-1'
    );
  });

  it('sanitizes secrets, stack lines, and overly long provider errors', async () => {
    const error = new Error(
      `Upload failed access_token=secret-token Authorization: Bearer abc123\n${'x'.repeat(
        700
      )}`
    );
    error.stack = `${error.message}\n    at private/source.ts:10:2`;

    const sanitized = sanitizeYoutubeCaptionError(error);
    expect(sanitized).not.toContain('secret-token');
    expect(sanitized).not.toContain('abc123');
    expect(sanitized).not.toContain('private/source');
    expect(sanitized.length).toBeLessThanOrEqual(500);
  });

  it('claims and starts only failed tracks with incremented generations', async () => {
    const { repository, service, start } = setup();
    repository.listFailed.mockResolvedValue([
      storedTrack({ status: 'FAILED' }),
      storedTrack({
        id: 'track-ja',
        language: 'ja',
        status: 'FAILED',
        retryGeneration: 2,
      }),
    ]);
    repository.claimFailed.mockImplementation(async (id) =>
      id === 'track-en'
        ? storedTrack({ status: 'PENDING', retryGeneration: 1 })
        : storedTrack({
            id: 'track-ja',
            language: 'ja',
            status: 'PENDING',
            retryGeneration: 3,
          })
    );

    const retried = await service.retryFailed('post-1', 'org-1');

    expect(repository.listFailed).toHaveBeenCalledWith('post-1', 'org-1');
    expect(repository.claimFailed).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenNthCalledWith(
      1,
      'youtubeCaptionWorkflow',
      expect.objectContaining({
        args: [{ trackId: 'track-en' }],
        taskQueue: 'youtube',
        workflowId: 'youtube-caption:post-1:en-US:1',
        workflowIdConflictPolicy: 'USE_EXISTING',
      })
    );
    expect(start).toHaveBeenNthCalledWith(
      2,
      'youtubeCaptionWorkflow',
      expect.objectContaining({
        args: [{ trackId: 'track-ja' }],
        workflowId: 'youtube-caption:post-1:ja:3',
      })
    );
    expect(retried).toHaveLength(2);
  });
});
