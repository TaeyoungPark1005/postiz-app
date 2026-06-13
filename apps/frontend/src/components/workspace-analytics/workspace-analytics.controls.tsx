'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Select } from '@gitroom/react/form/select';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  dateOptions,
  groupByOptions,
  isGroupBy,
  isMetric,
  metrics,
} from './workspace-analytics.constants';
import type {
  GroupBy,
  Metric,
  ProductWorkspace,
} from './workspace-analytics.types';

export const WorkspaceAnalyticsControls = ({
  metric,
  setMetric,
  date,
  setDate,
  groupBy,
  setGroupBy,
  channelId,
  setChannelId,
  workspace,
}: {
  readonly metric: Metric;
  readonly setMetric: Dispatch<SetStateAction<Metric>>;
  readonly date: number;
  readonly setDate: Dispatch<SetStateAction<number>>;
  readonly groupBy: GroupBy;
  readonly setGroupBy: Dispatch<SetStateAction<GroupBy>>;
  readonly channelId: string;
  readonly setChannelId: Dispatch<SetStateAction<string>>;
  readonly workspace?: ProductWorkspace;
}) => {
  const t = useT();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-[12px]">
      <Select
        label={t('metric', 'Metric')}
        name="metric"
        disableForm={true}
        hideErrors={true}
        value={metric}
        onChange={(event) => {
          if (isMetric(event.target.value)) {
            setMetric(event.target.value);
          }
        }}
      >
        {metrics.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </Select>
      <Select
        label={t('date_range', 'Date range')}
        name="date"
        disableForm={true}
        hideErrors={true}
        value={date}
        onChange={(event) => setDate(Number(event.target.value))}
      >
        {dateOptions.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </Select>
      <Select
        label={t('grouping', 'Grouping')}
        name="groupBy"
        disableForm={true}
        hideErrors={true}
        value={groupBy}
        onChange={(event) => {
          if (isGroupBy(event.target.value)) {
            setGroupBy(event.target.value);
          }
        }}
      >
        {groupByOptions.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </Select>
      <Select
        label={t('channel', 'Channel')}
        name="channel"
        disableForm={true}
        hideErrors={true}
        value={channelId}
        onChange={(event) => setChannelId(event.target.value)}
      >
        <option value="">{t('all_channels', 'All channels')}</option>
        {workspace?.channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {channel.displayName}
          </option>
        ))}
      </Select>
    </div>
  );
};
