export type ArchitectFocusArea =
  | "valuation-methodology"
  | "data-sources"
  | "architecture"
  | "quality-control"
  | "roadmap"
  | "all";

export const platformCapabilityContext = {
  market: "Polish SME private company valuation",
  stack: "Next.js and TypeScript",
  capabilities: [
    "KRS company lookup",
    "BizRaport financial imports",
    "PKD industry mapping",
    "Historical financial import",
    "Forecast generation",
    "FCFF DCF",
    "WACC",
    "FRED risk-free rate integration",
    "Damodaran ERP integration",
    "Damodaran beta integration",
    "Scenario analysis",
    "Sensitivity analysis",
    "EV-to-equity bridge",
    "Private company discounts",
    "Diagnostics",
    "Export functionality",
  ],
  currentKnownGaps: [
    "FCFE is not listed as an implemented valuation method.",
    "Asset-based valuation is not listed as an implemented valuation method.",
    "Precedent transactions are not listed as an implemented valuation method.",
    "Monte Carlo simulation is not listed as an implemented valuation method.",
    "Private transaction datasets and public comparable company pipelines are not yet listed as connected sources.",
    "Methodology versioning, audit logs, and assumption lineage should be treated as platform-level requirements.",
  ],
};

export const roadmapStages = [
  {
    stage: "Stage 1",
    name: "Valuation correctness",
    priority: "highest",
    objective: "Make formulas, valuation sequencing, diagnostic thresholds, and edge-case handling defensible before adding breadth.",
  },
  {
    stage: "Stage 2",
    name: "Data quality",
    priority: "highest",
    objective: "Improve source reliability, source metadata, refresh cadence, data validation, and assumption lineage.",
  },
  {
    stage: "Stage 3",
    name: "Professional methodology",
    priority: "high",
    objective: "Add missing valuation methods and institutional-grade calibration logic.",
  },
  {
    stage: "Stage 4",
    name: "Automation",
    priority: "medium",
    objective: "Automate imports, mapping, assumptions, alerts, and review workflows only after correctness controls exist.",
  },
  {
    stage: "Stage 5",
    name: "Reporting",
    priority: "medium",
    objective: "Produce audit-ready valuation support, not just attractive exports.",
  },
  {
    stage: "Stage 6",
    name: "UI/UX polish",
    priority: "lowest",
    objective: "Polish repeated professional workflows after methodology, data, and auditability are credible.",
  },
];

export const dataSourceEvaluationDimensions = [
  "cost",
  "API availability",
  "update frequency",
  "reliability",
  "implementation complexity",
  "coverage for Polish SMEs",
  "source licensing and redistribution constraints",
  "auditability and citation quality",
];

export const qualityControlChecklist = [
  "FCFF formula integrity and unlevered/free-cash-flow sequencing",
  "WACC and tax shield consistency",
  "Terminal value spread, terminal value concentration, and exit multiple support",
  "Normalization adjustments flowing into forecast cash flows",
  "EV-to-equity bridge completeness for debt-like items, cash, and non-operating assets",
  "Private company discount sequencing at equity value level",
  "Historical period consistency and imported statement sanity checks",
  "Source freshness, source confidence, manual override tracking, and stale seed warnings",
  "Scenario and sensitivity consistency with base-case forecast logic",
  "Export report reproducibility and methodology versioning",
];

export function buildFocusInstruction(focusArea: ArchitectFocusArea) {
  if (focusArea === "all") {
    return "Cover the whole platform, but prioritize the highest-risk valuation correctness and data quality items first.";
  }

  const labels: Record<Exclude<ArchitectFocusArea, "all">, string> = {
    "valuation-methodology": "valuation methodology",
    "data-sources": "data source strategy and integrations",
    architecture: "application and valuation-engine architecture",
    "quality-control": "quality control, diagnostics, and auditability",
    roadmap: "roadmap sequencing and prioritization",
  };

  return `Focus primarily on ${labels[focusArea]}, while still calling out any adjacent valuation correctness or data quality risks.`;
}
