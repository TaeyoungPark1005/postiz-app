import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IUploadProvider } from '@gitroom/nestjs-libraries/upload/upload.interface';
import { validateSrtFile } from './srt.validation';

export const CAPTION_STORAGE = Symbol('CAPTION_STORAGE');

export type CaptionAsset = {
  path: string;
  originalName: string;
  size: number;
  mimeType: 'application/x-subrip';
};

@Injectable()
export class CaptionUploadService {
  constructor(
    @Inject(CAPTION_STORAGE) private readonly storage: IUploadProvider
  ) {}

  async upload(file: Express.Multer.File): Promise<CaptionAsset> {
    validateSrtFile(file);

    const uploaded = await this.storage.uploadFile({
      ...file,
      mimetype: 'application/x-subrip',
    });
    if (!uploaded?.path) {
      throw new BadRequestException('Caption upload did not return a path');
    }

    return {
      path: uploaded.path,
      originalName: file.originalname,
      size: file.size,
      mimeType: 'application/x-subrip',
    };
  }
}
