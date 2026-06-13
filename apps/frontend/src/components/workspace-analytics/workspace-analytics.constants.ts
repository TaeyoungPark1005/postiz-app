import type { GroupBy, Metric } from './workspace-analytics.types';

export const metrics: readonly {
  readonly key: Metric;
  readonly label: string;
}[] = [
  { key: 'VIEWS', label: 'Views' },
  { key: 'REACH', label: 'Reach' },
  { key: 'IMPRESSIONS', label: 'Impressions' },
  { key: 'ENGAGEMENTS', label: 'Engagements' },
  { key: 'ENGAGEMENT_RATE', label: 'Engagement rate' },
  { key: 'LIKES', label: 'Likes' },
  { key: 'COMMENTS', label: 'Comments' },
  { key: 'SHARES', label: 'Shares' },
  { key: 'SAVES', label: 'Saves' },
  { key: 'FOLLOWERS', label: 'Followers' },
] as const;

export const groupByOptions: readonly {
  readonly key: GroupBy;
  readonly label: string;
}[] = [
  { key: 'total', label: 'Total' },
  { key: 'channel', label: 'By channel' },
  { key: 'campaign', label: 'By campaign' },
  { key: 'post', label: 'By post' },
] as const;

export const dateOptions: readonly {
  readonly key: number;
  readonly label: string;
}[] = [
  { key: 7, label: '7 Days' },
  { key: 30, label: '30 Days' },
  { key: 90, label: '90 Days' },
] as const;

export const isMetric = (value: string): value is Metric =>
  metrics.some((metric) => metric.key === value);

export const isGroupBy = (value: string): value is GroupBy =>
  groupByOptions.some((option) => option.key === value);
