import { z } from "zod";

export const ratioSchema = z.number().min(0).max(1);
export const growthRateSchema = z.number().min(-0.75).max(1);
export const operatingMarginSchema = z.number().min(-1).max(1);
export const positiveRateSchema = z.number().min(0).max(1);
export const dataConfidenceSchema = z.enum(["high", "medium", "low"]);

export const importedValueSourceSchema = z.object({
  value: z.number().nullable(),
  source: z.string(),
  sourceUrl: z.string(),
  sourceDate: z.string(),
  fetchedAt: z.string(),
  confidence: dataConfidenceSchema,
  isUserOverridden: z.boolean(),
  note: z.string().optional(),
});

export const companyProfileSchema = z.object({
  companyName: z.string().min(1),
  country: z.string().min(1),
  currency: z.string().min(1),
  registrationNumber: z.string(),
  nip: z.string(),
  regon: z.string(),
  website: z.string(),
  pkdCode: z.string(),
  legalForm: z.string(),
  address: z.string(),
  shareCapital: z.string(),
  registrationStatus: z.string(),
  industry: z.string().min(1),
  valuationDate: z.string().min(1),
});

export const historicalYearSchema = z.object({
  year: z.number().int(),
  revenue: z.number().nonnegative(),
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

export const marketMultipleSourceSchema = z.object({
  kind: z.enum(["manual", "publicComparable", "damodaranSector", "licensedProvider", "aiSuggested"]),
  label: z.string().min(1),
  sourceUrl: z.string().optional(),
  sourceDate: z.string().min(1),
  confidence: dataConfidenceSchema,
  approvalStatus: z.enum(["draft", "approved"]),
  rationale: z.string().min(1),
  damodaranIndustry: z.string().optional(),
  region: z.string().optional(),
  dataset: z.string().optional(),
  sourceFile: z.string().optional(),
  sourceUpdatedAt: z.string().optional(),
  publicComparableCount: z.number().int().nonnegative().optional(),
  publicComparableIncludedCount: z.number().int().nonnegative().optional(),
  publicComparableExcludedCount: z.number().int().nonnegative().optional(),
  publicComparableStaleCount: z.number().int().nonnegative().optional(),
  publicComparableNegativeEbitdaCount: z.number().int().nonnegative().optional(),
  benchmarkAssistantGeneratedAt: z.string().optional(),
  benchmarkAssistantAuditNote: z.string().optional(),
});

export const marketMultiplesAssumptionsSchema = z.object({
  evEbitdaMultiple: z.number().positive(),
  evRevenueMultiple: z.number().positive(),
  ebitdaWeight: ratioSchema,
  dcfWeight: ratioSchema,
  source: marketMultipleSourceSchema.default({
    kind: "manual",
    label: "Legacy manual market multiples",
    sourceUrl: "",
    sourceDate: "Current model",
    confidence: "low",
    approvalStatus: "draft",
    rationale: "Legacy input did not include source metadata. Review and approve source support before relying on the market approach.",
    damodaranIndustry: undefined,
    region: undefined,
    dataset: undefined,
    sourceFile: undefined,
    sourceUpdatedAt: undefined,
    publicComparableCount: undefined,
    publicComparableIncludedCount: undefined,
    publicComparableExcludedCount: undefined,
    publicComparableStaleCount: undefined,
    publicComparableNegativeEbitdaCount: undefined,
    benchmarkAssistantGeneratedAt: undefined,
    benchmarkAssistantAuditNote: undefined,
  }),
});

export const valuationImportMetadataSchema = z.object({
  bridge: z.object({
    cash: importedValueSourceSchema.optional(),
    debt: importedValueSourceSchema.optional(),
    leasing: importedValueSourceSchema.optional(),
    otherDebtLikeItems: importedValueSourceSchema.optional(),
    liabilities: importedValueSourceSchema.optional(),
    cashUnavailable: z.boolean().default(false),
    debtUnavailable: z.boolean().default(false),
    liabilitiesUsedAsDebtProxy: z.boolean().default(false),
    warnings: z.array(z.string()).default([]),
  }).optional(),
  workingCapital: z.object({
    netWorkingCapital: importedValueSourceSchema.optional(),
    currentAssets: importedValueSourceSchema.optional(),
    currentLiabilities: importedValueSourceSchema.optional(),
    receivables: importedValueSourceSchema.optional(),
    inventory: importedValueSourceSchema.optional(),
    payables: importedValueSourceSchema.optional(),
    derivedFromIncompleteFields: z.boolean().default(false),
    warnings: z.array(z.string()).default([]),
  }).optional(),
  assetFloor: z.object({
    assets: importedValueSourceSchema.optional(),
    equity: importedValueSourceSchema.optional(),
    liabilities: importedValueSourceSchema.optional(),
    warnings: z.array(z.string()).default([]),
  }).optional(),
}).optional();

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
  importMetadata: valuationImportMetadataSchema,
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
export type MarketMultipleSource = z.infer<typeof marketMultipleSourceSchema>;
export type MarketMultiplesAssumptions = z.infer<typeof marketMultiplesAssumptionsSchema>;
export type ImportedValueSource = z.infer<typeof importedValueSourceSchema>;
export type ValuationImportMetadata = z.infer<typeof valuationImportMetadataSchema>;
export type ValuationInput = z.infer<typeof valuationInputSchema>;
