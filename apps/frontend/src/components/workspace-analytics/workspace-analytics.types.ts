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

export type AnalyticsSummary = {
  readonly cards: readonly AnalyticsCardSummary[];
  readonly series: readonly AnalyticsSeries[];
  readonly channelComparison: readonly AnalyticsSeries[];
  readonly topPosts: readonly AnalyticsSeries[];
  readonly topCampaigns: readonly AnalyticsSeries[];
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
});
