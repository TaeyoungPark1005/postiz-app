'use client';

import { type MouseEvent, useCallback, useState } from 'react';
import clsx from 'clsx';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { TrashIcon } from '@gitroom/frontend/components/ui/icons';
import type { ProductWorkspace } from '@gitroom/frontend/components/workspace-analytics/workspace-analytics.types';
import { useProductWorkspace } from './workspace.context';

export const WorkspaceSelectRow = ({
  workspace,
  selected,
  onSelect,
}: {
  readonly workspace: ProductWorkspace;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) => {
  const t = useT();
  const { deleteWorkspace } = useProductWorkspace();
  const [deleting, setDeleting] = useState(false);

  const onDelete = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (deleting) {
        return;
      }

      const approved = await deleteDialog(
        t(
          'delete_workspace_description',
          'Deleting this workspace removes its channel grouping and analytics snapshots. Connected social channels and scheduled posts stay in Postiz.'
        ),
        t('delete_workspace', 'Delete workspace')
      );
      if (!approved) {
        return;
      }

      setDeleting(true);
      try {
        await deleteWorkspace(workspace.id);
      } finally {
        setDeleting(false);
      }
    },
    [deleteWorkspace, deleting, t, workspace.id]
  );

  return (
    <div
      className={clsx(
        'flex min-h-[42px] items-center rounded-[8px] transition-colors',
        selected
          ? 'bg-boxHover text-newTableText'
          : 'text-newTableText/60 hover:bg-boxHover hover:text-newTableText'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-[10px] px-[10px] py-[10px] text-start"
      >
        <span className="h-[8px] w-[8px] shrink-0 rounded-full bg-[#612bd3]" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-[600]">
          {workspace.name}
        </span>
        <span className="shrink-0 text-[12px] text-newTableText/45">
          {workspace.channels.length}
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label={t('delete_workspace', 'Delete workspace')}
        className="me-[6px] flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[6px] text-newTableText/45 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
      >
        <TrashIcon size={15} />
      </button>
    </div>
  );
};
