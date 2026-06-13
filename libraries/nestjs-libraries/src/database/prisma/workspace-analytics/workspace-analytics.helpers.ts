import { AnalyticsCanonicalMetric } from '@prisma/client';

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

const platformNames: Record<string, string> = {
  'instagram-standalone': 'Instagram',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  threads: 'Threads',
  x: 'X',
  youtube: 'YouTube',
};

export const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'workspace';

export const normalizeMetric = (label: string) => {
  const normalized = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return metricAliases[normalized] || AnalyticsCanonicalMetric.RAW;
};

export const dateKey = (date: Date) => date.toISOString().slice(0, 10);

export const workspaceChannelLabel = (
  providerIdentifier: string,
  displayName: string
) => {
  const key = providerIdentifier.trim().toLowerCase();
  const platform =
    platformNames[key] ||
    key.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return platform ? `${platform} · ${displayName}` : displayName;
};
