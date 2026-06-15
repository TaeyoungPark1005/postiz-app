'use client';

import { type FormEvent, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  parseIntegrationListResponse,
  type IntegrationListItem,
} from '@gitroom/frontend/components/workspace-analytics/workspace-analytics.types';
import { useProductWorkspace } from './workspace.context';
import { WorkspaceChannelLabelView } from './workspace-channel-label-view';
import { WorkspaceSelectRow } from './workspace-select-row';

export const WorkspaceSelector = () => {
  const fetch = useFetch();
  const t = useT();
  const {
    workspaces,
    selectedWorkspace,
    selectedWorkspaceId,
    selectWorkspace,
    createWorkspace,
    assignChannel,
    removeChannel,
    mutateWorkspaces,
  } = useProductWorkspace();
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [assigningIntegrationId, setAssigningIntegrationId] = useState('');
  const [removingIntegrationId, setRemovingIntegrationId] = useState('');

  // integrationId -> names of every workspace it is currently assigned to.
  // Lets the "Add channels" list flag a channel that already lives in another
  // workspace, so the same account does not get duplicated by accident.
  const channelWorkspaceNames = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const workspace of workspaces) {
      for (const channel of workspace.channels) {
        const names = map.get(channel.integrationId) || [];
        names.push(workspace.name);
        map.set(channel.integrationId, names);
      }
    }
    return map;
  }, [workspaces]);

  const loadIntegrations = useCallback(async () => {
    return parseIntegrationListResponse(
      await (await fetch('/integrations/list')).json()
    );
  }, [fetch]);

  const { data: integrations = [] } = useSWR(
    'workspace-selector-integrations',
    loadIntegrations,
    {
      revalidateOnFocus: false,
    }
  );

  const assignedIntegrationIds = useMemo(
    () =>
      new Set(
        selectedWorkspace?.channels.map((channel) => channel.integrationId) || []
      ),
    [selectedWorkspace]
  );

  const assignableIntegrations = useMemo(
    () =>
      integrations.filter(
        (integration) => !assignedIntegrationIds.has(integration.id)
      ),
    [assignedIntegrationIds, integrations]
  );

  const handleCreateWorkspace = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const created = await createWorkspace(newWorkspaceName);
      if (created) {
        setNewWorkspaceName('');
      }
    },
    [createWorkspace, newWorkspaceName]
  );

  const handleAssignChannel = useCallback(
    (integration: IntegrationListItem) => async () => {
      if (!selectedWorkspace) {
        return;
      }
      const otherWorkspaces = (
        channelWorkspaceNames.get(integration.id) || []
      ).filter((name) => name !== selectedWorkspace.name);
      if (
        otherWorkspaces.length &&
        !window.confirm(
          t(
            'confirm_cross_workspace_channel',
            'This channel is already in {0}. Add it to {1} as well?'
          )
            .replace('{0}', otherWorkspaces.join(', '))
            .replace('{1}', selectedWorkspace.name)
        )
      ) {
        return;
      }
      setAssigningIntegrationId(integration.id);
      try {
        await assignChannel(selectedWorkspace.id, integration.id);
        await mutateWorkspaces();
      } finally {
        setAssigningIntegrationId('');
      }
    },
    [assignChannel, channelWorkspaceNames, mutateWorkspaces, selectedWorkspace, t]
  );

  const handleRemoveChannel = useCallback(
    (integrationId: string) => async () => {
      if (!selectedWorkspace) {
        return;
      }
      if (
        !window.confirm(
          t(
            'confirm_remove_workspace_channel',
            'Remove this channel from {0}? The connected account is kept and stays in any other workspace.'
          ).replace('{0}', selectedWorkspace.name)
        )
      ) {
        return;
      }
      setRemovingIntegrationId(integrationId);
      try {
        await removeChannel(selectedWorkspace.id, integrationId);
        await mutateWorkspaces();
      } finally {
        setRemovingIntegrationId('');
      }
    },
    [mutateWorkspaces, removeChannel, selectedWorkspace, t]
  );

  if (!selectedWorkspace && !workspaces.length) {
    return null;
  }

  return (
    <div className="hover:text-newTextColor">
      <div className="group relative text-[12px]">
        <button
          type="button"
          className="flex h-[36px] w-[36px] items-center justify-center gap-[8px] rounded-[8px] bg-btnSimple px-[8px] text-newTableText transition-colors hover:bg-boxHover xl:w-auto xl:max-w-[220px] xl:justify-start xl:px-[10px]"
        >
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border border-newTableBorder bg-newBgColorInner text-[11px] font-[700]">
            W
          </span>
          <span className="hidden min-w-0 max-w-[142px] truncate text-start text-[13px] font-[600] xl:block">
            {selectedWorkspace?.name || t('workspace', 'Workspace')}
          </span>
          <svg
            width="10"
            height="6"
            viewBox="0 0 10 6"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="hidden shrink-0 xl:block"
          >
            <path
              d="M1 1L5 5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="absolute end-0 top-[100%] z-[80] hidden w-[min(320px,calc(100vw-32px))] pt-[10px] group-hover:block group-focus-within:block">
          <div className="flex max-h-[calc(100vh-120px)] flex-col gap-[14px] overflow-auto rounded-[12px] border border-newTableBorder bg-third p-[14px] text-newTableText shadow-xl">
            <div className="flex flex-col gap-[8px]">
              <div className="text-[13px] font-[700]">
                {t('product_workspaces', 'Product workspaces')}
              </div>
              <div className="flex flex-col gap-[4px]">
                {workspaces.map((workspace) => (
                  <WorkspaceSelectRow
                    key={workspace.id}
                    workspace={workspace}
                    selected={selectedWorkspaceId === workspace.id}
                    onSelect={() => selectWorkspace(workspace.id)}
                  />
                ))}
              </div>
            </div>

            <form
              onSubmit={handleCreateWorkspace}
              className="flex flex-col gap-[8px] border-t border-newTableBorder pt-[12px]"
            >
              <label
                htmlFor="new-product-workspace"
                className="text-[12px] font-[700] text-newTableText/70"
              >
                {t('new_product_workspace', 'New product workspace')}
              </label>
              <div className="flex gap-[8px]">
                <input
                  id="new-product-workspace"
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  className="h-[38px] min-w-0 flex-1 rounded-[8px] border border-newTableBorder bg-newBgColorInner px-[10px] text-[13px] outline-none"
                  placeholder="jocoHunt, PolaPop"
                />
                <button
                  type="submit"
                  className="h-[38px] rounded-[8px] bg-btnPrimary px-[12px] text-[13px] font-[600] text-white"
                >
                  {t('create', 'Create')}
                </button>
              </div>
            </form>

            {selectedWorkspace && (
              <div className="flex flex-col gap-[10px] border-t border-newTableBorder pt-[12px]">
                <div className="flex items-center justify-between gap-[12px]">
                  <div className="text-[12px] font-[700] text-newTableText/70">
                    {t('workspace_channels', 'Workspace channels')}
                  </div>
                  <Link
                    href="/analytics"
                    className="text-[12px] font-[600] text-btnText hover:text-newTextColor"
                  >
                    {t('open_analytics', 'Open analytics')}
                  </Link>
                </div>

                {!!selectedWorkspace.channels.length && (
                  <div className="grid grid-cols-2 gap-[6px]">
                    {selectedWorkspace.channels.map((channel) => (
                      <div
                        key={channel.id}
                        className="flex min-w-0 items-center gap-[7px] rounded-[8px] bg-newBgColorInner px-[8px] py-[7px] text-[12px]"
                      >
                        <SafeImage
                          src={`/icons/platforms/${channel.providerIdentifier}.png`}
                          className="rounded-[6px]"
                          alt={channel.providerIdentifier}
                          width={20}
                          height={20}
                        />
                        <WorkspaceChannelLabelView
                          identifier={channel.providerIdentifier}
                          name={channel.displayName}
                          className="min-w-0 flex-1 truncate text-[12px]"
                        />
                        <button
                          type="button"
                          onClick={handleRemoveChannel(channel.integrationId)}
                          disabled={
                            removingIntegrationId === channel.integrationId
                          }
                          title={t(
                            'remove_from_workspace',
                            'Remove from this workspace'
                          )}
                          aria-label={t(
                            'remove_from_workspace',
                            'Remove from this workspace'
                          )}
                          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[14px] leading-none text-newTableText/40 transition-colors hover:bg-boxHover hover:text-red-500 disabled:opacity-50"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {!selectedWorkspace.channels.length && (
                  <div className="rounded-[8px] bg-newBgColorInner px-[10px] py-[9px] text-[12px] text-newTableText/60">
                    {t(
                      'no_workspace_channels',
                      'No channels are assigned to this workspace yet.'
                    )}
                  </div>
                )}

                {!!assignableIntegrations.length && (
                  <div className="flex flex-col gap-[6px]">
                    <div className="text-[12px] font-[700] text-newTableText/70">
                      {t('add_channels', 'Add channels')}
                    </div>
                    <div className="grid grid-cols-2 gap-[6px]">
                      {assignableIntegrations.slice(0, 8).map((integration) => {
                        const inWorkspaces =
                          channelWorkspaceNames.get(integration.id) || [];
                        return (
                          <button
                            key={integration.id}
                            type="button"
                            onClick={handleAssignChannel(integration)}
                            disabled={assigningIntegrationId === integration.id}
                            className="flex min-w-0 items-center gap-[7px] rounded-[8px] bg-btnSimple px-[8px] py-[7px] text-start text-[12px] transition-colors hover:bg-boxHover disabled:opacity-60"
                          >
                            <SafeImage
                              src={`/icons/platforms/${integration.identifier}.png`}
                              className="rounded-[6px]"
                              alt={integration.identifier}
                              width={20}
                              height={20}
                            />
                            <span className="flex min-w-0 flex-col">
                              <WorkspaceChannelLabelView
                                identifier={integration.identifier}
                                name={integration.name}
                                className="truncate text-[12px]"
                              />
                              {!!inWorkspaces.length && (
                                <span className="truncate text-[10px] text-newTableText/50">
                                  {t('already_in_workspace', 'in')}{' '}
                                  {inWorkspaces.join(', ')}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
