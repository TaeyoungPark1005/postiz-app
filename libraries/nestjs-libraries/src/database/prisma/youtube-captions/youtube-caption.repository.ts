import { BadRequestException, Injectable } from '@nestjs/common';
import { YoutubeCaptionSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class YoutubeCaptionRepository {
  constructor(
    private readonly prisma: PrismaRepository<
      'post' | 'youtubeCaptionTrack'
    >
  ) {}

  private async requirePost(postId: string, organizationId: string) {
    const post = await this.prisma.model.post.findFirst({
      where: { id: postId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!post) {
      throw new BadRequestException('YouTube post not found');
    }
    return post;
  }

  async listForPost(postId: string, organizationId: string) {
    await this.requirePost(postId, organizationId);
    return this.prisma.model.youtubeCaptionTrack.findMany({
      where: { postId, post: { organizationId, deletedAt: null } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deleteNotDesired(
    postId: string,
    organizationId: string,
    languages: string[]
  ) {
    await this.requirePost(postId, organizationId);
    return this.prisma.model.youtubeCaptionTrack.deleteMany({
      where: {
        postId,
        status: { in: ['PENDING', 'FAILED'] },
        ...(languages.length ? { language: { notIn: languages } } : {}),
      },
    });
  }

  async upsertPending(
    postId: string,
    organizationId: string,
    caption: YoutubeCaptionSettingsDto
  ) {
    await this.requirePost(postId, organizationId);
    const data = {
      language: caption.language,
      name: caption.name || null,
      filePath: caption.file.path,
      originalName: caption.file.originalName,
      fileSize: caption.file.size,
      mimeType: caption.file.mimeType,
      status: 'PENDING' as const,
      attemptCount: 0,
      lastError: null as string | null,
      youtubeCaptionId: null as string | null,
    };

    return this.prisma.model.youtubeCaptionTrack.upsert({
      where: { postId_language: { postId, language: caption.language } },
      create: { postId, retryGeneration: 0, ...data },
      update: data,
    });
  }

  listPending(postId: string) {
    return this.prisma.model.youtubeCaptionTrack.findMany({
      where: { postId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
  }

  getUploadTask(trackId: string) {
    return this.prisma.model.youtubeCaptionTrack.findUnique({
      where: { id: trackId },
      include: { post: { include: { integration: true } } },
    });
  }

  markUploading(trackId: string) {
    return this.prisma.model.youtubeCaptionTrack.update({
      where: { id: trackId },
      data: { status: 'UPLOADING', attemptCount: { increment: 1 } },
    });
  }

  markUploaded(trackId: string, youtubeCaptionId: string) {
    return this.prisma.model.youtubeCaptionTrack.update({
      where: { id: trackId },
      data: {
        status: 'UPLOADED',
        youtubeCaptionId,
        lastError: null,
      },
    });
  }

  markFailed(trackId: string, lastError: string) {
    return this.prisma.model.youtubeCaptionTrack.update({
      where: { id: trackId },
      data: { status: 'FAILED', lastError },
    });
  }

  async listFailed(postId: string, organizationId: string) {
    await this.requirePost(postId, organizationId);
    return this.prisma.model.youtubeCaptionTrack.findMany({
      where: {
        postId,
        status: 'FAILED',
        post: { organizationId, deletedAt: null },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async claimFailed(trackId: string) {
    const claimed = await this.prisma.model.youtubeCaptionTrack.updateMany({
      where: { id: trackId, status: 'FAILED' },
      data: {
        status: 'PENDING',
        attemptCount: 0,
        lastError: null,
        retryGeneration: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      return null;
    }
    return this.prisma.model.youtubeCaptionTrack.findUnique({
      where: { id: trackId },
    });
  }
}
