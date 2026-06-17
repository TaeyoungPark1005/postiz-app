'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useProductWorkspace } from '@gitroom/frontend/components/workspaces/workspace.context';
import { WorkspaceAnalyticsControls } from './workspace-analytics.controls';
import {
  WorkspaceSeriesGrid,
  WorkspaceSummaryCards,
} from './workspace-analytics.cards';
import { WorkspaceAnalyticsSidebar } from './workspace-analytics.sidebar';
import { WorkspacePostTable } from './workspace-analytics.post-table';
import { WorkspaceHeatmap } from './workspace-analytics.heatmap';
import {
  WorkspaceHookCards,
  WorkspaceHookAI,
} from './workspace-analytics.hooks';
import {
  parseAnalyticsSummary,
  parseIntegrationListResponse,
  type GroupBy,
  type Metric,
} from './workspace-analytics.types';

export const WorkspaceAnalytics = () => {
  const fetch = useFetch();
  const t = useT();
  const [metric, setMetric] = useState<Metric>('VIEWS');
  const [date, setDate] = useState(7);
  const [groupBy, setGroupBy] = useState<GroupBy>('total');
  const [channelId, setChannelId] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const {
    workspaces,
    selectedWorkspaceId,
    selectedWorkspace: workspace,
    isLoading,
    selectWorkspace,
    createWorkspace: createProductWorkspace,
    assignChannel: assignWorkspaceChannel,
  } = useProductWorkspace();

  const loadIntegrations = useCallback(async () => {
    return parseIntegrationListResponse(
      await (await fetch('/integrations/list')).json()
    );
  }, [fetch]);

  const { data: integrations = [] } = useSWR(
    'workspace-analytics-integrations',
    loadIntegrations,
    {
      revalidateOnFocus: false,
    }
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
      await assignWorkspaceChannel(workspace.id, integrationId);
      await mutateSummary();
    },
    [assignWorkspaceChannel, mutateSummary, workspace]
  );

  const createWorkspace = useCallback(async () => {
    const name = newWorkspaceName.trim();
    if (!name) {
      return;
    }

    await createProductWorkspace(name);
    setNewWorkspaceName('');
  }, [createProductWorkspace, newWorkspaceName]);

  if (isLoading) {
    return (
      <div className="bg-newBgColorInner flex flex-1 items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-newBgColorInner overflow-auto lg:flex-row lg:overflow-hidden">
      <WorkspaceAnalyticsSidebar
        workspaces={workspaces}
        workspaceId={selectedWorkspaceId}
        setWorkspaceId={(value) => {
          selectWorkspace(
            typeof value === 'function' ? value(selectedWorkspaceId) : value
          );
          setChannelId('');
        }}
        selectedWorkspace={workspace}
        newWorkspaceName={newWorkspaceName}
        setNewWorkspaceName={setNewWorkspaceName}
        onCreateWorkspace={createWorkspace}
        assignableIntegrations={assignableIntegrations}
        onAssignChannel={assignChannel}
      />
      <main className="min-w-0 flex-1 flex flex-col p-[16px] gap-[16px] overflow-visible lg:p-[20px] lg:overflow-auto">
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
            <WorkspacePostTable posts={summary.postPerformance} metric={metric} />
            <WorkspaceHeatmap cells={summary.timeOfDay} />
            <WorkspaceHookCards hooks={summary.hookTypePerformance} />
            {workspace ? (
              <WorkspaceHookAI
                workspaceId={workspace.id}
                metric={metric}
                date={date}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
};
