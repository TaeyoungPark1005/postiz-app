import { Injectable } from '@nestjs/common';
import {
  AnalyticsAgeBucket,
  AnalyticsCanonicalMetric,
  PostHookType,
  WorkspaceRole,
} from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

interface SnapshotInput {
  workspaceId: string;
  channelId: string;
  postId?: string | null;
  providerIdentifier: string;
  canonicalMetric: AnalyticsCanonicalMetric;
  rawMetric: string;
  value: number;
  measuredAt: Date;
  ageBucket?: AnalyticsAgeBucket;
}

@Injectable()
export class WorkspaceAnalyticsRepository {
  constructor(
    private _workspace: PrismaRepository<
      | 'analyticsMetricSnapshot'
      | 'campaign'
      | 'media'
      | 'post'
      | 'postWorkspaceAttribution'
      | 'productWorkspace'
      | 'workspaceChannel'
      | 'workspaceMember'
    >,
    private _workspaceChannel: PrismaRepository<'workspaceChannel'>,
    private _snapshot: PrismaRepository<'analyticsMetricSnapshot'>,
    private _integration: PrismaRepository<'integration'>
  ) {}

  listWorkspaces(orgId: string, userId: string, isGlobalAdmin: boolean) {
    return this._workspace.model.productWorkspace.findMany({
      where: {
        organizationId: orgId,
        ...(isGlobalAdmin ? {} : { members: { some: { userId } } }),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        members: true,
        channels: true,
      },
    });
  }

  createWorkspace(orgId: string, userId: string, name: string, slug: string) {
    return this._workspace.model.productWorkspace.create({
      data: {
        organizationId: orgId,
        createdByUserId: userId,
        name,
        slug,
        members: {
          create: {
            userId,
            role: WorkspaceRole.OWNER,
          },
        },
      },
      include: {
        members: true,
        channels: true,
      },
    });
  }

  getWorkspaceForUser(
    orgId: string,
    userId: string,
    workspaceId: string,
    isGlobalAdmin: boolean
  ) {
    return this._workspace.model.productWorkspace.findFirst({
      where: {
        id: workspaceId,
        organizationId: orgId,
        ...(isGlobalAdmin ? {} : { members: { some: { userId } } }),
      },
      include: {
        members: true,
        channels: {
          include: {
            integration: true,
          },
        },
      },
    });
  }

  getWorkspaceOwner(
    orgId: string,
    userId: string,
    workspaceId: string,
    isGlobalAdmin: boolean
  ) {
    return this._workspace.model.productWorkspace.findFirst({
      where: {
        id: workspaceId,
        organizationId: orgId,
        ...(isGlobalAdmin
          ? {}
          : { members: { some: { userId, role: WorkspaceRole.OWNER } } }),
      },
    });
  }

  getIntegration(orgId: string, integrationId: string) {
    return this._integration.model.integration.findFirst({
      where: {
        id: integrationId,
        organizationId: orgId,
        deletedAt: null,
      },
    });
  }

  assignChannel(
    workspaceId: string,
    integrationId: string,
    providerIdentifier: string,
    displayName: string
  ) {
    return this._workspaceChannel.model.workspaceChannel.upsert({
      where: {
        workspaceId_integrationId: {
          workspaceId,
          integrationId,
        },
      },
      create: {
        workspaceId,
        integrationId,
        providerIdentifier,
        displayName,
      },
      update: {
        providerIdentifier,
        displayName,
      },
      include: {
        integration: true,
      },
    });
  }

  async removeChannel(workspaceId: string, integrationId: string) {
    const channel = await this._workspace.model.workspaceChannel.findUnique({
      where: {
        workspaceId_integrationId: {
          workspaceId,
          integrationId,
        },
      },
      select: { id: true },
    });
    if (!channel) {
      return null;
    }

    // Drop only the workspace<->channel mapping (and its cached analytics
    // snapshots, which RESTRICT the delete). The connected Integration / OAuth
    // tokens are never touched, so the account stays connected and remains in
    // any other workspace it belongs to.
    await this._workspace.model.analyticsMetricSnapshot.deleteMany({
      where: { channelId: channel.id },
    });
    await this._workspace.model.workspaceChannel.delete({
      where: { id: channel.id },
    });

    return { id: channel.id };
  }

  async deleteWorkspace(orgId: string, workspaceId: string) {
    const workspace = await this._workspace.model.productWorkspace.findFirst({
      where: {
        id: workspaceId,
        organizationId: orgId,
      },
      select: {
        id: true,
      },
    });
    if (!workspace) {
      return null;
    }

    await this._workspace.model.analyticsMetricSnapshot.deleteMany({
      where: { workspaceId },
    });
    await this._workspace.model.postWorkspaceAttribution.deleteMany({
      where: { workspaceId },
    });
    await this._workspace.model.media.updateMany({
      where: { productWorkspaceId: workspaceId },
      data: { productWorkspaceId: null },
    });
    await this._workspace.model.campaign.deleteMany({
      where: { workspaceId },
    });
    await this._workspace.model.workspaceChannel.deleteMany({
      where: { workspaceId },
    });
    await this._workspace.model.workspaceMember.deleteMany({
      where: { workspaceId },
    });

    return this._workspace.model.productWorkspace.delete({
      where: { id: workspaceId },
    });
  }

  async replaceSnapshots(
    workspaceId: string,
    channelId: string,
    from: Date,
    snapshots: SnapshotInput[]
  ) {
    // Only clear channel-aggregate rows (postId null). Post-level rows written
    // by the analytics collector must survive a channel refresh.
    await this._snapshot.model.analyticsMetricSnapshot.deleteMany({
      where: {
        workspaceId,
        channelId,
        postId: null,
        measuredAt: {
          gte: from,
        },
      },
    });

    if (!snapshots.length) {
      return { count: 0 };
    }

    return this._snapshot.model.analyticsMetricSnapshot.createMany({
      data: snapshots,
    });
  }

  listSnapshots(
    workspaceId: string,
    metric: AnalyticsCanonicalMetric,
    from: Date,
    channelId?: string
  ) {
    return this._snapshot.model.analyticsMetricSnapshot.findMany({
      where: {
        workspaceId,
        canonicalMetric: metric,
        // Channel/total/cards series must use only channel-aggregate rows so
        // post-level rows don't double-count into the account totals.
        postId: null,
        measuredAt: {
          gte: from,
        },
        ...(channelId ? { channelId } : {}),
      },
      orderBy: {
        measuredAt: 'asc',
      },
      include: {
        channel: true,
        campaign: true,
        post: true,
      },
    });
  }

  // --- Post-level analytics (collector + post views) ---

  listChannelsForIntegration(integrationId: string) {
    return this._workspaceChannel.model.workspaceChannel.findMany({
      where: { integrationId },
      select: { id: true, workspaceId: true, providerIdentifier: true },
    });
  }

  getPostForCollection(postId: string) {
    return this._workspace.model.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        organizationId: true,
        integrationId: true,
        releaseId: true,
        content: true,
        title: true,
        publishDate: true,
        hookType: true,
        integration: { select: { providerIdentifier: true } },
      },
    });
  }

  setHookClassification(
    postId: string,
    hookType: PostHookType,
    confidence: number
  ) {
    return this._workspace.model.post.update({
      where: { id: postId },
      data: {
        hookType,
        hookTypeConfidence: confidence,
        hookClassifiedAt: new Date(),
      },
    });
  }

  async replacePostSnapshots(
    workspaceId: string,
    channelId: string,
    postId: string,
    ageBucket: AnalyticsAgeBucket,
    snapshots: SnapshotInput[]
  ) {
    await this._snapshot.model.analyticsMetricSnapshot.deleteMany({
      where: { workspaceId, channelId, postId, ageBucket },
    });

    if (!snapshots.length) {
      return { count: 0 };
    }

    return this._snapshot.model.analyticsMetricSnapshot.createMany({
      data: snapshots,
    });
  }

  listPostSnapshots(workspaceId: string, from: Date) {
    return this._snapshot.model.analyticsMetricSnapshot.findMany({
      where: {
        workspaceId,
        postId: { not: null },
        measuredAt: { gte: from },
      },
      orderBy: { measuredAt: 'asc' },
      include: {
        channel: true,
        post: true,
      },
    });
  }
}
