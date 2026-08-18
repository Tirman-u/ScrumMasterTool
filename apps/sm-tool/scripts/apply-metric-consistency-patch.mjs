import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(here, "../src/App.tsx");
const viewsPath = path.resolve(here, "../src/components/ExecutiveViews.tsx");

function replaceOne(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) {
    throw new Error(`Metric consistency patch failed: ${label} source block not found.`);
  }
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Metric consistency patch failed: ${label} source block is not unique.`);
  }
  return source.slice(0, first) + to + source.slice(first + from.length);
}

let app = fs.readFileSync(appPath, "utf8");
let views = fs.readFileSync(viewsPath, "utf8");

// Idempotency: once App.tsx has already been patched in the current checkout,
// the prebuild hook should be a no-op rather than trying to patch it twice.
if (!app.includes('from "./lib/metric-consistency"')) {
  app = replaceOne(
    app,
    'import { workingDaysBetween } from "./lib/working-days";\n',
    'import { workingDaysBetween } from "./lib/working-days";\nimport { buildExecutiveFlowSummary } from "./lib/metric-consistency";\n',
    "shared flow summary import",
  );

  app = replaceOne(
    app,
`  const executiveFlowStages: ExecutiveFlowStage[] = selectedTeamRow
    ? selectedTeamBottleneckEntries
        .find((entry) => entry.period === dashboardBottleneckPeriod)?.columns
        .slice()
        .slice(0, 10)
        .map((column) => {
          const type = isDefaultNonFlowStatus(column.name) ? "queue" : "active";
          const signal: ExecSig = type === "active" ? "good" : column.avgDays > 20 ? "critical" : column.avgDays > 7 ? "warning" : "neutral";
          return { name: column.name, days: column.avgDays, type, signal };
        }) ?? []
    : [];

  const executiveTimeInStatus: ExecutiveFlowStage[] = selectedTimeInStatusRows
    .filter((row): row is TimeInStatusStatusRow & { avgDays: number } => row.avgDays !== null)
    .slice(0, 8)
    .map((row) => {
      const type = row.category === "active" ? "active" : "queue";
      return {
        name: row.name,
        days: row.avgDays,
        type,
        signal: executiveSigFromHealthTone(row.tone),
      };
    });
`,
`  // Team and Scrum Master must render the same selected-period Time in Status model.
  // Do not build a second flow model from the latest bottleneck month.
  const executiveTimeInStatus: ExecutiveFlowStage[] = selectedTimeInStatusRows
    .filter(
      (row): row is TimeInStatusStatusRow & { avgDays: number } =>
        row.avgDays !== null && (row.category === "active" || row.category === "queue"),
    )
    .map((row) => {
      const type: ExecutiveFlowStage["type"] = isQueueTimeStatus(row.name, selectedTeam?.config) ? "queue" : "active";
      return {
        name: row.name,
        days: row.avgDays,
        type,
        signal: executiveSigFromHealthTone(row.tone),
      };
    });

  const executiveFlowStages: ExecutiveFlowStage[] = executiveTimeInStatus;
  const executiveFlowSummary = buildExecutiveFlowSummary(executiveFlowStages);
  const executiveFlowEfficiencyTone: ExecSig =
    executiveFlowSummary.flowEfficiencyPct === null
      ? "neutral"
      : executiveFlowSummary.flowEfficiencyPct >= 75
        ? "good"
        : executiveFlowSummary.flowEfficiencyPct >= 45
          ? "warning"
          : "critical";
  const executiveBottleneckTone: ExecSig =
    executiveFlowSummary.biggestQueueDays === null
      ? "neutral"
      : executiveFlowSummary.biggestQueueDays > 20
        ? "critical"
        : executiveFlowSummary.biggestQueueDays > 7
          ? "warning"
          : "good";
  const executiveBottleneckSummary = executiveFlowSummary.biggestQueueName
    ? \`${'${periodSummary.currentLabel}'}: ${'${executiveFlowSummary.biggestQueueName}'} (${'${executiveFlowSummary.biggestQueueDays?.toFixed(1)}'} days).\`
    : \`No queue-stage Time in Status data for ${'${periodSummary.currentLabel}'}.\`;
`,
    "single selected-period flow model",
  );

  app = replaceOne(
    app,
    '      bottleneck: row.bottleneck || "—",\n      bottleneckDays: row.healthCurrent.queueTime.topStatuses[0]?.avgDays ?? null,',
    '      bottleneck: row.healthCurrent.queueTime.topStatuses[0]?.status ?? "—",\n      bottleneckDays: row.healthCurrent.queueTime.topStatuses[0]?.avgDays ?? null,',
    "dashboard bottleneck source",
  );

  app = replaceOne(
    app,
`          executiveMetric("Bug Ratio", selectedTeamHealth.bugRatio.doneBugRatio === null ? "-" : \`${'${formatPercentValue(selectedTeamHealth.bugRatio.doneBugRatio)}'}%\`, selectedTeamHealthSignals.doneBugRatio.tone === "bad" ? "critical" : selectedTeamHealthSignals.doneBugRatio.tone === "warn" ? "warning" : "good", {
            sub: \`${'${selectedTeamHealth.bugRatio.wipBugCount}'} bugs in backlog\`,
          }),`,
`          executiveMetric("Done Bug Ratio", selectedTeamHealth.bugRatio.doneBugRatio === null ? "-" : \`${'${formatPercentValue(selectedTeamHealth.bugRatio.doneBugRatio)}'}%\`, selectedTeamHealthSignals.doneBugRatio.tone === "bad" ? "critical" : selectedTeamHealthSignals.doneBugRatio.tone === "warn" ? "warning" : "good", {
            sub: selectedTeamHealth.bugRatio.doneBugRatio === null
              ? "No delivered items in selected period"
              : \`${'${selectedTeamHealth.bugRatio.doneBugCount}'}/${'${selectedTeamHealth.bugRatio.doneTotal}'} bugs in done\`,
          }),`,
    "done bug ratio label",
  );

  app = replaceOne(
    app,
`          executiveMetric("Bottleneck", selectedTeamHealth.bottleneckTrend.dominantStatus ?? selectedBottleneckFlowTimes[0]?.name ?? "-", selectedTeamHealthSignals.bottleneckTrend.tone === "bad" ? "critical" : selectedTeamHealthSignals.bottleneckTrend.tone === "warn" ? "warning" : "neutral", {
            prev: selectedTeamHealth.bottleneckTrend.longestStatus ?? "-",
            trend: "flat",
            trendGood: false,
            sub: selectedBottleneckSummary,
          }),`,
`          executiveMetric("Bottleneck", executiveFlowSummary.biggestQueueName ?? "-", executiveBottleneckTone, {
            trend: "flat",
            trendGood: false,
            sub: executiveBottleneckSummary,
          }),`,
    "executive bottleneck KPI",
  );

  app = replaceOne(
    app,
`          executiveMetric("Bug Ratio", selectedTeamHealth.bugRatio.wipBugRatio === null ? "-" : \`${'${formatPercentValue(selectedTeamHealth.bugRatio.wipBugRatio)}'}%\`, selectedTeamHealthSignals.doneBugRatio.tone === "bad" ? "critical" : selectedTeamHealthSignals.doneBugRatio.tone === "warn" ? "warning" : "good", { sub: \`${'${selectedTeamHealth.bugRatio.wipBugCount}'} / ${'${selectedTeamHealth.bugRatio.wipTotal}'} active items\` }),`,
`          executiveMetric("WIP Bug Ratio", selectedTeamHealth.bugRatio.wipBugRatio === null ? "-" : \`${'${formatPercentValue(selectedTeamHealth.bugRatio.wipBugRatio)}'}%\`, selectedTeamHealth.bugRatio.wipBugRatio !== null && selectedTeamHealth.bugRatio.wipBugRatio > 15 ? "critical" : selectedTeamHealth.bugRatio.wipBugRatio !== null && selectedTeamHealth.bugRatio.wipBugRatio > 10 ? "warning" : "good", { sub: \`${'${selectedTeamHealth.bugRatio.wipBugCount}'} / ${'${selectedTeamHealth.bugRatio.wipTotal}'} open items\` }),`,
    "WIP bug ratio label",
  );

  app = replaceOne(
    app,
`        processHealth: [
          executiveMetric("Bottleneck", selectedBottleneckFlowTimes[0]?.name ?? "-", selectedTeamHealthSignals.bottleneckTrend.tone === "bad" ? "critical" : selectedTeamHealthSignals.bottleneckTrend.tone === "warn" ? "warning" : "neutral", { sub: selectedBottleneckSummary }),
          executiveMetric("Flow Efficiency", selectedTeamHealth.flowEfficiency.valuePct === null ? "-" : \`${'${formatPercentValue(selectedTeamHealth.flowEfficiency.valuePct)}'}%\`, selectedTeamHealthSignals.flowEfficiency.tone === "bad" ? "critical" : selectedTeamHealthSignals.flowEfficiency.tone === "warn" ? "warning" : "good", { sub: "active / total time" }),`,
`        processHealth: [
          executiveMetric("Bottleneck", executiveFlowSummary.biggestQueueName ?? "-", executiveBottleneckTone, { sub: executiveBottleneckSummary }),
          executiveMetric("Flow Efficiency", executiveFlowSummary.flowEfficiencyPct === null ? "-" : \`${'${formatPercentValue(executiveFlowSummary.flowEfficiencyPct)}'}%\`, executiveFlowEfficiencyTone, { sub: "active / (active + queue)" }),`,
    "process health shared flow metrics",
  );

  app = replaceOne(
    app,
`        flowStages: executiveFlowStages.length > 0 ? executiveFlowStages : executiveTimeInStatus,
        throughputWeekly:`,
`        flowStages: executiveFlowStages,
        flowSummary: executiveFlowSummary,
        throughputWeekly:`,
    "executive flow summary payload",
  );

  app = replaceOne(
    app,
`        timeInStatus: executiveTimeInStatus.length > 0 ? executiveTimeInStatus : executiveFlowStages,`,
`        timeInStatus: executiveTimeInStatus,`,
    "shared Time in Status payload",
  );
}

if (!views.includes("flowSummary: {")) {
  views = replaceOne(
    views,
`  flowStages: ExecutiveFlowStage[];
  throughputWeekly: ExecutiveChartPoint[];`,
`  flowStages: ExecutiveFlowStage[];
  flowSummary: {
    queueDays: number;
    activeDays: number;
    totalDays: number;
    flowEfficiencyPct: number | null;
    biggestQueueName: string | null;
    biggestQueueDays: number | null;
  };
  throughputWeekly: ExecutiveChartPoint[];`,
    "ExecutiveTeamDesignData flow summary contract",
  );

  views = replaceOne(
    views,
`function FlowPipeline({ data, periodLabel }: { data: ExecutiveTeamDesignData; periodLabel: string }) {
  const maxDays = Math.max(1, ...data.flowStages.map((stage) => stage.days));
  const queueDays = data.flowStages.filter((stage) => stage.type === "queue").reduce((sum, stage) => sum + stage.days, 0);
  const activeDays = data.flowStages.filter((stage) => stage.type === "active").reduce((sum, stage) => sum + stage.days, 0);
  const totalDays = queueDays + activeDays;
  const biggestQueue = data.flowStages.filter((stage) => stage.type === "queue").sort((a, b) => b.days - a.days)[0] ?? null;
`,
`function FlowPipeline({ data, periodLabel }: { data: ExecutiveTeamDesignData; periodLabel: string }) {
  const maxDays = Math.max(1, ...data.flowStages.map((stage) => stage.days));
  const { queueDays, activeDays, flowEfficiencyPct, biggestQueueName, biggestQueueDays } = data.flowSummary;
  const biggestQueue = biggestQueueName !== null && biggestQueueDays !== null
    ? { name: biggestQueueName, days: biggestQueueDays }
    : null;
  const flowEfficiencySig: ExecSig = flowEfficiencyPct === null
    ? "neutral"
    : flowEfficiencyPct >= 75
      ? "good"
      : flowEfficiencyPct >= 45
        ? "warning"
        : "critical";
`,
    "FlowPipeline shared summary",
  );

  views = replaceOne(
    views,
`        <SummaryKpi label="Flow Efficiency" value={totalDays > 0 ? \`${'${((activeDays / totalDays) * 100).toFixed(1)}'}%\` : "-"} sig="warning" />`,
`        <SummaryKpi label="Flow Efficiency" value={flowEfficiencyPct === null ? "-" : \`${'${flowEfficiencyPct.toFixed(1)}'}%\`} sig={flowEfficiencySig} />`,
    "FlowPipeline flow efficiency display",
  );
}

fs.writeFileSync(appPath, app, "utf8");
fs.writeFileSync(viewsPath, views, "utf8");
console.log("Applied shared metric source-of-truth patch.");
