'use client';

import { useMemo } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { TimeOfDayCell } from './workspace-analytics.types';
import { formatValue } from './workspace-analytics.utils';

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hours = Array.from({ length: 24 }, (_, hour) => hour);

export const WorkspaceHeatmap = ({
  cells,
}: {
  readonly cells: readonly TimeOfDayCell[];
}) => {
  const t = useT();

  const { lookup, max } = useMemo(() => {
    const map = new Map<string, TimeOfDayCell>();
    let maxValue = 0;
    for (const cell of cells) {
      map.set(`${cell.weekday}-${cell.hour}`, cell);
      if (cell.value > maxValue) {
        maxValue = cell.value;
      }
    }
    return { lookup: map, max: maxValue };
  }, [cells]);

  if (!cells.length) {
    return (
      <div className="border border-dashed border-newTableBorder rounded-[12px] p-[32px] text-center text-[14px] text-newTableText/60">
        {t(
          'no_time_of_day_yet',
          'No publish time-of-day data yet (needs 24h-old posts).'
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 flex flex-col bg-newTableHeader border border-newTableBorder rounded-[12px] p-[16px]">
      <div className="text-[15px] font-medium text-newTableText mb-[4px]">
        {t('publish_time_heatmap', 'Best time to post (UTC)')}
      </div>
      <div className="text-[12px] text-newTableText/50 mb-[12px]">
        {t(
          'publish_time_heatmap_hint',
          'Average performance at 24h by weekday × hour.'
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-[3px] min-w-max">
          <div className="flex gap-[3px] ps-[36px]">
            {hours.map((hour) => (
              <div
                key={hour}
                className="w-[16px] text-center text-[9px] text-newTableText/40"
              >
                {hour % 6 === 0 ? hour : ''}
              </div>
            ))}
          </div>
          {weekdayLabels.map((label, weekday) => (
            <div key={label} className="flex items-center gap-[3px]">
              <div className="w-[33px] text-[11px] text-newTableText/60">
                {label}
              </div>
              {hours.map((hour) => {
                const cell = lookup.get(`${weekday}-${hour}`);
                const alpha =
                  cell && max > 0 ? 0.12 + (cell.value / max) * 0.88 : 0;
                return (
                  <div
                    key={hour}
                    title={
                      cell
                        ? `${label} ${hour}:00 · ${formatValue(
                            cell.value
                          )} (${cell.count})`
                        : `${label} ${hour}:00`
                    }
                    className="w-[16px] h-[16px] rounded-[3px] border border-newTableBorder/40"
                    style={
                      cell
                        ? { backgroundColor: `rgba(97, 43, 211, ${alpha})` }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
