'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { normalizeBcp47Language } from '@gitroom/helpers/utils/bcp47';
import { MAX_SRT_FILE_SIZE } from '@gitroom/helpers/utils/youtube.caption.constants';

type CaptionAsset = {
  path: string;
  originalName: string;
  size: number;
  mimeType: 'application/x-subrip';
};

type CaptionFormValue = {
  language: string;
  name?: string;
  file?: CaptionAsset;
};

type CaptionTrackStatus = {
  id: string;
  language: string;
  status: 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED';
  lastError?: string | null;
};

const statusStyle = {
  PENDING: { rail: 'bg-amber-400', badge: 'text-amber-300 bg-amber-400/10' },
  UPLOADING: { rail: 'bg-sky-400', badge: 'text-sky-300 bg-sky-400/10' },
  UPLOADED: { rail: 'bg-emerald-400', badge: 'text-emerald-300 bg-emerald-400/10' },
  FAILED: { rail: 'bg-red-400', badge: 'text-red-300 bg-red-400/10' },
} as const;

const fieldClass =
  'h-[42px] w-full rounded-[8px] border border-newTableBorder bg-newBgColorInner px-[12px] text-[14px] text-textColor outline-none focus:border-forth';

const responseMessage = (payload: any) => {
  const message = payload?.message || payload?.msg;
  return Array.isArray(message)
    ? message.join(', ')
    : message || 'Caption upload failed';
};

export const YoutubeCaptionFields = () => {
  const fetch = useFetch();
  const existingData = useExistingData();
  const postId = existingData.posts?.[0]?.id;
  const form = useFormContext<{ captions: CaptionFormValue[] }>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'captions',
  });
  const captions = form.watch('captions') || [];
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');

  const loadStatuses = async (url: string) => {
    const request = await fetch(url);
    const payload = await request.json();
    if (!request.ok) {
      throw new Error(responseMessage(payload));
    }
    return payload as CaptionTrackStatus[];
  };
  const { data: persistedTracks = [], mutate } = useSWR<CaptionTrackStatus[]>(
    postId ? `/posts/${postId}/captions` : null,
    loadStatuses,
    {
      refreshInterval: (latest) =>
        latest?.some((track) =>
          ['PENDING', 'UPLOADING'].includes(track.status)
        )
          ? 5000
          : 0,
      revalidateOnFocus: true,
    }
  );

  const duplicateLanguages = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const caption of captions) {
      const normalized = normalizeBcp47Language(caption?.language);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    }
    return duplicates;
  }, [captions]);

  const statusForLanguage = (language?: string) => {
    const normalized = normalizeBcp47Language(language)?.toLowerCase();
    return persistedTracks.find(
      (track) =>
        normalizeBcp47Language(track.language)?.toLowerCase() === normalized
    );
  };

  const uploadFile =
    (index: number, fieldId: string) =>
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      if (!/\.srt$/i.test(file.name)) {
        setUploadErrors((current) => ({
          ...current,
          [fieldId]: 'Caption file must use the .srt extension',
        }));
        return;
      }
      if (file.size > MAX_SRT_FILE_SIZE) {
        setUploadErrors((current) => ({
          ...current,
          [fieldId]: 'Caption file must be 5 MiB or smaller',
        }));
        return;
      }

      setUploadErrors((current) => ({ ...current, [fieldId]: '' }));
      setUploading((current) => new Set(current).add(fieldId));
      try {
        const body = new FormData();
        body.append('file', file, file.name);
        const request = await fetch('/media/upload-caption', {
          method: 'POST',
          body,
        });
        const payload = await request.json();
        if (!request.ok) {
          throw new Error(responseMessage(payload));
        }
        form.setValue(`captions.${index}.file`, payload as CaptionAsset, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      } catch (error) {
        setUploadErrors((current) => ({
          ...current,
          [fieldId]:
            error instanceof Error ? error.message : 'Caption upload failed',
        }));
      } finally {
        setUploading((current) => {
          const next = new Set(current);
          next.delete(fieldId);
          return next;
        });
      }
    };

  const retryFailed = async () => {
    if (!postId) return;
    setRetrying(true);
    setRetryError('');
    try {
      const request = await fetch(`/posts/${postId}/captions/retry`, {
        method: 'POST',
      });
      const payload = await request.json();
      if (!request.ok) {
        throw new Error(responseMessage(payload));
      }
      await mutate();
    } catch (error) {
      setRetryError(
        error instanceof Error ? error.message : 'Caption retry failed'
      );
    } finally {
      setRetrying(false);
    }
  };

  const hasFailed = persistedTracks.some((track) => track.status === 'FAILED');

  return (
    <section className="mt-[24px] border-t border-newTableBorder pt-[20px]">
      <div className="mb-[14px] flex items-start justify-between gap-[16px]">
        <div>
          <h3 className="text-[15px] font-medium text-textColor">
            Subtitle tracks
          </h3>
          <p className="mt-[4px] max-w-[520px] text-[12px] leading-[18px] text-textColor/60">
            Add one UTF-8 SRT file per language. Tracks upload after the video is
            published.
          </p>
        </div>
        <Button
          secondary
          className="shrink-0 rounded-[8px]"
          disabled={fields.length >= 20}
          onClick={() => append({ language: '', name: '' })}
        >
          Add track
        </Button>
      </div>

      {duplicateLanguages.size > 0 && (
        <div className="mb-[10px] text-[12px] text-red-300" role="alert">
          Each subtitle language can only be added once.
        </div>
      )}

      <div className="flex flex-col gap-[10px]">
        {fields.map((field, index) => {
          const value = captions[index];
          const persisted = statusForLanguage(value?.language);
          const status = uploading.has(field.id)
            ? 'UPLOADING'
            : persisted?.status || (value?.file ? 'PENDING' : undefined);
          const style = status ? statusStyle[status] : undefined;
          const invalidLanguage =
            !!value?.language && !normalizeBcp47Language(value.language);

          return (
            <div
              key={field.id}
              className="relative overflow-hidden rounded-[8px] border border-newTableBorder bg-newBgColorInner/40 p-[12px] ps-[16px]"
            >
              <div
                aria-hidden="true"
                className={`absolute inset-y-0 start-0 w-[4px] ${
                  style?.rail || 'bg-newTableBorder'
                }`}
              />
              <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-[130px_1fr_auto]">
                <label className="flex flex-col gap-[5px] text-[12px] text-textColor/70">
                  Language
                  <input
                    aria-label={`Caption language ${index + 1}`}
                    className={`${fieldClass} font-mono`}
                    placeholder="en, ja, pt-BR"
                    list="youtube-caption-languages"
                    {...form.register(`captions.${index}.language`, {
                      required: true,
                    })}
                  />
                </label>
                <label className="flex flex-col gap-[5px] text-[12px] text-textColor/70">
                  Track name (optional)
                  <input
                    aria-label={`Track name ${index + 1}`}
                    className={fieldClass}
                    placeholder="English"
                    {...form.register(`captions.${index}.name`)}
                  />
                </label>
                <div className="flex items-end justify-end">
                  <button
                    type="button"
                    aria-label={`Remove track ${index + 1}`}
                    className="h-[42px] rounded-[8px] px-[10px] text-[12px] text-red-300 hover:bg-red-400/10 focus:outline-none focus:ring-2 focus:ring-red-300"
                    onClick={() => remove(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {invalidLanguage && (
                <div className="mt-[8px] text-[12px] text-red-300" role="alert">
                  Use a valid BCP-47 language tag, such as en or pt-BR.
                </div>
              )}

              <div className="mt-[10px] flex flex-wrap items-center gap-[10px]">
                <label className="cursor-pointer rounded-[8px] border border-newTableBorder px-[12px] py-[8px] text-[12px] text-textColor hover:border-forth focus-within:ring-2 focus-within:ring-forth">
                  <span>{uploading.has(field.id) ? 'Uploading…' : 'Choose SRT'}</span>
                  <input
                    aria-label={`Subtitle file ${index + 1}`}
                    className="sr-only"
                    type="file"
                    accept=".srt,application/x-subrip,text/plain"
                    disabled={uploading.has(field.id)}
                    onChange={uploadFile(index, field.id)}
                  />
                </label>
                {value?.file?.originalName && (
                  <span className="max-w-[280px] truncate font-mono text-[12px] text-textColor/70">
                    {value.file.originalName}
                  </span>
                )}
                {status && style && (
                  <span
                    className={`rounded-[999px] px-[8px] py-[3px] font-mono text-[10px] ${style.badge}`}
                  >
                    {status}
                  </span>
                )}
              </div>

              {(uploadErrors[field.id] || persisted?.lastError) && (
                <div className="mt-[8px] text-[12px] leading-[18px] text-red-300" role="alert">
                  {uploadErrors[field.id] || persisted?.lastError}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasFailed && postId && (
        <div className="mt-[12px] flex items-center justify-between gap-[12px]">
          <div className="text-[12px] text-red-300" role="alert">
            {retryError}
          </div>
          <Button
            className="rounded-[8px]"
            loading={retrying}
            onClick={retryFailed}
          >
            Retry failed
          </Button>
        </div>
      )}

      <datalist id="youtube-caption-languages">
        {['ko', 'en', 'ja', 'zh-Hans', 'es', 'es-419', 'fr', 'de', 'pt-BR'].map(
          (language) => (
            <option key={language} value={language} />
          )
        )}
      </datalist>
    </section>
  );
};
