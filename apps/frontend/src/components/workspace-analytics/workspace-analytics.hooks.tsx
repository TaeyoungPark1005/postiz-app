'use client';

import { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type {
  HookTypePerformanceItem,
  Metric,
} from './workspace-analytics.types';
import { formatValue } from './workspace-analytics.utils';
import { hookTypeLabels } from './workspace-analytics.post-table';

export const WorkspaceHookCards = ({
  hooks,
}: {
  readonly hooks: readonly HookTypePerformanceItem[];
}) => {
  const t = useT();

  if (!hooks.length) {
    return (
      <div className="border border-dashed border-newTableBorder rounded-[12px] p-[32px] text-center text-[14px] text-newTableText/60">
        {t(
          'no_hook_performance_yet',
          'No hook-type data yet. Hooks are classified ~1 hour after publishing.'
        )}
      </div>
    );
  }

  const best = hooks.reduce(
    (max, hook) => (hook.avgValue > max ? hook.avgValue : max),
    0
  );

  return (
    <div className="min-w-0 flex flex-col gap-[12px]">
      <div className="text-[15px] font-medium text-newTableText">
        {t('hook_type_performance', 'Hook type performance')}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[12px]">
        {hooks.map((hook) => {
          const ratio = best > 0 ? hook.avgValue / best : 0;
          return (
            <div
              key={hook.hookType}
              className="min-w-0 flex flex-col gap-[8px] bg-newTableHeader border border-newTableBorder rounded-[12px] px-[16px] py-[14px] transition-all duration-200 hover:border-[#612bd3]/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-newTableText">
                  {hookTypeLabels[hook.hookType] || hook.hookType}
                </span>
                <span className="text-[12px] text-newTableText/50">
                  {hook.count} {t('posts', 'posts')}
                </span>
              </div>
              <div className="text-[24px] leading-[28px] font-semibold tabular-nums">
                {formatValue(hook.avgValue)}
              </div>
              <div className="h-[6px] rounded-full bg-newBgColorInner overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#612bd3]"
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const primaryButton =
  'h-[40px] px-[16px] rounded-[8px] text-[14px] font-medium bg-[#612bd3] text-white cursor-pointer disabled:opacity-50 disabled:pointer-events-none';

export const WorkspaceHookAI = ({
  workspaceId,
  metric,
  date,
}: {
  readonly workspaceId: string;
  readonly metric: Metric;
  readonly date: number;
}) => {
  const fetch = useFetch();
  const t = useT();
  const [insight, setInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightLoaded, setInsightLoaded] = useState(false);
  const [topic, setTopic] = useState('');
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const loadInsight = useCallback(async () => {
    setInsightLoading(true);
    try {
      const response = await (
        await fetch(`/workspace-analytics/workspaces/${workspaceId}/insights`, {
          method: 'POST',
          body: JSON.stringify({ metric, date }),
        })
      ).json();
      setInsight(typeof response?.summary === 'string' ? response.summary : '');
      setInsightLoaded(true);
    } finally {
      setInsightLoading(false);
    }
  }, [fetch, workspaceId, metric, date]);

  const loadSuggestions = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed) {
      return;
    }
    setSuggestLoading(true);
    try {
      const response = await (
        await fetch(
          `/workspace-analytics/workspaces/${workspaceId}/hook-suggestions`,
          {
            method: 'POST',
            body: JSON.stringify({ topic: trimmed, metric, date }),
          }
        )
      ).json();
      setSuggestions(
        Array.isArray(response?.suggestions) ? response.suggestions : []
      );
    } finally {
      setSuggestLoading(false);
    }
  }, [fetch, workspaceId, metric, date, topic]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-[16px]">
      <div className="min-w-0 flex flex-col gap-[12px] bg-newTableHeader border border-newTableBorder rounded-[12px] p-[16px]">
        <div className="flex items-center justify-between gap-[12px]">
          <span className="text-[15px] font-medium text-newTableText">
            {t('ai_hook_insight', 'AI insight')}
          </span>
          <button
            type="button"
            className={primaryButton}
            disabled={insightLoading}
            onClick={loadInsight}
          >
            {insightLoading
              ? t('generating', 'Generating…')
              : t('generate', 'Generate')}
          </button>
        </div>
        <p className="text-[14px] leading-[22px] text-newTableText/80 whitespace-pre-wrap min-h-[44px]">
          {insight ||
            (insightLoaded
              ? t('ai_insight_empty', 'Not enough post data yet for an insight.')
              : t(
                  'ai_insight_hint',
                  'Generate a Korean summary of which hooks are working in this workspace.'
                ))}
        </p>
      </div>

      <div className="min-w-0 flex flex-col gap-[12px] bg-newTableHeader border border-newTableBorder rounded-[12px] p-[16px]">
        <span className="text-[15px] font-medium text-newTableText">
          {t('ai_hook_suggestions', 'Hook suggestions')}
        </span>
        <div className="flex items-center gap-[8px]">
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={t('topic_placeholder', 'Topic, e.g. 신규 기능 출시')}
            className="flex-1 min-w-0 h-[40px] bg-newBgColorInner px-[12px] outline-none border border-newTableBorder rounded-[8px] text-[14px]"
          />
          <button
            type="button"
            className={primaryButton}
            disabled={suggestLoading || !topic.trim()}
            onClick={loadSuggestions}
          >
            {suggestLoading
              ? t('generating', 'Generating…')
              : t('suggest', 'Suggest')}
          </button>
        </div>
        {suggestions.length ? (
          <ul className="flex flex-col gap-[8px]">
            {suggestions.map((suggestion, index) => (
              <li
                key={index}
                className="text-[14px] leading-[20px] text-newTableText/80 bg-newBgColorInner border border-newTableBorder/60 rounded-[8px] px-[12px] py-[8px]"
              >
                {suggestion}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-newTableText/50">
            {t(
              'ai_suggestions_hint',
              'Enter a topic to get hook openings grounded in your best posts.'
            )}
          </p>
        )}
      </div>
    </div>
  );
};
