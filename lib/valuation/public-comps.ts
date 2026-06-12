import { z } from "zod";

export const publicComparableCompanySchema = z.object({
  ticker: z.string().min(1),
  market: z.enum(["GPW", "NewConnect", "Other"]),
  companyName: z.string().min(1),
  source: z.string().min(1),
  sourceUrl: z.string().optional(),
  priceDate: z.string().optional(),
  marketCap: z.number().nullable().optional(),
  netDebt: z.number().nullable().optional(),
  enterpriseValue: z.number().nullable().optional(),
  revenue: z.number().nullable().optional(),
  ebitda: z.number().nullable().optional(),
  evRevenue: z.number().nullable().optional(),
  evEbitda: z.number().nullable().optional(),
  liquidityFlag: z.enum(["ok", "thin", "unknown"]).default("unknown"),
  stalenessFlag: z.enum(["current", "stale", "unknown"]).default("unknown"),
  inclusionStatus: z.enum(["included", "excluded", "watchlist"]).default("watchlist"),
  rationale: z.string().min(1),
});

export type PublicComparableCompany = z.infer<typeof publicComparableCompanySchema>;

export const publicComparableSetSchema = z.object({
  status: z.enum(["draft", "approved"]),
  source: z.string().min(1),
  sourceUrl: z.string().optional(),
  fetchedAt: z.string(),
  provider: z.enum(["manual", "licensedProvider", "plannedApi"]).default("manual"),
  notes: z.array(z.string()).default([]),
  companies: z.array(publicComparableCompanySchema).default([]),
});

export type PublicComparableSet = z.infer<typeof publicComparableSetSchema>;

export function summarizePublicComps(companies: PublicComparableCompany[]) {
  const included = companies.filter((company) => company.inclusionStatus === "included");
  const excluded = companies.filter((company) => company.inclusionStatus === "excluded");
  const stale = companies.filter((company) => company.stalenessFlag === "stale");
  const thin = companies.filter((company) => company.liquidityFlag === "thin");
  const negativeEbitda = companies.filter((company) => typeof company.ebitda === "number" && company.ebitda <= 0);

  return {
    totalCount: companies.length,
    includedCount: included.length,
    excludedCount: excluded.length,
    staleCount: stale.length,
    thinLiquidityCount: thin.length,
    negativeEbitdaCount: negativeEbitda.length,
  };
}
