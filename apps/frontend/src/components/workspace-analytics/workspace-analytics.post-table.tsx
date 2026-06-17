'use client';

import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { PostPerformanceItem } from './workspace-analytics.types';
import { formatValue } from './workspace-analytics.utils';

export const hookTypeLabels: Record<string, string> = {
  QUESTION: 'Question',
  NUMBER: 'Number',
  EMPATHY: 'Empathy',
  SHOCK: 'Shock',
  STORY: 'Story',
  HOWTO: 'How-to',
  OTHER: 'Other',
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
}: {
  readonly posts: readonly PostPerformanceItem[];
}) => {
  const t = useT();

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
              <th className="font-medium px-[12px] py-[10px] text-right whitespace-nowrap">
                {t('value_24h', '24h')}
              </th>
              <th className="font-medium px-[16px] py-[10px] text-right whitespace-nowrap">
                {t('value_7d', '7d')}
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr
                key={post.postId}
                className="border-t border-newTableBorder/60 hover:bg-boxHover transition-colors"
              >
                <td className="px-[16px] py-[10px] max-w-[420px]">
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
                <td className="px-[12px] py-[10px] text-right tabular-nums">
                  {formatValue(post.value24h)}
                </td>
                <td className="px-[16px] py-[10px] text-right tabular-nums font-semibold">
                  {formatValue(post.value7d)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
