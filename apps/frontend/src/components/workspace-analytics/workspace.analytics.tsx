'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { WorkspaceAnalyticsControls } from './workspace-analytics.controls';
import {
  WorkspaceSeriesGrid,
  WorkspaceSummaryCards,
} from './workspace-analytics.cards';
import { WorkspaceAnalyticsSidebar } from './workspace-analytics.sidebar';
import {
  parseAnalyticsSummary,
  parseIntegrationListResponse,
  parseProductWorkspace,
  parseProductWorkspaces,
  type GroupBy,
  type Metric,
} from './workspace-analytics.types';

export const WorkspaceAnalytics = () => {
  const fetch = useFetch();
  const t = useT();
  const [workspaceId, setWorkspaceId] = useState('');
  const [metric, setMetric] = useState<Metric>('VIEWS');
  const [date, setDate] = useState(7);
  const [groupBy, setGroupBy] = useState<GroupBy>('total');
  const [channelId, setChannelId] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const loadWorkspaces = useCallback(async () => {
    return parseProductWorkspaces(
      await (await fetch('/workspace-analytics/workspaces')).json()
    );
  }, [fetch]);

  const loadIntegrations = useCallback(async () => {
    return parseIntegrationListResponse(
      await (await fetch('/integrations/list')).json()
    );
  }, [fetch]);

  const {
    data: workspaces = [],
    isLoading,
    mutate,
  } = useSWR('workspace-analytics-workspaces', loadWorkspaces, {
    revalidateOnFocus: false,
  });

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
    ? `/workspace-analytics/workspaces/${
        workspace.id
      }/summary?metric=${metric}&date=${date}&groupBy=${groupBy}${
        channelId ? `&channelId=${channelId}` : ''
      }`
    : null;

  const loadSummary = useCallback(async () => {
    if (!summaryKey) {
      return null;
    }
    return parseAnalyticsSummary(await (await fetch(summaryKey)).json());
  }, [fetch, summaryKey]);

  const {
    data: summary,
    isLoading: summaryLoading,
    mutate: mutateSummary,
  } = useSWR(summaryKey, loadSummary, {
    revalidateOnFocus: false,
  });

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
    [fetch, mutate, mutateSummary, workspace]
  );

  const createWorkspace = useCallback(async () => {
    const name = newWorkspaceName.trim();
    if (!name) {
      return;
    }

    const created = parseProductWorkspace(
      await (
        await fetch('/workspace-analytics/workspaces', {
          method: 'POST',
          body: JSON.stringify({ name }),
        })
      ).json()
    );
    setWorkspaceId(created.id);
    setNewWorkspaceName('');
    await mutate();
  }, [fetch, mutate, newWorkspaceName]);

  if (isLoading) {
    return (
      <div className="bg-newBgColorInner flex flex-1 items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <div className="flex flex-1 bg-newBgColorInner overflow-hidden">
      <WorkspaceAnalyticsSidebar
        workspaces={workspaces}
        workspaceId={workspaceId}
        setWorkspaceId={(value) => {
          setWorkspaceId(value);
          setChannelId('');
        }}
        selectedWorkspace={workspace}
        newWorkspaceName={newWorkspaceName}
        setNewWorkspaceName={setNewWorkspaceName}
        onCreateWorkspace={createWorkspace}
        assignableIntegrations={assignableIntegrations}
        onAssignChannel={assignChannel}
      />
      <main className="flex-1 flex flex-col p-[20px] gap-[16px] overflow-auto">
        <div className="flex flex-col gap-[4px]">
          <h1 className="text-[24px] leading-[30px] font-[600]">
            {workspace?.name || t('workspace_analytics', 'Workspace analytics')}
          </h1>
          <p className="text-[14px] text-newTableText/60">
            {t(
              'workspace_analytics_description',
              'Compare connected channels by metric, campaign, or post.'
            )}
          </p>
        </div>
        <WorkspaceAnalyticsControls
          metric={metric}
          setMetric={setMetric}
          date={date}
          setDate={setDate}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          channelId={channelId}
          setChannelId={setChannelId}
          workspace={workspace}
        />

        {summaryLoading && (
          <div className="flex items-center justify-center py-[60px]">
            <LoadingComponent />
          </div>
        )}

        {!summaryLoading && summary && (
          <>
            <WorkspaceSummaryCards cards={summary.cards} />
            <WorkspaceSeriesGrid series={summary.series} />
          </>
        )}
      </main>
    </div>
  );
};
