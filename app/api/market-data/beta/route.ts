import { NextResponse } from "next/server";
import { getDamodaranBetaSuggestion } from "@/lib/data-sources/damodaran-beta";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const industry = searchParams.get("industry") ?? "";
  const pkdCode = searchParams.get("pkdCode") ?? "";
  const description = searchParams.get("description") ?? "";
  const valuationDate = searchParams.get("valuationDate") ?? undefined;
  return NextResponse.json(getDamodaranBetaSuggestion({ industry, pkdCode, description }, valuationDate));
}
