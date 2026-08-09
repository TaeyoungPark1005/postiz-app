import { BadRequestException } from '@nestjs/common';

export const MAX_SRT_FILE_SIZE = 5 * 1024 * 1024;

const ACCEPTED_SRT_MIME_TYPES = new Set([
  'application/x-subrip',
  'text/plain',
  'application/octet-stream',
]);

const TIMING_LINE =
  /^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})$/;

const timestampToMilliseconds = (parts: string[]) => {
  const [hours, minutes, seconds, milliseconds] = parts.map(Number);
  if (minutes > 59 || seconds > 59) {
    return null;
  }

  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
};

export const validateSrtFile = (file: Express.Multer.File): string => {
  if (!file) {
    throw new BadRequestException('No caption file provided');
  }

  if (!/\.srt$/i.test(file.originalname || '')) {
    throw new BadRequestException('Caption file must use the .srt extension');
  }

  if (file.size > MAX_SRT_FILE_SIZE) {
    throw new BadRequestException('Caption file must be 5 MiB or smaller');
  }

  if (!ACCEPTED_SRT_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException('Unsupported caption MIME type');
  }

  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
  } catch {
    throw new BadRequestException('Caption file must be valid UTF-8');
  }

  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cues = normalized
    .split(/\n[\t ]*\n/)
    .filter((cue) => cue.trim().length > 0);

  if (!cues.length || cues.every((cue) => cue.split('\n').length < 2)) {
    throw new BadRequestException(
      'Caption file must contain at least one valid cue'
    );
  }

  cues.forEach((cue, position) => {
    const lines = cue.split('\n');
    const cueLabel = lines[0]?.trim() || String(position + 1);
    if (!/^\d+$/.test(lines[0]?.trim() || '')) {
      throw new BadRequestException(`Cue ${cueLabel} must use a numeric index`);
    }

    const timing = TIMING_LINE.exec(lines[1]?.trim() || '');
    if (!timing) {
      throw new BadRequestException(`Cue ${cueLabel} has an invalid timing line`);
    }

    const start = timestampToMilliseconds(timing.slice(1, 5));
    const end = timestampToMilliseconds(timing.slice(5, 9));
    if (start === null || end === null) {
      throw new BadRequestException(`Cue ${cueLabel} has an invalid timing line`);
    }
    if (end <= start) {
      throw new BadRequestException(`Cue ${cueLabel} must end after it starts`);
    }

    if (!lines.slice(2).join('\n').trim()) {
      throw new BadRequestException(`Cue ${cueLabel} must contain text`);
    }
  });

  return content;
};
