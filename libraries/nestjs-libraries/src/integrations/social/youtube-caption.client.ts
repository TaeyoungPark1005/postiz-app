import { Readable } from 'stream';
import { normalizeBcp47Language } from '@gitroom/helpers/utils/bcp47';
import type { youtube_v3 } from 'googleapis';

export type YoutubeCaptionClient = Pick<youtube_v3.Youtube, 'captions'>;

export type YoutubeCaptionUpsertInput = {
  videoId: string;
  language: string;
  name?: string;
  body: Readable;
};

const captionSnippet = (input: YoutubeCaptionUpsertInput) => ({
  videoId: input.videoId,
  language: input.language,
  name: input.name || input.language,
});

export const upsertYoutubeCaption = async (
  youtubeClient: YoutubeCaptionClient,
  input: YoutubeCaptionUpsertInput
): Promise<string> => {
  const listed = await youtubeClient.captions.list({
    part: ['id', 'snippet'],
    videoId: input.videoId,
  });
  const desiredLanguage = normalizeBcp47Language(input.language);
  const existing = (listed.data.items || []).find(
    (caption) =>
      !!caption.id &&
      normalizeBcp47Language(caption.snippet?.language) === desiredLanguage
  );

  const response = existing?.id
    ? await youtubeClient.captions.update({
        part: ['snippet'],
        requestBody: {
          id: existing.id,
          snippet: captionSnippet(input),
        },
        media: { body: input.body },
      })
    : await youtubeClient.captions.insert({
        part: ['snippet'],
        sync: false,
        requestBody: { snippet: captionSnippet(input) },
        media: { body: input.body },
      });

  const captionId = response.data.id || existing?.id;
  if (!captionId) {
    throw new Error('YouTube did not return a caption ID');
  }
  return captionId;
};
