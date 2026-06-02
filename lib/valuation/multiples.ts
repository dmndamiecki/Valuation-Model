import { calculateEquityBridge, type EquityBridgeResult } from "./bridge";
import { normalizeLatestEbitda } from "./forecast";
import type { BridgeAssumptions, HistoricalYear, MarketMultiplesAssumptions, NormalizationAdjustment } from "./types";

export type MarketValuationDiagnostic = {
  code: "DCF_MARKET_VALUE_DIVERGENCE" | "EV_REVENUE_BELOW_NET_CASH";
  severity: "warning";
  message: string;
  suggestedAction: string;
};

export type MarketValuationComparison = {
  dcfEnterpriseValue: number;
  marketEnterpriseValue: number;
  enterpriseValueDifferencePct: number;
  dcfEquityValue: number;
  marketEquityValue: number;
  equityValueDifferencePct: number;
};

export type BlendedValuation = {
  dcfWeight: number;
  marketWeight: number;
  blendedEnterpriseValue: number;
  blendedEquityValue: number;
};

export type MarketValuationResult = {
  selectedEvEbitdaMultiple: number;
  selectedEvRevenueMultiple: number;
  ebitdaWeight: number;
  revenueWeight: number;
  dcfWeight: number;
  marketWeight: number;
  normalizedEbitda: number;
  latestRevenue: number;
  impliedEvFromEbitda: number;
  impliedEvFromRevenue: number;
  weightedMarketEnterpriseValue: number;
  marketEquityBridge: EquityBridgeResult;
  comparison: MarketValuationComparison;
  blendedValuation: BlendedValuation;
  diagnostics: MarketValuationDiagnostic[];
};

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? Number.NaN : numerator / denominator;
}

function calculateDifferencePct(primaryValue: number, benchmarkValue: number): number {
  return safeDivide(primaryValue - benchmarkValue, Math.abs(benchmarkValue));
}

function calculateNetCash(bridge: BridgeAssumptions): number {
  return bridge.cash + bridge.nonOperatingAssets - bridge.debt - bridge.leasing - bridge.otherDebtLikeItems - bridge.transactionCosts;
}

export function calculateMarketValuation(
  historicals: HistoricalYear[],
  normalizationAdjustments: NormalizationAdjustment[],
  bridge: BridgeAssumptions,
  market: MarketMultiplesAssumptions,
  dcfEnterpriseValue: number,
  dcfEquityValue: number,
): MarketValuationResult {
  const latest = historicals[historicals.length - 1];
  const normalizedEbitda = normalizeLatestEbitda(historicals, normalizationAdjustments);
  const latestRevenue = latest.revenue;
  const revenueWeight = 1 - market.ebitdaWeight;
  const marketWeight = 1 - market.dcfWeight;
  const impliedEvFromEbitda = normalizedEbitda * market.evEbitdaMultiple;
  const impliedEvFromRevenue = latestRevenue * market.evRevenueMultiple;
  const weightedMarketEnterpriseValue = impliedEvFromEbitda * market.ebitdaWeight + impliedEvFromRevenue * revenueWeight;
  const marketEquityBridge = calculateEquityBridge(weightedMarketEnterpriseValue, bridge);
  const enterpriseValueDifferencePct = calculateDifferencePct(dcfEnterpriseValue, weightedMarketEnterpriseValue);
  const equityValueDifferencePct = calculateDifferencePct(dcfEquityValue, marketEquityBridge.equityValue);
  const blendedEnterpriseValue = dcfEnterpriseValue * market.dcfWeight + weightedMarketEnterpriseValue * marketWeight;
  const blendedEquityValue = dcfEquityValue * market.dcfWeight + marketEquityBridge.equityValue * marketWeight;
  const diagnostics: MarketValuationDiagnostic[] = [];

  if (Math.abs(enterpriseValueDifferencePct) > 0.5) {
    diagnostics.push({
      code: "DCF_MARKET_VALUE_DIVERGENCE",
      severity: "warning",
      message: "DCF enterprise value differs from weighted market enterprise value by more than 50%.",
      suggestedAction: "Review DCF forecast assumptions, selected benchmark multiples, and whether the benchmark set is comparable.",
    });
  }

  if (impliedEvFromRevenue < calculateNetCash(bridge)) {
    diagnostics.push({
      code: "EV_REVENUE_BELOW_NET_CASH",
      severity: "warning",
      message: "EV / Revenue implied enterprise value is below net cash.",
      suggestedAction: "Check the revenue multiple, cash and debt-like item inputs, and whether excess cash should be normalized.",
    });
  }

  return {
    selectedEvEbitdaMultiple: market.evEbitdaMultiple,
    selectedEvRevenueMultiple: market.evRevenueMultiple,
    ebitdaWeight: market.ebitdaWeight,
    revenueWeight,
    dcfWeight: market.dcfWeight,
    marketWeight,
    normalizedEbitda,
    latestRevenue,
    impliedEvFromEbitda,
    impliedEvFromRevenue,
    weightedMarketEnterpriseValue,
    marketEquityBridge,
    comparison: {
      dcfEnterpriseValue,
      marketEnterpriseValue: weightedMarketEnterpriseValue,
      enterpriseValueDifferencePct,
      dcfEquityValue,
      marketEquityValue: marketEquityBridge.equityValue,
      equityValueDifferencePct,
    },
    blendedValuation: {
      dcfWeight: market.dcfWeight,
      marketWeight,
      blendedEnterpriseValue,
      blendedEquityValue,
    },
    diagnostics,
  };
}
