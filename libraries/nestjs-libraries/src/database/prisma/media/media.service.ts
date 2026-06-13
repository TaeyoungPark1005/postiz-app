import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization, User } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { WorkspaceAnalyticsRepository } from '@gitroom/nestjs-libraries/database/prisma/workspace-analytics/workspace-analytics.repository';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@Injectable()
export class MediaService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _workspaceRepository: WorkspaceAnalyticsRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager
  ) {}

  private async accessibleWorkspaceId(
    org: Organization,
    user: User,
    workspaceId?: string
  ) {
    if (!workspaceId) {
      return undefined;
    }

    const workspace = await this._workspaceRepository.getWorkspaceForUser(
      org.id,
      user.id,
      workspaceId,
      user.isSuperAdmin
    );
    if (!workspace) {
      throw new HttpException('Workspace not found', 404);
    }

    return workspace.id;
  }

  async deleteMedia(
    org: Organization,
    user: User,
    id: string,
    workspaceId?: string
  ) {
    return this._mediaRepository.deleteMedia(
      org.id,
      id,
      await this.accessibleWorkspaceId(org, user, workspaceId)
    );
  }

  getMediaById(id: string) {
    return this._mediaRepository.getMediaById(id);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean
  ) {
    const generating = await this._subscriptionService.useCredit(
      org,
      'ai_images',
      async () => {
        if (generatePromptFirst) {
          prompt = await this._openAi.generatePromptForPicture(prompt);
          console.log('Prompt:', prompt);
        }
        return this._openAi.generateImage(prompt, !!generatePromptFirst);
      }
    );

    return generating;
  }

  saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    productWorkspaceId?: string
  ) {
    return this._mediaRepository.saveFile(
      org,
      fileName,
      filePath,
      originalName,
      productWorkspaceId
    );
  }

  async saveFileForUser(
    org: Organization,
    user: User,
    fileName: string,
    filePath: string,
    originalName?: string,
    workspaceId?: string
  ) {
    return this.saveFile(
      org.id,
      fileName,
      filePath,
      originalName,
      await this.accessibleWorkspaceId(org, user, workspaceId)
    );
  }

  async getMedia(org: Organization, user: User, page: number, workspaceId?: string) {
    return this._mediaRepository.getMedia(
      org.id,
      page,
      await this.accessibleWorkspaceId(org, user, workspaceId)
    );
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  async generateVideo(
    org: Organization,
    body: VideoDto,
    user?: User,
    workspaceId?: string
  ) {
    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_videos'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.VIDEOS_PER_MONTH,
      });
    }

    const video = this._videoManager.getVideoByName(body.type);
    if (!video) {
      throw new Error(`Video type ${body.type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    console.log(body.customParams);
    await video.instance.processAndValidate(body.customParams);
    console.log('no err');

    return await this._subscriptionService.useCredit(
      org,
      'ai_videos',
      async () => {
        const loadedData = await video.instance.process(
          body.output,
          body.customParams
        );

        const file = await this.storage.uploadSimple(loadedData);
        const fileName = file.split('/').pop();
        if (!fileName) {
          throw new HttpException('Upload location is missing', 400);
        }

        return user
          ? this.saveFileForUser(org, user, fileName, file, undefined, workspaceId)
          : this.saveFile(org.id, fileName, file);
      }
    );
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
  }
}
