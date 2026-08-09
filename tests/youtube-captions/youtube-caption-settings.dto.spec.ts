import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  YoutubeCaptionSettingsDto,
  YoutubeSettingsDto,
} from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import {
  isTrustedCaptionPath,
  normalizeBcp47Language,
} from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube-caption.validators';

const caption = (
  language: string,
  path = 'https://postiz.example/uploads/2026/08/09/story.en.srt'
) => ({
  language,
  name: 'English',
  file: {
    path,
    originalName: 'story.en.srt',
    size: 1842,
    mimeType: 'application/x-subrip',
  },
});

const validateSettings = async (captions?: unknown[]) => {
  const pipe = new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  return pipe.transform(
    {
      title: 'Example video',
      type: 'private',
      ...(captions ? { captions } : {}),
    },
    { type: 'body', metatype: YoutubeSettingsDto }
  ) as Promise<YoutubeSettingsDto>;
};

describe('YouTube caption settings validation', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalBucketUrl = process.env.CLOUDFLARE_BUCKET_URL;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://postiz.example';
    process.env.CLOUDFLARE_BUCKET_URL = 'https://media.example/captions';
  });

  afterAll(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
    process.env.CLOUDFLARE_BUCKET_URL = originalBucketUrl;
  });

  it('preserves existing YouTube settings when captions are omitted', async () => {
    const settings = await validateSettings();
    expect(settings.captions).toBeUndefined();
  });

  it.each([
    ['EN-us', 'en-US'],
    ['es-419', 'es-419'],
    ['zh-Hans', 'zh-Hans'],
  ])('normalizes valid BCP-47 language %s to %s', async (input, expected) => {
    const settings = await validateSettings([caption(input)]);
    expect(settings.captions?.[0]).toBeInstanceOf(YoutubeCaptionSettingsDto);
    expect(settings.captions?.[0].language).toBe(expected);
  });

  it('rejects a syntactically invalid BCP-47 language', async () => {
    await expect(validateSettings([caption('en_US')])).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(normalizeBcp47Language('en_US')).toBeNull();
  });

  it('rejects duplicate languages after canonical normalization', async () => {
    await expect(
      validateSettings([caption('EN-us'), caption('en-US')])
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects more than 20 caption tracks', async () => {
    const captions = Array.from({ length: 21 }, (_, index) =>
      caption(`en-x-${String(index + 10).padStart(2, '0')}`)
    );
    await expect(validateSettings(captions)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it.each([
    ['https://evil.example/uploads/story.srt'],
    ['https://postiz.example/private/story.srt'],
    ['file:///tmp/story.srt'],
    ['http://127.0.0.1/uploads/story.srt'],
    ['https://postiz.example/uploads/story.vtt'],
  ])('rejects an unmanaged caption path: %s', async (path) => {
    expect(isTrustedCaptionPath(path)).toBe(false);
    await expect(validateSettings([caption('en', path)])).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('accepts local-upload and Cloudflare caption paths', async () => {
    expect(
      isTrustedCaptionPath(
        'https://postiz.example/uploads/2026/08/09/story.SRT'
      )
    ).toBe(true);
    expect(
      isTrustedCaptionPath(
        'https://media.example/captions/2026/08/09/story.srt'
      )
    ).toBe(true);
  });

  it.each([
    [{ originalName: 'story.srt', size: 12, mimeType: 'application/x-subrip' }],
    [
      {
        path: 'https://postiz.example/uploads/story.srt',
        originalName: 'story.srt',
        size: 0,
        mimeType: 'application/x-subrip',
      },
    ],
    [
      {
        path: 'https://postiz.example/uploads/story.srt',
        originalName: 'story.srt',
        size: 5 * 1024 * 1024 + 1,
        mimeType: 'application/x-subrip',
      },
    ],
    [
      {
        path: 'https://postiz.example/uploads/story.srt',
        originalName: 'story.srt',
        size: 12,
        mimeType: 'text/plain',
      },
    ],
  ])('rejects invalid caption file metadata %#', async (file) => {
    await expect(
      validateSettings([{ ...caption('en'), file }])
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
