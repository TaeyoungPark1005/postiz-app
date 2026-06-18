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

export interface WorkspacePostPerformance {
  postId: string;
  intro: string;
  channelLabel: string;
  publishedAt: string;
  hookType: string | null;
  value: number; // value at the latest collected age bucket for the metric
  ageBucket: string; // which bucket value is from (H1|H6|H24|D3|D7)
  growth: number | null; // first->latest collected bucket growth %
}

export interface WorkspaceTimeOfDayCell {
  weekday: number; // 0=Sun .. 6=Sat (UTC)
  hour: number; // 0..23 (UTC)
  value: number; // average of selected metric at the 24h age bucket
  count: number;
}

export interface WorkspaceHookTypePerformance {
  hookType: string;
  avgValue: number; // average of selected metric at the 24h age bucket
  count: number;
}
