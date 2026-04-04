"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Experiment } from "@/lib/local-db/types";

function extractPrimaryMetric(metricsJson: string): number | null {
  try {
    const parsed = JSON.parse(metricsJson);
    if (typeof parsed === "object" && parsed !== null) {
      const entries = Object.entries(parsed);
      if (entries.length > 0) {
        const val = Number(entries[0][1]);
        if (!isNaN(val)) return val;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function getMetricName(metricsJson: string): string {
  try {
    const parsed = JSON.parse(metricsJson);
    if (typeof parsed === "object" && parsed !== null) {
      const entries = Object.entries(parsed);
      if (entries.length > 0) return entries[0][0];
    }
  } catch {
    // ignore
  }
  return "metric";
}

interface KarpathyPlotProps {
  experiments: Experiment[];
}

export function KarpathyPlot({ experiments }: KarpathyPlotProps) {
  const sorted = [...experiments]
    .filter((e) => e.startedAt !== null)
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));

  const data = sorted
    .map((exp, idx) => {
      const value = extractPrimaryMetric(exp.metrics);
      if (value === null) return null;
      return {
        experiment: idx + 1,
        value,
        name: exp.name,
      };
    })
    .filter(Boolean) as { experiment: number; value: number; name: string }[];

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No experiment metrics to plot yet.
      </div>
    );
  }

  const metricLabel =
    sorted.length > 0 ? getMetricName(sorted[0].metrics) : "metric";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="experiment"
          label={{
            value: "Experiment #",
            position: "insideBottomRight",
            offset: -5,
            className: "fill-muted-foreground text-xs",
          }}
          tick={{ className: "fill-muted-foreground text-xs" }}
        />
        <YAxis
          label={{
            value: metricLabel,
            angle: -90,
            position: "insideLeft",
            className: "fill-muted-foreground text-xs",
          }}
          tick={{ className: "fill-muted-foreground text-xs" }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            borderColor: "hsl(var(--border))",
            borderRadius: "0.375rem",
            fontSize: "0.75rem",
          }}
          labelFormatter={(label) => `Experiment #${label}`}
          formatter={(value: number, _name: string, props) => {
            const payload = props?.payload as { name?: string } | undefined;
            return [
              `${value}`,
              payload?.name ?? metricLabel,
            ];
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ r: 4, fill: "hsl(var(--primary))" }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
