import type { DataPoint, MarketDataSnapshot } from "./types";

const source = "Damodaran sector dataset manual seed pending automated import";
const sourceUrl = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html";
const sourceDate = "manual seed pending automated import";

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

export function createDamodaranManualSeedSnapshot(fetchedAt = new Date().toISOString()): MarketDataSnapshot {
  return {
    status: "not_configured",
    sourceDate,
    fetchedAt,
    equityRiskPremium: point(0.055, fetchedAt),
    beta: point(1.0, fetchedAt),
    evEbitdaMultiple: point(6.0, fetchedAt),
    evRevenueMultiple: point(1.0, fetchedAt),
    notes: [
      "Manual seed pending automated import; values are not live market data.",
      "Use Refresh market data only as a UI placeholder until a server/API layer is added.",
    ],
  };
}
