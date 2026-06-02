import { calculateEquityBridge, calculatePrivateCompanyDiscounts } from "./bridge";
import { calculateDcf } from "./dcf";
import { forecastFinancials } from "./forecast";
import type { ValuationInput } from "./types";

export type SensitivityCell = {
  wacc: number;
  terminalGrowth: number;
  enterpriseValue: number;
  equityValue: number;
  adjustedEquityValue: number;
  isValid: boolean;
};

export function buildSensitivityTable(
  input: ValuationInput,
  waccCases: number[],
  terminalGrowthCases: number[],
): SensitivityCell[][] {
  const forecastYears = forecastFinancials(
    input.historicals,
    input.forecast,
    input.workingCapital,
    input.normalizationAdjustments,
  );

  return terminalGrowthCases.map((terminalGrowth) =>
    waccCases.map((wacc) => {
      const dcf = calculateDcf(forecastYears, wacc, {
        ...input.terminalValue,
        perpetualGrowthRate: terminalGrowth,
        method: "gordon",
      });
      const bridge = calculateEquityBridge(dcf.enterpriseValue, input.bridge);
      const discounts = calculatePrivateCompanyDiscounts(bridge.equityValue, input.discounts);

      return {
        wacc,
        terminalGrowth,
        enterpriseValue: dcf.enterpriseValue,
        equityValue: bridge.equityValue,
        adjustedEquityValue: discounts.adjustedEquityValue,
        isValid: dcf.terminalValue.isGordonGrowthValid,
      };
    }),
  );
}

export function buildCenteredSensitivityCases(base: number, step: number, points = 5): number[] {
  const midpoint = Math.floor(points / 2);
  return Array.from({ length: points }, (_, index) => base + (index - midpoint) * step);
}
