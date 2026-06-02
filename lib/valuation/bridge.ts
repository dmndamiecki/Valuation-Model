import type { BridgeAssumptions, DiscountAssumptions } from "./types";

export type EquityBridgeResult = {
  enterpriseValue: number;
  cash: number;
  debt: number;
  leasing: number;
  otherDebtLikeItems: number;
  transactionCosts: number;
  nonOperatingAssets: number;
  equityValue: number;
};

export type DiscountResult = {
  lackOfMarketability: number;
  keyPersonDiscount: number;
  customerConcentrationDiscount: number;
  combinedDiscountRate: number;
  keyPersonDiscountAmount: number;
  customerConcentrationDiscountAmount: number;
  lackOfMarketabilityDiscountAmount: number;
  keyPersonAdjustedEquityValue: number;
  customerConcentrationAdjustedEquityValue: number;
  marketabilityAdjustedEquityValue: number;
  totalDiscountAmount: number;
  adjustedEquityValue: number;
};

export function calculateEquityBridge(enterpriseValue: number, bridge: BridgeAssumptions): EquityBridgeResult {
  const equityValue =
    enterpriseValue +
    bridge.cash +
    bridge.nonOperatingAssets -
    bridge.debt -
    bridge.leasing -
    bridge.otherDebtLikeItems -
    bridge.transactionCosts;
  return { enterpriseValue, ...bridge, equityValue };
}

export function calculatePrivateCompanyDiscounts(equityValue: number, discounts: DiscountAssumptions): DiscountResult {
  const keyPersonDiscountAmount = equityValue * discounts.keyPersonDiscount;
  const keyPersonAdjustedEquityValue = equityValue - keyPersonDiscountAmount;
  const customerConcentrationDiscountAmount = keyPersonAdjustedEquityValue * discounts.customerConcentrationDiscount;
  const customerConcentrationAdjustedEquityValue = keyPersonAdjustedEquityValue - customerConcentrationDiscountAmount;
  const lackOfMarketabilityDiscountAmount = customerConcentrationAdjustedEquityValue * discounts.lackOfMarketability;
  const marketabilityAdjustedEquityValue = customerConcentrationAdjustedEquityValue - lackOfMarketabilityDiscountAmount;
  const combinedDiscountRate = equityValue === 0 ? 0 : 1 - marketabilityAdjustedEquityValue / equityValue;
  const totalDiscountAmount = equityValue - marketabilityAdjustedEquityValue;

  return {
    ...discounts,
    combinedDiscountRate,
    keyPersonDiscountAmount,
    customerConcentrationDiscountAmount,
    lackOfMarketabilityDiscountAmount,
    keyPersonAdjustedEquityValue,
    customerConcentrationAdjustedEquityValue,
    marketabilityAdjustedEquityValue,
    totalDiscountAmount,
    adjustedEquityValue: marketabilityAdjustedEquityValue,
  };
}
