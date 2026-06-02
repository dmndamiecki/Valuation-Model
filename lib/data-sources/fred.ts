import type { DataConfidence, DataPoint, DataFetchStatus, MarketDataSnapshot } from "./types";

const manualSource = "FRED manual placeholder pending automated import";
const fredSource = "FRED";
const sourceUrl = "https://fred.stlouisfed.org/";
const apiSourceUrl = "https://api.stlouisfed.org/fred/series/observations";
const sourceDate = "manual placeholder pending automated import";

export const fredRiskFreeRateSeriesByCountry: Record<string, string> = {
  poland: "IRLTLT01PLM156N",
  germany: "IRLTLT01DEM156N",
  france: "IRLTLT01FRM156N",
  italy: "IRLTLT01ITM156N",
  "united states": "GS10",
  usa: "GS10",
  us: "GS10",
  "united kingdom": "IRLTLT01GBM156N",
  uk: "IRLTLT01GBM156N",
  canada: "IRLTLT01CAM156N",
  australia: "IRLTLT01AUM156N",
};

export type FredRiskFreeRateResult = {
  status: DataFetchStatus | "fallback";
  message: string;
  country: string;
  value: number | null;
  source: "FRED";
  sourceUrl: string;
  seriesId: string | null;
  observationDate: string | null;
  fetchedAt: string;
  confidence: DataConfidence;
  isUserOverridden: boolean;
};

type FredObservation = {
  date?: string;
  value?: string;
};

type FredObservationResponse = {
  observations?: FredObservation[];
  error_message?: string;
};

function point(value: number, fetchedAt: string): DataPoint<number> {
  return {
    value,
    source: manualSource,
    sourceUrl,
    sourceDate,
    fetchedAt,
    confidence: "low",
    isUserOverridden: false,
  };
}

function normalizeCountry(country: string) {
  return country.trim().toLowerCase();
}

export function getFredRiskFreeRateSeriesId(country: string) {
  return fredRiskFreeRateSeriesByCountry[normalizeCountry(country)] ?? null;
}

function unavailableResult(country: string, message: string, seriesId: string | null = null): FredRiskFreeRateResult {
  return {
    status: seriesId ? "not_configured" : "fallback",
    message,
    country,
    value: null,
    source: fredSource,
    sourceUrl: apiSourceUrl,
    seriesId,
    observationDate: null,
    fetchedAt: new Date().toISOString(),
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

export async function fetchFredRiskFreeRate(country: string, apiKey = process.env.FRED_API_KEY): Promise<FredRiskFreeRateResult> {
  const seriesId = getFredRiskFreeRateSeriesId(country);
  if (!seriesId) {
    return unavailableResult(country, `No FRED risk-free rate series mapping exists for ${country || "selected country"}.`);
  }

  if (!apiKey) {
    return unavailableResult(country, "FRED_API_KEY is not configured.", seriesId);
  }

  const fetchedAt = new Date().toISOString();
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "10",
  });
  const response = await fetch(`${apiSourceUrl}?${params.toString()}`, { cache: "no-store" });
  const payload = await response.json() as FredObservationResponse;

  if (!response.ok) {
    throw new Error(payload.error_message ?? `FRED request failed with status ${response.status}.`);
  }

  const latestObservation = (payload.observations ?? []).find((observation) => {
    if (!observation.value || observation.value === ".") return false;
    return Number.isFinite(Number(observation.value));
  });

  if (!latestObservation) {
    return {
      status: "fallback",
      message: `No valid numeric FRED observations were returned for ${seriesId}.`,
      country,
      value: null,
      source: fredSource,
      sourceUrl: apiSourceUrl,
      seriesId,
      observationDate: null,
      fetchedAt,
      confidence: "low",
      isUserOverridden: false,
    };
  }

  const percentValue = Number(latestObservation.value);

  return {
    status: "ready",
    message: "Risk-free rate fetched from FRED.",
    country,
    value: percentValue / 100,
    source: fredSource,
    sourceUrl: apiSourceUrl,
    seriesId,
    observationDate: latestObservation.date ?? null,
    fetchedAt,
    confidence: "high",
    isUserOverridden: false,
  };
}
