import betaSeed from "@/data/market/damodaran-beta-seed.json";
import type { DataConfidence } from "./types";

export type DamodaranBetaRefreshStatus = "manual_seed";

export type DamodaranBetaSuggestion = {
  status: "ready" | "fallback";
  message: string;
  value: number | null;
  unleveredBeta: number | null;
  cashAdjustedBeta: number | null;
  appIndustry: string;
  damodaranIndustry: string | null;
  source: string;
  sourceUrl: string;
  dataCurrentUrl: string;
  sourceDate: string;
  fetchedAt: string;
  datasetAgeDays: number;
  refreshStatus: DamodaranBetaRefreshStatus;
  confidence: DataConfidence;
  isLiveData: false;
  isUserOverridden: false;
  warning?: string;
};

type BetaSeedIndustry = {
  damodaranIndustry: string;
  unleveredBeta: number;
  cashAdjustedBeta: number;
  confidence: DataConfidence;
};

type BetaSeed = typeof betaSeed & {
  industries: Record<string, BetaSeedIndustry>;
};

const seed = betaSeed as BetaSeed;
const refreshAgeWarningDays = 180;

function normalizeIndustry(industry: string) {
  return industry.trim().toLowerCase();
}

function findIndustrySeed(industry: string): [string, BetaSeedIndustry] | null {
  const normalized = normalizeIndustry(industry);
  const entry = Object.entries(seed.industries).find(([industryName]) => normalizeIndustry(industryName) === normalized) as [string, BetaSeedIndustry] | undefined;
  return entry ?? null;
}

export function calculateDatasetAgeDays(sourceDate: string, valuationDateOrToday = new Date().toISOString()) {
  const source = new Date(`${sourceDate}T00:00:00.000Z`);
  const valuationDate = new Date(valuationDateOrToday);
  if (Number.isNaN(source.getTime()) || Number.isNaN(valuationDate.getTime())) {
    return 0;
  }
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((valuationDate.getTime() - source.getTime()) / millisecondsPerDay));
}

export function getDamodaranBetaRefreshWarning(sourceDate: string, valuationDateOrToday = new Date().toISOString()) {
  const datasetAgeDays = calculateDatasetAgeDays(sourceDate, valuationDateOrToday);
  return datasetAgeDays > refreshAgeWarningDays
    ? "Damodaran beta seed dataset is older than 180 days. Consider refreshing market assumptions."
    : undefined;
}

export function getDamodaranBetaSuggestion(industry: string, valuationDateOrToday = new Date().toISOString()): DamodaranBetaSuggestion {
  const datasetAgeDays = calculateDatasetAgeDays(seed.sourceDate, valuationDateOrToday);
  const warning = getDamodaranBetaRefreshWarning(seed.sourceDate, valuationDateOrToday);
  const fetchedAt = new Date().toISOString();
  const industrySeed = findIndustrySeed(industry);

  if (!industrySeed) {
    return {
      status: "fallback",
      message: `No Damodaran beta manual seed is mapped for ${industry || "selected industry"}.`,
      value: null,
      unleveredBeta: null,
      cashAdjustedBeta: null,
      appIndustry: industry,
      damodaranIndustry: null,
      source: seed.source,
      sourceUrl: seed.sourceUrl,
      dataCurrentUrl: seed.dataCurrentUrl,
      sourceDate: seed.sourceDate,
      fetchedAt,
      datasetAgeDays,
      refreshStatus: seed.refreshStatus as DamodaranBetaRefreshStatus,
      confidence: "medium",
      isLiveData: false,
      isUserOverridden: false,
      warning,
    };
  }

  const [appIndustry, data] = industrySeed;
  return {
    status: "ready",
    message: "Damodaran beta manual seed loaded. Values are not live data.",
    value: data.unleveredBeta,
    unleveredBeta: data.unleveredBeta,
    cashAdjustedBeta: data.cashAdjustedBeta,
    appIndustry,
    damodaranIndustry: data.damodaranIndustry,
    source: seed.source,
    sourceUrl: seed.sourceUrl,
    dataCurrentUrl: seed.dataCurrentUrl,
    sourceDate: seed.sourceDate,
    fetchedAt,
    datasetAgeDays,
    refreshStatus: seed.refreshStatus as DamodaranBetaRefreshStatus,
    confidence: data.confidence,
    isLiveData: false,
    isUserOverridden: false,
    warning,
  };
}
