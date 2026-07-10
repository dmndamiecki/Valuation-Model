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

function escapeXml(value: string | number | boolean): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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

function scalePdfValue(value: number, min: number, max: number, width: number) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return width / 2;
  }
  return Math.max(0, Math.min(width, ((value - min) / (max - min)) * width));
}

function buildPdfRangeSvg(conclusion: ValuationConclusion, currency: string) {
  const width = 720;
  const height = 96;
  const low = conclusion.bearAdjustedEquityValue;
  const base = conclusion.baseAdjustedEquityValue;
  const high = conclusion.bullAdjustedEquityValue;
  const min = Math.min(low, base, high);
  const max = Math.max(low, base, high);
  const start = scalePdfValue(low, min, max, width - 80) + 40;
  const end = scalePdfValue(high, min, max, width - 80) + 40;
  const marker = scalePdfValue(base, min, max, width - 80) + 40;

  return `
    <svg class="range-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Valuation range">
      <defs>
        <linearGradient id="rangeGradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#14b8a6" />
          <stop offset="55%" stop-color="#2dd4bf" />
          <stop offset="100%" stop-color="#0f766e" />
        </linearGradient>
      </defs>
      <line x1="40" y1="44" x2="${width - 40}" y2="44" stroke="#dbe5ee" stroke-width="14" stroke-linecap="round" />
      <line x1="${start.toFixed(1)}" y1="44" x2="${end.toFixed(1)}" y2="44" stroke="url(#rangeGradient)" stroke-width="14" stroke-linecap="round" />
      <circle cx="${marker.toFixed(1)}" cy="44" r="13" fill="#0f172a" stroke="#ffffff" stroke-width="4" />
      <text x="40" y="80" fill="#53657d" font-size="13" font-weight="700">${escapeHtml(safeMoney(low, currency))}</text>
      <text x="${width - 40}" y="80" fill="#53657d" font-size="13" font-weight="700" text-anchor="end">${escapeHtml(safeMoney(high, currency))}</text>
      <text x="${marker.toFixed(1)}" y="18" fill="#0f172a" font-size="13" font-weight="800" text-anchor="middle">${escapeHtml(safeMoney(base, currency))}</text>
    </svg>
  `;
}

function buildPdfFootballField(items: ValuationFootballFieldItem[], currency: string) {
  const values = items.flatMap((item) => [item.low, item.midpoint, item.high]).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const width = 720;
  const rowHeight = 44;
  const height = 34 + items.length * rowHeight;
  const plotWidth = 430;
  const plotX = 250;
  const colors = ["#0f766e", "#2563eb", "#7c3aed"];

  const rows = items.map((item, index) => {
    const y = 30 + index * rowHeight;
    const x1 = scalePdfValue(item.low, min, max, plotWidth) + plotX;
    const x2 = scalePdfValue(item.high, min, max, plotWidth) + plotX;
    const mid = scalePdfValue(item.midpoint, min, max, plotWidth) + plotX;
    const color = colors[index % colors.length];

    return `
      <text x="18" y="${y + 5}" fill="#0f172a" font-size="13" font-weight="800">${escapeHtml(item.method)}</text>
      <text x="18" y="${y + 23}" fill="#64748b" font-size="11">${escapeHtml(safeMoney(item.midpoint, currency))}</text>
      <line x1="${plotX}" y1="${y}" x2="${plotX + plotWidth}" y2="${y}" stroke="#e6edf5" stroke-width="10" stroke-linecap="round" />
      <line x1="${x1.toFixed(1)}" y1="${y}" x2="${x2.toFixed(1)}" y2="${y}" stroke="${color}" stroke-width="10" stroke-linecap="round" />
      <circle cx="${mid.toFixed(1)}" cy="${y}" r="7" fill="#ffffff" stroke="${color}" stroke-width="4" />
    `;
  }).join("");

  return `
    <svg class="football-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Valuation football field">
      <text x="${plotX}" y="15" fill="#64748b" font-size="10" font-weight="800" letter-spacing="1.5">LOW</text>
      <text x="${plotX + plotWidth / 2}" y="15" fill="#64748b" font-size="10" font-weight="800" text-anchor="middle" letter-spacing="1.5">MIDPOINT</text>
      <text x="${plotX + plotWidth}" y="15" fill="#64748b" font-size="10" font-weight="800" text-anchor="end" letter-spacing="1.5">HIGH</text>
      ${rows}
    </svg>
  `;
}

function buildPdfScenarioChart(scenarios: ScenarioAnalysisResult[], currency: string) {
  const values = scenarios.map((scenario) => scenario.adjustedEquityValue).filter(Number.isFinite);
  const min = values.length ? Math.min(...values, 0) : 0;
  const max = values.length ? Math.max(...values, 1) : 1;
  const width = 720;
  const height = 178;
  const plotX = 52;
  const plotY = 18;
  const plotWidth = 610;
  const plotHeight = 104;
  const barWidth = Math.min(120, plotWidth / Math.max(1, scenarios.length) - 18);
  const zeroY = plotY + plotHeight - scalePdfValue(0, min, max, plotHeight);

  const bars = scenarios.map((scenario, index) => {
    const x = plotX + index * (plotWidth / Math.max(1, scenarios.length)) + 18;
    const y = plotY + plotHeight - scalePdfValue(Math.max(scenario.adjustedEquityValue, 0), min, max, plotHeight);
    const h = Math.max(4, Math.abs(scalePdfValue(scenario.adjustedEquityValue, min, max, plotHeight) - scalePdfValue(0, min, max, plotHeight)));
    const color = scenario.name === "Base" ? "#0f766e" : scenario.name === "Bull" ? "#2563eb" : "#f59e0b";

    return `
      <rect x="${x.toFixed(1)}" y="${Math.min(y, zeroY).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" rx="8" fill="${color}" opacity="0.92" />
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${plotY + plotHeight + 23}" fill="#0f172a" font-size="12" font-weight="800" text-anchor="middle">${escapeHtml(scenario.name)}</text>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${plotY + plotHeight + 41}" fill="#64748b" font-size="10" text-anchor="middle">${escapeHtml(safeMoney(scenario.adjustedEquityValue, currency))}</text>
    `;
  }).join("");

  return `
    <svg class="scenario-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Scenario valuation chart">
      <line x1="${plotX}" y1="${zeroY.toFixed(1)}" x2="${plotX + plotWidth}" y2="${zeroY.toFixed(1)}" stroke="#dbe5ee" stroke-width="2" />
      <line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${plotY + plotHeight}" stroke="#dbe5ee" stroke-width="2" />
      ${bars}
    </svg>
  `;
}

export function buildExecutiveSummaryPdfHtml(report: ValuationReport): string {
  const currency = report.companyProfile.currency || "PLN";
  const companyName = report.companyProfile.companyName || "Company valuation";
  const conclusion = report.valuationConclusion;
  const executive = report.executiveSummary;
  const readiness = report.bankerGradeOutput.readiness;
  const generatedDate = new Date(report.generatedAt).toLocaleString("en-US");
  const warnings = conclusion.keyWarnings.length > 0 ? conclusion.keyWarnings : ["No critical diagnostics are currently active."];
  const source = report.inputAssumptions.marketMultiples.source;
  const latestHistorical = report.inputAssumptions.historicals[report.inputAssumptions.historicals.length - 1];
  const rangeSvg = buildPdfRangeSvg(conclusion, currency);
  const footballSvg = buildPdfFootballField(report.bankerGradeOutput.footballField, currency);
  const scenarioSvg = buildPdfScenarioChart(report.scenarioAnalysis, currency);
  const reviewTone = readiness.posture === "review-ready" ? "Ready for review" : readiness.posture === "screen-grade" ? "Screen-grade" : "Draft / review";
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
      <td>${escapeHtml(safeMoney(scenario.adjustedEquityValue, currency))}</td>
      <td>${escapeHtml(safeMultiple(scenario.evToEbitda))}</td>
      <td>${escapeHtml(safePercent(scenario.terminalValueContribution))}</td>
    </tr>
  `).join("");
  const assumptionRows = [
    ["WACC", safePercent(report.waccSummary.wacc)],
    ["Cost of equity", safePercent(report.waccSummary.costOfEquity)],
    ["Latest revenue", safeMoney(latestHistorical?.revenue ?? Number.NaN, currency)],
    ["Normalized EBITDA", safeMoney(report.normalizedEbitdaBridge.normalizedEbitda, currency)],
    ["Terminal method", report.terminalValueBreakdown.method],
    ["Terminal growth", safePercent(report.executiveSummary.terminalGrowth)],
    ["EV / EBITDA", safeMultiple(report.inputAssumptions.marketMultiples.evEbitdaMultiple)],
    ["DLOM", safePercent(report.inputAssumptions.discounts.lackOfMarketability)],
    ["Benchmark status", source.approvalStatus],
  ].map(([label, value]) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td>${escapeHtml(String(value))}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(companyName)} - Executive Valuation Summary</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; background: #e8eef5; }
    .page { max-width: 980px; margin: 0 auto; background: #ffffff; box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18); }
    .hero { position: relative; overflow: hidden; color: #ffffff; padding: 28px 32px 26px; background: linear-gradient(135deg, #071525 0%, #0f766e 58%, #22c55e 122%); }
    .hero:after { content: ""; position: absolute; right: -120px; top: -140px; width: 360px; height: 360px; border-radius: 999px; border: 56px solid rgba(255,255,255,0.10); }
    .topline { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; position: relative; z-index: 1; }
    .eyebrow { color: #99f6e4; font-size: 10px; font-weight: 900; letter-spacing: 0.22em; text-transform: uppercase; }
    .status-pill { border: 1px solid rgba(255,255,255,0.35); border-radius: 999px; padding: 7px 11px; color: #ecfeff; font-size: 11px; font-weight: 800; background: rgba(15,23,42,0.18); }
    h1 { position: relative; z-index: 1; margin: 10px 0 8px; max-width: 760px; font-size: 31px; line-height: 1.05; letter-spacing: -0.02em; }
    .hero-meta { position: relative; z-index: 1; color: #ccfbf1; font-size: 11px; line-height: 1.6; }
    .hero-grid { position: relative; z-index: 1; display: grid; grid-template-columns: 1.35fr 0.65fr; gap: 16px; margin-top: 22px; }
    .headline-card { border: 1px solid rgba(255,255,255,0.26); border-radius: 16px; padding: 18px; background: rgba(255,255,255,0.12); backdrop-filter: blur(10px); }
    .headline-label { color: #a7f3d0; font-size: 10px; font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase; }
    .headline-value { margin-top: 8px; font-size: 31px; font-weight: 900; letter-spacing: -0.02em; }
    .headline-copy { margin-top: 8px; color: #e0f2fe; font-size: 12px; line-height: 1.5; }
    .side-kpis { display: grid; gap: 9px; }
    .side-kpi { border: 1px solid rgba(255,255,255,0.22); border-radius: 12px; padding: 11px; background: rgba(15,23,42,0.18); }
    .side-kpi span { display: block; color: #bae6fd; font-size: 9px; font-weight: 900; letter-spacing: 0.15em; text-transform: uppercase; }
    .side-kpi strong { display: block; margin-top: 5px; font-size: 15px; color: #ffffff; }
    .content { padding: 24px 30px 30px; }
    .section { margin-top: 18px; }
    .section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    h2 { margin: 0; font-size: 16px; letter-spacing: -0.01em; }
    .section-note { color: #64748b; font-size: 11px; }
    p { margin: 0; line-height: 1.5; }
    .muted { color: #52627a; font-size: 12px; }
    .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 14px 0; }
    .metric { border: 1px solid #d8e0ea; border-radius: 14px; padding: 14px; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); min-height: 98px; }
    .metric.primary { border-color: #99f6e4; background: #ecfdf5; }
    .metric-label { color: #52627a; font-size: 9px; font-weight: 900; letter-spacing: 0.15em; text-transform: uppercase; }
    .metric-value { margin-top: 8px; font-size: 20px; font-weight: 900; line-height: 1.18; }
    .metric.primary .metric-value { color: #0f766e; }
    .card { border: 1px solid #d8e0ea; border-radius: 16px; padding: 15px; background: #ffffff; }
    .card.soft { background: #f8fafc; }
    .chart-card { border: 1px solid #cbd5e1; border-radius: 16px; padding: 16px; background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%); }
    .range-svg, .football-svg, .scenario-svg { display: block; width: 100%; height: auto; }
    .two-col { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 14px; align-items: start; }
    .three-col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .driver-list { margin: 8px 0 0; padding: 0; list-style: none; }
    .driver-list li { margin: 7px 0; padding-left: 15px; position: relative; color: #334155; font-size: 12px; line-height: 1.45; }
    .driver-list li:before { content: ""; position: absolute; left: 0; top: 7px; width: 6px; height: 6px; border-radius: 999px; background: #14b8a6; }
    .risk { border-color: #fde68a; background: #fffbeb; }
    .risk .driver-list li:before { background: #f59e0b; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
    th { color: #64748b; text-align: left; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; border-bottom: 1px solid #d8e0ea; padding: 8px 6px; }
    td { border-bottom: 1px solid #edf2f7; padding: 8px 6px; vertical-align: top; }
    .small { font-size: 11px; color: #52627a; }
    .source-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
    .source-item { border-radius: 12px; background: #f1f5f9; padding: 10px; }
    .source-item span { display: block; color: #64748b; font-size: 9px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; }
    .source-item strong { display: block; margin-top: 4px; font-size: 11px; color: #0f172a; }
    .footer { margin-top: 18px; padding-top: 12px; border-top: 1px solid #d8e0ea; color: #52627a; font-size: 10px; display: flex; justify-content: space-between; gap: 12px; }
    .page-break { break-before: page; page-break-before: always; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="topline">
        <div class="eyebrow">Executive valuation summary</div>
        <div class="status-pill">${escapeHtml(reviewTone)}</div>
      </div>
      <h1>${escapeHtml(companyName)}</h1>
      <p class="hero-meta">Generated ${escapeHtml(generatedDate)} | Currency: ${escapeHtml(currency)} | Country: ${escapeHtml(report.companyProfile.country || "n/a")} | KRS: ${escapeHtml(report.companyProfile.registrationNumber || "n/a")}</p>
      <div class="hero-grid">
        <div class="headline-card">
          <div class="headline-label">Headline owner-facing equity value</div>
          <div class="headline-value">${escapeHtml(safeMoney(conclusion.baseAdjustedEquityValue, currency))}</div>
          <p class="headline-copy">Supported range: ${escapeHtml(safeMoney(conclusion.bearAdjustedEquityValue, currency))} to ${escapeHtml(safeMoney(conclusion.bullAdjustedEquityValue, currency))}. ${escapeHtml(readiness.headline)}</p>
        </div>
        <div class="side-kpis">
          <div class="side-kpi"><span>Core multiple</span><strong>${escapeHtml(safeMultiple(executive.evToNormalizedEbitda))} EV / EBITDA</strong></div>
          <div class="side-kpi"><span>WACC</span><strong>${escapeHtml(safePercent(report.waccSummary.wacc))}</strong></div>
          <div class="side-kpi"><span>Benchmark</span><strong>${escapeHtml(source.approvalStatus)}</strong></div>
        </div>
      </div>
    </section>

    <main class="content">
      <section class="section">
        <div class="section-title">
          <h2>Valuation Range</h2>
          <span class="section-note">Low / headline / high indication</span>
        </div>
        <div class="chart-card">${rangeSvg}</div>
      </section>

      <section class="section metric-grid">
        <div class="metric primary"><div class="metric-label">Base equity value</div><div class="metric-value">${escapeHtml(safeMoney(conclusion.baseAdjustedEquityValue, currency))}</div><p class="small">Headline indication</p></div>
        <div class="metric"><div class="metric-label">Low indication</div><div class="metric-value">${escapeHtml(safeMoney(conclusion.bearAdjustedEquityValue, currency))}</div><p class="small">Downside case</p></div>
        <div class="metric"><div class="metric-label">High indication</div><div class="metric-value">${escapeHtml(safeMoney(conclusion.bullAdjustedEquityValue, currency))}</div><p class="small">Upside case</p></div>
      </section>

      <section class="section two-col">
        <div class="card">
          <div class="section-title"><h2>Key Valuation Drivers</h2></div>
          <ul class="driver-list">${conclusion.keyValuationDrivers.slice(0, 4).map((driver) => `<li>${escapeHtml(driver)}</li>`).join("")}</ul>
        </div>
        <div class="card soft">
          <div class="section-title"><h2>Core Assumptions</h2></div>
          <table><tbody>${assumptionRows}</tbody></table>
        </div>
      </section>

      <section class="section chart-card">
        <div class="section-title">
          <h2>Valuation Football Field</h2>
          <span class="section-note">Method-level support, not separate conclusions</span>
        </div>
        ${footballSvg}
      </section>

      <section class="section two-col">
        <div class="card">
          <div class="section-title"><h2>Scenario Support</h2></div>
          ${scenarioSvg}
        </div>
        <div class="card risk">
          <div class="section-title"><h2>Review Items</h2></div>
          <ul class="driver-list">${warnings.slice(0, 5).map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
        </div>
      </section>

      <section class="section page-break">
        <div class="section-title">
          <h2>Detailed Method Table</h2>
          <span class="section-note">Audit support</span>
        </div>
        <table>
          <thead><tr><th>Method</th><th>Low</th><th>Midpoint</th><th>High</th></tr></thead>
          <tbody>${footballRows}</tbody>
        </table>
      </section>

      <section class="section two-col">
        <div class="card">
          <div class="section-title"><h2>Scenario Table</h2></div>
          <table>
            <thead><tr><th>Scenario</th><th>Adjusted equity value</th><th>EV / EBITDA</th><th>TV / EV</th></tr></thead>
            <tbody>${scenarioRows}</tbody>
          </table>
        </div>
        <div class="card soft">
          <div class="section-title"><h2>Methodology</h2></div>
          <p class="small">${escapeHtml(conclusion.methodologyNote)} This PDF is intentionally limited to decision-grade outputs; Excel and JSON/CSV retain detailed audit support.</p>
        </div>
      </section>

      <section class="section">
        <div class="section-title"><h2>Benchmark Source Posture</h2></div>
        <div class="source-strip">
          <div class="source-item"><span>Source</span><strong>${escapeHtml(source.label)}</strong></div>
          <div class="source-item"><span>Status</span><strong>${escapeHtml(source.approvalStatus)}</strong></div>
          <div class="source-item"><span>Confidence</span><strong>${escapeHtml(source.confidence)}</strong></div>
          <div class="source-item"><span>Industry</span><strong>${escapeHtml(source.damodaranIndustry ?? "n/a")}</strong></div>
        </div>
      </section>

      <div class="footer">
        <span>Prepared by Valuation Workbench</span>
        <span>Review diagnostics, bridge inputs, and source approvals before external distribution.</span>
      </div>
    </main>
  </div>
</body>
</html>`;
}

function excelCell(value: string | number | boolean, styleId?: string): string {
  const type = typeof value === "number" && Number.isFinite(value) ? "Number" : "String";
  return `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ""}><Data ss:Type="${type}">${escapeXml(type === "Number" ? value : String(value))}</Data></Cell>`;
}

function excelRow(values: Array<string | number | boolean>, styleId?: string): string {
  return `<Row>${values.map((value) => excelCell(value, styleId)).join("")}</Row>`;
}

function excelSheet(name: string, rows: string[]): string {
  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${rows.join("")}</Table></Worksheet>`;
}

export function buildExecutiveExcelWorkbookXml(report: ValuationReport): string {
  const currency = report.companyProfile.currency || "PLN";
  const conclusion = report.valuationConclusion;
  const readiness = report.bankerGradeOutput.readiness;
  const source = report.inputAssumptions.marketMultiples.source;
  const latestHistorical = report.inputAssumptions.historicals[report.inputAssumptions.historicals.length - 1];
  const coreAssumptions = [
    ["WACC", report.waccSummary.wacc],
    ["Cost of equity", report.waccSummary.costOfEquity],
    ["Risk-free rate", report.inputAssumptions.wacc.riskFreeRate],
    ["Equity risk premium", report.inputAssumptions.wacc.equityRiskPremium],
    ["Beta", report.inputAssumptions.wacc.beta],
    ["Terminal growth", report.executiveSummary.terminalGrowth],
    ["EV/EBITDA benchmark", report.inputAssumptions.marketMultiples.evEbitdaMultiple],
    ["EV/Revenue benchmark", report.inputAssumptions.marketMultiples.evRevenueMultiple],
    ["DLOM", report.inputAssumptions.discounts.lackOfMarketability],
    ["Key-person discount", report.inputAssumptions.discounts.keyPersonDiscount],
    ["Customer concentration discount", report.inputAssumptions.discounts.customerConcentrationDiscount],
  ];

  const summaryRows = [
    excelRow(["Executive Summary"], "Title"),
    excelRow(["Company", report.companyProfile.companyName || "n/a"]),
    excelRow(["KRS", report.companyProfile.registrationNumber || "n/a"]),
    excelRow(["Country", report.companyProfile.country || "n/a"]),
    excelRow(["Currency", currency]),
    excelRow(["Valuation date", report.companyProfile.valuationDate || "n/a"]),
    excelRow(["Generated at", report.generatedAt]),
    excelRow([""]),
    excelRow(["Base adjusted equity value", conclusion.baseAdjustedEquityValue]),
    excelRow(["Low indication", conclusion.bearAdjustedEquityValue]),
    excelRow(["High indication", conclusion.bullAdjustedEquityValue]),
    excelRow(["Readiness posture", readiness.posture]),
    excelRow(["Readiness headline", readiness.headline]),
    excelRow([""]),
    excelRow(["Latest revenue", latestHistorical?.revenue ?? "n/a"]),
    excelRow(["Latest EBITDA", latestHistorical?.ebitda ?? "n/a"]),
    excelRow(["Normalized EBITDA", report.normalizedEbitdaBridge.normalizedEbitda]),
    excelRow(["EV / normalized EBITDA", report.executiveSummary.evToNormalizedEbitda]),
  ];

  const rangeRows = [
    excelRow(["Method", "Low", "Midpoint", "High", "Basis"], "Header"),
    ...report.bankerGradeOutput.footballField.map((item) => excelRow([item.method, item.low, item.midpoint, item.high, item.basis])),
    excelRow([""]),
    excelRow(["Scenario", "Enterprise Value", "Equity Value", "Adjusted Equity Value", "EV/EBITDA", "TV/EV"], "Header"),
    ...report.scenarioAnalysis.map((scenario) => excelRow([
      scenario.name,
      scenario.enterpriseValue,
      scenario.equityValue,
      scenario.adjustedEquityValue,
      scenario.evToEbitda,
      scenario.terminalValueContribution,
    ])),
  ];

  const assumptionsRows = [
    excelRow(["Assumption", "Value"], "Header"),
    ...coreAssumptions.map(([label, value]) => excelRow([String(label), value as number])),
    excelRow([""]),
    excelRow(["Market benchmark source", "Value"], "Header"),
    excelRow(["Source label", source.label]),
    excelRow(["Approval status", source.approvalStatus]),
    excelRow(["Confidence", source.confidence]),
    excelRow(["Region", source.region ?? "n/a"]),
    excelRow(["Dataset", source.dataset ?? "n/a"]),
    excelRow(["Damodaran industry", source.damodaranIndustry ?? "n/a"]),
    excelRow(["Source date", source.sourceDate]),
    excelRow(["Rationale", source.rationale]),
  ];

  const diagnosticsRows = [
    excelRow(["Severity", "Area", "Code", "Message"], "Header"),
    ...report.diagnosticsSummary.diagnostics.map((diagnostic) => excelRow([
      diagnostic.severity,
      diagnostic.area,
      diagnostic.code,
      diagnostic.message,
    ])),
    excelRow([""]),
    excelRow(["Next actions"], "Header"),
    ...report.bankerGradeOutput.openDiligenceItems.map((item) => excelRow([item])),
  ];

  const auditRows = [
    excelRow(["Timestamp", "Event", "Detail"], "Header"),
    ...report.bankerGradeOutput.auditTrail.map((item) => excelRow([item.timestamp, item.event, item.detail])),
    excelRow([""]),
    excelRow(["Driver"], "Header"),
    ...conclusion.keyValuationDrivers.map((item) => excelRow([item])),
  ];

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16" ss:Color="#0f172a"/></Style>
    <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#334155"/><Interior ss:Color="#eef2f7" ss:Pattern="Solid"/></Style>
  </Styles>
  ${excelSheet("Executive Summary", summaryRows)}
  ${excelSheet("Valuation Range", rangeRows)}
  ${excelSheet("Assumptions", assumptionsRows)}
  ${excelSheet("Diagnostics", diagnosticsRows)}
  ${excelSheet("Audit Trail", auditRows)}
</Workbook>`;
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
