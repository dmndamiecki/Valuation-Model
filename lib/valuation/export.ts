import { calculateEquityBridge, calculatePrivateCompanyDiscounts } from "./bridge";
import { calculateDcf, type DcfYear } from "./dcf";
import { calculateValuationDiagnostics, type DiagnosticsSummary, type ReadinessAssessment } from "./diagnostics";
import { forecastFinancials, normalizeLatestEbitda, sumNormalizationAdjustments, type ForecastYear } from "./forecast";
import {
  calculateEvToEquityBridgeOutput,
  calculateExecutiveSummary,
  calculatePrivateCompanyAdjustmentBridge,
  calculateTerminalValueBreakdown,
  type EvToEquityBridgeOutput,
  type ExecutiveSummary,
  type PrivateCompanyAdjustmentBridge,
  type TerminalValueBreakdown,
} from "./output";
import { calculateMarketValuation, type MarketValuationResult } from "./multiples";
import { calculateScenarioAnalysis, type ScenarioAnalysisResult } from "./scenarios";
import { buildCenteredSensitivityCases, buildSensitivityTable, type SensitivityCell } from "./sensitivity";
import type { CompanyProfile, ValuationInput } from "./types";
import { calculateWacc, type WaccResult } from "./wacc";

export type NormalizedEbitdaBridge = {
  reportedEbitda: number;
  totalAdjustments: number;
  normalizedEbitda: number;
  adjustments: ValuationInput["normalizationAdjustments"];
};

export type ValuationConclusion = {
  baseAdjustedEquityValue: number;
  bearAdjustedEquityValue: number;
  bullAdjustedEquityValue: number;
  keyValuationDrivers: string[];
  keyWarnings: string[];
  methodologyNote: string;
  summaryText: string;
};

export type ValuationFootballFieldItem = {
  method: "DCF scenarios" | "Market approach" | "Blended indication";
  low: number;
  midpoint: number;
  high: number;
  basis: string;
};

export type AssumptionsBookItem = {
  section: string;
  assumption: string;
  value: string | number;
  source: "user_input" | "model_calculation" | "template_or_import";
  rationale: string;
};

export type AuditTrailEvent = {
  timestamp: string;
  event: string;
  detail: string;
};

export type BankerGradeOutput = {
  readiness: ReadinessAssessment;
  executiveSummaryText: string;
  footballField: ValuationFootballFieldItem[];
  assumptionsBook: AssumptionsBookItem[];
  auditTrail: AuditTrailEvent[];
  openDiligenceItems: string[];
};

export type ValuationReport = {
  generatedAt: string;
  companyProfile: CompanyProfile;
  inputAssumptions: ValuationInput;
  normalizedEbitdaBridge: NormalizedEbitdaBridge;
  forecastTable: ForecastYear[];
  dcfTable: DcfYear[];
  waccSummary: WaccResult;
  terminalValueBreakdown: TerminalValueBreakdown;
  evToEquityBridge: EvToEquityBridgeOutput;
  privateCompanyAdjustmentBridge: PrivateCompanyAdjustmentBridge;
  diagnosticsSummary: DiagnosticsSummary;
  scenarioAnalysis: ScenarioAnalysisResult[];
  sensitivityTable: SensitivityCell[][];
  marketValuation: MarketValuationResult;
  valuationConclusion: ValuationConclusion;
  executiveSummary: ExecutiveSummary;
  bankerGradeOutput: BankerGradeOutput;
};

function safePercent(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "N/M";
}

function safeMoney(value: number, currency: string): string {
  return Number.isFinite(value) ? `${currency} ${Math.round(value).toLocaleString("en-US")}` : "N/M";
}

function safeMultiple(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)}x` : "N/M";
}

function csvEscape(value: string | number | boolean): string {
  const stringValue = String(value);
  return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function rowsToCsv(rows: Array<Array<string | number | boolean>>): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function findScenario(scenarios: ScenarioAnalysisResult[], name: ScenarioAnalysisResult["name"]): ScenarioAnalysisResult {
  const scenario = scenarios.find((item) => item.name === name);
  if (!scenario) {
    throw new Error(`Missing ${name} scenario`);
  }

  return scenario;
}

function buildFootballField(
  scenarios: ScenarioAnalysisResult[],
  marketValuation: MarketValuationResult,
): ValuationFootballFieldItem[] {
  const bear = findScenario(scenarios, "Bear");
  const base = findScenario(scenarios, "Base");
  const bull = findScenario(scenarios, "Bull");
  const marketEquity = marketValuation.marketEquityBridge.equityValue;
  const blendedEquity = marketValuation.blendedValuation.blendedEquityValue;

  return [
    {
      method: "DCF scenarios",
      low: bear.adjustedEquityValue,
      midpoint: base.adjustedEquityValue,
      high: bull.adjustedEquityValue,
      basis: "Bear/Base/Bull adjusted equity values from the DCF scenario engine.",
    },
    {
      method: "Market approach",
      low: marketEquity * 0.9,
      midpoint: marketEquity,
      high: marketEquity * 1.1,
      basis: "Manual benchmark EV/EBITDA and EV/Revenue multiples with a +/-10% screening range.",
    },
    {
      method: "Blended indication",
      low: blendedEquity * 0.9,
      midpoint: blendedEquity,
      high: blendedEquity * 1.1,
      basis: "DCF and market approach weighted by the selected DCF blend weighting.",
    },
  ];
}

function buildAssumptionsBook(input: ValuationInput, terminalValueBreakdown: TerminalValueBreakdown): AssumptionsBookItem[] {
  return [
    { section: "Company", assumption: "Valuation date", value: input.profile.valuationDate, source: "user_input", rationale: "Controls historical period labels, market-data freshness, and export timestamp context." },
    { section: "Company", assumption: "Industry", value: input.profile.industry, source: "user_input", rationale: "Used for template selection, beta context, and market comparability." },
    { section: "Forecast", assumption: "Year 1 revenue growth", value: safePercent(input.forecast.revenueGrowth[0]), source: "user_input", rationale: "Primary near-term revenue driver in the explicit forecast." },
    { section: "Forecast", assumption: "Year 5 EBITDA margin", value: safePercent(input.forecast.ebitdaMargin[4]), source: "user_input", rationale: "Key steady-state operating profitability assumption before terminal value." },
    { section: "Forecast", assumption: "Tax rate", value: safePercent(input.forecast.taxRate), source: "user_input", rationale: "Applied to EBIT to calculate NOPAT and FCFF." },
    { section: "WACC", assumption: "Risk-free rate", value: safePercent(input.wacc.riskFreeRate), source: "user_input", rationale: "Base rate for cost of equity and discount-rate build." },
    { section: "WACC", assumption: "Equity risk premium", value: safePercent(input.wacc.equityRiskPremium), source: "user_input", rationale: "Market equity return premium used in CAPM-style cost of equity." },
    { section: "WACC", assumption: "Beta", value: input.wacc.beta, source: "user_input", rationale: "Business risk input for cost of equity." },
    { section: "WACC", assumption: "Size premium", value: safePercent(input.wacc.sizePremium), source: "user_input", rationale: "Private SME size risk adjustment." },
    { section: "WACC", assumption: "Company-specific risk premium", value: safePercent(input.wacc.companySpecificRiskPremium), source: "user_input", rationale: "Idiosyncratic risk adjustment that should be checked for overlap with equity discounts." },
    { section: "Terminal value", assumption: "Selected method", value: terminalValueBreakdown.method, source: "user_input", rationale: "Determines whether Gordon Growth or exit multiple drives enterprise value." },
    { section: "Terminal value", assumption: "Terminal spread", value: safePercent(terminalValueBreakdown.terminalSpread), source: "model_calculation", rationale: "WACC less perpetual growth; narrow spreads are a key DCF risk." },
    { section: "Terminal value", assumption: "Implied exit multiple from Gordon Growth", value: safeMultiple(terminalValueBreakdown.impliedExitMultipleFromGordon), source: "model_calculation", rationale: "Cross-checks perpetual-growth output against market multiple intuition." },
    { section: "Terminal value", assumption: "Implied perpetual growth from exit multiple", value: safePercent(terminalValueBreakdown.impliedPerpetualGrowthFromExitMultiple), source: "model_calculation", rationale: "Cross-checks exit-multiple output against long-term growth logic." },
    { section: "Bridge", assumption: "Cash", value: input.bridge.cash, source: "user_input", rationale: "Cash-like item added from EV to equity value." },
    { section: "Bridge", assumption: "Debt and debt-like items", value: input.bridge.debt + input.bridge.leasing + input.bridge.otherDebtLikeItems, source: "user_input", rationale: "Debt-like items deducted from enterprise value." },
    { section: "Discounts", assumption: "DLOM", value: safePercent(input.discounts.lackOfMarketability), source: "user_input", rationale: "Equity-level discount for lack of marketability." },
    { section: "Market approach", assumption: "Benchmark EV/EBITDA", value: safeMultiple(input.marketMultiples.evEbitdaMultiple), source: "user_input", rationale: "Manual market cross-check multiple." },
    { section: "Market approach", assumption: "DCF blend weighting", value: safePercent(input.marketMultiples.dcfWeight), source: "user_input", rationale: "Controls weighting between income approach and market approach indications." },
  ];
}

function buildAuditTrail(input: ValuationInput, generatedAt: string): AuditTrailEvent[] {
  return [
    { timestamp: generatedAt, event: "Valuation report generated", detail: `${input.profile.companyName || "Unnamed company"} valuation exported in ${input.profile.currency}.` },
    { timestamp: generatedAt, event: "Model engine", detail: "FCFF DCF, WACC, EV-to-equity bridge, private-company discounts, scenarios, sensitivity, diagnostics, and market approach were recalculated from current inputs." },
    { timestamp: generatedAt, event: "Data posture", detail: "Audit trail records generated output state only; full per-assumption edit history is a recommended next implementation layer." },
  ];
}

function buildBankerGradeOutput(
  input: ValuationInput,
  valuationConclusion: ValuationConclusion,
  diagnosticsSummary: DiagnosticsSummary,
  scenarios: ScenarioAnalysisResult[],
  marketValuation: MarketValuationResult,
  terminalValueBreakdown: TerminalValueBreakdown,
  generatedAt: string,
): BankerGradeOutput {
  const footballField = buildFootballField(scenarios, marketValuation);
  const assumptionsBook = buildAssumptionsBook(input, terminalValueBreakdown);
  const openDiligenceItems = diagnosticsSummary.readiness.nextActions.length > 0
    ? diagnosticsSummary.readiness.nextActions
    : ["Refresh source support for market multiples, WACC inputs, bridge items, and private-company discounts before external use."];
  const executiveSummaryText = [
    valuationConclusion.summaryText,
    `Readiness: ${diagnosticsSummary.readiness.posture}. ${diagnosticsSummary.readiness.headline}`,
    `Football field range: ${safeMoney(Math.min(...footballField.map((item) => item.low)), input.profile.currency)} to ${safeMoney(Math.max(...footballField.map((item) => item.high)), input.profile.currency)} across DCF scenarios, market approach, and blended indication.`,
  ].join("\n\n");

  return {
    readiness: diagnosticsSummary.readiness,
    executiveSummaryText,
    footballField,
    assumptionsBook,
    auditTrail: buildAuditTrail(input, generatedAt),
    openDiligenceItems,
  };
}

export function buildValuationConclusion(
  input: ValuationInput,
  executiveSummary: ExecutiveSummary,
  scenarios: ScenarioAnalysisResult[],
  diagnostics: DiagnosticsSummary,
  marketValuation?: MarketValuationResult,
): ValuationConclusion {
  const bear = findScenario(scenarios, "Bear");
  const base = findScenario(scenarios, "Base");
  const bull = findScenario(scenarios, "Bull");
  const keyWarnings = diagnostics.diagnostics.slice(0, 5).map((diagnostic) => `${diagnostic.area}: ${diagnostic.message}`);
  const keyValuationDrivers = [
    `Base adjusted equity value of ${safeMoney(base.adjustedEquityValue, input.profile.currency)} reflects a WACC of ${safePercent(executiveSummary.impliedWacc)} and terminal growth of ${safePercent(executiveSummary.terminalGrowth)}.`,
    `Terminal value represents ${safePercent(executiveSummary.terminalValueContribution)} of enterprise value.`,
    `Enterprise value implies ${safeMultiple(executiveSummary.evToNormalizedEbitda)} normalized EBITDA.`,
    `Readiness posture is ${diagnostics.readiness.posture}: ${diagnostics.readiness.headline}`,
    ...(marketValuation ? [`Weighted market enterprise value is ${safeMoney(marketValuation.weightedMarketEnterpriseValue, input.profile.currency)}, implying a DCF / market EV difference of ${safePercent(marketValuation.comparison.enterpriseValueDifferencePct)}.`] : []),
  ];
  const methodologyNote = "Valuation is based on an unlevered FCFF DCF, WACC discounting, selected terminal value method, EV-to-equity bridge, sequential private-company equity discounts, market-multiple cross-checks, readiness diagnostics, and exportable banker-grade report objects.";
  const summaryText = [
    `${input.profile.companyName} valuation conclusion`,
    `Base adjusted equity value: ${safeMoney(base.adjustedEquityValue, input.profile.currency)}.`,
    `Bear / Bull adjusted equity value range: ${safeMoney(bear.adjustedEquityValue, input.profile.currency)} to ${safeMoney(bull.adjustedEquityValue, input.profile.currency)}.`,
    `Key drivers: ${keyValuationDrivers.join(" ")}`,
    `Key warnings: ${keyWarnings.length > 0 ? keyWarnings.join(" ") : "No diagnostics warnings or critical issues currently triggered."}`,
    `Methodology note: ${methodologyNote}`,
  ].join("\n\n");

  return {
    baseAdjustedEquityValue: base.adjustedEquityValue,
    bearAdjustedEquityValue: bear.adjustedEquityValue,
    bullAdjustedEquityValue: bull.adjustedEquityValue,
    keyValuationDrivers,
    keyWarnings,
    methodologyNote,
    summaryText,
  };
}

export function buildValuationReport(input: ValuationInput): ValuationReport {
  const generatedAt = new Date().toISOString();
  const forecastTable = forecastFinancials(input.historicals, input.forecast, input.workingCapital, input.normalizationAdjustments);
  const waccSummary = calculateWacc({ ...input.wacc, taxRate: input.forecast.taxRate });
  const dcf = calculateDcf(forecastTable, waccSummary.wacc, input.terminalValue);
  const bridge = calculateEquityBridge(dcf.enterpriseValue, input.bridge);
  const discounts = calculatePrivateCompanyDiscounts(bridge.equityValue, input.discounts);
  const normalizedEbitdaBridge = {
    reportedEbitda: input.historicals[input.historicals.length - 1].ebitda,
    totalAdjustments: sumNormalizationAdjustments(input.normalizationAdjustments),
    normalizedEbitda: normalizeLatestEbitda(input.historicals, input.normalizationAdjustments),
    adjustments: input.normalizationAdjustments,
  };
  const terminalValueBreakdown = calculateTerminalValueBreakdown(dcf, waccSummary.wacc, input.terminalValue);
  const evToEquityBridge = calculateEvToEquityBridgeOutput(bridge);
  const privateCompanyAdjustmentBridge = calculatePrivateCompanyAdjustmentBridge(bridge, discounts);
  const diagnosticsSummary = calculateValuationDiagnostics(input);
  const scenarioAnalysis = calculateScenarioAnalysis(input);
  const waccCases = buildCenteredSensitivityCases(waccSummary.wacc, 0.01, 5);
  const growthCases = buildCenteredSensitivityCases(input.terminalValue.perpetualGrowthRate, 0.005, 5);
  const sensitivityTable = buildSensitivityTable(input, waccCases, growthCases);
  const executiveSummary = calculateExecutiveSummary(
    dcf,
    bridge,
    discounts,
    normalizedEbitdaBridge.normalizedEbitda,
    waccSummary,
    input.terminalValue,
  );
  const marketValuation = calculateMarketValuation(
    input.historicals,
    input.normalizationAdjustments,
    input.bridge,
    input.marketMultiples,
    dcf.enterpriseValue,
    bridge.equityValue,
  );
  const valuationConclusion = buildValuationConclusion(input, executiveSummary, scenarioAnalysis, diagnosticsSummary, marketValuation);
  const bankerGradeOutput = buildBankerGradeOutput(
    input,
    valuationConclusion,
    diagnosticsSummary,
    scenarioAnalysis,
    marketValuation,
    terminalValueBreakdown,
    generatedAt,
  );

  return {
    generatedAt,
    companyProfile: input.profile,
    inputAssumptions: input,
    normalizedEbitdaBridge,
    forecastTable,
    dcfTable: dcf.forecastYears,
    waccSummary,
    terminalValueBreakdown,
    evToEquityBridge,
    privateCompanyAdjustmentBridge,
    diagnosticsSummary,
    scenarioAnalysis,
    sensitivityTable,
    marketValuation,
    valuationConclusion,
    executiveSummary,
    bankerGradeOutput,
  };
}

export function buildReportSummaryText(report: ValuationReport): string {
  return report.bankerGradeOutput.executiveSummaryText;
}

export function buildReportJson(report: ValuationReport): string {
  return JSON.stringify(report, null, 2);
}

export function buildForecastCsv(report: ValuationReport): string {
  return rowsToCsv([
    ["Year", "Revenue", "Revenue Growth", "EBITDA", "EBITDA Margin", "D&A", "CAPEX", "NWC", "Change in NWC", "FCFF"],
    ...report.forecastTable.map((year) => [
      year.year,
      year.revenue,
      year.revenueGrowth,
      year.ebitda,
      year.ebitdaMargin,
      year.depreciation,
      year.capex,
      year.netWorkingCapital,
      year.changeInNwc,
      year.freeCashFlow,
    ]),
  ]);
}

export function buildDcfCsv(report: ValuationReport): string {
  return rowsToCsv([
    ["Year", "Revenue", "EBITDA", "EBIT", "NOPAT", "D&A", "CAPEX", "Change in NWC", "FCFF", "Discount Factor", "PV of FCFF"],
    ...report.dcfTable.map((year) => [
      year.year,
      year.revenue,
      year.ebitda,
      year.ebit,
      year.nopat,
      year.depreciation,
      year.capex,
      year.changeInNwc,
      year.freeCashFlow,
      year.discountFactor,
      year.presentValueFcf,
    ]),
  ]);
}

export function buildScenarioCsv(report: ValuationReport): string {
  return rowsToCsv([
    ["Scenario", "Revenue Growth Adjustment", "EBITDA Margin Adjustment", "WACC Adjustment", "Terminal Growth Adjustment", "DLOM Adjustment", "Enterprise Value", "Equity Value", "Adjusted Equity Value", "EV / EBITDA", "TV / EV", "Warnings"],
    ...report.scenarioAnalysis.map((scenario) => [
      scenario.name,
      scenario.assumptions.revenueGrowthAdjustment,
      scenario.assumptions.ebitdaMarginAdjustment,
      scenario.assumptions.waccAdjustment,
      scenario.assumptions.terminalGrowthAdjustment,
      scenario.assumptions.dlomAdjustment,
      scenario.enterpriseValue,
      scenario.equityValue,
      scenario.adjustedEquityValue,
      scenario.evToEbitda,
      scenario.terminalValueContribution,
      scenario.warnings.map((warning) => warning.message).join(" | "),
    ]),
  ]);
}

export function buildSensitivityCsv(report: ValuationReport): string {
  const header = ["Terminal Growth / WACC", ...report.sensitivityTable[0].map((cell) => cell.wacc)];
  const rows = report.sensitivityTable.map((row) => [
    row[0].terminalGrowth,
    ...row.map((cell) => (cell.isValid ? cell.adjustedEquityValue : "N/M")),
  ]);
  return rowsToCsv([header, ...rows]);
}

export function buildReadinessCsv(report: ValuationReport): string {
  return rowsToCsv([
    ["Metric", "Value"],
    ["Readiness posture", report.bankerGradeOutput.readiness.posture],
    ["Calculation integrity", report.bankerGradeOutput.readiness.calculationIntegrity],
    ["Decision readiness", report.bankerGradeOutput.readiness.decisionReadiness],
    ["Headline", report.bankerGradeOutput.readiness.headline],
    ["Critical diagnostics", report.diagnosticsSummary.criticalCount],
    ["Warning diagnostics", report.diagnosticsSummary.warningCount],
  ]);
}

export function buildFootballFieldCsv(report: ValuationReport): string {
  return rowsToCsv([
    ["Method", "Low", "Midpoint", "High", "Basis"],
    ...report.bankerGradeOutput.footballField.map((item) => [item.method, item.low, item.midpoint, item.high, item.basis]),
  ]);
}

export function buildAssumptionsBookCsv(report: ValuationReport): string {
  return rowsToCsv([
    ["Section", "Assumption", "Value", "Source", "Rationale"],
    ...report.bankerGradeOutput.assumptionsBook.map((item) => [item.section, item.assumption, item.value, item.source, item.rationale]),
  ]);
}

export function buildCombinedCsvExport(report: ValuationReport): string {
  return [
    "Readiness Summary",
    buildReadinessCsv(report),
    "",
    "Valuation Football Field",
    buildFootballFieldCsv(report),
    "",
    "Assumptions Book",
    buildAssumptionsBookCsv(report),
    "",
    "Forecast Table",
    buildForecastCsv(report),
    "",
    "DCF Table",
    buildDcfCsv(report),
    "",
    "Scenario Table",
    buildScenarioCsv(report),
    "",
    "Sensitivity Table",
    buildSensitivityCsv(report),
  ].join("\n");
}
