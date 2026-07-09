import type { ValuationInput } from "./types";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function createBlankValuationInput(valuationDate = todayIsoDate()): ValuationInput {
  const valuationYear = Number(valuationDate.slice(0, 4));
  const latestYear = Number.isFinite(valuationYear) ? valuationYear - 1 : new Date().getUTCFullYear() - 1;

  return {
    profile: {
      companyName: "",
      country: "Poland",
      currency: "PLN",
      registrationNumber: "",
      nip: "",
      regon: "",
      pkdCode: "",
      legalForm: "",
      address: "",
      shareCapital: "",
      registrationStatus: "",
      website: "",
      industry: "",
      valuationDate,
    },
    historicals: [latestYear - 2, latestYear - 1, latestYear].map((year) => ({
      year,
      revenue: 0,
      ebitda: 0,
      depreciation: 0,
      capex: 0,
      netWorkingCapital: 0,
    })),
    normalizationAdjustments: [],
    forecast: {
      revenueGrowth: Array(5).fill(0),
      ebitdaMargin: Array(5).fill(0),
      depreciationPctRevenue: Array(5).fill(0.03),
      capexPctRevenue: Array(5).fill(0.04),
      taxRate: 0.19,
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
      taxRate: 0.19,
    },
    terminalValue: {
      perpetualGrowthRate: 0.025,
      exitEbitdaMultiple: 6,
      method: "gordon",
    },
    bridge: {
      cash: 0,
      debt: 0,
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
        rationale: "Initial placeholder multiples. Replace with GPW/NewConnect comparables, Damodaran sector evidence, a licensed data provider, or an analyst-approved source before relying on the market approach.",
        region: "Europe",
        dataset: "Manual placeholder",
      },
    },
    importMetadata: undefined,
  };
}

export const exampleValuationInput: ValuationInput = {
  profile: {
    companyName: "Harbor Precision Components LLC",
    country: "United States",
    currency: "USD",
    registrationNumber: "US-DE-1234567",
    nip: "",
    regon: "",
    pkdCode: "",
    legalForm: "",
    address: "",
    shareCapital: "",
    registrationStatus: "",
    website: "https://harborprecision.example",
    industry: "Niche industrial manufacturing",
    valuationDate: "2026-06-01",
  },
  historicals: [
    { year: 2023, revenue: 11800, ebitda: 1530, depreciation: 410, capex: 520, netWorkingCapital: 1650 },
    { year: 2024, revenue: 12650, ebitda: 1710, depreciation: 435, capex: 610, netWorkingCapital: 1770 },
    { year: 2025, revenue: 13750, ebitda: 1990, depreciation: 460, capex: 720, netWorkingCapital: 1900 },
  ],
  normalizationAdjustments: [
    { label: "Owner compensation above market", amount: 180 },
    { label: "One-time ERP implementation expense", amount: 95 },
    { label: "Non-recurring legal settlement", amount: 60 },
  ],
  forecast: {
    revenueGrowth: [0.075, 0.068, 0.058, 0.048, 0.04],
    ebitdaMargin: [0.154, 0.158, 0.162, 0.165, 0.167],
    depreciationPctRevenue: [0.033, 0.032, 0.031, 0.03, 0.03],
    capexPctRevenue: [0.052, 0.05, 0.047, 0.045, 0.043],
    taxRate: 0.26,
  },
  workingCapital: {
    nwcPctRevenue: [0.139, 0.138, 0.137, 0.136, 0.135],
  },
  wacc: {
    riskFreeRate: 0.042,
    equityRiskPremium: 0.055,
    beta: 1.05,
    sizePremium: 0.035,
    companySpecificRiskPremium: 0.025,
    preTaxCostOfDebt: 0.078,
    targetDebtPctCapital: 0.25,
    taxRate: 0.26,
  },
  terminalValue: {
    perpetualGrowthRate: 0.032,
    exitEbitdaMultiple: 6.5,
    method: "gordon",
  },
  bridge: {
    cash: 950,
    debt: 4200,
    leasing: 650,
    otherDebtLikeItems: 275,
    transactionCosts: 350,
    nonOperatingAssets: 225,
  },
  discounts: {
    lackOfMarketability: 0.19,
    lackOfMarketabilitySource: "financialCraftBenchmark",
    keyPersonDiscount: 0.04,
    customerConcentrationDiscount: 0.06,
  },
  marketMultiples: {
    evEbitdaMultiple: 6.2,
    evRevenueMultiple: 0.95,
    ebitdaWeight: 0.7,
    dcfWeight: 0.7,
    source: {
      kind: "manual",
      label: "Example analyst-selected industrial SME multiples",
      sourceUrl: "",
      sourceDate: "Current model",
      confidence: "low",
      approvalStatus: "draft",
      rationale: "Example screening multiples included for demo use. Refresh with public-market or transaction evidence for a live valuation.",
      region: "Europe",
      dataset: "Manual placeholder",
    },
  },
  importMetadata: undefined,
};
