'use client';

import { useMemo } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type {
  Metric,
  PostPerformanceItem,
} from './workspace-analytics.types';
import { formatValue } from './workspace-analytics.utils';
import { metrics } from './workspace-analytics.constants';

export const hookTypeLabels: Record<string, string> = {
  QUESTION: 'Question',
  NUMBER: 'Number',
  EMPATHY: 'Empathy',
  SHOCK: 'Shock',
  STORY: 'Story',
  HOWTO: 'How-to',
  OTHER: 'Other',
};

// Age bucket -> short human label.
const bucketLabels: Record<string, string> = {
  H1: '1h',
  H6: '6h',
  H24: '24h',
  D3: '3d',
  D7: '7d',
};

const formatPublished = (value: string) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const WorkspacePostTable = ({
  posts,
  metric,
}: {
  readonly posts: readonly PostPerformanceItem[];
  readonly metric: Metric;
}) => {
  const t = useT();

  const metricLabel = useMemo(
    () => metrics.find((item) => item.key === metric)?.label || metric,
    [metric]
  );

  const max = useMemo(
    () => Math.max(1, ...posts.map((post) => post.value || 0)),
    [posts]
  );

  if (!posts.length) {
    return (
      <div className="border border-dashed border-newTableBorder rounded-[12px] p-[32px] text-center text-[14px] text-newTableText/60">
        {t(
          'no_post_performance_yet',
          'No post-level performance yet. Metrics appear ~1 hour after publishing.'
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 flex flex-col bg-newTableHeader border border-newTableBorder rounded-[12px] overflow-hidden">
      <div className="px-[16px] pt-[14px] pb-[8px] text-[15px] font-medium text-newTableText">
        {t('post_performance', 'Post performance')}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-newTableText/60 text-left">
              <th className="font-medium px-[16px] py-[10px]">
                {t('hook', 'Hook')}
              </th>
              <th className="font-medium px-[12px] py-[10px] whitespace-nowrap">
                {t('channel', 'Channel')}
              </th>
              <th className="font-medium px-[12px] py-[10px] whitespace-nowrap">
                {t('published', 'Published')}
              </th>
              <th className="font-medium px-[12px] py-[10px] min-w-[200px]">
                {metricLabel}
              </th>
              <th className="font-medium px-[16px] py-[10px] text-right whitespace-nowrap">
                {t('growth', 'Growth')}
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const ratio = max > 0 ? post.value / max : 0;
              return (
                <tr
                  key={post.postId}
                  className="border-t border-newTableBorder/60 hover:bg-boxHover transition-colors"
                >
                  <td className="px-[16px] py-[10px] max-w-[360px]">
                    <div className="flex items-center gap-[8px] min-w-0">
                      {post.hookType ? (
                        <span className="shrink-0 text-[11px] px-[8px] py-[2px] rounded-full bg-[#612bd3]/15 text-[#a98bf0]">
                          {hookTypeLabels[post.hookType] || post.hookType}
                        </span>
                      ) : null}
                      <span className="min-w-0 truncate text-newTableText">
                        {post.intro}
                      </span>
                    </div>
                  </td>
                  <td className="px-[12px] py-[10px] whitespace-nowrap text-newTableText/80">
                    {post.channelLabel}
                  </td>
                  <td className="px-[12px] py-[10px] whitespace-nowrap text-newTableText/60">
                    {formatPublished(post.publishedAt)}
                  </td>
                  <td className="px-[12px] py-[10px]">
                    <div className="flex items-center gap-[10px]">
                      <div className="flex-1 min-w-[60px] max-w-[150px] h-[8px] rounded-full bg-newBgColorInner overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#612bd3]"
                          style={{ width: `${Math.round(ratio * 100)}%` }}
                        />
                      </div>
                      <span className="w-[72px] text-right tabular-nums font-semibold shrink-0">
                        {formatValue(post.value)}
                      </span>
                      <span
                        className="shrink-0 text-[10px] px-[6px] py-[1px] rounded-full bg-newBgColorInner text-newTableText/50"
                        title={t('measured_at_age', 'Measured at this age')}
                      >
                        {bucketLabels[post.ageBucket] || post.ageBucket}
                      </span>
                    </div>
                  </td>
                  <td className="px-[16px] py-[10px] text-right tabular-nums whitespace-nowrap">
                    {post.growth === null ? (
                      <span className="text-newTableText/40">—</span>
                    ) : (
                      <span
                        className={
                          post.growth >= 0 ? 'text-[#32d583]' : 'text-red-400'
                        }
                      >
                        {post.growth >= 0 ? '+' : ''}
                        {Math.round(post.growth)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
