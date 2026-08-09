jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({ IntegrationManager: class IntegrationManager {} })
);

import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PostsController } from '@gitroom/backend/api/routes/posts.controller';

const youtubePostBody = (captions?: unknown[]) => ({
  type: 'now' as const,
  date: '2026-08-09T12:00:00',
  shortLink: false,
  tags: [],
  posts: [
    {
      integration: { id: 'integration-1' },
      group: 'group-1',
      settings: {
        __type: 'youtube',
        ...(captions ? { captions } : {}),
      },
      value: [{ content: 'Story', delay: 0, image: [] }],
    },
  ],
});

describe('PostsService YouTube caption lifecycle', () => {
  it('persists pending captions before starting the video workflow', async () => {
    const callOrder: string[] = [];
    const postRepository = {
      createOrUpdatePost: jest.fn(async () => {
        callOrder.push('post-created');
        return { posts: [{ id: 'post-1', state: 'QUEUE' }] };
      }),
    };
    const captionService = {
      syncPending: jest.fn(async () => {
        callOrder.push('captions-persisted');
      }),
    };
    const service = Object.create(PostsService.prototype) as PostsService & any;
    Object.assign(service, {
      _postRepository: postRepository,
      _captionService: captionService,
      _shortLinkService: {},
    });
    service.startWorkflow = jest.fn(async () => {
      callOrder.push('video-workflow-started');
    });
    const captions = [
      {
        language: 'en',
        file: {
          path: 'https://postiz.example/uploads/story.en.srt',
          originalName: 'story.en.srt',
          size: 100,
          mimeType: 'application/x-subrip',
        },
      },
    ];

    await service.createPost('org-1', youtubePostBody(captions) as any);
    await Promise.resolve();

    expect(captionService.syncPending).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      captions
    );
    expect(callOrder).toEqual([
      'post-created',
      'captions-persisted',
      'video-workflow-started',
    ]);
  });

  it('does not add caption work for existing YouTube posts without captions', async () => {
    const postRepository = {
      createOrUpdatePost: jest
        .fn()
        .mockResolvedValue({ posts: [{ id: 'post-1', state: 'QUEUE' }] }),
    };
    const captionService = { syncPending: jest.fn() };
    const service = Object.create(PostsService.prototype) as PostsService & any;
    Object.assign(service, {
      _postRepository: postRepository,
      _captionService: captionService,
      _shortLinkService: {},
    });
    service.startWorkflow = jest.fn().mockResolvedValue(undefined);

    await service.createPost('org-1', youtubePostBody() as any);

    expect(captionService.syncPending).not.toHaveBeenCalled();
    expect(service.startWorkflow).toHaveBeenCalledTimes(1);
  });
});

describe('PostsController YouTube caption routes', () => {
  it('scopes caption status reads to the authenticated organization', async () => {
    const captionService = {
      listForPost: jest.fn().mockResolvedValue([{ id: 'track-en' }]),
      retryFailed: jest.fn(),
    };
    const controller = new PostsController(
      {} as any,
      {} as any,
      {} as any,
      captionService as any
    );

    await expect(
      controller.getYoutubeCaptions({ id: 'org-1' } as any, 'post-1')
    ).resolves.toEqual([{ id: 'track-en' }]);
    expect(captionService.listForPost).toHaveBeenCalledWith('post-1', 'org-1');
  });

  it('retries failed tracks only inside the authenticated organization', async () => {
    const captionService = {
      listForPost: jest.fn(),
      retryFailed: jest.fn().mockResolvedValue([{ id: 'track-en' }]),
    };
    const controller = new PostsController(
      {} as any,
      {} as any,
      {} as any,
      captionService as any
    );

    await expect(
      controller.retryYoutubeCaptions({ id: 'org-1' } as any, 'post-1')
    ).resolves.toEqual([{ id: 'track-en' }]);
    expect(captionService.retryFailed).toHaveBeenCalledWith(
      'post-1',
      'org-1'
    );
  });
});
