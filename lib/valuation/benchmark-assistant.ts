import { z } from "zod";
import type { BizRaportCatalogFilters } from "@/lib/data-sources/bizraport-catalog";
import type { DamodaranEuropeBenchmark } from "@/lib/data-sources/damodaran-europe";
import type { PeerBenchmarkResult } from "./peer-benchmarks";
import { publicComparableCompanySchema } from "./public-comps";

export const benchmarkAssistantWarningSchema = z.object({
  severity: z.enum(["info", "warning", "critical"]),
  area: z.enum(["industry", "publicComps", "bizRaport", "damodaran", "marketMultiples", "dataQuality"]),
  message: z.string().min(1),
  suggestedAction: z.string().min(1),
});

export const benchmarkAssistantResultSchema = z.object({
  status: z.enum(["ready", "unavailable", "error"]),
  generatedAt: z.string(),
  model: z.string(),
  suggestedDamodaranIndustry: z.string().nullable(),
  damodaranConfidence: z.enum(["high", "medium", "low"]),
  industryRationale: z.string().min(1),
  suggestedPublicComps: z.array(publicComparableCompanySchema).default([]),
  bizRaportFilters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  bizRaportRationale: z.string().min(1),
  sanityWarnings: z.array(benchmarkAssistantWarningSchema).default([]),
  benchmarkRationale: z.string().min(1),
  nextActions: z.array(z.string()).default([]),
  auditNote: z.string().min(1),
});

export type BenchmarkAssistantResult = z.infer<typeof benchmarkAssistantResultSchema>;
export type BenchmarkAssistantWarning = z.infer<typeof benchmarkAssistantWarningSchema>;

type FallbackInput = {
  generatedAt: string;
  model: string;
  suggestedDamodaranIndustry: string | null;
  damodaranConfidence: "high" | "medium" | "low";
  industryRationale: string;
  bizRaportFilters: BizRaportCatalogFilters;
  damodaranBenchmark: DamodaranEuropeBenchmark | null;
  peerBenchmarks: PeerBenchmarkResult | null;
  unavailableReason?: string;
};

const SOFTWARE_COMPS = [
  ["ACP", "Asseco Poland", "Large Polish IT services and software benchmark; use as broad context, not SME direct peer."],
  ["CMR", "Comarch", "Polish software and IT services comparable with project and recurring revenue exposure."],
  ["DWL", "DataWalk", "Software/data analytics profile; likely high-growth and should be reviewed for outlier risk."],
  ["TEN", "TenderHut", "NewConnect IT services/software candidate; check liquidity and current filings."],
  ["CLD", "Cloud Technologies", "Digital/data business model candidate; verify business mix before inclusion."],
] as const;

const MANUFACTURING_COMPS = [
  ["APT", "Apator", "Industrial equipment benchmark with public-market reporting and manufacturing exposure."],
  ["MFO", "MFO", "Steel profiles / manufacturing candidate; verify scale and margin comparability."],
  ["PCE", "PCC Exol", "Industrial chemicals/manufacturing context; likely only partial peer depending on product mix."],
  ["AMB", "Ambra", "Manufacturing/consumer product context; include only if operating model is comparable."],
] as const;

const GENERAL_COMPS = [
  ["GPW", "GPW listed peer set", "Placeholder for analyst-selected Warsaw Stock Exchange comparable companies."],
  ["NC", "NewConnect peer set", "Placeholder for analyst-selected NewConnect comparable companies."],
] as const;

function chooseCompSeeds(industryRationale: string, suggestedDamodaranIndustry: string | null) {
  const text = `${industryRationale} ${suggestedDamodaranIndustry ?? ""}`.toLowerCase();
  if (text.includes("computer") || text.includes("software") || text.includes("it ")) return SOFTWARE_COMPS;
  if (text.includes("machinery") || text.includes("manufactur")) return MANUFACTURING_COMPS;
  return GENERAL_COMPS;
}

function compactFilters(filters: BizRaportCatalogFilters): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  ) as Record<string, string | number | boolean>;
}

export function buildBenchmarkAssistantFallback(input: FallbackInput): BenchmarkAssistantResult {
  const compSeeds = chooseCompSeeds(input.industryRationale, input.suggestedDamodaranIndustry);
  const publicComps = compSeeds.map(([ticker, companyName, rationale], index) => ({
    ticker,
    market: index === compSeeds.length - 1 && ticker === "NC" ? "NewConnect" as const : "GPW" as const,
    companyName,
    source: "AI suggestion only - market data connector pending",
    sourceUrl: "",
    priceDate: undefined,
    marketCap: null,
    netDebt: null,
    enterpriseValue: null,
    revenue: null,
    ebitda: null,
    evRevenue: null,
    evEbitda: null,
    liquidityFlag: "unknown" as const,
    stalenessFlag: "unknown" as const,
    inclusionStatus: "watchlist" as const,
    rationale,
  }));

  const warnings: BenchmarkAssistantWarning[] = [];
  if (input.unavailableReason) {
    const normalizedReason = input.unavailableReason.toLowerCase();
    const isProviderConfigurationIssue =
      normalizedReason.includes("quota") ||
      normalizedReason.includes("billing") ||
      normalizedReason.includes("api key") ||
      normalizedReason.includes("openai");
    warnings.push({
      severity: "warning",
      area: "dataQuality",
      message: isProviderConfigurationIssue
        ? "AI benchmark review is unavailable in this environment."
        : "AI benchmark review could not be completed.",
      suggestedAction: "Use the Damodaran Europe benchmark and BizRaport peer screen; AI only adds optional rationale and does not affect numeric valuation inputs.",
    });
  }
  if (!input.damodaranBenchmark?.industry) {
    warnings.push({
      severity: "warning",
      area: "damodaran",
      message: "Damodaran Europe benchmark has not been loaded for this model.",
      suggestedAction: "Run the Damodaran Europe benchmark before approving market multiples.",
    });
  }
  if (!input.peerBenchmarks || input.peerBenchmarks.catalogCount === 0) {
    warnings.push({
      severity: "info",
      area: "bizRaport",
      message: "BizRaport peer screen has not been refreshed for this benchmark set.",
      suggestedAction: "Fetch a BizRaport peer screen to validate PKD, revenue scale and margin comparability.",
    });
  }

  return {
    status: input.unavailableReason ? "unavailable" : "ready",
    generatedAt: input.generatedAt,
    model: input.model,
    suggestedDamodaranIndustry: input.suggestedDamodaranIndustry,
    damodaranConfidence: input.damodaranConfidence,
    industryRationale: input.industryRationale,
    suggestedPublicComps: publicComps,
    bizRaportFilters: compactFilters(input.bizRaportFilters),
    bizRaportRationale: "BizRaport should be used to screen private Polish peers by PKD, revenue scale and EBITDA profile; it should not be treated as a direct trading multiple source.",
    sanityWarnings: warnings,
    benchmarkRationale: "Use Damodaran Europe as the numeric sector benchmark and BizRaport as private peer screening support. GPW/NewConnect should be added only after source-traced public-company financial data is attached.",
    nextActions: [
      "Load Damodaran Europe benchmark and keep selected multiples in draft.",
      "Refresh BizRaport peer screen for the selected KRS and PKD.",
      "Approve the selected market multiples only after the benchmark source and peer screen have been reviewed.",
    ],
    auditNote: "Fallback result contains no AI-created valuation numbers; all valuation multiples must remain source-traced and approved.",
  };
}
