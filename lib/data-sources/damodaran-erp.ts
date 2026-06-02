import erpSeed from "@/data/market/damodaran-erp-seed.json";
import type { DataConfidence } from "./types";

export type DamodaranErpRefreshStatus = "manual_seed";

export type DamodaranErpSuggestion = {
  status: "ready" | "fallback";
  message: string;
  value: number | null;
  matureMarketErp: number | null;
  countryRiskPremium: number | null;
  totalErp: number | null;
  corporateTaxRate?: number;
  country: string;
  source: string;
  sourceUrl: string;
  dataCurrentUrl: string;
  sourceDate: string;
  fetchedAt: string;
  datasetAgeDays: number;
  refreshStatus: DamodaranErpRefreshStatus;
  confidence: DataConfidence;
  isLiveData: false;
  isUserOverridden: false;
  warning?: string;
};

type ErpSeedCountry = {
  countryRiskPremium: number;
  totalErp: number;
  corporateTaxRate?: number;
};

type ErpSeed = typeof erpSeed & {
  countries: Record<string, ErpSeedCountry>;
};

const seed = erpSeed as ErpSeed;
const refreshAgeWarningDays = 180;

function normalizeCountry(country: string) {
  return country.trim().toLowerCase();
}

function findCountrySeed(country: string): [string, ErpSeedCountry] | null {
  const normalized = normalizeCountry(country);
  const entry = Object.entries(seed.countries).find(([countryName]) => normalizeCountry(countryName) === normalized);
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

export function getDamodaranErpRefreshWarning(sourceDate: string, valuationDateOrToday = new Date().toISOString()) {
  const datasetAgeDays = calculateDatasetAgeDays(sourceDate, valuationDateOrToday);
  return datasetAgeDays > refreshAgeWarningDays
    ? "Damodaran ERP seed dataset is older than 180 days. Consider refreshing market assumptions."
    : undefined;
}

export function getDamodaranErpSuggestion(country: string, valuationDateOrToday = new Date().toISOString()): DamodaranErpSuggestion {
  const datasetAgeDays = calculateDatasetAgeDays(seed.sourceDate, valuationDateOrToday);
  const warning = getDamodaranErpRefreshWarning(seed.sourceDate, valuationDateOrToday);
  const fetchedAt = new Date().toISOString();
  const countrySeed = findCountrySeed(country);

  if (!countrySeed) {
    return {
      status: "fallback",
      message: `No Damodaran ERP manual seed is mapped for ${country || "selected country"}.`,
      value: null,
      matureMarketErp: seed.matureMarketErp / 100,
      countryRiskPremium: null,
      totalErp: null,
      country,
      source: seed.source,
      sourceUrl: seed.sourceUrl,
      dataCurrentUrl: seed.dataCurrentUrl,
      sourceDate: seed.sourceDate,
      fetchedAt,
      datasetAgeDays,
      refreshStatus: seed.refreshStatus as DamodaranErpRefreshStatus,
      confidence: "medium",
      isLiveData: false,
      isUserOverridden: false,
      warning,
    };
  }

  const [matchedCountry, data] = countrySeed;
  return {
    status: "ready",
    message: "Damodaran ERP manual seed loaded. Values are not live data.",
    value: data.totalErp / 100,
    matureMarketErp: seed.matureMarketErp / 100,
    countryRiskPremium: data.countryRiskPremium / 100,
    totalErp: data.totalErp / 100,
    corporateTaxRate: data.corporateTaxRate === undefined ? undefined : data.corporateTaxRate / 100,
    country: matchedCountry,
    source: seed.source,
    sourceUrl: seed.sourceUrl,
    dataCurrentUrl: seed.dataCurrentUrl,
    sourceDate: seed.sourceDate,
    fetchedAt,
    datasetAgeDays,
    refreshStatus: seed.refreshStatus as DamodaranErpRefreshStatus,
    confidence: "medium",
    isLiveData: false,
    isUserOverridden: false,
    warning,
  };
}
