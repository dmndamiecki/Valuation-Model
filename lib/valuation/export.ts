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
import { getFinancialCraftLiquidityBenchmark } from "../data-sources/financialcraft-liquidity";

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
  const liquidityBenchmark = getFinancialCraftLiquidityBenchmark(Math.max(calculateEquityBridge(calculateDcf(forecastFinancials(input.historicals, input.forecast, input.workingCapital, input.normalizationAdjustments), calculateWacc({ ...input.wacc, taxRate: input.forecast.taxRate }).wacc, input.terminalValue).enterpriseValue, input.bridge).equityValue, 0));
  const dlomRationale = input.discounts.lackOfMarketabilitySource === "manual"
    ? `Manual DLOM override. FinancialCraft ${liquidityBenchmark.sourcePeriod} benchmark for ${liquidityBenchmark.sizeLabel} (${liquidityBenchmark.capitalizationRange}) is ${safePercent(liquidityBenchmark.lackOfMarketabilityDiscount)}; document why the selected ${safePercent(input.discounts.lackOfMarketability)} assumption differs. Source: ${liquidityBenchmark.sourceUrl}`
    : `FinancialCraft ${liquidityBenchmark.sourcePeriod} lack-of-marketability benchmark for ${liquidityBenchmark.sizeLabel} (${liquidityBenchmark.capitalizationRange}) is ${safePercent(liquidityBenchmark.lackOfMarketabilityDiscount)}. Source: ${liquidityBenchmark.sourceUrl}`;

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
    { section: "Discounts", assumption: "DLOM", value: safePercent(input.discounts.lackOfMarketability), source: input.discounts.lackOfMarketabilitySource === "manual" ? "user_input" : "template_or_import", rationale: dlomRationale },
    { section: "Market approach", assumption: "Benchmark EV/EBITDA", value: safeMultiple(input.marketMultiples.evEbitdaMultiple), source: "user_input", rationale: input.marketMultiples.source.rationale },
    { section: "Market approach", assumption: "Benchmark EV/Revenue", value: safeMultiple(input.marketMultiples.evRevenueMultiple), source: "user_input", rationale: `${input.marketMultiples.source.label}; approval status: ${input.marketMultiples.source.approvalStatus}; confidence: ${input.marketMultiples.source.confidence}.` },
    { section: "Market approach", assumption: "Multiple source date", value: input.marketMultiples.source.sourceDate, source: "user_input", rationale: `Source type: ${input.marketMultiples.source.kind}; region: ${input.marketMultiples.source.region ?? "n/a"}; Damodaran industry: ${input.marketMultiples.source.damodaranIndustry ?? "n/a"}; public comps included: ${input.marketMultiples.source.publicComparableIncludedCount ?? "n/a"} of ${input.marketMultiples.source.publicComparableCount ?? "n/a"}${input.marketMultiples.source.benchmarkAssistantGeneratedAt ? `; benchmark assistant: ${input.marketMultiples.source.benchmarkAssistantGeneratedAt}` : ""}${input.marketMultiples.source.sourceUrl ? `; URL: ${input.marketMultiples.source.sourceUrl}` : ""}.` },
    { section: "Market approach", assumption: "Benchmark assistant audit note", value: input.marketMultiples.source.benchmarkAssistantAuditNote ?? "n/a", source: "model_calculation", rationale: "Documents whether AI assisted benchmark selection and confirms that AI is not treated as a numeric valuation source." },
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
    `Base valuation is ${safeMoney(base.adjustedEquityValue, input.profile.currency)}, with a current range of ${safeMoney(bear.adjustedEquityValue, input.profile.currency)} to ${safeMoney(bull.adjustedEquityValue, input.profile.currency)}.`,
    `The main model drivers are WACC of ${safePercent(executiveSummary.impliedWacc)}, terminal growth of ${safePercent(executiveSummary.terminalGrowth)}, and EV / EBITDA of ${safeMultiple(executiveSummary.evToNormalizedEbitda)}.`,
    `Readiness is ${diagnostics.readiness.posture}: ${diagnostics.readiness.headline}`,
    ...(marketValuation ? [`The market cross-check implies ${safeMoney(marketValuation.weightedMarketEnterpriseValue, input.profile.currency)} enterprise value, a ${safePercent(marketValuation.comparison.enterpriseValueDifferencePct)} difference versus DCF EV.`] : []),
  ];
  const methodologyNote = "Methodology: FCFF DCF with WACC discounting, terminal value, EV-to-equity bridge, private-company adjustments, market cross-checks, scenario analysis, sensitivity, and readiness diagnostics.";
  const summaryText = [
    `${input.profile.companyName || "Company"} valuation summary`,
    `Indicated owner-facing equity value: ${safeMoney(base.adjustedEquityValue, input.profile.currency)}.`,
    `Reasonable range: ${safeMoney(bear.adjustedEquityValue, input.profile.currency)} to ${safeMoney(bull.adjustedEquityValue, input.profile.currency)}.`,
    `What matters most: ${keyValuationDrivers.join(" ")}`,
    `Items to review: ${keyWarnings.length > 0 ? keyWarnings.join(" ") : "No critical diagnostics are currently active."}`,
    methodologyNote,
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

export function buildPdfReportHtml(report: ValuationReport): string {
  const currency = report.companyProfile.currency;
  const conclusion = report.valuationConclusion;
  const executive = report.executiveSummary;
  const readiness = report.bankerGradeOutput.readiness;
  const generatedDate = new Date(report.generatedAt).toLocaleString("en-US");
  const warnings = conclusion.keyWarnings.length > 0 ? conclusion.keyWarnings : ["No critical diagnostics are currently active."];
  const footballRows = report.bankerGradeOutput.footballField.map((item) => `
    <tr>
      <td>${escapeHtml(item.method)}</td>
      <td>${escapeHtml(safeMoney(item.low, currency))}</td>
      <td>${escapeHtml(safeMoney(item.midpoint, currency))}</td>
      <td>${escapeHtml(safeMoney(item.high, currency))}</td>
    </tr>
  `).join("");
  const scenarioRows = report.scenarioAnalysis.map((scenario) => `
    <tr>
      <td>${escapeHtml(scenario.name)}</td>
      <td>${escapeHtml(safeMoney(scenario.enterpriseValue, currency))}</td>
      <td>${escapeHtml(safeMoney(scenario.equityValue, currency))}</td>
      <td>${escapeHtml(safeMoney(scenario.adjustedEquityValue, currency))}</td>
      <td>${escapeHtml(safeMultiple(scenario.evToEbitda))}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.companyProfile.companyName || "Valuation")} - Valuation Report</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; background: #fff; }
    .page { max-width: 980px; margin: 0 auto; }
    .cover { border-bottom: 2px solid #0f766e; padding-bottom: 22px; margin-bottom: 24px; }
    .eyebrow { color: #0f766e; font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
    h1 { margin: 10px 0 8px; font-size: 30px; line-height: 1.08; }
    h2 { margin: 28px 0 10px; font-size: 17px; }
    p { margin: 0; line-height: 1.55; }
    .muted { color: #52627a; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0; }
    .metric { border: 1px solid #d8e0ea; border-radius: 10px; padding: 14px; background: #f8fafc; }
    .metric-label { color: #52627a; font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
    .metric-value { margin-top: 8px; font-size: 21px; font-weight: 800; }
    .callout { border: 1px solid #c9e7df; border-left: 5px solid #0f766e; border-radius: 10px; padding: 16px; background: #f3fbf8; margin: 16px 0; }
    .risk { border-color: #f1d6a8; border-left-color: #d97706; background: #fffaf0; }
    ul { margin: 10px 0 0 20px; padding: 0; }
    li { margin: 6px 0; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th { color: #52627a; text-align: left; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; border-bottom: 1px solid #d8e0ea; padding: 9px 6px; }
    td { border-bottom: 1px solid #edf2f7; padding: 10px 6px; }
    .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #d8e0ea; color: #52627a; font-size: 11px; }
    @media print { .no-print { display: none; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="page">
    <section class="cover">
      <div class="eyebrow">Valuation report</div>
      <h1>${escapeHtml(report.companyProfile.companyName || "Company valuation")}</h1>
      <p class="muted">Generated ${escapeHtml(generatedDate)} · Currency: ${escapeHtml(currency)} in 000s · ${escapeHtml(report.companyProfile.country)}</p>
    </section>

    <section class="callout">
      <div class="eyebrow">Investment view</div>
      <p><strong>Indicated owner-facing equity value is ${escapeHtml(safeMoney(conclusion.baseAdjustedEquityValue, currency))}</strong>, within a current range of ${escapeHtml(safeMoney(conclusion.bearAdjustedEquityValue, currency))} to ${escapeHtml(safeMoney(conclusion.bullAdjustedEquityValue, currency))}. Readiness is ${escapeHtml(readiness.posture)}: ${escapeHtml(readiness.headline)}</p>
    </section>

    <div class="grid">
      <div class="metric"><div class="metric-label">Base equity value</div><div class="metric-value">${escapeHtml(safeMoney(conclusion.baseAdjustedEquityValue, currency))}</div></div>
      <div class="metric"><div class="metric-label">Valuation range</div><div class="metric-value">${escapeHtml(safeMoney(conclusion.bearAdjustedEquityValue, currency))} - ${escapeHtml(safeMoney(conclusion.bullAdjustedEquityValue, currency))}</div></div>
      <div class="metric"><div class="metric-label">EV / EBITDA</div><div class="metric-value">${escapeHtml(safeMultiple(executive.evToNormalizedEbitda))}</div></div>
    </div>

    <h2>What Drives The Valuation</h2>
    <ul>${conclusion.keyValuationDrivers.map((driver) => `<li>${escapeHtml(driver)}</li>`).join("")}</ul>

    <section class="callout risk">
      <div class="eyebrow">Items to review before external use</div>
      <ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
    </section>

    <h2>Valuation Range By Method</h2>
    <table>
      <thead><tr><th>Method</th><th>Low</th><th>Midpoint</th><th>High</th></tr></thead>
      <tbody>${footballRows}</tbody>
    </table>

    <h2>Scenario Summary</h2>
    <table>
      <thead><tr><th>Scenario</th><th>Enterprise value</th><th>Equity value</th><th>Adjusted equity</th><th>EV / EBITDA</th></tr></thead>
      <tbody>${scenarioRows}</tbody>
    </table>

    <h2>Methodology</h2>
    <p>${escapeHtml(conclusion.methodologyNote)}</p>

    <div class="footer">Prepared by Valuation Workbench. This report is a decision-support output and should be reviewed before external distribution.</div>
  </div>
</body>
</html>`;
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
