import { z } from "zod";

export const ratioSchema = z.number().min(0).max(1);
export const growthRateSchema = z.number().min(-0.75).max(1);
export const operatingMarginSchema = z.number().min(-1).max(1);
export const positiveRateSchema = z.number().min(0).max(1);

export const companyProfileSchema = z.object({
  companyName: z.string().min(1),
  country: z.string().min(1),
  currency: z.string().min(1),
  registrationNumber: z.string().min(1),
  website: z.string(),
  pkdCode: z.string(),
  industry: z.string().min(1),
  valuationDate: z.string().min(1),
});

export const historicalYearSchema = z.object({
  year: z.number().int(),
  revenue: z.number().positive(),
  ebitda: z.number(),
  depreciation: z.number().nonnegative(),
  capex: z.number().nonnegative(),
  netWorkingCapital: z.number(),
});

export const normalizationAdjustmentSchema = z.object({
  label: z.string().min(1),
  amount: z.number(),
});

export const forecastAssumptionsSchema = z.object({
  revenueGrowth: z.array(growthRateSchema).length(5),
  ebitdaMargin: z.array(operatingMarginSchema).length(5),
  depreciationPctRevenue: z.array(ratioSchema).length(5),
  capexPctRevenue: z.array(ratioSchema).length(5),
  taxRate: ratioSchema,
});

export const workingCapitalAssumptionsSchema = z.object({
  nwcPctRevenue: z.array(ratioSchema).length(5),
});

export const waccAssumptionsSchema = z.object({
  riskFreeRate: positiveRateSchema,
  equityRiskPremium: positiveRateSchema,
  beta: z.number().min(0).max(10),
  sizePremium: positiveRateSchema,
  companySpecificRiskPremium: positiveRateSchema,
  preTaxCostOfDebt: positiveRateSchema,
  targetDebtPctCapital: ratioSchema,
  taxRate: ratioSchema,
});

export const terminalValueAssumptionsSchema = z.object({
  perpetualGrowthRate: z.number().min(-0.05).max(0.08),
  exitEbitdaMultiple: z.number().positive(),
  method: z.enum(["gordon", "exitMultiple"]),
});

export const bridgeAssumptionsSchema = z.object({
  cash: z.number().nonnegative(),
  debt: z.number().nonnegative(),
  leasing: z.number().nonnegative(),
  otherDebtLikeItems: z.number().nonnegative(),
  transactionCosts: z.number().nonnegative(),
  nonOperatingAssets: z.number().nonnegative(),
});

export const discountAssumptionsSchema = z.object({
  lackOfMarketability: ratioSchema,
  keyPersonDiscount: ratioSchema,
  customerConcentrationDiscount: ratioSchema,
});

export const marketMultiplesAssumptionsSchema = z.object({
  evEbitdaMultiple: z.number().positive(),
  evRevenueMultiple: z.number().positive(),
  ebitdaWeight: ratioSchema,
  dcfWeight: ratioSchema,
});

export const valuationInputSchema = z.object({
  profile: companyProfileSchema,
  historicals: z.array(historicalYearSchema).length(3),
  normalizationAdjustments: z.array(normalizationAdjustmentSchema),
  forecast: forecastAssumptionsSchema,
  workingCapital: workingCapitalAssumptionsSchema,
  wacc: waccAssumptionsSchema,
  terminalValue: terminalValueAssumptionsSchema,
  bridge: bridgeAssumptionsSchema,
  discounts: discountAssumptionsSchema,
  marketMultiples: marketMultiplesAssumptionsSchema,
});

export type CompanyProfile = z.infer<typeof companyProfileSchema>;
export type HistoricalYear = z.infer<typeof historicalYearSchema>;
export type NormalizationAdjustment = z.infer<typeof normalizationAdjustmentSchema>;
export type ForecastAssumptions = z.infer<typeof forecastAssumptionsSchema>;
export type WorkingCapitalAssumptions = z.infer<typeof workingCapitalAssumptionsSchema>;
export type WaccAssumptions = z.infer<typeof waccAssumptionsSchema>;
export type TerminalValueAssumptions = z.infer<typeof terminalValueAssumptionsSchema>;
export type BridgeAssumptions = z.infer<typeof bridgeAssumptionsSchema>;
export type DiscountAssumptions = z.infer<typeof discountAssumptionsSchema>;
export type MarketMultiplesAssumptions = z.infer<typeof marketMultiplesAssumptionsSchema>;
export type ValuationInput = z.infer<typeof valuationInputSchema>;
