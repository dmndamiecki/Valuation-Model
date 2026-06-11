import type { PeerBenchmarkResult, PeerBenchmarkMetric } from "./peer-benchmarks";
import type { ValuationInput } from "./types";

export type PeerBenchmarkDiagnostic = {
  code: string;
  severity: "info" | "warning" | "critical";
  metric: PeerBenchmarkMetric;
  message: string;
  suggestedAction: string;
};

function latestHistorical(input: ValuationInput) {
  return input.historicals[input.historicals.length - 1];
}

function latestCompanyMetric(input: ValuationInput, metric: PeerBenchmarkMetric): number | null {
  const latest = latestHistorical(input);
  if (metric === "revenue") return latest.revenue;
  if (metric === "ebitda") return latest.ebitda;
  if (metric === "ebitdaMargin") return latest.revenue === 0 ? null : latest.ebitda / latest.revenue;
  if (metric === "assets") return null;
  if (metric === "liabilities") return input.bridge.debt + input.bridge.leasing + input.bridge.otherDebtLikeItems || null;
  if (metric === "debtRatio") {
    const debtLikeItems = input.bridge.debt + input.bridge.leasing + input.bridge.otherDebtLikeItems;
    const investedCapitalProxy = debtLikeItems + Math.max(0, latest.ebitda * input.marketMultiples.evEbitdaMultiple);
    return investedCapitalProxy === 0 ? null : debtLikeItems / investedCapitalProxy;
  }
  if (metric === "revenueCagr3Y") {
    const first = input.historicals[0];
    const span = latest.year - first.year;
    if (first.revenue <= 0 || latest.revenue <= 0 || span <= 0) return null;
    return (latest.revenue / first.revenue) ** (1 / span) - 1;
  }
  return null;
}

export function calculatePeerBenchmarkDiagnostics(
  input: ValuationInput,
  benchmarks: PeerBenchmarkResult,
): PeerBenchmarkDiagnostic[] {
  const diagnostics: PeerBenchmarkDiagnostic[] = [];

  for (const stats of benchmarks.metrics) {
    if (stats.count < 5 || stats.p25 === null || stats.p75 === null || stats.median === null) {
      continue;
    }

    const companyValue = latestCompanyMetric(input, stats.metric);
    if (companyValue === null || !Number.isFinite(companyValue)) {
      continue;
    }

    if (companyValue < stats.p25 || companyValue > stats.p75) {
      diagnostics.push({
        code: `PEER_BENCHMARK_OUTLIER_${stats.metric.toUpperCase()}`,
        severity: "warning",
        metric: stats.metric,
        message: `${stats.metric} is outside the BizRaport peer interquartile range.`,
        suggestedAction: "Review whether the company is genuinely an outlier or whether imported data, forecast assumptions, or bridge inputs need correction.",
      });
    }
  }

  if (benchmarks.sampledFinancialCount > 0 && benchmarks.sampledFinancialCount < 10) {
    diagnostics.push({
      code: "PEER_SAMPLE_BELOW_10",
      severity: "info",
      metric: "revenue",
      message: "BizRaport peer benchmark sample has fewer than 10 companies.",
      suggestedAction: "Increase sample_limit or broaden filters before using peer statistics as valuation support.",
    });
  }

  return diagnostics;
}

