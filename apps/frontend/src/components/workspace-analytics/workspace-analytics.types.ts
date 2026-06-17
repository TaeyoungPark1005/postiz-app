export type Metric =
  | 'VIEWS'
  | 'REACH'
  | 'IMPRESSIONS'
  | 'LIKES'
  | 'COMMENTS'
  | 'SHARES'
  | 'SAVES'
  | 'REPOSTS'
  | 'QUOTES'
  | 'FOLLOWERS'
  | 'FOLLOWING'
  | 'VIDEO_COUNT'
  | 'ENGAGEMENTS'
  | 'ENGAGEMENT_RATE';

export type GroupBy = 'total' | 'channel' | 'campaign' | 'post';

export type ChartColor = 'purple' | 'green' | 'blue';

export type WorkspaceChannel = {
  readonly id: string;
  readonly integrationId: string;
  readonly providerIdentifier: string;
  readonly displayName: string;
};

export type ProductWorkspace = {
  readonly id: string;
  readonly name: string;
  readonly channels: readonly WorkspaceChannel[];
};

export type IntegrationListItem = {
  readonly id: string;
  readonly name: string;
  readonly identifier: string;
  readonly disabled?: boolean;
};

export type AnalyticsSeries = {
  readonly id: string;
  readonly label: string;
  readonly data: readonly { readonly date: string; readonly total: number }[];
};

export type AnalyticsCardSummary = {
  readonly label: string;
  readonly value: number | string;
};

export type PostPerformanceItem = {
  readonly postId: string;
  readonly intro: string;
  readonly channelLabel: string;
  readonly publishedAt: string;
  readonly hookType: string | null;
  readonly value24h: number;
  readonly value7d: number;
};

export type TimeOfDayCell = {
  readonly weekday: number;
  readonly hour: number;
  readonly value: number;
  readonly count: number;
};

export type HookTypePerformanceItem = {
  readonly hookType: string;
  readonly avgValue: number;
  readonly count: number;
};

export type AnalyticsSummary = {
  readonly cards: readonly AnalyticsCardSummary[];
  readonly series: readonly AnalyticsSeries[];
  readonly channelComparison: readonly AnalyticsSeries[];
  readonly topPosts: readonly AnalyticsSeries[];
  readonly topCampaigns: readonly AnalyticsSeries[];
  readonly postPerformance: readonly PostPerformanceItem[];
  readonly timeOfDay: readonly TimeOfDayCell[];
  readonly hookTypePerformance: readonly HookTypePerformanceItem[];
};

class WorkspaceAnalyticsResponseError extends Error {
  constructor(readonly field: string) {
    super(`Invalid workspace analytics response field: ${field}`);
  }
}

const readOptionalField = (value: unknown, field: string): unknown => {
  if (typeof value !== 'object' || value === null) {
    throw new WorkspaceAnalyticsResponseError(field);
  }

  if (!Object.prototype.hasOwnProperty.call(value, field)) {
    return undefined;
  }

  return Object.getOwnPropertyDescriptor(value, field)?.value;
};

const readField = (value: unknown, field: string): unknown => {
  const fieldValue = readOptionalField(value, field);
  if (fieldValue === undefined) {
    throw new WorkspaceAnalyticsResponseError(field);
  }
  return fieldValue;
};

const parseString = (value: unknown, field: string): string => {
  if (typeof value !== 'string') {
    throw new WorkspaceAnalyticsResponseError(field);
  }
  return value;
};

const parseNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number') {
    throw new WorkspaceAnalyticsResponseError(field);
  }
  return value;
};

const parseStringOrNumber = (
  value: unknown,
  field: string
): string | number => {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  throw new WorkspaceAnalyticsResponseError(field);
};

const parseBooleanOrUndefined = (
  value: unknown,
  field: string
): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  throw new WorkspaceAnalyticsResponseError(field);
};

const parseArray = <T>(
  value: unknown,
  field: string,
  parseItem: (item: unknown) => T
): readonly T[] => {
  if (!Array.isArray(value)) {
    throw new WorkspaceAnalyticsResponseError(field);
  }
  return value.map(parseItem);
};

const parseWorkspaceChannel = (value: unknown): WorkspaceChannel => ({
  id: parseString(readField(value, 'id'), 'id'),
  integrationId: parseString(
    readField(value, 'integrationId'),
    'integrationId'
  ),
  providerIdentifier: parseString(
    readField(value, 'providerIdentifier'),
    'providerIdentifier'
  ),
  displayName: parseString(readField(value, 'displayName'), 'displayName'),
});

export const parseProductWorkspace = (value: unknown): ProductWorkspace => ({
  id: parseString(readField(value, 'id'), 'id'),
  name: parseString(readField(value, 'name'), 'name'),
  channels: parseArray(
    readField(value, 'channels'),
    'channels',
    parseWorkspaceChannel
  ),
});

export const parseProductWorkspaces = (
  value: unknown
): readonly ProductWorkspace[] =>
  parseArray(value, 'workspaces', parseProductWorkspace);

const parseIntegrationListItem = (value: unknown): IntegrationListItem => ({
  id: parseString(readField(value, 'id'), 'id'),
  name: parseString(readField(value, 'name'), 'name'),
  identifier: parseString(readField(value, 'identifier'), 'identifier'),
  disabled: parseBooleanOrUndefined(
    readOptionalField(value, 'disabled'),
    'disabled'
  ),
});

export const parseIntegrationListResponse = (
  value: unknown
): readonly IntegrationListItem[] =>
  parseArray(
    readField(value, 'integrations'),
    'integrations',
    parseIntegrationListItem
  );

const parseAnalyticsPoint = (value: unknown) => ({
  date: parseString(readField(value, 'date'), 'date'),
  total: parseNumber(readField(value, 'total'), 'total'),
});

const parseAnalyticsSeries = (value: unknown): AnalyticsSeries => ({
  id: parseString(readField(value, 'id'), 'id'),
  label: parseString(readField(value, 'label'), 'label'),
  data: parseArray(readField(value, 'data'), 'data', parseAnalyticsPoint),
});

const parseAnalyticsCardSummary = (value: unknown): AnalyticsCardSummary => ({
  label: parseString(readField(value, 'label'), 'label'),
  value: parseStringOrNumber(readField(value, 'value'), 'value'),
});

const parseStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

// Tolerant array parser: post-level fields default to [] if a server hasn't
// been upgraded yet, so the existing views keep working during a rollout.
const parseOptionalArray = <T>(
  value: unknown,
  parseItem: (item: unknown) => T
): readonly T[] => (Array.isArray(value) ? value.map(parseItem) : []);

const parsePostPerformanceItem = (value: unknown): PostPerformanceItem => ({
  postId: parseString(readField(value, 'postId'), 'postId'),
  intro: parseString(readField(value, 'intro'), 'intro'),
  channelLabel: parseString(readField(value, 'channelLabel'), 'channelLabel'),
  publishedAt: parseString(readField(value, 'publishedAt'), 'publishedAt'),
  hookType: parseStringOrNull(readOptionalField(value, 'hookType')),
  value24h: parseNumber(readField(value, 'value24h'), 'value24h'),
  value7d: parseNumber(readField(value, 'value7d'), 'value7d'),
});

const parseTimeOfDayCell = (value: unknown): TimeOfDayCell => ({
  weekday: parseNumber(readField(value, 'weekday'), 'weekday'),
  hour: parseNumber(readField(value, 'hour'), 'hour'),
  value: parseNumber(readField(value, 'value'), 'value'),
  count: parseNumber(readField(value, 'count'), 'count'),
});

const parseHookTypePerformanceItem = (
  value: unknown
): HookTypePerformanceItem => ({
  hookType: parseString(readField(value, 'hookType'), 'hookType'),
  avgValue: parseNumber(readField(value, 'avgValue'), 'avgValue'),
  count: parseNumber(readField(value, 'count'), 'count'),
});

export const parseAnalyticsSummary = (value: unknown): AnalyticsSummary => ({
  cards: parseArray(
    readField(value, 'cards'),
    'cards',
    parseAnalyticsCardSummary
  ),
  series: parseArray(
    readField(value, 'series'),
    'series',
    parseAnalyticsSeries
  ),
  channelComparison: parseArray(
    readField(value, 'channelComparison'),
    'channelComparison',
    parseAnalyticsSeries
  ),
  topPosts: parseArray(
    readField(value, 'topPosts'),
    'topPosts',
    parseAnalyticsSeries
  ),
  topCampaigns: parseArray(
    readField(value, 'topCampaigns'),
    'topCampaigns',
    parseAnalyticsSeries
  ),
  postPerformance: parseOptionalArray(
    readOptionalField(value, 'postPerformance'),
    parsePostPerformanceItem
  ),
  timeOfDay: parseOptionalArray(
    readOptionalField(value, 'timeOfDay'),
    parseTimeOfDayCell
  ),
  hookTypePerformance: parseOptionalArray(
    readOptionalField(value, 'hookTypePerformance'),
    parseHookTypePerformanceItem
  ),
});
