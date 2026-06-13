'use client';

import { ChartSocial } from '@gitroom/frontend/components/analytics/chart-social';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type {
  AnalyticsCardSummary,
  AnalyticsSeries,
} from './workspace-analytics.types';
import {
  colorForIndex,
  formatValue,
  seriesTotal,
} from './workspace-analytics.utils';

export const WorkspaceSummaryCards = ({
  cards,
}: {
  readonly cards: readonly AnalyticsCardSummary[];
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-[16px]">
    {cards.map((card, index) => {
      const color = colorForIndex(index);

      return (
        <div
          key={card.label}
          className="min-w-0 flex flex-col bg-newTableHeader border border-newTableBorder rounded-[12px] px-[16px] py-[14px] transition-all duration-200 hover:border-[#612bd3]/50"
        >
          <div className="min-w-0 flex items-center gap-[10px] text-[13px] font-medium text-newTableText/70">
            <span
              className={`w-[8px] h-[8px] rounded-full ${
                color === 'purple' ? 'bg-[#612bd3]' : ''
              } ${color === 'green' ? 'bg-[#32d583]' : ''} ${
                color === 'blue' ? 'bg-[#1d9bf0]' : ''
              }`}
            />
            <span className="min-w-0 truncate">{card.label}</span>
          </div>
          <div className="text-[32px] leading-[38px] font-semibold mt-[10px] tracking-tight">
            {formatValue(card.value)}
          </div>
        </div>
      );
    })}
  </div>
);

export const WorkspaceSeriesGrid = ({
  series,
}: {
  readonly series: readonly AnalyticsSeries[];
}) => {
  const t = useT();

  if (!series.length) {
    return (
      <div className="border border-dashed border-newTableBorder rounded-[12px] p-[32px] text-center text-[14px] text-newTableText/60">
        {t(
          'no_workspace_snapshots_yet',
          'No workspace snapshots yet. Assign a channel or choose a supported metric.'
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-[16px]">
      {series.map((item, index) => {
        const color = colorForIndex(index);

        return (
          <div
            key={item.id}
            className="min-w-0 flex flex-col bg-newTableHeader border border-newTableBorder rounded-[12px] overflow-hidden transition-all duration-200 hover:border-[#612bd3]/50"
          >
            <div className="flex items-center justify-between px-[16px] pt-[14px] pb-[8px]">
              <div className="flex items-center gap-[10px] min-w-0">
                <span
                  className={`w-[8px] h-[8px] rounded-full shrink-0 ${
                    color === 'purple' ? 'bg-[#612bd3]' : ''
                  } ${color === 'green' ? 'bg-[#32d583]' : ''} ${
                    color === 'blue' ? 'bg-[#1d9bf0]' : ''
                  }`}
                />
                <span className="text-[15px] font-medium text-newTableText truncate">
                  {item.label}
                </span>
              </div>
              <div className="text-[18px] font-semibold ps-[12px]">
                {formatValue(seriesTotal(item))}
              </div>
            </div>
            <div className="px-[12px] py-[8px]">
              <div className="h-[120px] relative">
                <ChartSocial data={[...item.data]} color={color} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
