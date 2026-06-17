import { Injectable } from '@nestjs/common';
import { AnalyticsAgeBucket } from '@prisma/client';
import { WorkspaceAnalyticsRepository } from '@gitroom/nestjs-libraries/database/prisma/workspace-analytics/workspace-analytics.repository';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { normalizeMetric } from '@gitroom/nestjs-libraries/database/prisma/workspace-analytics/workspace-analytics.helpers';
import { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';

@Injectable()
export class PostAnalyticsService {
  constructor(
    private _repo: WorkspaceAnalyticsRepository,
    private _postsService: PostsService,
    private _openaiService: OpenaiService
  ) {}

  // Classify the post's hook once, right after the first collection (H1).
  // Guarded so AI/model failures never block snapshot collection.
  private async classifyHookOnce(post: {
    id: string;
    content: string;
    title: string | null;
    hookType: unknown;
  }) {
    if (post.hookType != null) {
      return;
    }
    const intro = stripHtmlValidation('none', post.title || post.content || '')
      .trim()
      .slice(0, 200);
    if (!intro) {
      return;
    }
    try {
      const { hookType, confidence } =
        await this._openaiService.classifyHookType(intro);
      await this._repo.setHookClassification(post.id, hookType, confidence);
    } catch (err) {
      console.warn('post-analytics: hook classification failed', {
        postId: post.id,
      });
    }
  }

  // Called by the Temporal collector at each age bucket (1h/6h/24h/3d/7d).
  // Reuses PostsService.checkPostAnalytics (provider resolution + token
  // refresh + provider.postAnalytics) and writes post-level snapshots keyed by
  // postId + ageBucket for every WorkspaceChannel the post's integration maps
  // to. Never throws — collection must not affect publishing.
  async collectPostSnapshots(postId: string, ageBucket: AnalyticsAgeBucket) {
    const post = await this._repo.getPostForCollection(postId);
    if (!post || !post.releaseId || post.releaseId === 'missing') {
      console.warn('post-analytics: skip (no releaseId)', { postId, ageBucket });
      return { collected: 0 };
    }

    // Classify the hook once, at the first collection point.
    if (ageBucket === 'H1') {
      await this.classifyHookOnce(post);
    }

    const channels = await this._repo.listChannelsForIntegration(
      post.integrationId
    );
    if (!channels.length) {
      console.warn('post-analytics: skip (no workspace channel)', { postId });
      return { collected: 0 };
    }

    const analytics = await this._postsService.checkPostAnalytics(
      post.organizationId,
      postId,
      7
    );

    if (!Array.isArray(analytics) || !analytics.length) {
      console.warn('post-analytics: empty analytics', {
        postId,
        ageBucket,
        providerIdentifier: post.integration?.providerIdentifier,
        missing: !Array.isArray(analytics),
      });
      return { collected: 0 };
    }

    const measuredAt = new Date();
    let collected = 0;

    for (const channel of channels) {
      const rows = (analytics as AnalyticsData[]).flatMap((metric) =>
        // Post-level provider metrics are cumulative totals; keep the latest
        // point as the value at this age bucket.
        metric.data.slice(-1).map((point) => ({
          workspaceId: channel.workspaceId,
          channelId: channel.id,
          postId,
          providerIdentifier: channel.providerIdentifier,
          canonicalMetric: normalizeMetric(metric.label),
          rawMetric: metric.label,
          value: Number(point.total) || 0,
          measuredAt,
          ageBucket,
        }))
      );

      await this._repo.replacePostSnapshots(
        channel.workspaceId,
        channel.id,
        postId,
        ageBucket,
        rows
      );
      collected += rows.length;
    }

    return { collected };
  }
}
