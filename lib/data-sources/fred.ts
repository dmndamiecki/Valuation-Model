import type { DataPoint, MarketDataSnapshot } from "./types";

const source = "FRED manual placeholder pending automated import";
const sourceUrl = "https://fred.stlouisfed.org/";
const sourceDate = "manual placeholder pending automated import";

function point(value: number, fetchedAt: string): DataPoint<number> {
  return {
    value,
    source,
    sourceUrl,
    sourceDate,
    fetchedAt,
    confidence: "low",
    isUserOverridden: false,
  };
}

export function createFredManualSeedSnapshot(fetchedAt = new Date().toISOString()): MarketDataSnapshot {
  return {
    status: "not_configured",
    sourceDate,
    fetchedAt,
    riskFreeRate: point(0.05, fetchedAt),
    notes: [
      "Manual placeholder pending automated import; no FRED request has been made.",
      "A future server-side integration can refresh Treasury yields without exposing API keys in the browser.",
    ],
  };
}
