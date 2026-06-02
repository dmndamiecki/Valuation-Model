import type { WaccAssumptions } from "./types";

export type WaccResult = {
  costOfEquity: number;
  afterTaxCostOfDebt: number;
  debtWeight: number;
  equityWeight: number;
  wacc: number;
};

export function calculateCostOfEquity(input: WaccAssumptions): number {
  return input.riskFreeRate + input.beta * input.equityRiskPremium + input.sizePremium + input.companySpecificRiskPremium;
}

export function calculateWacc(input: WaccAssumptions): WaccResult {
  const debtWeight = input.targetDebtPctCapital;
  const equityWeight = 1 - debtWeight;
  const costOfEquity = calculateCostOfEquity(input);
  const afterTaxCostOfDebt = input.preTaxCostOfDebt * (1 - input.taxRate);
  const wacc = equityWeight * costOfEquity + debtWeight * afterTaxCostOfDebt;

  return { costOfEquity, afterTaxCostOfDebt, debtWeight, equityWeight, wacc };
}
