import { calculateEquityBridge, calculatePrivateCompanyDiscounts } from "./bridge";
import { calculateDcf, type DcfYear } from "./dcf";
import { calculateValuationDiagnostics, type DiagnosticsSummary } from "./diagnostics";
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
    ...(marketValuation ? [`Weighted market enterprise value is ${safeMoney(marketValuation.weightedMarketEnterpriseValue, input.profile.currency)}, implying a DCF / market EV difference of ${safePercent(marketValuation.comparison.enterpriseValueDifferencePct)}.`] : []),
  ];
  const methodologyNote = "Valuation is based on an unlevered FCFF DCF, WACC discounting, selected terminal value method, EV-to-equity bridge, and sequential private-company equity discounts. Valuation uses server-side public/company/market data integrations where configured; all assumptions remain editable and export is local.";
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

  return {
    generatedAt: new Date().toISOString(),
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
  };
}

export function buildReportSummaryText(report: ValuationReport): string {
  return report.valuationConclusion.summaryText;
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

export function buildCombinedCsvExport(report: ValuationReport): string {
  return [
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
