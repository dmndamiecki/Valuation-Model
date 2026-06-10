import type { EquityBridgeResult, DiscountResult } from "./bridge";
import type { DcfResult, DcfYear } from "./dcf";
import type { ForecastYear } from "./forecast";
import type { TerminalValueAssumptions, ValuationInput } from "./types";
import type { WaccResult } from "./wacc";

export type ExecutiveSummary = {
  enterpriseValue: number;
  equityValue: number;
  adjustedEquityValue: number;
  evToNormalizedEbitda: number;
  equityToNormalizedEbitda: number;
  impliedWacc: number;
  terminalGrowth: number;
  terminalValueContribution: number;
};

export type TerminalValueBreakdown = {
  method: TerminalValueAssumptions["method"];
  finalYearFcff: number;
  nextYearFcff: number;
  finalYearEbitda: number;
  wacc: number;
  terminalGrowth: number;
  terminalSpread: number;
  gordonTerminalValue: number;
  exitMultipleTerminalValue: number;
  selectedTerminalValue: number;
  terminalValue: number;
  presentValueTerminalValue: number;
  impliedExitMultipleFromGordon: number;
  impliedPerpetualGrowthFromExitMultiple: number;
  terminalValueMethodGapPct: number;
  isGordonGrowthValid: boolean;
};

export type EvToEquityBridgeOutput = {
  enterpriseValue: number;
  cash: number;
  debt: number;
  leasing: number;
  otherDebtLikeItems: number;
  transactionCosts: number;
  nonOperatingAssets: number;
  equityValue: number;
};

export type PrivateCompanyAdjustmentBridge = {
  equityValueBeforeDiscounts: number;
  lackOfMarketabilityDiscountAmount: number;
  keyPersonDiscountAmount: number;
  customerConcentrationDiscountAmount: number;
  adjustedEquityValue: number;
};

export type ValuationWarningCode =
  | "WACC_LESS_THAN_OR_EQUAL_TO_G"
  | "NEGATIVE_FCFF"
  | "TERMINAL_VALUE_ABOVE_85_PERCENT_OF_EV"
  | "DEBT_EXCEEDS_EV"
  | "DLOM_ABOVE_30_PERCENT"
  | "SPECIFIC_RISK_PREMIUM_ABOVE_5_PERCENT";

export type ValuationWarning = {
  code: ValuationWarningCode;
  message: string;
};

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? Number.NaN : numerator / denominator;
}

function calculateImpliedPerpetualGrowthFromTerminalValue(terminalValue: number, wacc: number, finalYearFcff: number): number {
  if (!Number.isFinite(terminalValue) || terminalValue <= 0 || !Number.isFinite(finalYearFcff)) {
    return Number.NaN;
  }

  return (terminalValue * wacc - finalYearFcff) / (terminalValue + finalYearFcff);
}

export function calculateExecutiveSummary(
  dcf: DcfResult,
  bridge: EquityBridgeResult,
  discounts: DiscountResult,
  normalizedEbitda: number,
  wacc: WaccResult,
  terminal: TerminalValueAssumptions,
): ExecutiveSummary {
  return {
    enterpriseValue: dcf.enterpriseValue,
    equityValue: bridge.equityValue,
    adjustedEquityValue: discounts.adjustedEquityValue,
    evToNormalizedEbitda: safeDivide(dcf.enterpriseValue, normalizedEbitda),
    equityToNormalizedEbitda: safeDivide(bridge.equityValue, normalizedEbitda),
    impliedWacc: wacc.wacc,
    terminalGrowth: terminal.perpetualGrowthRate,
    terminalValueContribution: safeDivide(dcf.terminalValue.presentValueTerminalValue, dcf.enterpriseValue),
  };
}

export function calculateTerminalValueBreakdown(
  dcf: DcfResult,
  wacc: number,
  terminal: TerminalValueAssumptions,
): TerminalValueBreakdown {
  const finalYear = dcf.forecastYears[dcf.forecastYears.length - 1];
  const impliedExitMultipleFromGordon = safeDivide(dcf.terminalValue.gordonTerminalValue, finalYear.ebitda);
  const impliedPerpetualGrowthFromExitMultiple = calculateImpliedPerpetualGrowthFromTerminalValue(
    dcf.terminalValue.exitMultipleTerminalValue,
    wacc,
    finalYear.freeCashFlow,
  );
  const terminalValueMethodGapPct = safeDivide(
    dcf.terminalValue.gordonTerminalValue - dcf.terminalValue.exitMultipleTerminalValue,
    Math.abs(dcf.terminalValue.exitMultipleTerminalValue),
  );

  return {
    method: terminal.method,
    finalYearFcff: finalYear.freeCashFlow,
    nextYearFcff: finalYear.freeCashFlow * (1 + terminal.perpetualGrowthRate),
    finalYearEbitda: finalYear.ebitda,
    wacc,
    terminalGrowth: terminal.perpetualGrowthRate,
    terminalSpread: dcf.terminalValue.gordonSpread,
    gordonTerminalValue: dcf.terminalValue.gordonTerminalValue,
    exitMultipleTerminalValue: dcf.terminalValue.exitMultipleTerminalValue,
    selectedTerminalValue: dcf.terminalValue.selectedTerminalValue,
    terminalValue: dcf.terminalValue.selectedTerminalValue,
    presentValueTerminalValue: dcf.terminalValue.presentValueTerminalValue,
    impliedExitMultipleFromGordon,
    impliedPerpetualGrowthFromExitMultiple,
    terminalValueMethodGapPct,
    isGordonGrowthValid: dcf.terminalValue.isGordonGrowthValid,
  };
}

export function calculateEvToEquityBridgeOutput(bridge: EquityBridgeResult): EvToEquityBridgeOutput {
  return {
    enterpriseValue: bridge.enterpriseValue,
    cash: bridge.cash,
    debt: bridge.debt,
    leasing: bridge.leasing,
    otherDebtLikeItems: bridge.otherDebtLikeItems,
    transactionCosts: bridge.transactionCosts,
    nonOperatingAssets: bridge.nonOperatingAssets,
    equityValue: bridge.equityValue,
  };
}

export function calculatePrivateCompanyAdjustmentBridge(
  bridge: EquityBridgeResult,
  discounts: DiscountResult,
): PrivateCompanyAdjustmentBridge {
  return {
    equityValueBeforeDiscounts: bridge.equityValue,
    lackOfMarketabilityDiscountAmount: discounts.lackOfMarketabilityDiscountAmount,
    keyPersonDiscountAmount: discounts.keyPersonDiscountAmount,
    customerConcentrationDiscountAmount: discounts.customerConcentrationDiscountAmount,
    adjustedEquityValue: discounts.adjustedEquityValue,
  };
}

export function calculateValuationWarnings(input: ValuationInput, dcf: DcfResult, bridge: EquityBridgeResult): ValuationWarning[] {
  const warnings: ValuationWarning[] = [];
  const hasNegativeFcff = dcf.forecastYears.some((year: ForecastYear | DcfYear) => year.freeCashFlow < 0);
  const terminalValueContribution = safeDivide(dcf.terminalValue.presentValueTerminalValue, dcf.enterpriseValue);
  const totalDebtLikeItems = bridge.debt + bridge.leasing + bridge.otherDebtLikeItems;

  if (dcf.terminalValue.gordonSpread <= 0) {
    warnings.push({ code: "WACC_LESS_THAN_OR_EQUAL_TO_G", message: "WACC is less than or equal to terminal growth; Gordon Growth terminal value is invalid." });
  }

  if (hasNegativeFcff) {
    warnings.push({ code: "NEGATIVE_FCFF", message: "At least one forecast year has negative FCFF." });
  }

  if (terminalValueContribution > 0.85) {
    warnings.push({ code: "TERMINAL_VALUE_ABOVE_85_PERCENT_OF_EV", message: "PV of terminal value contributes more than 85% of enterprise value." });
  }

  if (totalDebtLikeItems > dcf.enterpriseValue) {
    warnings.push({ code: "DEBT_EXCEEDS_EV", message: "Debt, leasing and other debt-like items exceed enterprise value." });
  }

  if (input.discounts.lackOfMarketability > 0.3) {
    warnings.push({ code: "DLOM_ABOVE_30_PERCENT", message: "DLOM is above 30%." });
  }

  if (input.wacc.companySpecificRiskPremium > 0.05) {
    warnings.push({ code: "SPECIFIC_RISK_PREMIUM_ABOVE_5_PERCENT", message: "Company-specific risk premium is above 5%." });
  }

  return warnings;
}
