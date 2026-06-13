'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Select } from '@gitroom/react/form/select';
import { Button } from '@gitroom/react/form/button';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { ChartSocial } from '@gitroom/frontend/components/analytics/chart-social';

type Metric =
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

type GroupBy = 'total' | 'channel' | 'campaign' | 'post';

interface WorkspaceChannel {
  id: string;
  integrationId: string;
  providerIdentifier: string;
  displayName: string;
}

interface ProductWorkspace {
  id: string;
  name: string;
  channels: WorkspaceChannel[];
}

interface IntegrationListItem {
  id: string;
  name: string;
  identifier: string;
  disabled?: boolean;
}

interface AnalyticsSeries {
  id: string;
  label: string;
  data: Array<{ date: string; total: number }>;
}

interface AnalyticsSummary {
  cards: Array<{ label: string; value: number | string }>;
  series: AnalyticsSeries[];
  channelComparison: AnalyticsSeries[];
  topPosts: AnalyticsSeries[];
  topCampaigns: AnalyticsSeries[];
}

const metrics: Array<{ key: Metric; label: string }> = [
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
];

const groupByOptions: Array<{ key: GroupBy; label: string }> = [
  { key: 'total', label: 'Total' },
  { key: 'channel', label: 'By channel' },
  { key: 'campaign', label: 'By campaign' },
  { key: 'post', label: 'By post' },
];

const formatValue = (value: string | number) =>
  typeof value === 'number' ? new Intl.NumberFormat().format(Math.round(value)) : value;

const seriesTotal = (series: AnalyticsSeries) =>
  series.data.reduce((sum, point) => sum + point.total, 0);

export const WorkspaceAnalytics = () => {
  const fetch = useFetch();
  const [workspaceId, setWorkspaceId] = useState('');
  const [metric, setMetric] = useState<Metric>('VIEWS');
  const [date, setDate] = useState(7);
  const [groupBy, setGroupBy] = useState<GroupBy>('total');
  const [channelId, setChannelId] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const loadWorkspaces = useCallback(async () => {
    return (await (await fetch('/workspace-analytics/workspaces')).json()) as ProductWorkspace[];
  }, []);

  const loadIntegrations = useCallback(async () => {
    const response = (await (await fetch('/integrations/list')).json()) as {
      integrations: IntegrationListItem[];
    };
    return response.integrations;
  }, []);

  const { data: workspaces = [], isLoading, mutate } = useSWR(
    'workspace-analytics-workspaces',
    loadWorkspaces,
    {
      revalidateOnFocus: false,
    }
  );

  const { data: integrations = [] } = useSWR(
    'workspace-analytics-integrations',
    loadIntegrations,
    {
      revalidateOnFocus: false,
    }
  );

  useEffect(() => {
    if (!workspaceId && workspaces[0]) {
      setWorkspaceId(workspaces[0].id);
    }
  }, [workspaceId, workspaces]);

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === workspaceId),
    [workspaceId, workspaces]
  );

  const summaryKey = workspace
    ? `/workspace-analytics/workspaces/${workspace.id}/summary?metric=${metric}&date=${date}&groupBy=${groupBy}${channelId ? `&channelId=${channelId}` : ''}`
    : null;

  const loadSummary = useCallback(async () => {
    if (!summaryKey) {
      return null;
    }
    return (await (await fetch(summaryKey)).json()) as AnalyticsSummary;
  }, [summaryKey]);

  const {
    data: summary,
    isLoading: summaryLoading,
    mutate: mutateSummary,
  } = useSWR(
    summaryKey,
    loadSummary,
    {
      revalidateOnFocus: false,
    }
  );

  const assignableIntegrations = useMemo(() => {
    const assigned = new Set(
      workspace?.channels.map((channel) => channel.integrationId) || []
    );
    return integrations.filter((integration) => !assigned.has(integration.id));
  }, [integrations, workspace]);

  const assignChannel = useCallback(
    (integrationId: string) => async () => {
      if (!workspace) {
        return;
      }
      await fetch(`/workspace-analytics/workspaces/${workspace.id}/channels`, {
        method: 'POST',
        body: JSON.stringify({ integrationId }),
      });
      await mutate();
      await mutateSummary();
    },
    [workspace, mutate, mutateSummary]
  );

  const createWorkspace = useCallback(
    async () => {
      const name = newWorkspaceName.trim();
      if (!name) {
        return;
      }

      const created = (await (
        await fetch('/workspace-analytics/workspaces', {
          method: 'POST',
          body: JSON.stringify({ name }),
        })
      ).json()) as ProductWorkspace;
      setWorkspaceId(created.id);
      setNewWorkspaceName('');
      await mutate();
    },
    [newWorkspaceName, mutate]
  );

  if (isLoading) {
    return (
      <div className="bg-newBgColorInner flex flex-1 items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <div className="bg-newBgColorInner flex-1 p-[20px] flex flex-col gap-[18px] overflow-auto">
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-[12px]">
        <Select
          label="Workspace"
          name="workspace"
          disableForm={true}
          hideErrors={true}
          value={workspaceId}
          onChange={(event) => {
            setWorkspaceId(event.target.value);
            setChannelId('');
          }}
        >
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Select
          label="Metric"
          name="metric"
          disableForm={true}
          hideErrors={true}
          value={metric}
          onChange={(event) => setMetric(event.target.value as Metric)}
        >
          {metrics.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </Select>
        <Select
          label="Date range"
          name="date"
          disableForm={true}
          hideErrors={true}
          value={date}
          onChange={(event) => setDate(Number(event.target.value))}
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </Select>
        <Select
          label="Grouping"
          name="groupBy"
          disableForm={true}
          hideErrors={true}
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value as GroupBy)}
        >
          {groupByOptions.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </Select>
        <Select
          label="Channel"
          name="channel"
          disableForm={true}
          hideErrors={true}
          value={channelId}
          onChange={(event) => setChannelId(event.target.value)}
        >
          <option value="">All channels</option>
          {workspace?.channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.displayName}
            </option>
          ))}
        </Select>
      </div>

      <div className="border border-newTableBorder bg-newTableHeader rounded-[8px] p-[14px] flex flex-col md:flex-row gap-[10px] md:items-end">
        <label className="flex flex-1 flex-col gap-[6px] text-[14px]">
          New product workspace
          <input
            value={newWorkspaceName}
            onChange={(event) => setNewWorkspaceName(event.target.value)}
            className="h-[42px] bg-newBgColorInner px-[16px] outline-none border-newTableBorder border rounded-[8px] text-[14px]"
            placeholder="jocoHunt, PolaPop, jocoLetter"
          />
        </label>
        <Button onClick={createWorkspace}>Create workspace</Button>
      </div>

      {!!assignableIntegrations.length && (
        <div className="border border-newTableBorder bg-newTableHeader rounded-[8px] p-[14px] flex flex-col gap-[10px]">
          <div className="text-[15px] font-medium text-newTableText">
            Assign connected channels to this product workspace
          </div>
          <div className="flex flex-wrap gap-[8px]">
            {assignableIntegrations.map((integration) => (
              <Button key={integration.id} onClick={assignChannel(integration.id)}>
                Add {integration.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {summaryLoading && (
        <div className="flex items-center justify-center py-[60px]">
          <LoadingComponent />
        </div>
      )}

      {!summaryLoading && summary && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-[12px]">
            {summary.cards.map((card) => (
              <div
                key={card.label}
                className="border border-newTableBorder bg-newTableHeader rounded-[8px] p-[16px]"
              >
                <div className="text-[13px] text-newTableText/60">{card.label}</div>
                <div className="text-[28px] leading-[34px] font-semibold mt-[6px]">
                  {formatValue(card.value)}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-[12px]">
            {summary.series.map((series, index) => (
              <div
                key={series.id}
                className="border border-newTableBorder bg-newTableHeader rounded-[8px] p-[16px]"
              >
                <div className="flex items-center justify-between mb-[12px]">
                  <div className="text-[15px] font-medium text-newTableText">
                    {series.label}
                  </div>
                  <div className="text-[18px] font-semibold">
                    {formatValue(seriesTotal(series))}
                  </div>
                </div>
                <div className="h-[160px]">
                  <ChartSocial
                    data={series.data}
                    color={index % 3 === 0 ? 'purple' : index % 3 === 1 ? 'green' : 'blue'}
                  />
                </div>
              </div>
            ))}
          </div>

          {!summary.series.length && (
            <div className="border border-newTableBorder bg-newTableHeader rounded-[8px] p-[28px] text-center text-newTableText/70">
              No workspace snapshots yet. Assign a channel or choose a supported metric.
            </div>
          )}
        </>
      )}
    </div>
  );
};
