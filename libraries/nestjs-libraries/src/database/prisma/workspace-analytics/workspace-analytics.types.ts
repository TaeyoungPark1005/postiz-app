import type { AnalyticsCanonicalMetric } from '@prisma/client';

export type WorkspaceGroupBy = 'total' | 'channel' | 'campaign' | 'post';

export interface WorkspaceAnalyticsQuery {
  metric: AnalyticsCanonicalMetric;
  date: number;
  groupBy: WorkspaceGroupBy;
  channelId?: string;
}

export interface AnalyticsPoint {
  date: string;
  total: number;
}

export interface WorkspaceAnalyticsSeries {
  id: string;
  label: string;
  data: AnalyticsPoint[];
}

export interface WorkspaceAnalyticsCard {
  label: string;
  value: number | string;
}
