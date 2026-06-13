import { Injectable } from '@nestjs/common';
import { AnalyticsCanonicalMetric } from '@prisma/client';
import type { Organization, User } from '@prisma/client';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { internalAccessPolicy } from '@gitroom/nestjs-libraries/services/access-policy/internal-access-policy';
import type { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { WorkspaceAnalyticsRepository } from '@gitroom/nestjs-libraries/database/prisma/workspace-analytics/workspace-analytics.repository';
import type {
  WorkspaceAnalyticsCard,
  WorkspaceAnalyticsQuery,
  WorkspaceAnalyticsSeries,
} from '@gitroom/nestjs-libraries/database/prisma/workspace-analytics/workspace-analytics.types';

const metricAliases: Record<string, AnalyticsCanonicalMetric> = {
  view: AnalyticsCanonicalMetric.VIEWS,
  views: AnalyticsCanonicalMetric.VIEWS,
  view_count: AnalyticsCanonicalMetric.VIEWS,
  viewcount: AnalyticsCanonicalMetric.VIEWS,
  reach: AnalyticsCanonicalMetric.REACH,
  impression: AnalyticsCanonicalMetric.IMPRESSIONS,
  impressions: AnalyticsCanonicalMetric.IMPRESSIONS,
  like: AnalyticsCanonicalMetric.LIKES,
  likes: AnalyticsCanonicalMetric.LIKES,
  comments: AnalyticsCanonicalMetric.COMMENTS,
  comment: AnalyticsCanonicalMetric.COMMENTS,
  shares: AnalyticsCanonicalMetric.SHARES,
  share: AnalyticsCanonicalMetric.SHARES,
  share_count: AnalyticsCanonicalMetric.SHARES,
  saves: AnalyticsCanonicalMetric.SAVES,
  save: AnalyticsCanonicalMetric.SAVES,
  reposts: AnalyticsCanonicalMetric.REPOSTS,
  repost: AnalyticsCanonicalMetric.REPOSTS,
  quotes: AnalyticsCanonicalMetric.QUOTES,
  quote: AnalyticsCanonicalMetric.QUOTES,
  followers: AnalyticsCanonicalMetric.FOLLOWERS,
  follower: AnalyticsCanonicalMetric.FOLLOWERS,
  following: AnalyticsCanonicalMetric.FOLLOWING,
  video_count: AnalyticsCanonicalMetric.VIDEO_COUNT,
  videocount: AnalyticsCanonicalMetric.VIDEO_COUNT,
  engagements: AnalyticsCanonicalMetric.ENGAGEMENTS,
  engagement: AnalyticsCanonicalMetric.ENGAGEMENTS,
  engagement_rate: AnalyticsCanonicalMetric.ENGAGEMENT_RATE,
  engagementrate: AnalyticsCanonicalMetric.ENGAGEMENT_RATE,
};

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'workspace';

const normalizeMetric = (label: string) => {
  const normalized = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return metricAliases[normalized] || AnalyticsCanonicalMetric.RAW;
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class WorkspaceAnalyticsService {
  constructor(
    private _workspaceRepository: WorkspaceAnalyticsRepository,
    private _integrationService: IntegrationService
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

    return {
      workspace,
      metric: query.metric,
      groupBy: query.groupBy,
      cards: this.toCards(snapshots, channelComparison),
      series,
      channelComparison,
      topPosts: this.toSeries('post', snapshots).slice(0, 10),
      topCampaigns: this.toSeries('campaign', snapshots).slice(0, 10),
    };
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
            ? snapshot.channel.displayName
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
    const bestChannel = channelComparison[0];

    return [
      { label: 'Total metric', value: total },
      { label: 'Snapshot points', value: snapshots.length },
      { label: 'Channels', value: channelComparison.length },
      { label: 'Best channel', value: bestChannel?.label || 'No data' },
    ];
  }
}
