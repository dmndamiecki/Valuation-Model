import { NextResponse } from "next/server";
import { getDamodaranErpSuggestion } from "@/lib/data-sources/damodaran-erp";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? "";
  const valuationDate = searchParams.get("valuationDate") ?? undefined;
  return NextResponse.json(getDamodaranErpSuggestion(country, valuationDate));
}
