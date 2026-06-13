import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AnalyticsCanonicalMetric, Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { WorkspaceAnalyticsService } from '@gitroom/nestjs-libraries/database/prisma/workspace-analytics/workspace-analytics.service';
import type { WorkspaceGroupBy } from '@gitroom/nestjs-libraries/database/prisma/workspace-analytics/workspace-analytics.types';

const groupByValues = new Set<WorkspaceGroupBy>([
  'total',
  'channel',
  'campaign',
  'post',
]);

const parseMetric = (value?: string) => {
  const key = (value || 'VIEWS').trim().toUpperCase();
  return (
    AnalyticsCanonicalMetric[key as keyof typeof AnalyticsCanonicalMetric] ||
    AnalyticsCanonicalMetric.VIEWS
  );
};

const parseGroupBy = (value?: string): WorkspaceGroupBy => {
  const groupBy = (value || 'total') as WorkspaceGroupBy;
  return groupByValues.has(groupBy) ? groupBy : 'total';
};

@ApiTags('Workspace Analytics')
@Controller('/workspace-analytics')
export class WorkspaceAnalyticsController {
  constructor(private _workspaceAnalyticsService: WorkspaceAnalyticsService) {}

  @Get('/workspaces')
  listWorkspaces(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    return this._workspaceAnalyticsService.listWorkspaces(org, user);
  }

  @Post('/workspaces')
  createWorkspace(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: { name: string }
  ) {
    return this._workspaceAnalyticsService.createWorkspace(org, user, body);
  }

  @Post('/workspaces/:workspaceId/channels')
  assignChannel(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('workspaceId') workspaceId: string,
    @Body() body: { integrationId: string }
  ) {
    return this._workspaceAnalyticsService.assignChannel(
      org,
      user,
      workspaceId,
      body
    );
  }

  @Get('/workspaces/:workspaceId/summary')
  summary(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('workspaceId') workspaceId: string,
    @Query('metric') metric: string,
    @Query('date') date: string,
    @Query('groupBy') groupBy: string,
    @Query('channelId') channelId?: string
  ) {
    return this._workspaceAnalyticsService.summary(org, user, workspaceId, {
      metric: parseMetric(metric),
      date: Number(date) || 7,
      groupBy: parseGroupBy(groupBy),
      channelId,
    });
  }
}
