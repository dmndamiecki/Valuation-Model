import { NextResponse } from "next/server";
import { suggestDamodaranEuropeIndustry } from "@/lib/data-sources/damodaran-europe";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(suggestDamodaranEuropeIndustry({
    pkdCode: searchParams.get("pkdCode") ?? "",
    appIndustry: searchParams.get("industry") ?? "",
    description: searchParams.get("description") ?? "",
  }));
}
