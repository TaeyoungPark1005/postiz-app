/** @jest-environment ./tests/youtube-captions/jsdom.environment.cjs */

const mockFetch = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { SWRConfig } from 'swr';
import { YoutubeCaptionFields } from '@gitroom/frontend/components/new-launch/providers/youtube/youtube.caption.fields';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';

const asset = {
  path: 'https://postiz.example/uploads/story.en.srt',
  originalName: 'story.en.srt',
  size: 100,
  mimeType: 'application/x-subrip',
};

const caption = (language: string) => ({
  language,
  name: '',
  file: { ...asset, originalName: `story.${language}.srt` },
});

const response = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) });

const TestForm = ({
  initialCaptions = [],
  postId,
}: {
  initialCaptions?: unknown[];
  postId?: string;
}) => {
  const form = useForm({ defaultValues: { captions: initialCaptions } });
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        loadingTimeout: 0,
      }}
    >
      <ExistingDataContextProvider
        value={{
          integration: postId ? 'youtube-integration' : '',
          group: postId ? 'group-1' : undefined,
          posts: postId ? [{ id: postId }] : [],
          settings: {},
        }}
      >
        <FormProvider {...form}>
          <YoutubeCaptionFields />
        </FormProvider>
      </ExistingDataContextProvider>
    </SWRConfig>
  );
};

describe('YoutubeCaptionFields', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('adds and removes a language track row', () => {
    render(<TestForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Add track' }));
    expect(screen.getByLabelText('Caption language 1')).toBeTruthy();
    expect(screen.getByLabelText('Track name 1')).toBeTruthy();
    expect(screen.getByLabelText('Subtitle file 1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove track 1' }));
    expect(screen.queryByLabelText('Caption language 1')).toBeNull();
  });

  it('disables adding when 20 tracks already exist', () => {
    render(
      <TestForm
        initialCaptions={Array.from({ length: 20 }, (_, index) =>
          caption(`en-x-${index + 10}`)
        )}
      />
    );

    expect(
      (screen.getByRole('button', { name: 'Add track' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it.each([
    ['story.txt', 10, 'Caption file must use the .srt extension'],
    ['story.srt', 5 * 1024 * 1024 + 1, 'Caption file must be 5 MiB or smaller'],
  ])('blocks invalid file %s before upload', async (name, size, message) => {
    render(<TestForm initialCaptions={[{ language: 'en', name: '' }]} />);
    const file = new File([new Uint8Array(size)], name, { type: 'text/plain' });

    fireEvent.change(screen.getByLabelText('Subtitle file 1'), {
      target: { files: [file] },
    });

    expect(await screen.findByText(message)).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uploads a valid SRT as FormData and displays the stored filename', async () => {
    mockFetch.mockReturnValue(response(asset));
    render(<TestForm initialCaptions={[{ language: 'en', name: '' }]} />);
    const file = new File(['valid srt'], 'story.en.srt', {
      type: 'application/x-subrip',
    });

    fireEvent.change(screen.getByLabelText('Subtitle file 1'), {
      target: { files: [file] },
    });

    expect(await screen.findByText('story.en.srt')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith(
      '/media/upload-caption',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
    );
  });

  it('shows duplicate canonical language tags before scheduling', () => {
    render(<TestForm initialCaptions={[caption('EN-us'), caption('en-US')]} />);

    expect(
      screen.getByText('Each subtitle language can only be added once.')
    ).toBeTruthy();
  });

  it('shows failed status and retries through the failed-only endpoint', async () => {
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/posts/post-1/captions/retry' && options?.method === 'POST') {
        return response([{ ...caption('en'), status: 'PENDING' }]);
      }
      if (url === '/posts/post-1/captions') {
        return response([
          {
            id: 'track-en',
            language: 'en',
            status: 'FAILED',
            lastError: 'YouTube quota rejected this caption',
          },
        ]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<TestForm initialCaptions={[caption('en')]} postId="post-1" />);

    expect(await screen.findByText('FAILED')).toBeTruthy();
    expect(
      screen.getByText('YouTube quota rejected this caption')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/posts/post-1/captions/retry', {
        method: 'POST',
      })
    );
  });
});
