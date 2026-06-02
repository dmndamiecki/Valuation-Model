import { NextResponse } from "next/server";
import { fetchFredRiskFreeRate } from "@/lib/data-sources/fred";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? "";

  try {
    const result = await fetchFredRiskFreeRate(country);
    const status = result.status === "ready" ? 200 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "FRED risk-free rate fetch failed.",
        country,
        value: null,
        source: "FRED",
        sourceUrl: "https://api.stlouisfed.org/fred/series/observations",
        seriesId: null,
        observationDate: null,
        fetchedAt: new Date().toISOString(),
        confidence: "low",
        isUserOverridden: false,
      },
      { status: 200 },
    );
  }
}
