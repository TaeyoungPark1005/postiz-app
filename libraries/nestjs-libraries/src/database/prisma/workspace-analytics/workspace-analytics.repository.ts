import { Injectable } from '@nestjs/common';
import { AnalyticsCanonicalMetric, WorkspaceRole } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

interface SnapshotInput {
  workspaceId: string;
  channelId: string;
  providerIdentifier: string;
  canonicalMetric: AnalyticsCanonicalMetric;
  rawMetric: string;
  value: number;
  measuredAt: Date;
}

@Injectable()
export class WorkspaceAnalyticsRepository {
  constructor(
    private _workspace: PrismaRepository<'productWorkspace'>,
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

  async replaceSnapshots(
    workspaceId: string,
    channelId: string,
    from: Date,
    snapshots: SnapshotInput[]
  ) {
    await this._snapshot.model.analyticsMetricSnapshot.deleteMany({
      where: {
        workspaceId,
        channelId,
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
}
