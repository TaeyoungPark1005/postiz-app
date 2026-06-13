import type { AnalyticsSeries, ChartColor } from './workspace-analytics.types';

const colors: readonly ChartColor[] = ['purple', 'green', 'blue'] as const;

export const formatValue = (value: string | number) =>
  typeof value === 'number'
    ? new Intl.NumberFormat().format(Math.round(value))
    : value;

export const seriesTotal = (series: AnalyticsSeries) =>
  series.data.reduce((sum, point) => sum + point.total, 0);

export const colorForIndex = (index: number) =>
  colors[index % colors.length] || 'purple';
