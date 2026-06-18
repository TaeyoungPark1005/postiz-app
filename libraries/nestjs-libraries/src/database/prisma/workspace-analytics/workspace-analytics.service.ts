import { Injectable } from '@nestjs/common';
import type { AnalyticsAgeBucket, Organization, User } from '@prisma/client';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { internalAccessPolicy } from '@gitroom/nestjs-libraries/services/access-policy/internal-access-policy';
import type { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { WorkspaceAnalyticsRepository } from '@gitroom/nestjs-libraries/database/prisma/workspace-analytics/workspace-analytics.repository';
import type {
  WorkspaceAnalyticsCard,
  WorkspaceAnalyticsQuery,
  WorkspaceAnalyticsSeries,
  WorkspaceHookTypePerformance,
  WorkspacePostPerformance,
  WorkspaceTimeOfDayCell,
} from '@gitroom/nestjs-libraries/database/prisma/workspace-analytics/workspace-analytics.types';
import {
  AGE_BUCKET_ORDER,
  dateKey,
  hourKey,
  normalizeMetric,
  toSlug,
  weekdayKey,
  workspaceChannelLabel,
} from '@gitroom/nestjs-libraries/database/prisma/workspace-analytics/workspace-analytics.helpers';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';

@Injectable()
export class WorkspaceAnalyticsService {
  constructor(
    private _workspaceRepository: WorkspaceAnalyticsRepository,
    private _integrationService: IntegrationService,
    private _openaiService: OpenaiService
  ) {}

  async listWorkspaces(org: Organization, user: User) {
    const workspaces = await this._workspaceRepository.listWorkspaces(
      org.id,
      user.id,
      user.isSuperAdmin
    );

    if (workspaces.length) {
      return workspaces;
    }

    return [
      await this.createWorkspace(org, user, {
        name: org.name || 'Default workspace',
      }),
    ];
  }

  createWorkspace(org: Organization, user: User, body: { name: string }) {
    internalAccessPolicy.assertWorkspaceCreationAllowed(user.email);
    const name = body.name.trim();
    if (!name) {
      throw new Error('Workspace name is required');
    }

    return this._workspaceRepository.createWorkspace(
      org.id,
      user.id,
      name,
      `${toSlug(name)}-${Date.now().toString(36)}`
    );
  }

  async assignChannel(
    org: Organization,
    user: User,
    workspaceId: string,
    body: { integrationId: string }
  ) {
    const owner = await this._workspaceRepository.getWorkspaceOwner(
      org.id,
      user.id,
      workspaceId,
      user.isSuperAdmin
    );
    if (!owner) {
      throw new Error('You do not have permission to manage this workspace');
    }
    if (!body.integrationId) {
      throw new Error('Integration id is required');
    }

    const integration = await this._workspaceRepository.getIntegration(
      org.id,
      body.integrationId
    );
    if (!integration) {
      throw new Error('Integration not found');
    }

    return this._workspaceRepository.assignChannel(
      workspaceId,
      integration.id,
      integration.providerIdentifier,
      integration.name
    );
  }

  async removeChannel(
    org: Organization,
    user: User,
    workspaceId: string,
    integrationId: string
  ) {
    const owner = await this._workspaceRepository.getWorkspaceOwner(
      org.id,
      user.id,
      workspaceId,
      user.isSuperAdmin
    );
    if (!owner) {
      throw new Error('You do not have permission to manage this workspace');
    }
    if (!integrationId) {
      throw new Error('Integration id is required');
    }

    const removed = await this._workspaceRepository.removeChannel(
      workspaceId,
      integrationId
    );
    if (!removed) {
      throw new Error('Workspace channel not found');
    }

    return { removed: true, integrationId };
  }

  async deleteWorkspace(org: Organization, user: User, workspaceId: string) {
    const owner = await this._workspaceRepository.getWorkspaceOwner(
      org.id,
      user.id,
      workspaceId,
      user.isSuperAdmin
    );
    if (!owner) {
      throw new Error('You do not have permission to manage this workspace');
    }

    const deleted = await this._workspaceRepository.deleteWorkspace(
      org.id,
      workspaceId
    );
    if (!deleted) {
      throw new Error('Workspace not found');
    }

    return { deleted: true, id: deleted.id };
  }

  async summary(
    org: Organization,
    user: User,
    workspaceId: string,
    query: WorkspaceAnalyticsQuery
  ) {
    const workspace = await this._workspaceRepository.getWorkspaceForUser(
      org.id,
      user.id,
      workspaceId,
      user.isSuperAdmin
    );
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const days = Math.min(Math.max(Number(query.date) || 7, 1), 90);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const channels = query.channelId
      ? workspace.channels.filter((channel) => channel.id === query.channelId)
      : workspace.channels;
    if (query.channelId && !channels.length) {
      throw new Error('Workspace channel not found');
    }

    await Promise.all(
      channels.map(async (channel) => {
        const analytics = await this._integrationService.checkAnalytics(
          org,
          channel.integrationId,
          String(days)
        );
        await this._workspaceRepository.replaceSnapshots(
          workspace.id,
          channel.id,
          from,
          this.toSnapshots(
            workspace.id,
            channel.id,
            channel.providerIdentifier,
            analytics
          )
        );
      })
    );

    const snapshots = await this._workspaceRepository.listSnapshots(
      workspace.id,
      query.metric,
      from,
      query.channelId
    );
    const series = this.toSeries(query.groupBy, snapshots);
    const channelComparison = this.toSeries('channel', snapshots);

    const postSnapshots = await this._workspaceRepository.listPostSnapshots(
      workspace.id,
      from
    );

    return {
      workspace,
      metric: query.metric,
      groupBy: query.groupBy,
      cards: this.toCards(snapshots, channelComparison),
      series,
      channelComparison,
      topPosts: this.toSeries('post', snapshots).slice(0, 10),
      topCampaigns: this.toSeries('campaign', snapshots).slice(0, 10),
      postPerformance: this.toPostPerformance(postSnapshots, query.metric),
      timeOfDay: this.toTimeOfDay(postSnapshots, query.metric),
      hookTypePerformance: this.toHookTypePerformance(
        postSnapshots,
        query.metric
      ),
    };
  }

  private postIntro(post?: { title: string | null; content: string } | null) {
    if (!post) {
      return 'Unknown post';
    }
    const text = stripHtmlValidation('none', post.title || post.content || '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 80) || 'Unknown post';
  }

  // Reduce each post's snapshots (for one metric) to the LATEST collected age
  // bucket, so views populate from H1 (1h after publish) instead of waiting for
  // H24. Also keeps the earliest bucket to express a growth trajectory.
  private latestByPost(
    postSnapshots: Awaited<
      ReturnType<WorkspaceAnalyticsRepository['listPostSnapshots']>
    >,
    metric: WorkspaceAnalyticsQuery['metric']
  ) {
    type Entry = {
      post: (typeof postSnapshots)[number]['post'];
      channel: (typeof postSnapshots)[number]['channel'];
      values: Map<AnalyticsAgeBucket, number>;
    };
    const byPost = new Map<string, Entry>();
    for (const snapshot of postSnapshots) {
      if (
        snapshot.canonicalMetric !== metric ||
        !snapshot.postId ||
        !snapshot.ageBucket
      ) {
        continue;
      }
      const entry =
        byPost.get(snapshot.postId) ||
        ({
          post: snapshot.post,
          channel: snapshot.channel,
          values: new Map<AnalyticsAgeBucket, number>(),
        } as Entry);
      entry.post = snapshot.post;
      entry.channel = snapshot.channel;
      entry.values.set(snapshot.ageBucket, snapshot.value);
      byPost.set(snapshot.postId, entry);
    }

    const result = new Map<
      string,
      {
        post: Entry['post'];
        channel: Entry['channel'];
        value: number;
        ageBucket: AnalyticsAgeBucket;
        firstValue: number;
        firstBucket: AnalyticsAgeBucket;
      }
    >();
    for (const [postId, entry] of byPost) {
      const present = AGE_BUCKET_ORDER.filter((bucket) =>
        entry.values.has(bucket)
      );
      if (!present.length) {
        continue;
      }
      const latest = present[present.length - 1];
      const first = present[0];
      result.set(postId, {
        post: entry.post,
        channel: entry.channel,
        value: entry.values.get(latest) ?? 0,
        ageBucket: latest,
        firstValue: entry.values.get(first) ?? 0,
        firstBucket: first,
      });
    }
    return result;
  }

  // Per-post value at its latest collected bucket + first→latest growth.
  private toPostPerformance(
    postSnapshots: Awaited<
      ReturnType<WorkspaceAnalyticsRepository['listPostSnapshots']>
    >,
    metric: WorkspaceAnalyticsQuery['metric']
  ): WorkspacePostPerformance[] {
    const latest = this.latestByPost(postSnapshots, metric);
    return Array.from(latest.entries())
      .map(([postId, entry]) => {
        const growth =
          entry.firstBucket !== entry.ageBucket && entry.firstValue > 0
            ? ((entry.value - entry.firstValue) / entry.firstValue) * 100
            : null;
        return {
          postId,
          intro: this.postIntro(entry.post),
          channelLabel: entry.channel
            ? workspaceChannelLabel(
                entry.channel.providerIdentifier,
                entry.channel.displayName
              )
            : 'Unknown channel',
          publishedAt: entry.post?.publishDate
            ? new Date(entry.post.publishDate).toISOString()
            : '',
          hookType: entry.post?.hookType ?? null,
          value: entry.value,
          ageBucket: entry.ageBucket,
          growth,
        };
      })
      .sort((left, right) => right.value - left.value)
      .slice(0, 50);
  }

  // Average latest-bucket value per UTC weekday×hour of publish time.
  private toTimeOfDay(
    postSnapshots: Awaited<
      ReturnType<WorkspaceAnalyticsRepository['listPostSnapshots']>
    >,
    metric: WorkspaceAnalyticsQuery['metric']
  ): WorkspaceTimeOfDayCell[] {
    const latest = this.latestByPost(postSnapshots, metric);
    const cells = new Map<
      string,
      { weekday: number; hour: number; sum: number; count: number }
    >();
    for (const entry of latest.values()) {
      if (!entry.post?.publishDate) {
        continue;
      }
      const published = new Date(entry.post.publishDate);
      const weekday = weekdayKey(published);
      const hour = hourKey(published);
      const key = `${weekday}-${hour}`;
      const cell = cells.get(key) || { weekday, hour, sum: 0, count: 0 };
      cell.sum += entry.value;
      cell.count += 1;
      cells.set(key, cell);
    }

    return Array.from(cells.values()).map((cell) => ({
      weekday: cell.weekday,
      hour: cell.hour,
      value: cell.count ? cell.sum / cell.count : 0,
      count: cell.count,
    }));
  }

  // Average latest-bucket value grouped by hook type.
  private toHookTypePerformance(
    postSnapshots: Awaited<
      ReturnType<WorkspaceAnalyticsRepository['listPostSnapshots']>
    >,
    metric: WorkspaceAnalyticsQuery['metric']
  ): WorkspaceHookTypePerformance[] {
    const latest = this.latestByPost(postSnapshots, metric);
    const agg = new Map<string, { sum: number; count: number }>();
    for (const entry of latest.values()) {
      const hookType = entry.post?.hookType ?? 'OTHER';
      const current = agg.get(hookType) || { sum: 0, count: 0 };
      current.sum += entry.value;
      current.count += 1;
      agg.set(hookType, current);
    }

    return Array.from(agg.entries())
      .map(([hookType, current]) => ({
        hookType,
        avgValue: current.count ? current.sum / current.count : 0,
        count: current.count,
      }))
      .sort((left, right) => right.avgValue - left.avgValue);
  }

  private toSnapshots(
    workspaceId: string,
    channelId: string,
    providerIdentifier: string,
    analytics: AnalyticsData[]
  ) {
    return analytics.flatMap((metric) =>
      metric.data.map((point) => ({
        workspaceId,
        channelId,
        providerIdentifier,
        canonicalMetric: normalizeMetric(metric.label),
        rawMetric: metric.label,
        value: Number(point.total) || 0,
        measuredAt: new Date(point.date),
      }))
    );
  }

  private toSeries(
    groupBy: WorkspaceAnalyticsQuery['groupBy'],
    snapshots: Awaited<ReturnType<WorkspaceAnalyticsRepository['listSnapshots']>>
  ): WorkspaceAnalyticsSeries[] {
    const grouped = new Map<
      string,
      { label: string; points: Map<string, number> }
    >();

    for (const snapshot of snapshots) {
      const key =
        groupBy === 'total'
          ? 'total'
          : groupBy === 'channel'
            ? snapshot.channelId
            : groupBy === 'campaign'
              ? snapshot.campaignId || 'uncampaign'
              : snapshot.postId || 'unknown-post';
      const label =
        groupBy === 'total'
          ? 'Total'
          : groupBy === 'channel'
            ? workspaceChannelLabel(
                snapshot.channel.providerIdentifier,
                snapshot.channel.displayName
              )
            : groupBy === 'campaign'
              ? snapshot.campaign?.name || 'No campaign'
              : snapshot.post?.title ||
                snapshot.post?.content.slice(0, 64) ||
                'Unknown post';
      const current = grouped.get(key) || {
        label,
        points: new Map<string, number>(),
      };
      const day = dateKey(snapshot.measuredAt);
      current.points.set(day, (current.points.get(day) || 0) + snapshot.value);
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .map(([id, item]) => ({
        id,
        label: item.label,
        data: Array.from(item.points.entries()).map(([date, total]) => ({
          date,
          total,
        })),
      }))
      .sort(
        (left, right) =>
          right.data.reduce((sum, point) => sum + point.total, 0) -
          left.data.reduce((sum, point) => sum + point.total, 0)
      );
  }

  private toCards(
    snapshots: Awaited<
      ReturnType<WorkspaceAnalyticsRepository['listSnapshots']>
    >,
    channelComparison: WorkspaceAnalyticsSeries[]
  ): WorkspaceAnalyticsCard[] {
    const total = snapshots.reduce((sum, snapshot) => sum + snapshot.value, 0);

    return [
      { label: 'Total metric', value: total },
      { label: 'Snapshot points', value: snapshots.length },
      { label: 'Channels', value: channelComparison.length },
    ];
  }

  // On-demand AI insight summary over the workspace's post-level performance.
  async hookInsights(
    org: Organization,
    user: User,
    workspaceId: string,
    query: { metric: WorkspaceAnalyticsQuery['metric']; date: number }
  ) {
    const workspace = await this._workspaceRepository.getWorkspaceForUser(
      org.id,
      user.id,
      workspaceId,
      user.isSuperAdmin
    );
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const days = Math.min(Math.max(Number(query.date) || 30, 1), 90);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const postSnapshots = await this._workspaceRepository.listPostSnapshots(
      workspace.id,
      from
    );
    const performance = this.toPostPerformance(postSnapshots, query.metric);
    if (!performance.length) {
      return { summary: '' };
    }

    const toItem = (item: WorkspacePostPerformance) => ({
      intro: item.intro,
      hookType: item.hookType,
      value: item.value,
    });

    const summary = await this._openaiService.summarizeHookInsights({
      metricLabel: String(query.metric),
      topPosts: performance.slice(0, 5).map(toItem),
      bottomPosts: performance.slice(-5).map(toItem),
      hookStats: this.toHookTypePerformance(postSnapshots, query.metric),
    });

    return { summary };
  }

  // On-demand hook suggestions for a topic, grounded in what worked here.
  async hookSuggestions(
    org: Organization,
    user: User,
    workspaceId: string,
    params: {
      topic: string;
      metric: WorkspaceAnalyticsQuery['metric'];
      date: number;
    }
  ) {
    const workspace = await this._workspaceRepository.getWorkspaceForUser(
      org.id,
      user.id,
      workspaceId,
      user.isSuperAdmin
    );
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const topic = (params.topic || '').trim();
    if (!topic) {
      throw new Error('Topic is required');
    }

    const days = Math.min(Math.max(Number(params.date) || 30, 1), 90);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const postSnapshots = await this._workspaceRepository.listPostSnapshots(
      workspace.id,
      from
    );
    const examples = this.toPostPerformance(postSnapshots, params.metric)
      .slice(0, 5)
      .map((item) => ({
        intro: item.intro,
        hookType: item.hookType,
        value: item.value,
      }));

    const suggestions = await this._openaiService.suggestHooks(topic, examples);
    return { suggestions };
  }
}
