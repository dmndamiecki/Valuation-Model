import type { ForecastAssumptions, HistoricalYear, NormalizationAdjustment, WorkingCapitalAssumptions } from "./types";

export type ForecastYear = {
  year: number;
  revenue: number;
  revenueGrowth: number;
  inputEbitdaMargin: number;
  normalizationMarginUplift: number;
  ebitda: number;
  ebitdaMargin: number;
  depreciation: number;
  ebit: number;
  tax: number;
  nopat: number;
  capex: number;
  netWorkingCapital: number;
  changeInNwc: number;
  freeCashFlow: number;
};

export function sumNormalizationAdjustments(adjustments: NormalizationAdjustment[]): number {
  return adjustments.reduce((sum, item) => sum + item.amount, 0);
}

export function normalizeLatestEbitda(historicals: HistoricalYear[], adjustments: NormalizationAdjustment[]): number {
  const latest = historicals[historicals.length - 1];
  return latest.ebitda + sumNormalizationAdjustments(adjustments);
}

export function calculateNormalizationMarginUplift(
  historicals: HistoricalYear[],
  adjustments: NormalizationAdjustment[] = [],
): number {
  const latest = historicals[historicals.length - 1];
  if (latest.revenue === 0) {
    return 0;
  }

  return sumNormalizationAdjustments(adjustments) / latest.revenue;
}

export function forecastFinancials(
  historicals: HistoricalYear[],
  forecast: ForecastAssumptions,
  workingCapital: WorkingCapitalAssumptions,
  normalizationAdjustments: NormalizationAdjustment[] = [],
): ForecastYear[] {
  const latest = historicals[historicals.length - 1];
  const normalizationMarginUplift = calculateNormalizationMarginUplift(historicals, normalizationAdjustments);

  return Array.from({ length: 5 }).reduce<ForecastYear[]>((years, _placeholder, index) => {
    const previousRevenue = index === 0 ? latest.revenue : years[index - 1].revenue;
    const previousNwc = index === 0 ? latest.netWorkingCapital : years[index - 1].netWorkingCapital;
    const revenueGrowth = forecast.revenueGrowth[index];
    const revenue = previousRevenue * (1 + revenueGrowth);
    const inputEbitdaMargin = forecast.ebitdaMargin[index];
    const ebitdaMargin = inputEbitdaMargin + normalizationMarginUplift;
    const ebitda = revenue * ebitdaMargin;
    const depreciation = revenue * forecast.depreciationPctRevenue[index];
    const ebit = ebitda - depreciation;
    const tax = Math.max(0, ebit * forecast.taxRate);
    const nopat = ebit - tax;
    const capex = revenue * forecast.capexPctRevenue[index];
    const netWorkingCapital = revenue * workingCapital.nwcPctRevenue[index];
    const changeInNwc = netWorkingCapital - previousNwc;
    const freeCashFlow = nopat + depreciation - capex - changeInNwc;

    years.push({
      year: latest.year + index + 1,
      revenue,
      revenueGrowth,
      inputEbitdaMargin,
      normalizationMarginUplift,
      ebitda,
      ebitdaMargin,
      depreciation,
      ebit,
      tax,
      nopat,
      capex,
      netWorkingCapital,
      changeInNwc,
      freeCashFlow,
    });
    return years;
  }, []);
}
