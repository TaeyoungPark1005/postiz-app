import { Global, Module } from '@nestjs/common';
import { UploadFactory } from './upload.factory';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import {
  CAPTION_STORAGE,
  CaptionUploadService,
} from '@gitroom/nestjs-libraries/upload/captions/caption-upload.service';

@Global()
@Module({
  providers: [
    UploadFactory,
    CustomFileValidationPipe,
    {
      provide: CAPTION_STORAGE,
      useFactory: () => UploadFactory.createStorage(),
    },
    CaptionUploadService,
  ],
  exports: [UploadFactory, CustomFileValidationPipe, CaptionUploadService],
})
export class UploadModule {}
