'use client';

import clsx from 'clsx';
import {
  workspaceChannelLabel,
  workspacePlatformName,
} from './workspace-channel-label';

export const WorkspaceChannelLabelView = ({
  identifier,
  name,
  className,
}: {
  readonly identifier: string;
  readonly name: string;
  readonly className?: string;
}) => (
  <span
    dir="ltr"
    title={workspaceChannelLabel({
      providerIdentifier: identifier,
      displayName: name,
    })}
    className={clsx('flex min-w-0 items-center text-left', className)}
  >
    <span className="shrink-0">{workspacePlatformName(identifier)}</span>
    <span className="shrink-0 px-[4px]">·</span>
    <span className="min-w-0 truncate">{name}</span>
  </span>
);
