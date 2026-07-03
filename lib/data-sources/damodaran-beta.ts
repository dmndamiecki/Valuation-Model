import type { DataConfidence } from "./types";
import { getDamodaranEuropeBenchmark } from "./damodaran-europe";

export type DamodaranBetaRefreshStatus = "manual_seed" | "downloaded_snapshot";

export type DamodaranBetaSuggestion = {
  status: "ready" | "fallback";
  message: string;
  value: number | null;
  unleveredBeta: number | null;
  cashAdjustedBeta: number | null;
  totalUnleveredBeta?: number | null;
  costOfCapitalLocal?: number | null;
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
const refreshAgeWarningDays = 180;

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

export function getDamodaranBetaSuggestion(params: string | { industry?: string; pkdCode?: string; description?: string }, valuationDateOrToday = new Date().toISOString()): DamodaranBetaSuggestion {
  const industry = typeof params === "string" ? params : params.industry ?? "";
  const benchmark = getDamodaranEuropeBenchmark(typeof params === "string" ? { appIndustry: industry } : {
    appIndustry: industry,
    pkdCode: params.pkdCode,
    description: params.description,
  });
  const datasetAgeDays = calculateDatasetAgeDays(benchmark.sourceDate, valuationDateOrToday);
  const warning = getDamodaranBetaRefreshWarning(benchmark.sourceDate, valuationDateOrToday);

  if (!benchmark.industry) {
    return {
      status: "fallback",
      message: `No Damodaran Europe beta benchmark is mapped for ${industry || "selected industry"}.`,
      value: null,
      unleveredBeta: null,
      cashAdjustedBeta: null,
      totalUnleveredBeta: null,
      costOfCapitalLocal: null,
      appIndustry: industry,
      damodaranIndustry: null,
      source: benchmark.source,
      sourceUrl: benchmark.sourceUrl,
      dataCurrentUrl: benchmark.dataCurrentUrl,
      sourceDate: benchmark.sourceDate,
      fetchedAt: benchmark.fetchedAt,
      datasetAgeDays,
      refreshStatus: benchmark.refreshStatus as DamodaranBetaRefreshStatus,
      confidence: "medium",
      isLiveData: false,
      isUserOverridden: false,
      warning,
    };
  }

  return {
    status: "ready",
    message: "Damodaran Europe beta benchmark loaded from local 2026 snapshot.",
    value: benchmark.industry.cashAdjustedUnleveredBeta ?? benchmark.industry.unleveredBeta ?? null,
    unleveredBeta: benchmark.industry.unleveredBeta ?? null,
    cashAdjustedBeta: benchmark.industry.cashAdjustedUnleveredBeta ?? null,
    totalUnleveredBeta: benchmark.industry.totalUnleveredBeta ?? null,
    costOfCapitalLocal: benchmark.industry.costOfCapitalLocal ?? null,
    appIndustry: industry,
    damodaranIndustry: benchmark.industry.industryName,
    source: benchmark.source,
    sourceUrl: benchmark.sourceUrl,
    dataCurrentUrl: benchmark.dataCurrentUrl,
    sourceDate: benchmark.sourceDate,
    fetchedAt: benchmark.fetchedAt,
    datasetAgeDays,
    refreshStatus: benchmark.refreshStatus as DamodaranBetaRefreshStatus,
    confidence: benchmark.confidence,
    isLiveData: false,
    isUserOverridden: false,
    warning,
  };
}
