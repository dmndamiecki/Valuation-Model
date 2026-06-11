import { calculateEquityBridge, calculatePrivateCompanyDiscounts } from "./bridge";
import { calculateComparableCompanies } from "./comparable-companies";
import { calculateDcf } from "./dcf";
import { forecastFinancials } from "./forecast";
import { getIndustryModelProfile, type IndustryModelProfile } from "./industry-model-profiles";
import { calculateMarketValuation } from "./multiples";
import type { PeerBenchmarkResult } from "./peer-benchmarks";
import { calculateScenarioAnalysis } from "./scenarios";
import type { ImportedValueSource, ValuationInput } from "./types";
import { calculateWacc } from "./wacc";

export type ValuationEngineId =
  | "dcf"
  | "comparableCompanies"
  | "marketMultiples"
  | "assetBasedFloor"
  | "scenarioAnalysis"
  | "monteCarlo";

export type ValuationEngineStatus = "ready" | "review" | "missing-data" | "disabled";
export type ValuationEngineCategory = "income" | "market" | "asset" | "scenario" | "simulation";

export type EngineSource = {
  label: string;
  source: string;
  sourceDate: string;
  confidence: "high" | "medium" | "low";
  note?: string;
};

export type ValuationEngineDefinition = {
  id: ValuationEngineId;
  name: string;
  category: ValuationEngineCategory;
  supportedIndustries: string[];
  requiredInputs: string[];
  sourceRequirements: string[];
  outputUnit: "enterpriseValue" | "equityValue" | "distribution" | "floor";
};

export type ValuationEngineDiagnostic = {
  severity: "info" | "warning" | "critical";
  message: string;
};

export type ValuationEngineDetailValue = number | string | boolean | null;

export type ValuationEngineResult = {
  id: ValuationEngineId;
  name: string;
  category: ValuationEngineCategory;
  status: ValuationEngineStatus;
  weight: number;
  normalizedWeight: number;
  confidenceScore: number;
  enterpriseValue: { low: number; base: number; high: number };
  equityValue: { low: number; base: number; high: number };
  pointEstimate: number;
  diagnostics: ValuationEngineDiagnostic[];
  inputSources: EngineSource[];
  calculationSources: EngineSource[];
  manualOverrides: EngineSource[];
  missingSources: string[];
  details: Record<string, ValuationEngineDetailValue>;
};

export type BlendedValuationRange = {
  low: number;
  base: number;
  high: number;
  confidenceScore: number;
  confidenceBand: "high" | "medium" | "low";
  activeEngines: ValuationEngineResult[];
  excludedEngines: ValuationEngineResult[];
  engineResults: ValuationEngineResult[];
  industryProfile: IndustryModelProfile;
};

export const valuationEngineDefinitions: ValuationEngineDefinition[] = [
  {
    id: "dcf",
    name: "Discounted Cash Flow",
    category: "income",
    supportedIndustries: ["all"],
    requiredInputs: ["historicals", "forecast", "WACC", "terminal value", "EV-to-equity bridge"],
    sourceRequirements: ["historical financials", "risk-free rate", "equity risk premium", "industry beta"],
    outputUnit: "enterpriseValue",
  },
  {
    id: "comparableCompanies",
    name: "Comparable Companies",
    category: "market",
    supportedIndustries: ["all"],
    requiredInputs: ["normalized EBITDA", "revenue", "selected peer multiples"],
    sourceRequirements: ["peer set", "EV/EBITDA", "EV/Revenue", "outlier review"],
    outputUnit: "enterpriseValue",
  },
  {
    id: "marketMultiples",
    name: "Market Multiples",
    category: "market",
    supportedIndustries: ["all"],
    requiredInputs: ["normalized EBITDA", "latest revenue", "manual multiples"],
    sourceRequirements: ["selected multiples", "bridge inputs"],
    outputUnit: "enterpriseValue",
  },
  {
    id: "assetBasedFloor",
    name: "Asset-Based Floor",
    category: "asset",
    supportedIndustries: ["asset-heavy", "all"],
    requiredInputs: ["assets", "equity", "liabilities"],
    sourceRequirements: ["balance sheet", "manual hard-asset review"],
    outputUnit: "floor",
  },
  {
    id: "scenarioAnalysis",
    name: "Scenario Analysis",
    category: "scenario",
    supportedIndustries: ["all"],
    requiredInputs: ["bear", "base", "bull assumptions"],
    sourceRequirements: ["forecast", "WACC", "discount assumptions"],
    outputUnit: "equityValue",
  },
  {
    id: "monteCarlo",
    name: "Monte Carlo Simulation",
    category: "simulation",
    supportedIndustries: ["all"],
    requiredInputs: ["growth", "margin", "WACC", "terminal growth", "NWC distributions"],
    sourceRequirements: ["historical volatility proxies", "forecast assumptions"],
    outputUnit: "distribution",
  },
];

function range(low: number, base: number, high: number) {
  const values = [low, base, high].filter(Number.isFinite);
  if (values.length === 0) {
    return { low: Number.NaN, base: Number.NaN, high: Number.NaN };
  }
  return {
    low: Math.min(...values),
    base: Number.isFinite(base) ? base : values[Math.floor(values.length / 2)],
    high: Math.max(...values),
  };
}

function sourceFromImported(label: string, source: ImportedValueSource | undefined): EngineSource | null {
  if (!source) return null;
  return {
    label,
    source: source.source,
    sourceDate: source.sourceDate,
    confidence: source.confidence,
    note: source.note,
  };
}

function compactSources(sources: Array<EngineSource | null | undefined>): EngineSource[] {
  return sources.filter((source): source is EngineSource => Boolean(source));
}

function manualSource(label: string, note = "Manual or model assumption"): EngineSource {
  return { label, source: "Manual/model input", sourceDate: "Current model", confidence: "low", note };
}

function calculatedSource(label: string, note: string): EngineSource {
  return { label, source: "Valuation engine", sourceDate: "Current calculation", confidence: "medium", note };
}

function hasUsefulHistorical(input: ValuationInput) {
  return input.historicals.some((year) => year.revenue > 0 || year.ebitda !== 0);
}

function confidenceFromDiagnostics(base: number, diagnostics: ValuationEngineDiagnostic[], sourceCount: number) {
  const penalty = diagnostics.reduce((sum, diagnostic) => sum + (diagnostic.severity === "critical" ? 30 : diagnostic.severity === "warning" ? 12 : 0), 0);
  const sourceBonus = Math.min(10, sourceCount * 2);
  return Math.max(10, Math.min(95, Math.round(base + sourceBonus - penalty)));
}

function applyPrivateDiscountRange(input: ValuationInput, equityRange: { low: number; base: number; high: number }) {
  return {
    low: calculatePrivateCompanyDiscounts(equityRange.low, input.discounts).adjustedEquityValue,
    base: calculatePrivateCompanyDiscounts(equityRange.base, input.discounts).adjustedEquityValue,
    high: calculatePrivateCompanyDiscounts(equityRange.high, input.discounts).adjustedEquityValue,
  };
}

function disabledResult(definition: ValuationEngineDefinition, weight: number, missingSources: string[]): ValuationEngineResult {
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    status: "missing-data",
    weight,
    normalizedWeight: 0,
    confidenceScore: 0,
    enterpriseValue: range(Number.NaN, Number.NaN, Number.NaN),
    equityValue: range(Number.NaN, Number.NaN, Number.NaN),
    pointEstimate: Number.NaN,
    diagnostics: missingSources.map((message) => ({ severity: "critical", message })),
    inputSources: [],
    calculationSources: [],
    manualOverrides: [],
    missingSources,
    details: {},
  };
}

function buildDcfEngine(input: ValuationInput, weight: number): ValuationEngineResult {
  const definition = valuationEngineDefinitions[0];
  const forecastYears = forecastFinancials(input.historicals, input.forecast, input.workingCapital, input.normalizationAdjustments);
  const wacc = calculateWacc({ ...input.wacc, taxRate: input.forecast.taxRate });
  const dcf = calculateDcf(forecastYears, wacc.wacc, input.terminalValue);
  const bridge = calculateEquityBridge(dcf.enterpriseValue, input.bridge);
  const adjusted = calculatePrivateCompanyDiscounts(bridge.equityValue, input.discounts);
  const diagnostics: ValuationEngineDiagnostic[] = [];

  if (!hasUsefulHistorical(input)) diagnostics.push({ severity: "critical", message: "Historical financials are missing or blank." });
  if (wacc.wacc <= input.terminalValue.perpetualGrowthRate) diagnostics.push({ severity: "critical", message: "WACC is less than or equal to terminal growth." });
  if (dcf.terminalValue.presentValueTerminalValue / Math.max(1, Math.abs(dcf.enterpriseValue)) > 0.85) diagnostics.push({ severity: "warning", message: "Terminal value contributes more than 85% of enterprise value." });

  const evRange = range(dcf.enterpriseValue * 0.9, dcf.enterpriseValue, dcf.enterpriseValue * 1.1);
  const equityRange = applyPrivateDiscountRange(input, range(bridge.equityValue * 0.9, bridge.equityValue, bridge.equityValue * 1.1));
  const inputSources = compactSources([
    sourceFromImported("Cash", input.importMetadata?.bridge?.cash),
    sourceFromImported("Debt", input.importMetadata?.bridge?.debt),
    sourceFromImported("Liabilities", input.importMetadata?.bridge?.liabilities),
    manualSource("Forecast assumptions"),
    manualSource("WACC assumptions"),
  ]);

  return {
    id: "dcf",
    name: definition.name,
    category: definition.category,
    status: diagnostics.some((item) => item.severity === "critical") ? "review" : diagnostics.length ? "review" : "ready",
    weight,
    normalizedWeight: 0,
    confidenceScore: confidenceFromDiagnostics(78, diagnostics, inputSources.length),
    enterpriseValue: evRange,
    equityValue: equityRange,
    pointEstimate: adjusted.adjustedEquityValue,
    diagnostics,
    inputSources,
    calculationSources: [calculatedSource("DCF calculation", "Existing DCF formula wrapped as an engine."), calculatedSource("EV-to-equity bridge", "Bridge applied after enterprise value.")],
    manualOverrides: [manualSource("Terminal value method", input.terminalValue.method)],
    missingSources: [],
    details: {
      wacc: wacc.wacc,
      terminalGrowth: input.terminalValue.perpetualGrowthRate,
      terminalValueContribution: dcf.terminalValue.presentValueTerminalValue / Math.max(1, Math.abs(dcf.enterpriseValue)),
    },
  };
}

function buildMarketMultiplesEngine(input: ValuationInput, weight: number, dcfEnterpriseValue: number, dcfEquityValue: number): ValuationEngineResult {
  const definition = valuationEngineDefinitions[2];
  const result = calculateMarketValuation(input.historicals, input.normalizationAdjustments, input.bridge, input.marketMultiples, dcfEnterpriseValue, dcfEquityValue);
  const diagnostics: ValuationEngineDiagnostic[] = result.diagnostics.map((item) => ({ severity: item.severity, message: item.message }));
  if (result.normalizedEbitda <= 0 && result.latestRevenue <= 0) diagnostics.push({ severity: "critical", message: "Revenue and normalized EBITDA are unavailable for market multiples." });

  const evRange = range(result.weightedMarketEnterpriseValue * 0.85, result.weightedMarketEnterpriseValue, result.weightedMarketEnterpriseValue * 1.15);
  const equityRange = applyPrivateDiscountRange(input, range(result.marketEquityBridge.equityValue * 0.85, result.marketEquityBridge.equityValue, result.marketEquityBridge.equityValue * 1.15));
  const inputSources = [manualSource("EV/EBITDA multiple"), manualSource("EV/Revenue multiple"), manualSource("EBITDA/revenue weighting")];

  return {
    id: "marketMultiples",
    name: definition.name,
    category: definition.category,
    status: diagnostics.some((item) => item.severity === "critical") ? "missing-data" : diagnostics.length ? "review" : "ready",
    weight,
    normalizedWeight: 0,
    confidenceScore: confidenceFromDiagnostics(62, diagnostics, inputSources.length),
    enterpriseValue: evRange,
    equityValue: equityRange,
    pointEstimate: equityRange.base,
    diagnostics,
    inputSources,
    calculationSources: [calculatedSource("Manual multiple valuation", "Current EV/EBITDA and EV/Revenue market approach wrapped as an engine.")],
    manualOverrides: inputSources,
    missingSources: diagnostics.some((item) => item.severity === "critical") ? ["Positive revenue or EBITDA"] : [],
    details: {
      evEbitdaMultiple: result.selectedEvEbitdaMultiple,
      evRevenueMultiple: result.selectedEvRevenueMultiple,
      weightedMarketEnterpriseValue: result.weightedMarketEnterpriseValue,
    },
  };
}

function buildCompsEngine(input: ValuationInput, weight: number, peerBenchmarks: PeerBenchmarkResult | null): ValuationEngineResult {
  const definition = valuationEngineDefinitions[1];
  const result = calculateComparableCompanies(input, peerBenchmarks);
  const evRange = range(result.enterpriseValueRange.low, result.enterpriseValueRange.base, result.enterpriseValueRange.high);
  const lowBridge = Number.isFinite(evRange.low) ? calculateEquityBridge(evRange.low, input.bridge) : null;
  const baseBridge = Number.isFinite(evRange.base) ? calculateEquityBridge(evRange.base, input.bridge) : null;
  const highBridge = Number.isFinite(evRange.high) ? calculateEquityBridge(evRange.high, input.bridge) : null;
  const equityRange = lowBridge && baseBridge && highBridge
    ? applyPrivateDiscountRange(input, range(lowBridge.equityValue, baseBridge.equityValue, highBridge.equityValue))
    : range(Number.NaN, Number.NaN, Number.NaN);
  const diagnostics: ValuationEngineDiagnostic[] = result.diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity,
    message: diagnostic.message,
  }));
  const peerSet = result.peerSet;
  const peerSource = peerSet
    ? {
        label: "BizRaport peer set",
        source: peerSet.source,
        sourceDate: peerSet.fetchedAt,
        confidence: peerSet.quality.score >= 70 ? "medium" as const : "low" as const,
        note: `${peerSet.peerCount} catalog peers; ${peerSet.sampledFinancialCount} sampled financial profiles; quality ${peerSet.quality.score}%.`,
      }
    : null;
  const multipleSource = {
    label: result.multiplesSource.label,
    source: result.multiplesSource.kind,
    sourceDate: "Current model",
    confidence: result.multiplesSource.confidence,
    note: result.multiplesSource.note,
  };

  return {
    id: "comparableCompanies",
    name: definition.name,
    category: definition.category,
    status: result.status,
    weight,
    normalizedWeight: 0,
    confidenceScore: result.confidenceScore,
    enterpriseValue: evRange,
    equityValue: equityRange,
    pointEstimate: equityRange.base,
    diagnostics,
    inputSources: compactSources([peerSource, multipleSource, manualSource("PKD industry context")]),
    calculationSources: [
      calculatedSource("Comparable Companies engine", "BizRaport supports peer screening and operating diagnostics; manual/public market multiples drive valuation."),
      calculatedSource("EV-to-equity bridge", "Bridge applied consistently after implied enterprise value."),
    ],
    manualOverrides: [
      manualSource("EV/EBITDA multiple", String(result.multiplesSource.evEbitdaMultiple ?? "missing")),
      manualSource("EV/Revenue multiple", String(result.multiplesSource.evRevenueMultiple ?? "missing")),
    ],
    missingSources: result.missingSources,
    details: {
      peerCount: peerSet?.peerCount ?? 0,
      sampledFinancialCount: peerSet?.sampledFinancialCount ?? 0,
      peerQualityScore: peerSet?.quality.score ?? 0,
      outlierRate: peerSet?.quality.outlierRate ?? null,
      evEbitdaMultiple: result.multiplesSource.evEbitdaMultiple,
      evRevenueMultiple: result.multiplesSource.evRevenueMultiple,
      impliedEvFromEbitda: result.impliedEnterpriseValue.ebitda,
      impliedEvFromRevenue: result.impliedEnterpriseValue.revenue,
      impliedWeightedEnterpriseValue: result.impliedEnterpriseValue.weighted,
    },
  };
}

function buildAssetFloorEngine(input: ValuationInput, weight: number, industryProfile: IndustryModelProfile): ValuationEngineResult {
  const definition = valuationEngineDefinitions[3];
  const assets = input.importMetadata?.assetFloor?.assets?.value;
  const equity = input.importMetadata?.assetFloor?.equity?.value;
  const liabilities = input.importMetadata?.assetFloor?.liabilities?.value;
  const sourceBase = typeof equity === "number"
    ? equity
    : typeof assets === "number" && typeof liabilities === "number"
      ? assets - liabilities
      : Number.NaN;

  if (!Number.isFinite(sourceBase)) {
    return disabledResult(definition, weight, ["Balance sheet assets/equity/liabilities are unavailable for asset floor."]);
  }

  const diagnostics: ValuationEngineDiagnostic[] = [];
  if (industryProfile.assetIntensity === "low") diagnostics.push({ severity: "info", message: "Low asset-intensity PKD profile: asset floor is a downside reference, not a primary method." });
  if (input.importMetadata?.assetFloor?.warnings?.length) diagnostics.push(...input.importMetadata.assetFloor.warnings.map((message) => ({ severity: "warning" as const, message })));
  const evRange = range(sourceBase * 0.85, sourceBase, sourceBase * 1.05);
  const equityRange = range(sourceBase * 0.85, sourceBase, sourceBase * 1.05);
  const inputSources = compactSources([
    sourceFromImported("Assets", input.importMetadata?.assetFloor?.assets),
    sourceFromImported("Equity", input.importMetadata?.assetFloor?.equity),
    sourceFromImported("Liabilities", input.importMetadata?.assetFloor?.liabilities),
  ]);

  return {
    id: "assetBasedFloor",
    name: definition.name,
    category: definition.category,
    status: diagnostics.some((item) => item.severity === "warning") ? "review" : "ready",
    weight,
    normalizedWeight: 0,
    confidenceScore: confidenceFromDiagnostics(58, diagnostics, inputSources.length),
    enterpriseValue: evRange,
    equityValue: equityRange,
    pointEstimate: sourceBase,
    diagnostics,
    inputSources,
    calculationSources: [calculatedSource("Adjusted book floor", "Uses imported equity or assets less liabilities before manual hard-asset revaluation workflow exists.")],
    manualOverrides: [],
    missingSources: [],
    details: { assets: assets ?? "unavailable", equity: equity ?? "unavailable", liabilities: liabilities ?? "unavailable" },
  };
}

function buildScenarioEngine(input: ValuationInput, weight: number): ValuationEngineResult {
  const definition = valuationEngineDefinitions[4];
  const scenarios = calculateScenarioAnalysis(input);
  const adjustedValues = scenarios.map((scenario) => scenario.adjustedEquityValue);
  const enterpriseValues = scenarios.map((scenario) => scenario.enterpriseValue);
  const diagnostics = scenarios.flatMap((scenario) => scenario.warnings.map((warning) => ({ severity: "warning" as const, message: warning.message })));
  const evRange = range(Math.min(...enterpriseValues), enterpriseValues[1] ?? enterpriseValues[0], Math.max(...enterpriseValues));
  const equityRange = range(Math.min(...adjustedValues), adjustedValues[1] ?? adjustedValues[0], Math.max(...adjustedValues));

  return {
    id: "scenarioAnalysis",
    name: definition.name,
    category: definition.category,
    status: diagnostics.length ? "review" : "ready",
    weight,
    normalizedWeight: 0,
    confidenceScore: confidenceFromDiagnostics(68, diagnostics, 4),
    enterpriseValue: evRange,
    equityValue: equityRange,
    pointEstimate: equityRange.base,
    diagnostics,
    inputSources: [manualSource("Bear/base/bull deltas"), manualSource("Forecast assumptions"), manualSource("WACC assumptions"), manualSource("Discount assumptions")],
    calculationSources: [calculatedSource("Scenario analysis", "Existing bear/base/bull scenario logic wrapped as a range engine.")],
    manualOverrides: [manualSource("Scenario deltas")],
    missingSources: [],
    details: { scenarios: scenarios.length, bear: equityRange.low, base: equityRange.base, bull: equityRange.high },
  };
}

function mulberry32(seed: number) {
  return function random() {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function buildMonteCarloEngine(input: ValuationInput, weight: number): ValuationEngineResult {
  const definition = valuationEngineDefinitions[5];
  if (!hasUsefulHistorical(input)) return disabledResult(definition, weight, ["Historical financials are required for Monte Carlo."]);

  const seedText = `${input.profile.registrationNumber}-${input.profile.valuationDate}-${input.profile.pkdCode}`;
  const seed = Array.from(seedText).reduce((sum, char) => sum + char.charCodeAt(0), 0) || 1729;
  const random = mulberry32(seed);
  const iterations = 10000;
  const outputs: number[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const shock = (scale: number) => (random() + random() + random() - 1.5) * scale;
    const simulatedInput: ValuationInput = {
      ...input,
      forecast: {
        ...input.forecast,
        revenueGrowth: input.forecast.revenueGrowth.map((value) => value + shock(0.05)),
        ebitdaMargin: input.forecast.ebitdaMargin.map((value) => Math.max(-0.3, Math.min(0.6, value + shock(0.04)))),
      },
      workingCapital: {
        ...input.workingCapital,
        nwcPctRevenue: input.workingCapital.nwcPctRevenue.map((value) => Math.max(0, Math.min(0.8, value + shock(0.04)))),
      },
      wacc: {
        ...input.wacc,
        riskFreeRate: Math.max(0, input.wacc.riskFreeRate + shock(0.015)),
        equityRiskPremium: Math.max(0, input.wacc.equityRiskPremium + shock(0.015)),
        beta: Math.max(0.1, input.wacc.beta + shock(0.25)),
      },
      terminalValue: {
        ...input.terminalValue,
        perpetualGrowthRate: Math.max(-0.03, Math.min(0.05, input.terminalValue.perpetualGrowthRate + shock(0.01))),
      },
    };
    const forecastYears = forecastFinancials(simulatedInput.historicals, simulatedInput.forecast, simulatedInput.workingCapital, simulatedInput.normalizationAdjustments);
    const wacc = calculateWacc({ ...simulatedInput.wacc, taxRate: simulatedInput.forecast.taxRate });
    const dcf = calculateDcf(forecastYears, wacc.wacc, simulatedInput.terminalValue);
    const bridge = calculateEquityBridge(dcf.enterpriseValue, simulatedInput.bridge);
    const adjusted = calculatePrivateCompanyDiscounts(bridge.equityValue, simulatedInput.discounts);
    if (Number.isFinite(adjusted.adjustedEquityValue)) outputs.push(adjusted.adjustedEquityValue);
  }

  const p10 = percentile(outputs, 0.1);
  const p25 = percentile(outputs, 0.25);
  const p50 = percentile(outputs, 0.5);
  const p75 = percentile(outputs, 0.75);
  const p90 = percentile(outputs, 0.9);
  const diagnostics: ValuationEngineDiagnostic[] = [];
  if (outputs.length < iterations * 0.95) diagnostics.push({ severity: "warning", message: "Some Monte Carlo paths produced invalid outputs and were excluded." });

  return {
    id: "monteCarlo",
    name: definition.name,
    category: definition.category,
    status: diagnostics.length ? "review" : "ready",
    weight,
    normalizedWeight: 0,
    confidenceScore: confidenceFromDiagnostics(64, diagnostics, 7),
    enterpriseValue: range(Number.NaN, Number.NaN, Number.NaN),
    equityValue: range(p10, p50, p90),
    pointEstimate: p50,
    diagnostics,
    inputSources: [manualSource("Revenue growth distribution"), manualSource("EBITDA margin distribution"), manualSource("WACC distribution"), manualSource("Terminal growth distribution"), manualSource("NWC distribution")],
    calculationSources: [calculatedSource("Monte Carlo simulation", "10,000 deterministic-seeded paths over core valuation assumptions.")],
    manualOverrides: [],
    missingSources: [],
    details: { iterations, p10, p25, p50, p75, p90 },
  };
}

function normalizeWeights(results: ValuationEngineResult[]): ValuationEngineResult[] {
  const active = results.filter((result) => result.status !== "disabled" && result.status !== "missing-data" && Number.isFinite(result.equityValue.base));
  const totalWeight = active.reduce((sum, result) => sum + result.weight * Math.max(0.1, result.confidenceScore / 100), 0);
  return results.map((result) => {
    if (!active.includes(result) || totalWeight <= 0) return { ...result, normalizedWeight: 0 };
    return { ...result, normalizedWeight: (result.weight * Math.max(0.1, result.confidenceScore / 100)) / totalWeight };
  });
}

function weightedValue(results: ValuationEngineResult[], selector: (result: ValuationEngineResult) => number) {
  return results.reduce((sum, result) => sum + selector(result) * result.normalizedWeight, 0);
}

export function runValuationEngines(input: ValuationInput, peerBenchmarks: PeerBenchmarkResult | null = null): BlendedValuationRange {
  const industryProfile = getIndustryModelProfile(input.profile.pkdCode);
  const weights = industryProfile.defaultEngineWeights;
  const forecastYears = forecastFinancials(input.historicals, input.forecast, input.workingCapital, input.normalizationAdjustments);
  const wacc = calculateWacc({ ...input.wacc, taxRate: input.forecast.taxRate });
  const dcf = calculateDcf(forecastYears, wacc.wacc, input.terminalValue);
  const bridge = calculateEquityBridge(dcf.enterpriseValue, input.bridge);
  const results = normalizeWeights([
    buildDcfEngine(input, weights.dcf ?? 0.25),
    buildCompsEngine(input, weights.comparableCompanies ?? 0.15, peerBenchmarks),
    buildMarketMultiplesEngine(input, weights.marketMultiples ?? 0.15, dcf.enterpriseValue, bridge.equityValue),
    buildAssetFloorEngine(input, weights.assetBasedFloor ?? 0.1, industryProfile),
    buildScenarioEngine(input, weights.scenarioAnalysis ?? 0.15),
    buildMonteCarloEngine(input, weights.monteCarlo ?? 0.15),
  ]);
  const activeEngines = results.filter((result) => result.normalizedWeight > 0);
  const excludedEngines = results.filter((result) => result.normalizedWeight === 0);
  const confidenceScore = activeEngines.length === 0
    ? 0
    : Math.round(activeEngines.reduce((sum, result) => sum + result.confidenceScore * result.normalizedWeight, 0));

  return {
    low: weightedValue(activeEngines, (result) => result.equityValue.low),
    base: weightedValue(activeEngines, (result) => result.equityValue.base),
    high: weightedValue(activeEngines, (result) => result.equityValue.high),
    confidenceScore,
    confidenceBand: confidenceScore >= 75 ? "high" : confidenceScore >= 55 ? "medium" : "low",
    activeEngines,
    excludedEngines,
    engineResults: results,
    industryProfile,
  };
}
