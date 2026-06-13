'use client';

import type { Dispatch, SetStateAction } from 'react';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type {
  IntegrationListItem,
  ProductWorkspace,
} from './workspace-analytics.types';
import { WorkspaceChannelLabelView } from '@gitroom/frontend/components/workspaces/workspace-channel-label-view';
import { WorkspaceSelectRow } from '@gitroom/frontend/components/workspaces/workspace-select-row';

export const WorkspaceAnalyticsSidebar = ({
  workspaces,
  workspaceId,
  setWorkspaceId,
  selectedWorkspace,
  newWorkspaceName,
  setNewWorkspaceName,
  onCreateWorkspace,
  assignableIntegrations,
  onAssignChannel,
}: {
  readonly workspaces: readonly ProductWorkspace[];
  readonly workspaceId: string;
  readonly setWorkspaceId: Dispatch<SetStateAction<string>>;
  readonly selectedWorkspace?: ProductWorkspace;
  readonly newWorkspaceName: string;
  readonly setNewWorkspaceName: Dispatch<SetStateAction<string>>;
  readonly onCreateWorkspace: () => Promise<void>;
  readonly assignableIntegrations: readonly IntegrationListItem[];
  readonly onAssignChannel: (integrationId: string) => () => Promise<void>;
}) => {
  const t = useT();

  return (
    <aside className="bg-newBgColorInner p-[16px] flex flex-col gap-[18px] transition-all w-full shrink-0 border-b border-newTableBorder overflow-visible lg:w-[280px] lg:border-b-0 lg:border-e lg:p-[20px] lg:overflow-auto">
      <div className="flex flex-col gap-[12px]">
        <h2 className="text-[20px] font-[500]">
          {t('product_workspaces', 'Product workspaces')}
        </h2>
        <div className="flex flex-col gap-[6px]">
          {workspaces.map((workspace) => (
            <WorkspaceSelectRow
              key={workspace.id}
              workspace={workspace}
              selected={workspaceId === workspace.id}
              onSelect={() => setWorkspaceId(workspace.id)}
            />
          ))}
        </div>
      </div>

      <div className="border border-newTableBorder rounded-[12px] p-[12px] flex flex-col gap-[10px]">
        <div className="text-[13px] font-[600] text-newTableText/70">
          {t('new_product_workspace', 'New product workspace')}
        </div>
        <input
          value={newWorkspaceName}
          onChange={(event) => setNewWorkspaceName(event.target.value)}
          className="h-[40px] bg-newBgColorInner px-[12px] outline-none border-newTableBorder border rounded-[8px] text-[14px]"
          placeholder="jocoHunt, PolaPop"
        />
        <Button onClick={onCreateWorkspace}>
          <span className="whitespace-nowrap">
            {t('create_workspace', 'Create workspace')}
          </span>
        </Button>
      </div>

      {!!selectedWorkspace?.channels.length && (
        <div className="flex flex-col gap-[10px]">
          <div className="text-[13px] font-[600] text-newTableText/70">
            {t('assigned_channels', 'Assigned channels')}
          </div>
          {selectedWorkspace.channels.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center gap-[10px] text-[14px] text-newTableText/80"
            >
              <SafeImage
                src={`/icons/platforms/${channel.providerIdentifier}.png`}
                className="rounded-[8px]"
                alt={channel.providerIdentifier}
                width={28}
                height={28}
              />
              <WorkspaceChannelLabelView
                identifier={channel.providerIdentifier}
                name={channel.displayName}
              />
            </div>
          ))}
        </div>
      )}

      {!!assignableIntegrations.length && (
        <div className="flex flex-col gap-[10px]">
          <div className="text-[13px] font-[600] text-newTableText/70">
            {t('add_channels', 'Add channels')}
          </div>
          {assignableIntegrations.map((integration) => (
            <button
              key={integration.id}
              type="button"
              onClick={onAssignChannel(integration.id)}
              className="flex items-center gap-[10px] h-[40px] px-[10px] rounded-e-[8px] bg-btnSimple hover:bg-boxHover transition-colors text-[14px]"
            >
              <SafeImage
                src={`/icons/platforms/${integration.identifier}.png`}
                className="rounded-[8px]"
                alt={integration.identifier}
                width={26}
                height={26}
              />
              <WorkspaceChannelLabelView
                identifier={integration.identifier}
                name={integration.name}
              />
            </button>
          ))}
        </div>
      )}
    </aside>
  );
};
