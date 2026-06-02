import type { ForecastAssumptions, HistoricalYear, NormalizationAdjustment, ValuationInput, WorkingCapitalAssumptions } from "./types";

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

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function repeatedFive(value: number) {
  return Array(5).fill(value);
}

function defaultForecastTaxRate(country: string, currentTaxRate: number) {
  const normalizedCountry = country.trim().toLowerCase();
  if (normalizedCountry.includes("poland") || normalizedCountry === "pl") {
    return 0.19;
  }
  return currentTaxRate || 0.26;
}

export type HistoricalForecastSeed = {
  revenueCagr: number;
  ebitdaMargin: number;
  depreciationPctRevenue: number;
  capexPctRevenue: number;
  nwcPctRevenue: number;
  taxRate: number;
  notes: string[];
};

export function calculateHistoricalForecastSeed(input: ValuationInput): HistoricalForecastSeed {
  const notes: string[] = [];
  const historicalsByYear = [...input.historicals].sort((a, b) => a.year - b.year);
  const revenueYears = historicalsByYear.filter((year) => year.revenue > 0);
  const oldestRevenueYear = revenueYears[0];
  const latestRevenueYear = revenueYears[revenueYears.length - 1];
  const yearSpan = oldestRevenueYear && latestRevenueYear ? Math.max(1, latestRevenueYear.year - oldestRevenueYear.year) : 1;
  const revenueCagr = oldestRevenueYear && latestRevenueYear && oldestRevenueYear.revenue > 0 && latestRevenueYear.revenue > 0 && revenueYears.length > 1
    ? (latestRevenueYear.revenue / oldestRevenueYear.revenue) ** (1 / yearSpan) - 1
    : 0;
  const ebitdaMargins = historicalsByYear
    .filter((year) => year.revenue > 0 && Number.isFinite(year.ebitda))
    .map((year) => year.ebitda / year.revenue);
  const depreciationRatios = historicalsByYear
    .filter((year) => year.revenue > 0 && year.depreciation >= 0)
    .map((year) => year.depreciation / year.revenue);
  const capexRatios = historicalsByYear
    .filter((year) => year.revenue > 0 && year.capex > 0)
    .map((year) => year.capex / year.revenue);
  const latestNwcYear = [...historicalsByYear].reverse().find((year) => year.revenue > 0 && Number.isFinite(year.netWorkingCapital));
  const depreciationPctRevenue = average(depreciationRatios);
  const capexPctRevenue = capexRatios.length > 0 ? average(capexRatios) : depreciationPctRevenue;

  if (capexRatios.length === 0) {
    notes.push("Capex unavailable from source data. Capex seeded equal to depreciation.");
  }

  return {
    revenueCagr: Number.isFinite(revenueCagr) ? revenueCagr : 0,
    ebitdaMargin: average(ebitdaMargins),
    depreciationPctRevenue,
    capexPctRevenue,
    nwcPctRevenue: latestNwcYear ? latestNwcYear.netWorkingCapital / latestNwcYear.revenue : 0.1,
    taxRate: defaultForecastTaxRate(input.profile.country, input.forecast.taxRate || input.wacc.taxRate),
    notes,
  };
}

export function seedForecastFromHistoricals(input: ValuationInput): { input: ValuationInput; seed: HistoricalForecastSeed } {
  const seed = calculateHistoricalForecastSeed(input);

  return {
    seed,
    input: {
      ...input,
      forecast: {
        ...input.forecast,
        revenueGrowth: repeatedFive(seed.revenueCagr),
        ebitdaMargin: repeatedFive(seed.ebitdaMargin),
        depreciationPctRevenue: repeatedFive(seed.depreciationPctRevenue),
        capexPctRevenue: repeatedFive(seed.capexPctRevenue),
        taxRate: seed.taxRate,
      },
      workingCapital: {
        nwcPctRevenue: repeatedFive(seed.nwcPctRevenue),
      },
      wacc: {
        ...input.wacc,
        taxRate: seed.taxRate,
      },
    },
  };
}
