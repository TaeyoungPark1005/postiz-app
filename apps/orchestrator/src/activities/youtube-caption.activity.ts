import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ApplicationFailure } from '@temporalio/activity';
import dayjs from 'dayjs';
import { YoutubeCaptionService } from '@gitroom/nestjs-libraries/database/prisma/youtube-captions/youtube-caption.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { sanitizeYoutubeCaptionError } from '@gitroom/nestjs-libraries/database/prisma/youtube-captions/youtube-caption.service';

const RECONNECT_ERROR =
  'Reconnect the YouTube integration, then retry this caption.';

export const formatYoutubeCaptionFailure = (error: unknown): string => {
  const sanitized = sanitizeYoutubeCaptionError(error);
  if (
    /scope|permission|unauth|forbidden|credential|reconnect|invalid[_ -]?grant/i.test(
      sanitized
    )
  ) {
    return RECONNECT_ERROR;
  }
  return sanitized || 'YouTube caption upload failed';
};

@Injectable()
@Activity()
export class YoutubeCaptionActivity {
  constructor(
    private readonly captionService: YoutubeCaptionService,
    private readonly integrationManager: IntegrationManager,
    private readonly refreshIntegrationService: RefreshIntegrationService,
    private readonly notificationService: NotificationService
  ) {}

  @ActivityMethod()
  getPendingYoutubeCaptions(postId: string) {
    return this.captionService.listPending(postId);
  }

  @ActivityMethod()
  async uploadYoutubeCaption(trackId: string): Promise<string> {
    const track = await this.captionService.getUploadTask(trackId);
    if (!track || !track.post?.releaseId) {
      throw ApplicationFailure.nonRetryable(
        'Published YouTube video ID is missing',
        'youtube_caption_missing_video'
      );
    }
    if (
      track.post.integration?.providerIdentifier
        ?.split('-')[0]
        .toLowerCase() !== 'youtube'
    ) {
      throw ApplicationFailure.nonRetryable(
        'Caption track is not attached to a YouTube post',
        'youtube_caption_invalid_provider'
      );
    }

    await this.captionService.markUploading(trackId);

    const integration = track.post.integration;
    let accessToken = integration.token;
    const refresh = async () => {
      const refreshed = await this.refreshIntegrationService.refresh(
        integration
      );
      if (!refreshed || !refreshed.accessToken) {
        throw ApplicationFailure.nonRetryable(
          RECONNECT_ERROR,
          'youtube_caption_reconnect'
        );
      }
      accessToken = refreshed.accessToken;
    };

    if (
      integration.refreshNeeded ||
      (integration.tokenExpiration &&
        dayjs(integration.tokenExpiration).isBefore(dayjs().add(1, 'minute')))
    ) {
      await refresh();
    }

    const provider = this.integrationManager.getSocialIntegration(
      integration.providerIdentifier
    ) as unknown as {
      uploadCaption: (
        token: string,
        input: {
          videoId: string;
          language: string;
          name?: string;
          path: string;
        }
      ) => Promise<string>;
    };
    if (typeof provider.uploadCaption !== 'function') {
      throw ApplicationFailure.nonRetryable(
        'YouTube caption upload is unavailable',
        'youtube_caption_unavailable'
      );
    }

    const upload = () =>
      provider.uploadCaption(accessToken, {
        videoId: track.post.releaseId!,
        language: track.language,
        name: track.name || undefined,
        path: track.filePath,
      });

    let youtubeCaptionId: string;
    try {
      youtubeCaptionId = await upload();
    } catch (error) {
      if (!(error instanceof RefreshToken)) {
        throw error;
      }
      await refresh();
      youtubeCaptionId = await upload();
    }

    await this.captionService.markUploaded(trackId, youtubeCaptionId);
    return youtubeCaptionId;
  }

  @ActivityMethod()
  async failYoutubeCaption(trackId: string, error: unknown) {
    const track = await this.captionService.getUploadTask(trackId);
    if (!track || track.status === 'UPLOADED') {
      return;
    }

    const message = formatYoutubeCaptionFailure(error);
    await this.captionService.markFailed(trackId, message);
    await this.notificationService.inAppNotification(
      track.post.organizationId,
      `YouTube caption upload failed (${track.language})`,
      message,
      false,
      false,
      'fail'
    );
  }
}
