import { NextResponse } from "next/server";
import {
  buildBizRaportDebugSnapshot,
  fetchBizRaportCompanyData,
  isBizRaportDebugEnabled,
  mapBizRaportResponseToCompanyFinancialData,
} from "@/lib/data-sources/bizraport";

const sourceMetadata = {
  source: "BizRaport",
  sourceUrl: "https://api.bizraport.pl",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const krs = searchParams.get("krs") ?? undefined;
  const nip = searchParams.get("nip") ?? undefined;
  const fetchedAt = new Date().toISOString();

  try {
    const response = await fetchBizRaportCompanyData({ krs, nip });
    const companyData = mapBizRaportResponseToCompanyFinancialData(response, fetchedAt);
    const debug = isBizRaportDebugEnabled() ? buildBizRaportDebugSnapshot(response, companyData) : undefined;

    return NextResponse.json({
      status: "ready",
      data: companyData,
      debug,
      sourceMetadata: { ...sourceMetadata, sourceDate: companyData.sourceDate, fetchedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown BizRaport fetch error.";
    const status = message.includes("credentials") ? 500 : 400;
    return NextResponse.json({ status: "error", data: null, error: message, sourceMetadata: { ...sourceMetadata, fetchedAt } }, { status });
  }
}
