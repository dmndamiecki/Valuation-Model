import { calculateEquityBridge } from "./bridge";
import { calculateDcf } from "./dcf";
import { forecastFinancials, normalizeLatestEbitda, sumNormalizationAdjustments } from "./forecast";
import { calculateMarketValuation } from "./multiples";
import type { ValuationInput } from "./types";
import { calculateWacc } from "./wacc";
import { getFinancialCraftLiquidityBenchmark } from "../data-sources/financialcraft-liquidity";

export type DiagnosticSeverity = "info" | "warning" | "critical";
export type DiagnosticArea = "Forecast" | "WACC" | "Terminal Value" | "Bridge" | "Discounts" | "Normalization" | "Market Approach" | "Sources";
export type ReadinessPosture = "review-ready" | "screen-grade" | "not-decision-ready";

export type ValuationDiagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  area: DiagnosticArea;
  message: string;
  suggestedAction: string;
};

export type ReadinessAssessment = {
  posture: ReadinessPosture;
  calculationIntegrity: "pass" | "warning" | "fail";
  decisionReadiness: "review-ready" | "screen-grade" | "not-decision-ready";
  headline: string;
  blockers: string[];
  caveats: string[];
  nextActions: string[];
};

export type DiagnosticsSummary = {
  diagnostics: ValuationDiagnostic[];
  bySeverity: Record<DiagnosticSeverity, ValuationDiagnostic[]>;
  warningCount: number;
  criticalCount: number;
  readiness: ReadinessAssessment;
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

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function buildReadinessAssessment(diagnostics: ValuationDiagnostic[]): ReadinessAssessment {
  const critical = diagnostics.filter((diagnostic) => diagnostic.severity === "critical");
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  const sourceWarnings = diagnostics.filter((diagnostic) => diagnostic.area === "Sources" || diagnostic.code.includes("MANUAL") || diagnostic.code.includes("MISSING"));
  const calculationIntegrity = critical.length > 0 ? "fail" : warnings.length > 0 ? "warning" : "pass";
  const decisionReadiness: ReadinessAssessment["decisionReadiness"] =
    critical.length > 0 ? "not-decision-ready" : sourceWarnings.length > 0 || warnings.length > 0 ? "screen-grade" : "review-ready";
  const posture: ReadinessPosture = decisionReadiness;
  const blockers = critical.map((diagnostic) => `${diagnostic.area}: ${diagnostic.message}`);
  const caveats = warnings.map((diagnostic) => `${diagnostic.area}: ${diagnostic.message}`);
  const nextActions = (critical.length > 0 ? critical : warnings).slice(0, 5).map((diagnostic) => diagnostic.suggestedAction);
  const headline =
    posture === "not-decision-ready"
      ? "Calculation or assumption issues prevent decision use until remediated."
      : posture === "screen-grade"
        ? "Model calculates, but source support or assumption quality limits the output to screening use."
        : "No critical or warning diagnostics are currently triggered; output is ready for review subject to source evidence.";

  return { posture, calculationIntegrity, decisionReadiness, headline, blockers, caveats, nextActions };
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
    readiness: buildReadinessAssessment(diagnostics),
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
  const marketValuation = calculateMarketValuation(
    input.historicals,
    input.normalizationAdjustments,
    input.bridge,
    input.marketMultiples,
    dcf.enterpriseValue,
    bridge.equityValue,
  );
  const latestHistorical = input.historicals[input.historicals.length - 1];
  const finalForecast = forecastYears[forecastYears.length - 1];
  const revenueCagr = calculateRevenueCagr(latestHistorical.revenue, finalForecast.revenue, forecastYears.length);
  const terminalValueContribution = safeDivide(dcf.terminalValue.presentValueTerminalValue, dcf.enterpriseValue);
  const normalizedEbitda = normalizeLatestEbitda(input.historicals, input.normalizationAdjustments);
  const totalDebtLikeItems = bridge.debt + bridge.leasing + bridge.otherDebtLikeItems;
  const liquidityBenchmark = getFinancialCraftLiquidityBenchmark(Math.max(bridge.equityValue, 0));
  const debtToEbitda = safeDivide(totalDebtLikeItems, normalizedEbitda);
  const importedLiabilities = input.importMetadata?.bridge?.liabilities?.value ?? input.importMetadata?.assetFloor?.liabilities?.value ?? null;
  const evEqualsEquity = Math.abs(bridge.equityValue - dcf.enterpriseValue) < 1;
  const normalizationAdjustmentRatio = safeDivide(
    Math.abs(sumNormalizationAdjustments(input.normalizationAdjustments)),
    Math.abs(latestHistorical.ebitda),
  );
  const terminalSpread = wacc.wacc - input.terminalValue.perpetualGrowthRate;
  const historicalYears = input.historicals.map((year) => year.year);
  const historicalYearsAreSequential = historicalYears.every((year, index) => index === 0 || year === historicalYears[index - 1] + 1);

  if (isBlank(input.profile.companyName) || isBlank(input.profile.industry)) {
    diagnostics.push({
      code: "MISSING_COMPANY_CONTEXT",
      severity: "critical",
      area: "Sources",
      message: "Company name or industry is missing.",
      suggestedAction: "Complete the company profile before relying on valuation output.",
    });
  }

  if (isBlank(input.profile.registrationNumber) && isBlank(input.profile.nip) && isBlank(input.profile.regon)) {
    diagnostics.push({
      code: "MISSING_REGISTRY_IDENTIFIER",
      severity: "warning",
      area: "Sources",
      message: "No KRS, NIP, REGON, or equivalent identifier is captured.",
      suggestedAction: "Add a registry identifier or explicitly label the company profile as manually sourced.",
    });
  }

  if (!historicalYearsAreSequential) {
    diagnostics.push({
      code: "HISTORICAL_YEARS_NOT_SEQUENTIAL",
      severity: "warning",
      area: "Sources",
      message: "Historical financial years are not sequential.",
      suggestedAction: "Verify imported periods and align the historical base before forecasting.",
    });
  }

  if (input.historicals.every((year) => year.revenue === 0 && year.ebitda === 0)) {
    diagnostics.push({
      code: "MISSING_HISTORICAL_FINANCIALS",
      severity: "critical",
      area: "Sources",
      message: "Historical revenue and EBITDA are blank across all periods.",
      suggestedAction: "Import or enter historical financial statements before using the model.",
    });
  }

  if (input.importMetadata?.bridge?.cashUnavailable) {
    diagnostics.push({
      code: "BIZRAPORT_CASH_UNAVAILABLE",
      severity: "warning",
      area: "Bridge",
      message: "Cash is unavailable from BizRaport; bridge cash may be a zero fallback or manual input.",
      suggestedAction: "Review the latest balance sheet and manually enter cash or cash-like assets before relying on equity value.",
    });
  }

  if (input.importMetadata?.bridge?.debtUnavailable) {
    diagnostics.push({
      code: "BIZRAPORT_DEBT_UNAVAILABLE",
      severity: input.importMetadata.bridge.liabilitiesUsedAsDebtProxy ? "warning" : "critical",
      area: "Bridge",
      message: "Financial debt is unavailable from BizRaport.",
      suggestedAction: "Manually review loans, leases, factoring, related-party debt, and other debt-like items.",
    });
  }

  if (input.importMetadata?.bridge?.liabilitiesUsedAsDebtProxy) {
    diagnostics.push({
      code: "TOTAL_LIABILITIES_USED_AS_DEBT_PROXY",
      severity: "warning",
      area: "Bridge",
      message: "Total liabilities used as conservative debt-like proxy; review actual financial debt manually.",
      suggestedAction: "Replace the proxy with true financial debt, leasing, working-capital liabilities, and other debt-like items once the liability split is available.",
    });
  }

  if (importedLiabilities !== null && importedLiabilities > 0 && totalDebtLikeItems === 0 && evEqualsEquity) {
    diagnostics.push({
      code: "EV_EQUALS_EQUITY_WITH_IMPORTED_LIABILITIES",
      severity: "critical",
      area: "Bridge",
      message: "Enterprise value equals equity value even though imported liabilities are greater than zero.",
      suggestedAction: "Populate the EV-to-equity bridge from imported liabilities or manually confirm that liabilities are not debt-like.",
    });
  }

  if (input.importMetadata?.workingCapital?.derivedFromIncompleteFields) {
    diagnostics.push({
      code: "NWC_DERIVED_FROM_INCOMPLETE_FIELDS",
      severity: "warning",
      area: "Forecast",
      message: "Net working capital was derived from incomplete BizRaport balance sheet fields.",
      suggestedAction: "Review receivables, inventory, payables/current liabilities, and NWC percent of revenue before relying on FCFF.",
    });
  }

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

  if (input.wacc.companySpecificRiskPremium > 0.05 && (input.discounts.keyPersonDiscount > 0 || input.discounts.customerConcentrationDiscount > 0)) {
    diagnostics.push({
      code: "RISK_PREMIUM_AND_DISCOUNTS_OVERLAP",
      severity: "warning",
      area: "Discounts",
      message: "Company-specific risk premium is above 5% while private-company discounts are also applied.",
      suggestedAction: "Confirm key-person, customer concentration, and marketability risks are not double-counted in both WACC and equity discounts.",
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

  if (terminalSpread < 0.02) {
    diagnostics.push({
      code: "TERMINAL_SPREAD_BELOW_200_BPS",
      severity: terminalSpread <= 0 ? "critical" : "warning",
      area: "Terminal Value",
      message: `WACC less terminal growth spread is ${(terminalSpread * 100).toFixed(1)}%.`,
      suggestedAction: "Increase discount-rate support, reduce terminal growth, or use the exit multiple method until the terminal spread is defensible.",
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

  if (Math.abs(input.discounts.lackOfMarketability - liquidityBenchmark.lackOfMarketabilityDiscount) > 0.03) {
    diagnostics.push({
      code: "DLOM_DEVIATES_FROM_FINANCIALCRAFT_BENCHMARK",
      severity: "info",
      area: "Discounts",
      message: `DLOM is ${(input.discounts.lackOfMarketability * 100).toFixed(1)}% versus FinancialCraft ${liquidityBenchmark.sourcePeriod} benchmark of ${(liquidityBenchmark.lackOfMarketabilityDiscount * 100).toFixed(1)}% for ${liquidityBenchmark.sizeLabel}.`,
      suggestedAction: "Document the reason for using a manual DLOM override, such as expected exit route, holding period, shareholder restrictions, or transaction-specific liquidity facts.",
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

  for (const diagnostic of marketValuation.diagnostics) {
    diagnostics.push({
      code: diagnostic.code,
      severity: diagnostic.severity,
      area: "Market Approach",
      message: diagnostic.message,
      suggestedAction: diagnostic.suggestedAction,
    });
  }

  if (input.marketMultiples.source.approvalStatus !== "approved") {
    diagnostics.push({
      code: "MARKET_MULTIPLES_NOT_APPROVED",
      severity: "warning",
      area: "Market Approach",
      message: "Market multiples are still draft and do not have analyst approval.",
      suggestedAction: "Attach GPW/NewConnect, Damodaran, licensed provider, or analyst-reviewed evidence and mark the selected multiples as approved before decision use.",
    });
  }

  if (input.marketMultiples.source.kind === "publicComparable") {
    const includedCount = input.marketMultiples.source.publicComparableIncludedCount ?? 0;
    if (includedCount < 3) {
      diagnostics.push({
        code: "PUBLIC_COMPS_SAMPLE_TOO_SMALL",
        severity: "warning",
        area: "Market Approach",
        message: `Public comparable company support has only ${includedCount} included peer(s).`,
        suggestedAction: "Use at least three analyst-reviewed GPW/NewConnect peers or fall back to Damodaran Europe sector evidence before approval.",
      });
    }

    if ((input.marketMultiples.source.publicComparableNegativeEbitdaCount ?? 0) > 0) {
      diagnostics.push({
        code: "PUBLIC_COMPS_NEGATIVE_EBITDA",
        severity: "warning",
        area: "Market Approach",
        message: "Public comparable set includes companies with zero or negative EBITDA.",
        suggestedAction: "Exclude negative EBITDA peers from EV/EBITDA or use EV/Revenue with explicit rationale.",
      });
    }

    if ((input.marketMultiples.source.publicComparableStaleCount ?? 0) > 0) {
      diagnostics.push({
        code: "PUBLIC_COMPS_STALE_DATA",
        severity: "warning",
        area: "Market Approach",
        message: "Public comparable set includes stale price or financial statement dates.",
        suggestedAction: "Refresh GPW/NewConnect prices and latest reported financials before approving the benchmark.",
      });
    }
  }

  if (input.marketMultiples.source.kind === "aiSuggested") {
    diagnostics.push({
      code: "AI_SUGGESTED_MULTIPLES_REQUIRE_SOURCE_DATA",
      severity: "warning",
      area: "Market Approach",
      message: "Benchmark assistant output is being used as source context, but AI is not a numeric market-data source.",
      suggestedAction: "Attach Damodaran Europe, GPW/NewConnect, licensed provider, or analyst-entered public-comparable data before approval.",
    });
  }

  const sourceDateTime = Date.parse(input.marketMultiples.source.sourceDate);
  if (Number.isFinite(sourceDateTime)) {
    const ageDays = (Date.now() - sourceDateTime) / 86_400_000;
    if (ageDays > 365) {
      diagnostics.push({
        code: "MARKET_MULTIPLE_SOURCE_DATE_STALE",
        severity: "warning",
        area: "Market Approach",
        message: `Market multiple source date is ${Math.round(ageDays)} days old.`,
        suggestedAction: "Refresh the source or document why older sector data remains relevant.",
      });
    }
  }

  if (input.marketMultiples.evEbitdaMultiple > 12 || input.marketMultiples.evRevenueMultiple > 4) {
    diagnostics.push({
      code: "MARKET_MULTIPLE_ABOVE_SME_SCREENING_RANGE",
      severity: "warning",
      area: "Market Approach",
      message: "Selected market multiple is high for an SME screening valuation.",
      suggestedAction: "Document peer comparability, growth/margin support, and whether the multiple reflects strategic-control evidence rather than public trading evidence.",
    });
  }

  return buildSummary(diagnostics);
}
