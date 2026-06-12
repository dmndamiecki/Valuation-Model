import type { BizRaportCatalogFilters } from "@/lib/data-sources/bizraport-catalog";
import type { PeerBenchmarkMetric, PeerBenchmarkResult, PeerBenchmarkStats } from "./peer-benchmarks";
import type { MarketMultiplesAssumptions, ValuationInput } from "./types";

export type PeerSetFilterSummary = {
  pkdSection?: string;
  pkdDivision?: string;
  pkdSubclass?: string;
  revenueFrom?: number;
  revenueTo?: number;
  ebitdaFrom?: number;
  ebitdaTo?: number;
  assetsFrom?: number;
  assetsTo?: number;
  source: "BizRaport";
};

export type PeerSetQuality = {
  score: number;
  sampleSizeScore: number;
  pkdMatchScore: number;
  revenueScaleScore: number;
  recencyScore: number;
  outlierScore: number;
  outlierRate: number;
};

export type PeerSet = {
  source: "BizRaport";
  sourceUrl: string;
  fetchedAt: string;
  filters: PeerSetFilterSummary;
  peerCount: number;
  sampledFinancialCount: number;
  peerKrs: string[];
  metrics: PeerBenchmarkStats[];
  quality: PeerSetQuality;
  warnings: string[];
  notes: string[];
};

export type MultiplesSourceKind = MarketMultiplesAssumptions["source"]["kind"];

export type ComparableCompaniesMultiplesSource = {
  kind: MultiplesSourceKind;
  label: string;
  evEbitdaMultiple: number | null;
  evRevenueMultiple: number | null;
  confidence: "high" | "medium" | "low";
  approvalStatus: MarketMultiplesAssumptions["source"]["approvalStatus"];
  sourceDate: string;
  sourceUrl?: string;
  note: string;
};

export type ComparableCompaniesDiagnosticCode =
  | "NO_PEER_SET"
  | "PEER_SAMPLE_TOO_SMALL"
  | "WEAK_PKD_MATCH"
  | "STALE_OR_UNSAMPLED_FINANCIALS"
  | "REVENUE_SCALE_MISMATCH"
  | "MARGIN_DISPERSION_TOO_WIDE"
  | "MISSING_VALID_MULTIPLES"
  | "MULTIPLES_NOT_APPROVED"
  | "BIZRAPORT_NOT_MULTIPLE_SOURCE"
  | "EV_BRIDGE_INCOMPLETE";

export type ComparableCompaniesDiagnostic = {
  code: ComparableCompaniesDiagnosticCode;
  severity: "info" | "warning" | "critical";
  message: string;
};

export type ComparableCompaniesResult = {
  status: "ready" | "review" | "missing-data";
  peerSet: PeerSet | null;
  multiplesSource: ComparableCompaniesMultiplesSource;
  impliedEnterpriseValue: {
    ebitda: number | null;
    revenue: number | null;
    weighted: number | null;
  };
  enterpriseValueRange: { low: number; base: number; high: number };
  diagnostics: ComparableCompaniesDiagnostic[];
  confidenceScore: number;
  missingSources: string[];
};

function latestHistorical(input: ValuationInput) {
  return input.historicals[input.historicals.length - 1];
}

function parsePkd(pkdCode: string) {
  const normalized = pkdCode.trim().toUpperCase();
  const division = normalized.match(/\d{2}/)?.[0];
  const section = normalized.match(/^[A-Z]/)?.[0];
  return { section, division, subclass: normalized || undefined };
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function metricStats(peerSet: PeerSet | null, metric: PeerBenchmarkMetric): PeerBenchmarkStats | null {
  return peerSet?.metrics.find((stats) => stats.metric === metric) ?? null;
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildBizRaportPeerFilters(input: ValuationInput): BizRaportCatalogFilters {
  const latest = latestHistorical(input);
  const { section, division, subclass } = parsePkd(input.profile.pkdCode);
  const revenue = latest.revenue;
  const ebitda = latest.ebitda;
  const revenueBand = revenue > 0 ? { from: revenue * 0.4, to: revenue * 2.5 } : { from: undefined, to: undefined };
  const ebitdaBand = ebitda > 0 ? { from: ebitda * 0.25, to: ebitda * 4 } : { from: undefined, to: undefined };

  return {
    pkdSekcja: section,
    pkdDzial: division,
    pkdPodklasa: subclass,
    przychodyOd: revenueBand.from,
    przychodyDo: revenueBand.to,
    ebitdaOd: ebitdaBand.from,
    ebitdaDo: ebitdaBand.to,
    nieWykreslona: true,
    limit: 250,
  };
}

export function summarizePeerFilters(filters: BizRaportCatalogFilters): PeerSetFilterSummary {
  return {
    pkdSection: filters.pkdSekcja,
    pkdDivision: filters.pkdDzial,
    pkdSubclass: filters.pkdPodklasa,
    revenueFrom: filters.przychodyOd,
    revenueTo: filters.przychodyDo,
    ebitdaFrom: filters.ebitdaOd,
    ebitdaTo: filters.ebitdaDo,
    assetsFrom: filters.sumaBilansowaOd,
    assetsTo: filters.sumaBilansowaDo,
    source: "BizRaport",
  };
}

function calculateOutlierRate(input: ValuationInput, benchmark: PeerBenchmarkResult) {
  const latest = latestHistorical(input);
  const checks: Array<{ metric: PeerBenchmarkMetric; value: number | null }> = [
    { metric: "revenue", value: latest.revenue },
    { metric: "ebitda", value: latest.ebitda },
    { metric: "ebitdaMargin", value: safeDivide(latest.ebitda, latest.revenue) },
  ];
  let comparableChecks = 0;
  let outliers = 0;

  for (const check of checks) {
    const stats = benchmark.metrics.find((item) => item.metric === check.metric);
    if (!stats || !finite(check.value) || !finite(stats.p25) || !finite(stats.p75)) {
      continue;
    }
    comparableChecks += 1;
    if (check.value < stats.p25 || check.value > stats.p75) {
      outliers += 1;
    }
  }

  return comparableChecks === 0 ? 1 : outliers / comparableChecks;
}

export function buildPeerSetFromBenchmark(input: ValuationInput, benchmark: PeerBenchmarkResult | null): PeerSet | null {
  if (!benchmark) {
    return null;
  }

  const filters = buildBizRaportPeerFilters(input);
  const outlierRate = calculateOutlierRate(input, benchmark);
  const sampleSizeScore = clamp(benchmark.sampledFinancialCount / 25, 0, 1);
  const pkdMatchScore = filters.pkdPodklasa ? 1 : filters.pkdDzial ? 0.8 : filters.pkdSekcja ? 0.55 : 0.2;
  const revenueStats = benchmark.metrics.find((item) => item.metric === "revenue");
  const latestRevenue = latestHistorical(input).revenue;
  const revenueScaleScore = finite(revenueStats?.p25) && finite(revenueStats?.p75) && latestRevenue >= revenueStats.p25 && latestRevenue <= revenueStats.p75
    ? 1
    : finite(revenueStats?.median) && latestRevenue > 0
      ? clamp(1 - Math.abs(Math.log(latestRevenue / revenueStats.median)) / Math.log(5), 0, 1)
      : 0.35;
  const recencyScore = benchmark.sampledFinancialCount > 0 ? 0.75 : 0.2;
  const outlierScore = 1 - outlierRate;
  const score = Math.round(100 * (
    sampleSizeScore * 0.3 +
    pkdMatchScore * 0.2 +
    revenueScaleScore * 0.2 +
    recencyScore * 0.15 +
    outlierScore * 0.15
  ));

  return {
    source: "BizRaport",
    sourceUrl: benchmark.sourceUrl,
    fetchedAt: benchmark.fetchedAt,
    filters: summarizePeerFilters(filters),
    peerCount: benchmark.catalogCount,
    sampledFinancialCount: benchmark.sampledFinancialCount,
    peerKrs: benchmark.peerKrs,
    metrics: benchmark.metrics,
    quality: {
      score,
      sampleSizeScore,
      pkdMatchScore,
      revenueScaleScore,
      recencyScore,
      outlierScore,
      outlierRate,
    },
    warnings: benchmark.warnings,
    notes: benchmark.notes,
  };
}

export function buildManualMultiplesSource(marketMultiples: MarketMultiplesAssumptions): ComparableCompaniesMultiplesSource {
  const hasEbitda = finite(marketMultiples.evEbitdaMultiple) && marketMultiples.evEbitdaMultiple > 0;
  const hasRevenue = finite(marketMultiples.evRevenueMultiple) && marketMultiples.evRevenueMultiple > 0;
  const source = marketMultiples.source;
  const confidence = source.approvalStatus === "approved" ? source.confidence : "low";

  return {
    kind: source.kind,
    label: source.label,
    evEbitdaMultiple: hasEbitda ? marketMultiples.evEbitdaMultiple : null,
    evRevenueMultiple: hasRevenue ? marketMultiples.evRevenueMultiple : null,
    confidence,
    approvalStatus: source.approvalStatus,
    sourceDate: source.sourceDate,
    sourceUrl: source.sourceUrl,
    note: source.rationale,
  };
}

function marginDispersionTooWide(peerSet: PeerSet | null) {
  const stats = metricStats(peerSet, "ebitdaMargin");
  if (!finite(stats?.p25) || !finite(stats?.p75)) {
    return false;
  }
  return Math.abs(stats.p75 - stats.p25) > 0.2;
}

export function calculateComparableCompanies(input: ValuationInput, benchmark: PeerBenchmarkResult | null): ComparableCompaniesResult {
  const peerSet = buildPeerSetFromBenchmark(input, benchmark);
  const multiplesSource = buildManualMultiplesSource(input.marketMultiples);
  const latest = latestHistorical(input);
  const normalizedEbitda = latest.ebitda + input.normalizationAdjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
  const impliedEvFromEbitda = finite(multiplesSource.evEbitdaMultiple) && normalizedEbitda > 0 ? normalizedEbitda * multiplesSource.evEbitdaMultiple : null;
  const impliedEvFromRevenue = finite(multiplesSource.evRevenueMultiple) && latest.revenue > 0 ? latest.revenue * multiplesSource.evRevenueMultiple : null;
  const weights = input.marketMultiples;
  const validWeightedInputs = [
    { value: impliedEvFromEbitda, weight: weights.ebitdaWeight },
    { value: impliedEvFromRevenue, weight: 1 - weights.ebitdaWeight },
  ].filter((item): item is { value: number; weight: number } => finite(item.value) && item.weight > 0);
  const totalWeight = validWeightedInputs.reduce((sum, item) => sum + item.weight, 0);
  const weightedEv = totalWeight > 0
    ? validWeightedInputs.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
    : null;
  const diagnostics: ComparableCompaniesDiagnostic[] = [];
  const missingSources: string[] = [];

  if (!peerSet) {
    diagnostics.push({ code: "NO_PEER_SET", severity: "critical", message: "Comparable Companies requires a BizRaport peer screen before it can be used as a full engine." });
    missingSources.push("BizRaport peer set");
  } else {
    if (peerSet.sampledFinancialCount < 10) diagnostics.push({ code: "PEER_SAMPLE_TOO_SMALL", severity: "warning", message: "Peer sample has fewer than 10 financial profiles." });
    if (peerSet.quality.pkdMatchScore < 0.75) diagnostics.push({ code: "WEAK_PKD_MATCH", severity: "warning", message: "Peer screen is not matched at PKD division/subclass depth." });
    if (peerSet.quality.recencyScore < 0.5) diagnostics.push({ code: "STALE_OR_UNSAMPLED_FINANCIALS", severity: "warning", message: "Peer financial sample is stale, missing, or not fetched." });
    if (peerSet.quality.revenueScaleScore < 0.5) diagnostics.push({ code: "REVENUE_SCALE_MISMATCH", severity: "warning", message: "Subject revenue scale is outside the core peer benchmark range." });
    if (marginDispersionTooWide(peerSet)) diagnostics.push({ code: "MARGIN_DISPERSION_TOO_WIDE", severity: "warning", message: "Peer EBITDA margin dispersion is wide; multiples should be reviewed manually." });
  }

  if (!finite(weightedEv)) {
    diagnostics.push({ code: "MISSING_VALID_MULTIPLES", severity: "critical", message: "No valid EV/EBITDA or EV/Revenue multiple can be applied." });
    missingSources.push("Manual/public EV multiple evidence");
  }

  if (multiplesSource.approvalStatus !== "approved") {
    diagnostics.push({ code: "MULTIPLES_NOT_APPROVED", severity: "warning", message: "Selected market multiples are still draft and need analyst approval before the market approach is decision-grade." });
    missingSources.push("Approved market multiple source");
  }

  diagnostics.push({ code: "BIZRAPORT_NOT_MULTIPLE_SOURCE", severity: "info", message: "BizRaport peer data supports peer selection and benchmark diagnostics, not direct valuation multiples." });

  if (input.importMetadata?.bridge?.cashUnavailable || input.importMetadata?.bridge?.debtUnavailable) {
    diagnostics.push({ code: "EV_BRIDGE_INCOMPLETE", severity: "warning", message: "EV-to-equity bridge contains unavailable cash or debt fields; review equity value manually." });
  }

  const critical = diagnostics.some((diagnostic) => diagnostic.severity === "critical");
  const warning = diagnostics.some((diagnostic) => diagnostic.severity === "warning");
  const peerQuality = peerSet?.quality.score ?? 0;
  const baseConfidence = peerSet ? 25 + peerQuality * 0.45 : 10;
  const multiplesConfidence = finite(weightedEv) ? (multiplesSource.approvalStatus === "approved" ? 22 : 8) : 0;
  const confidenceScore = Math.round(clamp(baseConfidence + multiplesConfidence - diagnostics.filter((item) => item.severity === "warning").length * 5, 10, 80));
  const dispersion = peerSet ? clamp(0.35 - peerSet.quality.score / 250, 0.12, 0.35) : 0.35;
  const base = weightedEv ?? Number.NaN;

  return {
    status: critical ? "missing-data" : warning ? "review" : "ready",
    peerSet,
    multiplesSource,
    impliedEnterpriseValue: {
      ebitda: impliedEvFromEbitda,
      revenue: impliedEvFromRevenue,
      weighted: weightedEv,
    },
    enterpriseValueRange: {
      low: finite(base) ? base * (1 - dispersion) : Number.NaN,
      base,
      high: finite(base) ? base * (1 + dispersion) : Number.NaN,
    },
    diagnostics,
    confidenceScore,
    missingSources,
  };
}
