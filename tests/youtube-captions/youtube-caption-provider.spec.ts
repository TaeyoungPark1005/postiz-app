import 'reflect-metadata';
import { Readable } from 'stream';
import { upsertYoutubeCaption } from '@gitroom/nestjs-libraries/integrations/social/youtube-caption.client';
import { YoutubeProvider } from '@gitroom/nestjs-libraries/integrations/social/youtube.provider';

const setup = (items: unknown[] = []) => {
  const list = jest.fn().mockResolvedValue({ data: { items } });
  const insert = jest.fn().mockResolvedValue({ data: { id: 'caption-new' } });
  const update = jest
    .fn()
    .mockResolvedValue({ data: { id: 'caption-existing' } });
  return {
    list,
    insert,
    update,
    client: { captions: { list, insert, update } },
  };
};

describe('upsertYoutubeCaption', () => {
  it('inserts an SRT when the video has no matching language track', async () => {
    const { client, list, insert, update } = setup();
    const body = Readable.from(Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nHi'));

    await expect(
      upsertYoutubeCaption(client as any, {
        videoId: 'video-123',
        language: 'en-US',
        name: 'English',
        body,
      })
    ).resolves.toBe('caption-new');

    expect(list).toHaveBeenCalledWith({
      part: ['id', 'snippet'],
      videoId: 'video-123',
    });
    expect(insert).toHaveBeenCalledWith({
      part: ['snippet'],
      sync: false,
      requestBody: {
        snippet: {
          videoId: 'video-123',
          language: 'en-US',
          name: 'English',
        },
      },
      media: { body },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('updates a canonical language match instead of inserting', async () => {
    const { client, insert, update } = setup([
      {
        id: 'caption-existing',
        snippet: { videoId: 'video-123', language: 'EN-us', name: 'Old name' },
      },
    ]);
    const body = Readable.from('replacement');

    await expect(
      upsertYoutubeCaption(client as any, {
        videoId: 'video-123',
        language: 'en-US',
        name: 'English',
        body,
      })
    ).resolves.toBe('caption-existing');

    expect(update).toHaveBeenCalledWith({
      part: ['snippet'],
      requestBody: {
        id: 'caption-existing',
        snippet: {
          videoId: 'video-123',
          language: 'en-US',
          name: 'English',
        },
      },
      media: { body },
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('lists before every write so a replay never creates a duplicate track', async () => {
    const { client, list, insert, update } = setup();
    list
      .mockResolvedValueOnce({ data: { items: [] } })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'caption-new',
              snippet: { videoId: 'video-123', language: 'ja' },
            },
          ],
        },
      });

    await upsertYoutubeCaption(client as any, {
      videoId: 'video-123',
      language: 'ja',
      body: Readable.from('first'),
    });
    await upsertYoutubeCaption(client as any, {
      videoId: 'video-123',
      language: 'ja',
      body: Readable.from('replay'),
    });

    expect(list).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('uses the language tag as YouTube track name when the optional name is empty', async () => {
    const { client, insert } = setup();

    await upsertYoutubeCaption(client as any, {
      videoId: 'video-123',
      language: 'pt-BR',
      body: Readable.from('caption'),
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: {
          snippet: {
            videoId: 'video-123',
            language: 'pt-BR',
            name: 'pt-BR',
          },
        },
      })
    );
  });

  it('fails when YouTube does not return a caption ID', async () => {
    const { client, insert } = setup();
    insert.mockResolvedValue({ data: {} });

    await expect(
      upsertYoutubeCaption(client as any, {
        videoId: 'video-123',
        language: 'en',
        body: Readable.from('caption'),
      })
    ).rejects.toThrow('YouTube did not return a caption ID');
  });
});

describe('YoutubeProvider caption authorization errors', () => {
  it.each([
    'insufficientPermissions',
    'Request had insufficient authentication scopes',
    'PERMISSION_DENIED: youtube captions scope missing',
  ])('turns %s into reconnect guidance', (body) => {
    expect(new YoutubeProvider().handleErrors(body)).toEqual({
      type: 'refresh-token',
      value:
        'YouTube caption access is missing. Reconnect your YouTube integration and try again.',
    });
  });
});
