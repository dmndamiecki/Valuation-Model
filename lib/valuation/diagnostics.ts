import { calculateEquityBridge } from "./bridge";
import { calculateDcf } from "./dcf";
import { forecastFinancials, normalizeLatestEbitda, sumNormalizationAdjustments } from "./forecast";
import type { ValuationInput } from "./types";
import { calculateWacc } from "./wacc";

export type DiagnosticSeverity = "info" | "warning" | "critical";
export type DiagnosticArea = "Forecast" | "WACC" | "Terminal Value" | "Bridge" | "Discounts" | "Normalization";

export type ValuationDiagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  area: DiagnosticArea;
  message: string;
  suggestedAction: string;
};

export type DiagnosticsSummary = {
  diagnostics: ValuationDiagnostic[];
  bySeverity: Record<DiagnosticSeverity, ValuationDiagnostic[]>;
  warningCount: number;
  criticalCount: number;
};

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? Number.NaN : numerator / denominator;
}

function calculateRevenueCagr(startRevenue: number, endRevenue: number, years: number): number {
  if (startRevenue <= 0 || endRevenue <= 0 || years <= 0) {
    return Number.NaN;
  }

  return Math.pow(endRevenue / startRevenue, 1 / years) - 1;
}

function buildSummary(diagnostics: ValuationDiagnostic[]): DiagnosticsSummary {
  const bySeverity: Record<DiagnosticSeverity, ValuationDiagnostic[]> = {
    critical: diagnostics.filter((diagnostic) => diagnostic.severity === "critical"),
    warning: diagnostics.filter((diagnostic) => diagnostic.severity === "warning"),
    info: diagnostics.filter((diagnostic) => diagnostic.severity === "info"),
  };

  return {
    diagnostics,
    bySeverity,
    warningCount: bySeverity.warning.length,
    criticalCount: bySeverity.critical.length,
  };
}

export function calculateValuationDiagnostics(input: ValuationInput): DiagnosticsSummary {
  const diagnostics: ValuationDiagnostic[] = [];
  const forecastYears = forecastFinancials(
    input.historicals,
    input.forecast,
    input.workingCapital,
    input.normalizationAdjustments,
  );
  const wacc = calculateWacc({ ...input.wacc, taxRate: input.forecast.taxRate });
  const dcf = calculateDcf(forecastYears, wacc.wacc, input.terminalValue);
  const bridge = calculateEquityBridge(dcf.enterpriseValue, input.bridge);
  const latestHistorical = input.historicals[input.historicals.length - 1];
  const finalForecast = forecastYears[forecastYears.length - 1];
  const revenueCagr = calculateRevenueCagr(latestHistorical.revenue, finalForecast.revenue, forecastYears.length);
  const terminalValueContribution = safeDivide(dcf.terminalValue.presentValueTerminalValue, dcf.enterpriseValue);
  const normalizedEbitda = normalizeLatestEbitda(input.historicals, input.normalizationAdjustments);
  const totalDebtLikeItems = bridge.debt + bridge.leasing + bridge.otherDebtLikeItems;
  const debtToEbitda = safeDivide(totalDebtLikeItems, normalizedEbitda);
  const normalizationAdjustmentRatio = safeDivide(
    Math.abs(sumNormalizationAdjustments(input.normalizationAdjustments)),
    Math.abs(latestHistorical.ebitda),
  );

  if (revenueCagr > 0.3) {
    diagnostics.push({
      code: "REVENUE_CAGR_ABOVE_30_PERCENT",
      severity: "critical",
      area: "Forecast",
      message: `Forecast revenue CAGR is ${(revenueCagr * 100).toFixed(1)}%, above the 30% QC threshold.`,
      suggestedAction: "Re-check volume, price, market share, and capacity assumptions; consider phasing growth more gradually.",
    });
  }

  for (const year of forecastYears) {
    if (year.ebitdaMargin > 0.4) {
      diagnostics.push({
        code: `EBITDA_MARGIN_ABOVE_40_PERCENT_${year.year}`,
        severity: "critical",
        area: "Forecast",
        message: `${year.year} EBITDA margin is ${(year.ebitdaMargin * 100).toFixed(1)}%, above 40%.`,
        suggestedAction: "Validate gross margin, operating leverage, and normalization assumptions against comparable private companies.",
      });
    }

    if (year.ebitdaMargin < 0.05) {
      diagnostics.push({
        code: `EBITDA_MARGIN_BELOW_5_PERCENT_${year.year}`,
        severity: "warning",
        area: "Forecast",
        message: `${year.year} EBITDA margin is ${(year.ebitdaMargin * 100).toFixed(1)}%, below 5%.`,
        suggestedAction: "Confirm the business is not structurally under-earning or model a turnaround case separately.",
      });
    }

    const capexToSales = safeDivide(year.capex, year.revenue);
    if (capexToSales < 0.01) {
      diagnostics.push({
        code: `CAPEX_SALES_BELOW_1_PERCENT_${year.year}`,
        severity: "warning",
        area: "Forecast",
        message: `${year.year} CAPEX / Sales is ${(capexToSales * 100).toFixed(1)}%, below 1%.`,
        suggestedAction: "Review maintenance capex needs and ensure the forecast does not understate reinvestment.",
      });
    }

    if (capexToSales > 0.2) {
      diagnostics.push({
        code: `CAPEX_SALES_ABOVE_20_PERCENT_${year.year}`,
        severity: "warning",
        area: "Forecast",
        message: `${year.year} CAPEX / Sales is ${(capexToSales * 100).toFixed(1)}%, above 20%.`,
        suggestedAction: "Verify whether elevated capex is temporary growth capex or should be modeled as a separate investment program.",
      });
    }

    if (year.freeCashFlow < 0) {
      diagnostics.push({
        code: `NEGATIVE_FCFF_${year.year}`,
        severity: "critical",
        area: "Forecast",
        message: `${year.year} FCFF is negative.`,
        suggestedAction: "Review margin, tax, capex, and working-capital assumptions; consider whether additional financing is required.",
      });
    }
  }

  if (wacc.wacc < 0.08) {
    diagnostics.push({
      code: "WACC_BELOW_8_PERCENT",
      severity: "critical",
      area: "WACC",
      message: `WACC is ${(wacc.wacc * 100).toFixed(1)}%, below 8%.`,
      suggestedAction: "Revisit private-company risk, size premium, company-specific risk, beta, and debt cost assumptions.",
    });
  }

  if (wacc.wacc > 0.3) {
    diagnostics.push({
      code: "WACC_ABOVE_30_PERCENT",
      severity: "critical",
      area: "WACC",
      message: `WACC is ${(wacc.wacc * 100).toFixed(1)}%, above 30%.`,
      suggestedAction: "Confirm the discount rate reflects a going-concern DCF rather than a distressed or venture-style return case.",
    });
  }

  if (input.terminalValue.perpetualGrowthRate > 0.03) {
    diagnostics.push({
      code: "TERMINAL_GROWTH_ABOVE_3_PERCENT",
      severity: "warning",
      area: "Terminal Value",
      message: `Terminal growth is ${(input.terminalValue.perpetualGrowthRate * 100).toFixed(1)}%, above 3%.`,
      suggestedAction: "Benchmark perpetual growth against long-term inflation and GDP expectations; consider reducing terminal growth.",
    });
  }

  if (terminalValueContribution > 0.85) {
    diagnostics.push({
      code: "TERMINAL_VALUE_CONTRIBUTION_ABOVE_85_PERCENT",
      severity: "warning",
      area: "Terminal Value",
      message: `PV of terminal value is ${(terminalValueContribution * 100).toFixed(1)}% of enterprise value, above 85%.`,
      suggestedAction: "Extend the explicit forecast period, reduce terminal assumptions, or add support for steady-state economics.",
    });
  }

  if (forecastYears.every((year) => year.depreciation > year.capex)) {
    diagnostics.push({
      code: "DA_HIGHER_THAN_CAPEX_ALL_YEARS",
      severity: "info",
      area: "Forecast",
      message: "D&A is higher than CAPEX in every forecast year.",
      suggestedAction: "Confirm this reflects asset base run-off rather than understated maintenance capex.",
    });
  }

  if (debtToEbitda > 4) {
    diagnostics.push({
      code: "DEBT_TO_EBITDA_ABOVE_4X",
      severity: "critical",
      area: "Bridge",
      message: `Debt-like items / normalized EBITDA is ${debtToEbitda.toFixed(1)}x, above 4.0x.`,
      suggestedAction: "Review debt-like items and assess whether leverage creates solvency, refinancing, or equity impairment risk.",
    });
  }

  if (normalizationAdjustmentRatio > 0.3) {
    diagnostics.push({
      code: "NORMALIZATION_ADJUSTMENT_ABOVE_30_PERCENT_EBITDA",
      severity: "warning",
      area: "Normalization",
      message: `Normalization adjustments equal ${(normalizationAdjustmentRatio * 100).toFixed(1)}% of reported EBITDA, above 30%.`,
      suggestedAction: "Support each adjustment with evidence and consider a sensitivity excluding less certain add-backs.",
    });
  }

  if (input.discounts.lackOfMarketability > 0.3) {
    diagnostics.push({
      code: "DLOM_ABOVE_30_PERCENT",
      severity: "warning",
      area: "Discounts",
      message: `DLOM is ${(input.discounts.lackOfMarketability * 100).toFixed(1)}%, above 30%.`,
      suggestedAction: "Benchmark the marketability discount against observed transaction restrictions and expected holding period.",
    });
  }

  if (input.discounts.customerConcentrationDiscount > 0.1) {
    diagnostics.push({
      code: "CUSTOMER_CONCENTRATION_DISCOUNT_ABOVE_10_PERCENT",
      severity: "warning",
      area: "Discounts",
      message: `Customer concentration discount is ${(input.discounts.customerConcentrationDiscount * 100).toFixed(1)}%, above 10%.`,
      suggestedAction: "Validate customer revenue concentration, contract durability, churn risk, and mitigation plans.",
    });
  }

  if (input.discounts.keyPersonDiscount > 0.1) {
    diagnostics.push({
      code: "KEY_PERSON_DISCOUNT_ABOVE_10_PERCENT",
      severity: "warning",
      area: "Discounts",
      message: `Key person discount is ${(input.discounts.keyPersonDiscount * 100).toFixed(1)}%, above 10%.`,
      suggestedAction: "Review management depth, succession planning, employment agreements, and transferability of relationships.",
    });
  }

  return buildSummary(diagnostics);
}
