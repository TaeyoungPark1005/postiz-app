import { Injectable } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { YoutubeCaptionSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import { YoutubeCaptionRepository } from './youtube-caption.repository';
import { youtubeCaptionWorkflowId } from '@gitroom/helpers/utils/youtube.caption.workflow';

export { youtubeCaptionWorkflowId };

export const sanitizeYoutubeCaptionError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error || '');
  const firstLine = raw.split(/\r?\n/)[0] || 'YouTube caption upload failed';
  return firstLine
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi,
      '$1=[redacted]'
    )
    .replace(/\bbearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .slice(0, 500);
};

@Injectable()
export class YoutubeCaptionService {
  constructor(
    private readonly repository: YoutubeCaptionRepository,
    private readonly temporalService: TemporalService
  ) {}

  async syncPending(
    postId: string,
    organizationId: string,
    captions: YoutubeCaptionSettingsDto[],
    resetForNewVideo = false
  ) {
    const existing = await this.repository.listForPost(postId, organizationId);
    const languages = captions.map((caption) => caption.language);
    await this.repository.deleteNotDesired(postId, organizationId, languages);

    const synchronized = [];
    for (const caption of captions) {
      const current = existing.find(
        (track) => track.language.toLowerCase() === caption.language.toLowerCase()
      );
      const unchanged =
        current &&
        current.name === (caption.name || null) &&
        current.filePath === caption.file.path &&
        current.originalName === caption.file.originalName &&
        current.fileSize === caption.file.size &&
        current.mimeType === caption.file.mimeType;
      const needsNewVideoUpload =
        resetForNewVideo &&
        current &&
        ['UPLOADED', 'FAILED'].includes(current.status);

      if (unchanged && !needsNewVideoUpload) {
        synchronized.push(current);
        continue;
      }

      synchronized.push(
        await this.repository.upsertPending(
          postId,
          organizationId,
          caption
        )
      );
    }

    return synchronized;
  }

  listForPost(postId: string, organizationId: string) {
    return this.repository.listForPost(postId, organizationId);
  }

  listPending(postId: string) {
    return this.repository.listPending(postId);
  }

  getUploadTask(trackId: string) {
    return this.repository.getUploadTask(trackId);
  }

  markUploading(trackId: string) {
    return this.repository.markUploading(trackId);
  }

  markUploaded(trackId: string, youtubeCaptionId: string) {
    return this.repository.markUploaded(trackId, youtubeCaptionId);
  }

  markFailed(trackId: string, error: unknown) {
    return this.repository.markFailed(
      trackId,
      sanitizeYoutubeCaptionError(error)
    );
  }

  async retryFailed(postId: string, organizationId: string) {
    const failed = await this.repository.listFailed(postId, organizationId);
    const restarted = [];
    for (const failedTrack of failed) {
      const track = await this.repository.claimFailed(failedTrack.id);
      if (!track) {
        continue;
      }

      try {
        await this.temporalService.client
          .getRawClient()
          .workflow.start('youtubeCaptionWorkflow', {
            args: [{ trackId: track.id }],
            taskQueue: 'youtube',
            workflowId: youtubeCaptionWorkflowId(
              track.postId,
              track.language,
              track.retryGeneration
            ),
            workflowIdConflictPolicy: 'USE_EXISTING',
          });
        restarted.push(track);
      } catch (error) {
        await this.repository.markFailed(
          track.id,
          sanitizeYoutubeCaptionError(error)
        );
      }
    }
    return restarted;
  }
}
