import { fetchBizRaportCompanyData, mapBizRaportResponseToCompanyFinancialData } from "@/lib/data-sources/bizraport";
import {
  effectiveFinancialSampleLimit,
  fetchBizRaportCatalog,
  type BizRaportCatalogFilters,
} from "@/lib/data-sources/bizraport-catalog";
import type { CompanyFinancialData, ImportedFinancialYear } from "@/lib/data-sources/types";

export type PeerBenchmarkMetric =
  | "revenue"
  | "ebitda"
  | "ebitdaMargin"
  | "netMargin"
  | "operatingMargin"
  | "roa"
  | "roe"
  | "debtRatio"
  | "assets"
  | "equity"
  | "liabilities"
  | "revenueCagr3Y";

export type PeerBenchmarkStats = {
  metric: PeerBenchmarkMetric;
  count: number;
  p25: number | null;
  median: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
};

export type PeerBenchmarkResult = {
  source: "BizRaport";
  sourceUrl: string;
  fetchedAt: string;
  catalogCount: number;
  sampledFinancialCount: number;
  sampleLimit: number;
  peerKrs: string[];
  metrics: PeerBenchmarkStats[];
  warnings: string[];
  notes: string[];
};

function latestYear(company: CompanyFinancialData): ImportedFinancialYear | undefined {
  return [...company.years].sort((a, b) => b.year - a.year)[0];
}

function dataValue(year: ImportedFinancialYear | undefined, metric: keyof ImportedFinancialYear): number | null {
  const point = year?.[metric];
  if (point && typeof point === "object" && "value" in point && typeof point.value === "number" && Number.isFinite(point.value)) {
    return point.value;
  }
  return null;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function revenueCagr3Y(company: CompanyFinancialData): number | null {
  const years = [...company.years].sort((a, b) => a.year - b.year).filter((year) => dataValue(year, "revenue") !== null);
  if (years.length < 2) {
    return null;
  }
  const oldest = years[Math.max(0, years.length - 3)];
  const latest = years[years.length - 1];
  const oldestRevenue = dataValue(oldest, "revenue");
  const latestRevenue = dataValue(latest, "revenue");
  const yearSpan = latest.year - oldest.year;

  if (!oldestRevenue || !latestRevenue || yearSpan <= 0) {
    return null;
  }

  return (latestRevenue / oldestRevenue) ** (1 / yearSpan) - 1;
}

function metricValue(company: CompanyFinancialData, metric: PeerBenchmarkMetric): number | null {
  const latest = latestYear(company);
  if (metric === "revenueCagr3Y") {
    return revenueCagr3Y(company);
  }
  if (metric === "ebitdaMargin") {
    return dataValue(latest, "ebitdaMargin") ?? ratio(dataValue(latest, "ebitda"), dataValue(latest, "revenue"));
  }
  return dataValue(latest, metric);
}

function percentile(sortedValues: number[], percentileValue: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function stats(metric: PeerBenchmarkMetric, values: number[]): PeerBenchmarkStats {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    metric,
    count: sorted.length,
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
  };
}

async function fetchPeerFinancials(krsList: string[], sampleLimit: number, fetchedAt: string) {
  const companies: CompanyFinancialData[] = [];
  const warnings: string[] = [];

  for (const krs of krsList.slice(0, sampleLimit)) {
    try {
      const response = await fetchBizRaportCompanyData({ krs });
      companies.push(mapBizRaportResponseToCompanyFinancialData(response, fetchedAt));
    } catch (error) {
      warnings.push(`Skipped peer ${krs}: ${error instanceof Error ? error.message : "BizRaport /api/dane failed."}`);
    }
  }

  return { companies, warnings };
}

export async function buildBizRaportPeerBenchmarks(
  filters: BizRaportCatalogFilters,
  requestedSampleLimit: number | undefined,
): Promise<PeerBenchmarkResult> {
  const catalog = await fetchBizRaportCatalog(filters);
  const sampleLimit = effectiveFinancialSampleLimit(requestedSampleLimit);
  const fetchedAt = new Date().toISOString();
  const peerKrs = catalog.companies.map((company) => company.krs);
  const notes: string[] = [
    "Catalog lookup is used as the low-cost peer screen. Full /api/dane financial fetches are capped and should be reserved for selected peer samples.",
  ];
  const warnings = [...catalog.warnings];

  if (sampleLimit === 0) {
    notes.push("No /api/dane peer sample was requested, so benchmark metrics are not calculated.");
    return {
      source: "BizRaport",
      sourceUrl: catalog.sourceUrl,
      fetchedAt,
      catalogCount: catalog.returnedCount,
      sampledFinancialCount: 0,
      sampleLimit,
      peerKrs,
      metrics: [],
      warnings,
      notes,
    };
  }

  const peerFinancials = await fetchPeerFinancials(peerKrs, sampleLimit, fetchedAt);
  warnings.push(...peerFinancials.warnings);

  const benchmarkMetrics: PeerBenchmarkMetric[] = [
    "revenue",
    "ebitda",
    "ebitdaMargin",
    "netMargin",
    "operatingMargin",
    "roa",
    "roe",
    "debtRatio",
    "assets",
    "equity",
    "liabilities",
    "revenueCagr3Y",
  ];

  return {
    source: "BizRaport",
    sourceUrl: catalog.sourceUrl,
    fetchedAt,
    catalogCount: catalog.returnedCount,
    sampledFinancialCount: peerFinancials.companies.length,
    sampleLimit,
    peerKrs,
    metrics: benchmarkMetrics.map((metric) => stats(metric, peerFinancials.companies.map((company) => metricValue(company, metric)).filter((value): value is number => value !== null))),
    warnings,
    notes,
  };
}

