import {
  MAX_SRT_FILE_SIZE,
  validateSrtFile,
} from '@gitroom/nestjs-libraries/upload/captions/srt.validation';
import { CaptionUploadService } from '@gitroom/nestjs-libraries/upload/captions/caption-upload.service';
import { IUploadProvider } from '@gitroom/nestjs-libraries/upload/upload.interface';
import { Readable } from 'stream';

const validSrt = `1
00:00:00,000 --> 00:00:01,250
Hello world

2
00:00:02,000 --> 00:00:03,500
Second line
continues here
`;

const makeFile = (
  overrides: Partial<Express.Multer.File> = {}
): Express.Multer.File => {
  const buffer = overrides.buffer ?? Buffer.from(validSrt, 'utf8');
  return {
    fieldname: 'file',
    originalname: 'story.en.srt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: buffer.length,
    buffer,
    stream: Readable.from(buffer),
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
};

describe('validateSrtFile', () => {
  it('accepts a UTF-8 SRT with multiple indexed cues', () => {
    expect(validateSrtFile(makeFile())).toBe(validSrt);
  });

  it('accepts an uppercase SRT extension and the exact size limit', () => {
    expect(
      validateSrtFile(
        makeFile({ originalname: 'STORY.SRT', size: MAX_SRT_FILE_SIZE })
      )
    ).toBe(validSrt);
  });

  it.each(['story.txt', 'story.srt.exe'])('rejects invalid extension %s', (name) => {
    expect(() => validateSrtFile(makeFile({ originalname: name }))).toThrow(
      'Caption file must use the .srt extension'
    );
  });

  it('rejects files larger than 5 MiB', () => {
    expect(() =>
      validateSrtFile(makeFile({ size: MAX_SRT_FILE_SIZE + 1 }))
    ).toThrow('Caption file must be 5 MiB or smaller');
  });

  it('rejects an unsupported MIME type even when the suffix is SRT', () => {
    expect(() =>
      validateSrtFile(makeFile({ mimetype: 'application/pdf' }))
    ).toThrow('Unsupported caption MIME type');
  });

  it('rejects bytes that cannot be decoded as UTF-8', () => {
    expect(() =>
      validateSrtFile(makeFile({ buffer: Buffer.from([0xc3, 0x28]), size: 2 }))
    ).toThrow('Caption file must be valid UTF-8');
  });

  it('rejects content without a cue', () => {
    const buffer = Buffer.from('just some text', 'utf8');
    expect(() => validateSrtFile(makeFile({ buffer, size: buffer.length }))).toThrow(
      'Caption file must contain at least one valid cue'
    );
  });

  it('rejects a malformed cue timing line', () => {
    const buffer = Buffer.from(
      '1\n00:00:00.000 -> 00:00:01.000\nHello\n',
      'utf8'
    );
    expect(() => validateSrtFile(makeFile({ buffer, size: buffer.length }))).toThrow(
      'Cue 1 has an invalid timing line'
    );
  });

  it('rejects a cue whose end does not follow its start', () => {
    const buffer = Buffer.from(
      '1\n00:00:02,000 --> 00:00:01,000\nHello\n',
      'utf8'
    );
    expect(() => validateSrtFile(makeFile({ buffer, size: buffer.length }))).toThrow(
      'Cue 1 must end after it starts'
    );
  });

  it('rejects a cue with empty text', () => {
    const buffer = Buffer.from(
      '1\n00:00:00,000 --> 00:00:01,000\n   \n',
      'utf8'
    );
    expect(() => validateSrtFile(makeFile({ buffer, size: buffer.length }))).toThrow(
      'Cue 1 must contain text'
    );
  });
});

describe('CaptionUploadService', () => {
  it('validates before upload, forces SRT MIME, and returns stable metadata', async () => {
    const uploadFile = jest.fn(async (file: Express.Multer.File) => ({
      path: 'https://postiz.example/uploads/2026/08/09/random.srt',
      originalname: file.originalname,
    }));
    const storage: IUploadProvider = {
      uploadFile,
      uploadSimple: jest.fn(),
      removeFile: jest.fn(),
    };
    const service = new CaptionUploadService(storage);
    const file = makeFile();

    await expect(service.upload(file)).resolves.toEqual({
      path: 'https://postiz.example/uploads/2026/08/09/random.srt',
      originalName: 'story.en.srt',
      size: Buffer.byteLength(validSrt),
      mimeType: 'application/x-subrip',
    });
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        originalname: 'story.en.srt',
        mimetype: 'application/x-subrip',
        buffer: Buffer.from(validSrt, 'utf8'),
      })
    );
  });

  it('does not call storage when validation fails', async () => {
    const storage: IUploadProvider = {
      uploadFile: jest.fn(),
      uploadSimple: jest.fn(),
      removeFile: jest.fn(),
    };
    const service = new CaptionUploadService(storage);

    await expect(
      service.upload(makeFile({ originalname: 'story.txt' }))
    ).rejects.toThrow('Caption file must use the .srt extension');
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
});
