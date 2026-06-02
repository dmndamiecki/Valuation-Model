import { calculateEquityBridge, calculatePrivateCompanyDiscounts } from "./bridge";
import { calculateDcf } from "./dcf";
import { forecastFinancials, normalizeLatestEbitda } from "./forecast";
import { calculateWacc, type WaccResult } from "./wacc";
import type { ValuationInput } from "./types";

export type ValuationScenarioResult = ReturnType<typeof calculateScenario>;

export type ScenarioName = "Bear" | "Base" | "Bull";

export type ScenarioAssumption = {
  name: ScenarioName;
  revenueGrowthAdjustment: number;
  ebitdaMarginAdjustment: number;
  waccAdjustment: number;
  terminalGrowthAdjustment: number;
  dlomAdjustment: number;
};

export type ScenarioWarning = {
  code: "INVALID_OUTPUT" | "WACC_LESS_THAN_OR_EQUAL_TO_G";
  message: string;
};

export type ScenarioAnalysisResult = {
  name: ScenarioName;
  assumptions: ScenarioAssumption;
  enterpriseValue: number;
  equityValue: number;
  adjustedEquityValue: number;
  evToEbitda: number;
  terminalValueContribution: number;
  wacc: number;
  terminalGrowth: number;
  warnings: ScenarioWarning[];
};

export const defaultScenarioAssumptions: ScenarioAssumption[] = [
  {
    name: "Bear",
    revenueGrowthAdjustment: -0.02,
    ebitdaMarginAdjustment: -0.01,
    waccAdjustment: 0.01,
    terminalGrowthAdjustment: -0.005,
    dlomAdjustment: 0.05,
  },
  {
    name: "Base",
    revenueGrowthAdjustment: 0,
    ebitdaMarginAdjustment: 0,
    waccAdjustment: 0,
    terminalGrowthAdjustment: 0,
    dlomAdjustment: 0,
  },
  {
    name: "Bull",
    revenueGrowthAdjustment: 0.02,
    ebitdaMarginAdjustment: 0.01,
    waccAdjustment: -0.01,
    terminalGrowthAdjustment: 0.005,
    dlomAdjustment: -0.05,
  },
];

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? Number.NaN : numerator / denominator;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyScenarioAssumption(input: ValuationInput, assumption: ScenarioAssumption): ValuationInput {
  return {
    ...input,
    forecast: {
      ...input.forecast,
      revenueGrowth: input.forecast.revenueGrowth.map((growth: number) => growth + assumption.revenueGrowthAdjustment),
      ebitdaMargin: input.forecast.ebitdaMargin.map((margin: number) => margin + assumption.ebitdaMarginAdjustment),
    },
    terminalValue: {
      ...input.terminalValue,
      perpetualGrowthRate: input.terminalValue.perpetualGrowthRate + assumption.terminalGrowthAdjustment,
    },
    discounts: {
      ...input.discounts,
      lackOfMarketability: clamp(input.discounts.lackOfMarketability + assumption.dlomAdjustment, 0, 1),
    },
  };
}

function adjustWaccResult(wacc: WaccResult, adjustment: number): WaccResult {
  return {
    ...wacc,
    wacc: wacc.wacc + adjustment,
  };
}

export function calculateScenario(input: ValuationInput) {
  const forecastYears = forecastFinancials(
    input.historicals,
    input.forecast,
    input.workingCapital,
    input.normalizationAdjustments,
  );
  const wacc = calculateWacc({ ...input.wacc, taxRate: input.forecast.taxRate });
  const dcf = calculateDcf(forecastYears, wacc.wacc, input.terminalValue);
  const bridge = calculateEquityBridge(dcf.enterpriseValue, input.bridge);
  const discounts = calculatePrivateCompanyDiscounts(bridge.equityValue, input.discounts);

  return { forecastYears, wacc, dcf, bridge, discounts };
}

export function calculateScenarioAnalysis(
  input: ValuationInput,
  assumptions: ScenarioAssumption[] = defaultScenarioAssumptions,
): ScenarioAnalysisResult[] {
  const normalizedEbitda = normalizeLatestEbitda(input.historicals, input.normalizationAdjustments);

  return assumptions.map((assumption) => {
    const scenarioInput = applyScenarioAssumption(input, assumption);
    const forecastYears = forecastFinancials(
      scenarioInput.historicals,
      scenarioInput.forecast,
      scenarioInput.workingCapital,
      scenarioInput.normalizationAdjustments,
    );
    const baseWacc = calculateWacc({ ...scenarioInput.wacc, taxRate: scenarioInput.forecast.taxRate });
    const wacc = adjustWaccResult(baseWacc, assumption.waccAdjustment);
    const dcf = calculateDcf(forecastYears, wacc.wacc, scenarioInput.terminalValue);
    const bridge = calculateEquityBridge(dcf.enterpriseValue, scenarioInput.bridge);
    const discounts = calculatePrivateCompanyDiscounts(bridge.equityValue, scenarioInput.discounts);
    const terminalValueContribution = safeDivide(dcf.terminalValue.presentValueTerminalValue, dcf.enterpriseValue);
    const warnings: ScenarioWarning[] = [];

    if (wacc.wacc <= scenarioInput.terminalValue.perpetualGrowthRate || !dcf.terminalValue.isGordonGrowthValid) {
      warnings.push({
        code: "WACC_LESS_THAN_OR_EQUAL_TO_G",
        message: `${assumption.name}: WACC is less than or equal to terminal growth.`,
      });
    }

    if (
      !Number.isFinite(dcf.enterpriseValue) ||
      !Number.isFinite(bridge.equityValue) ||
      !Number.isFinite(discounts.adjustedEquityValue) ||
      !Number.isFinite(terminalValueContribution)
    ) {
      warnings.push({ code: "INVALID_OUTPUT", message: `${assumption.name}: scenario output is not meaningful.` });
    }

    return {
      name: assumption.name,
      assumptions: assumption,
      enterpriseValue: dcf.enterpriseValue,
      equityValue: bridge.equityValue,
      adjustedEquityValue: discounts.adjustedEquityValue,
      evToEbitda: safeDivide(dcf.enterpriseValue, normalizedEbitda),
      terminalValueContribution,
      wacc: wacc.wacc,
      terminalGrowth: scenarioInput.terminalValue.perpetualGrowthRate,
      warnings,
    };
  });
}

export function createScenario(input: ValuationInput, overrides: Partial<ValuationInput>): ValuationInput {
  return {
    ...input,
    ...overrides,
    forecast: { ...input.forecast, ...overrides.forecast },
    workingCapital: { ...input.workingCapital, ...overrides.workingCapital },
    wacc: { ...input.wacc, ...overrides.wacc },
    terminalValue: { ...input.terminalValue, ...overrides.terminalValue },
    bridge: { ...input.bridge, ...overrides.bridge },
    discounts: { ...input.discounts, ...overrides.discounts },
  };
}
