import type { ValuationInput } from "./types";

export type SimpleModeInput = {
  companyName: string;
  country: string;
  currency: string;
  registrationNumber: string;
  nip: string;
  regon: string;
  website: string;
  pkdCode: string;
  legalForm: string;
  address: string;
  shareCapital: string;
  registrationStatus: string;
  industry: string;
  latestRevenue: number;
  latestEbitda: number;
  cash: number;
  debt: number;
  expectedAnnualRevenueGrowth: number;
  expectedEbitdaMargin: number;
  valuationDate: string;
};

export function getDefaultTaxRate(country: string, currency: string) {
  const normalizedCountry = country.trim().toLowerCase();
  const normalizedCurrency = currency.trim().toUpperCase();

  if (
    normalizedCountry.includes("poland") ||
    normalizedCountry === "pl" ||
    normalizedCurrency === "PLN"
  ) {
    return 0.19;
  }

  if (
    normalizedCountry.includes("united states") ||
    normalizedCountry.includes("usa") ||
    normalizedCountry === "us" ||
    normalizedCurrency === "USD"
  ) {
    return 0.26;
  }

  return 0.26;
}

function safePriorRevenue(
  revenue: number,
  growth: number,
  periodsBack: number,
) {
  const growthFactor = 1 + growth;
  if (growthFactor <= 0) {
    return revenue;
  }

  return revenue / growthFactor ** periodsBack;
}

export function simpleInputFromValuationInput(
  input: ValuationInput,
): SimpleModeInput {
  const latestHistorical = input.historicals[input.historicals.length - 1];

  return {
    companyName: input.profile.companyName,
    country: input.profile.country,
    currency: input.profile.currency,
    registrationNumber: input.profile.registrationNumber,
    nip: input.profile.nip,
    regon: input.profile.regon,
    pkdCode: input.profile.pkdCode,
    legalForm: input.profile.legalForm,
    address: input.profile.address,
    shareCapital: input.profile.shareCapital,
    registrationStatus: input.profile.registrationStatus,
    website: input.profile.website,
    industry: input.profile.industry,
    latestRevenue: latestHistorical.revenue,
    latestEbitda: latestHistorical.ebitda,
    cash: input.bridge.cash,
    debt: input.bridge.debt,
    expectedAnnualRevenueGrowth: input.forecast.revenueGrowth[0],
    expectedEbitdaMargin: input.forecast.ebitdaMargin[0],
    valuationDate: input.profile.valuationDate,
  };
}

export function buildValuationInputFromSimpleMode(
  simpleInput: SimpleModeInput,
): ValuationInput {
  const taxRate = getDefaultTaxRate(simpleInput.country, simpleInput.currency);
  const valuationYear = Number(simpleInput.valuationDate.slice(0, 4));
  const latestYear = Number.isFinite(valuationYear)
    ? valuationYear - 1
    : new Date().getUTCFullYear() - 1;
  const historicalYears = [latestYear - 2, latestYear - 1, latestYear];
  const latestMargin =
    simpleInput.latestRevenue === 0
      ? 0
      : simpleInput.latestEbitda / simpleInput.latestRevenue;

  return {
    profile: {
      companyName: simpleInput.companyName,
      country: simpleInput.country,
      currency: simpleInput.currency,
      registrationNumber: simpleInput.registrationNumber,
      nip: simpleInput.nip,
      regon: simpleInput.regon,
      pkdCode: simpleInput.pkdCode,
      legalForm: simpleInput.legalForm,
      address: simpleInput.address,
      shareCapital: simpleInput.shareCapital,
      registrationStatus: simpleInput.registrationStatus,
      website: simpleInput.website,
      industry: simpleInput.industry,
      valuationDate: simpleInput.valuationDate,
    },
    historicals: historicalYears.map((year, index) => {
      const periodsBack = 2 - index;
      const revenue =
        periodsBack === 0
          ? simpleInput.latestRevenue
          : safePriorRevenue(
              simpleInput.latestRevenue,
              simpleInput.expectedAnnualRevenueGrowth,
              periodsBack,
            );
      const ebitda =
        periodsBack === 0 ? simpleInput.latestEbitda : revenue * latestMargin;

      return {
        year,
        revenue,
        ebitda,
        depreciation: revenue * 0.03,
        capex: revenue * 0.04,
        netWorkingCapital: revenue * 0.12,
      };
    }),
    normalizationAdjustments: [],
    forecast: {
      revenueGrowth: Array(5).fill(simpleInput.expectedAnnualRevenueGrowth),
      ebitdaMargin: Array(5).fill(simpleInput.expectedEbitdaMargin),
      depreciationPctRevenue: Array(5).fill(0.03),
      capexPctRevenue: Array(5).fill(0.04),
      taxRate,
    },
    workingCapital: {
      nwcPctRevenue: Array(5).fill(0.12),
    },
    wacc: {
      riskFreeRate: 0.05,
      equityRiskPremium: 0.055,
      beta: 1,
      sizePremium: 0.04,
      companySpecificRiskPremium: 0.02,
      preTaxCostOfDebt: 0.08,
      targetDebtPctCapital: 0.25,
      taxRate,
    },
    terminalValue: {
      perpetualGrowthRate: 0.025,
      exitEbitdaMultiple: 6,
      method: "gordon",
    },
    bridge: {
      cash: simpleInput.cash,
      debt: simpleInput.debt,
      leasing: 0,
      otherDebtLikeItems: 0,
      transactionCosts: 0,
      nonOperatingAssets: 0,
    },
    discounts: {
      lackOfMarketability: 0.19,
      lackOfMarketabilitySource: "financialCraftBenchmark",
      keyPersonDiscount: 0.05,
      customerConcentrationDiscount: 0.05,
    },
    marketMultiples: {
      evEbitdaMultiple: 6,
      evRevenueMultiple: 1,
      ebitdaWeight: 0.7,
      dcfWeight: 0.7,
      source: {
        kind: "manual",
        label: "Manual analyst-selected SME screening multiples",
        sourceUrl: "",
        sourceDate: "Current model",
        confidence: "low",
        approvalStatus: "draft",
        rationale: "Initial placeholder multiples from simple mode. Replace with GPW/NewConnect comparables, Damodaran sector evidence, a licensed data provider, or an analyst-approved source before relying on the market approach.",
        region: "Europe",
        dataset: "Manual placeholder",
      },
    },
  };
}
