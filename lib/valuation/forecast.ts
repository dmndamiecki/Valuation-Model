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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export const historicalForecastSeedSource = "Generated from historical financial statements";

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
  source: typeof historicalForecastSeedSource;
  notes: string[];
};

export function calculateHistoricalForecastSeed(input: ValuationInput): HistoricalForecastSeed {
  const notes: string[] = [];
  const historicalsByYear = [...input.historicals].sort((a, b) => a.year - b.year).slice(-3);
  const revenueYears = historicalsByYear.filter((year) => year.revenue > 0);
  const oldestRevenueYear = revenueYears[0];
  const latestRevenueYear = revenueYears[revenueYears.length - 1];
  const yearSpan = oldestRevenueYear && latestRevenueYear ? Math.max(1, latestRevenueYear.year - oldestRevenueYear.year) : 1;
  const rawRevenueCagr = oldestRevenueYear && latestRevenueYear && oldestRevenueYear.revenue > 0 && latestRevenueYear.revenue > 0 && revenueYears.length > 1
    ? (latestRevenueYear.revenue / oldestRevenueYear.revenue) ** (1 / yearSpan) - 1
    : 0;
  const revenueCagr = Number.isFinite(rawRevenueCagr) ? clamp(rawRevenueCagr, -0.15, 0.15) : 0;

  if (Number.isFinite(rawRevenueCagr) && rawRevenueCagr !== revenueCagr) {
    notes.push("Revenue CAGR was clamped to the -15% to +15% forecast seeding range.");
  }
  const ebitdaMargins = historicalsByYear
    .filter((year) => year.revenue > 0 && Number.isFinite(year.ebitda))
    .map((year) => year.ebitda / year.revenue);
  const depreciationRatios = historicalsByYear
    .filter((year) => year.revenue > 0 && year.depreciation >= 0)
    .map((year) => year.depreciation / year.revenue);
  const capexRatios = historicalsByYear
    .filter((year) => year.revenue > 0 && year.capex > 0)
    .map((year) => year.capex / year.revenue);
  const nwcRatios = historicalsByYear
    .filter((year) => year.revenue > 0 && Number.isFinite(year.netWorkingCapital))
    .map((year) => year.netWorkingCapital / year.revenue);
  const latestNwcYear = [...historicalsByYear].reverse().find((year) => year.revenue > 0 && Number.isFinite(year.netWorkingCapital) && year.netWorkingCapital !== 0);
  const depreciationPctRevenue = average(depreciationRatios);
  const capexPctRevenue = capexRatios.length > 0 ? average(capexRatios) : depreciationPctRevenue;
  const nwcPctRevenue = latestNwcYear ? latestNwcYear.netWorkingCapital / latestNwcYear.revenue : average(nwcRatios);

  if (capexRatios.length === 0) {
    notes.push("Capex unavailable from source data. Capex seeded equal to depreciation.");
  }

  return {
    revenueCagr,
    ebitdaMargin: average(ebitdaMargins),
    depreciationPctRevenue,
    capexPctRevenue,
    nwcPctRevenue,
    taxRate: defaultForecastTaxRate(input.profile.country, input.forecast.taxRate || input.wacc.taxRate),
    source: historicalForecastSeedSource,
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
