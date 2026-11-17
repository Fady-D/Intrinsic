"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DcfResult, FinancialDataset } from "@/lib/finance/types";
import { millions } from "@/lib/format";
const colors = ["#db967d", "#7ebdb0", "#aaa0df"];
const axis = {
  stroke: "#8d969f",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};
const tooltip = {
  contentStyle: {
    background: "#19222b",
    border: "1px solid #38434b",
    borderRadius: 8,
    color: "#ecf1f3",
  },
  labelStyle: { color: "#ecf1f3" },
};
function Frame({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <h3>{title}</h3>
        <span>{caption}</span>
      </div>
      <div
        className="chart"
        role="img"
        aria-label={`${title}. Exact values are available in the financial tables.`}
      >
        {children}
      </div>
    </section>
  );
}
export default function Charts({
  data,
  result,
  scenarios,
}: {
  data: FinancialDataset;
  result: DcfResult;
  scenarios: { name: string; value: number }[];
}) {
  const revenue = [
    ...data.incomeStatements.map((r, i, arr) => ({
      year: String(r.year),
      historical: r.revenue,
      projected: i === arr.length - 1 ? r.revenue : undefined,
    })),
    ...result.forecast.map((r) => ({
      year: String(r.year),
      projected: r.revenue,
      historical: undefined,
    })),
  ];
  const forecast = result.forecast.map((r) => ({
    year: String(r.year),
    fcff: r.fcff,
    margin: r.margin * 100,
    pv: r.presentValue,
  }));
  return (
    <div className="charts-grid">
      <Frame title="Revenue trajectory" caption="USD m · historical + forecast">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={revenue}>
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7ebdb0" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#7ebdb0" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#27323a" />
            <XAxis dataKey="year" {...axis} minTickGap={24} />
            <YAxis {...axis} tickFormatter={millions} width={48} />
            <Tooltip {...tooltip} />
            <Area
              name="Historical revenue"
              type="monotone"
              dataKey="historical"
              stroke="#8f9baa"
              fill="transparent"
              strokeWidth={2}
            />
            <Area
              name="Projected revenue"
              type="monotone"
              dataKey="projected"
              stroke="#7ebdb0"
              fill="url(#revenueFill)"
              strokeDasharray="5 4"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Frame>
      <Frame title="Free cash flow to firm" caption="USD m · projected">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={forecast}>
            <CartesianGrid vertical={false} stroke="#27323a" />
            <XAxis dataKey="year" {...axis} minTickGap={18} />
            <YAxis {...axis} width={45} />
            <Tooltip {...tooltip} />
            <Bar
              name="FCFF"
              dataKey="fcff"
              fill="#7ebdb0"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Frame>
      <Frame title="Operating margin" caption="% · projected">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={forecast}>
            <CartesianGrid vertical={false} stroke="#27323a" />
            <XAxis dataKey="year" {...axis} minTickGap={18} />
            <YAxis {...axis} unit="%" width={45} />
            <Tooltip {...tooltip} />
            <Line
              name="Operating margin (%)"
              dataKey="margin"
              stroke="#aaa0df"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Frame>
      <Frame title="Scenario valuation" caption="USD / diluted share">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={scenarios}>
            <CartesianGrid vertical={false} stroke="#27323a" />
            <XAxis dataKey="name" {...axis} />
            <YAxis {...axis} width={45} />
            <Tooltip {...tooltip} />
            <Bar
              name="Intrinsic value / share"
              dataKey="value"
              radius={[4, 4, 0, 0]}
            >
              {scenarios.map((s, i) => (
                <Cell key={s.name} fill={colors[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Frame>
      <Frame
        title="Discounted cash flow contributions"
        caption="USD m · years 1–10, excludes terminal"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={forecast}>
            <CartesianGrid vertical={false} stroke="#27323a" />
            <XAxis dataKey="year" {...axis} minTickGap={18} />
            <YAxis {...axis} width={45} />
            <Tooltip {...tooltip} />
            <Bar
              name="Present value of FCFF"
              dataKey="pv"
              fill="#90a6cb"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Frame>
    </div>
  );
}
