import { NextResponse } from "next/server";
import { searchBizRaportCompanies } from "@/lib/data-sources/bizraport";

const sourceMetadata = {
  source: "BizRaport",
  sourceUrl: "https://api.bizraport.pl",
  fetchedAt: new Date().toISOString(),
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? searchParams.get("q") ?? "";
  const limit = Number(searchParams.get("limit") ?? 10);

  try {
    const response = await searchBizRaportCompanies(query, Number.isFinite(limit) ? limit : 10);
    return NextResponse.json({
      status: "ready",
      data: response.data ?? [],
      dane_uciete: response.dane_uciete ?? false,
      sourceMetadata: { ...sourceMetadata, fetchedAt: new Date().toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown BizRaport search error.";
    const status = message.includes("credentials") ? 500 : 400;
    return NextResponse.json({ status: "error", data: [], error: message, sourceMetadata: { ...sourceMetadata, fetchedAt: new Date().toISOString() } }, { status });
  }
}
