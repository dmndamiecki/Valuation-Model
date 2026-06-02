import { NextResponse } from "next/server";
import { buildKrsDebugSnapshot, fetchPublicKrsProfile, mapKrsResponseToCompanyProfileData } from "@/lib/data-sources/krs";

const sourceMetadata = {
  source: "Public KRS API",
  sourceUrl: "https://api-krs.ms.gov.pl",
};

function isKrsDebugEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview" || process.env.NEXT_PUBLIC_DEBUG_KRS === "true";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const krs = searchParams.get("krs") ?? "";
  const rejestr = searchParams.get("rejestr") ?? "P";
  const fetchedAt = new Date().toISOString();

  try {
    const response = await fetchPublicKrsProfile({ krs, rejestr });
    const profile = mapKrsResponseToCompanyProfileData(response, fetchedAt);
    const debug = isKrsDebugEnabled() ? buildKrsDebugSnapshot(response, profile) : undefined;

    return NextResponse.json({
      status: "ready",
      data: profile,
      debug,
      sourceMetadata: { ...sourceMetadata, sourceDate: profile.sourceDate, fetchedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Public KRS API fetch error.";
    return NextResponse.json({ status: "error", data: null, error: message, sourceMetadata: { ...sourceMetadata, fetchedAt } }, { status: 400 });
  }
}
