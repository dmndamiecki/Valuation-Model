import { NextResponse } from "next/server";
import { getDamodaranEuropeBenchmark, getDamodaranEuropeSnapshot } from "@/lib/data-sources/damodaran-europe";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pkdCode = searchParams.get("pkdCode") ?? "";
  const appIndustry = searchParams.get("industry") ?? "";
  const description = searchParams.get("description") ?? "";
  const includeDataset = searchParams.get("includeDataset") === "true";
  const benchmark = getDamodaranEuropeBenchmark({ pkdCode, appIndustry, description });

  return NextResponse.json({
    ...benchmark,
    dataset: includeDataset ? getDamodaranEuropeSnapshot() : undefined,
  });
}
