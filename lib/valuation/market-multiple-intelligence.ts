import type { PeerBenchmarkResult } from "./peer-benchmarks";
import type { MarketMultiplesAssumptions, ValuationInput } from "./types";

export type MarketMultipleSourceKind = MarketMultiplesAssumptions["source"]["kind"];

export type MarketMultipleIntelligence = {
  posture: "approved" | "draft" | "needs-evidence";
  title: string;
  summary: string;
  suggestedNextActions: string[];
  aiAnalystRole: string;
};

const sourceKindLabels: Record<MarketMultipleSourceKind, string> = {
  manual: "Manual analyst input",
  publicComparable: "GPW/NewConnect public comparable",
  damodaranSector: "Damodaran sector fallback",
  licensedProvider: "Licensed market data provider",
  aiSuggested: "AI-assisted draft",
};

export function marketMultipleSourceKindLabel(kind: MarketMultipleSourceKind) {
  return sourceKindLabels[kind];
}

export function assessMarketMultipleIntelligence(
  input: ValuationInput,
  peerBenchmarks: PeerBenchmarkResult | null,
): MarketMultipleIntelligence {
  const source = input.marketMultiples.source;
  const hasUsefulMultiples = input.marketMultiples.evEbitdaMultiple > 0 || input.marketMultiples.evRevenueMultiple > 0;
  const hasPeerScreen = Boolean(peerBenchmarks && peerBenchmarks.catalogCount > 0);
  const posture =
    source.approvalStatus === "approved" && hasUsefulMultiples
      ? "approved"
      : hasUsefulMultiples
        ? "draft"
        : "needs-evidence";

  const nextActions: string[] = [];
  if (!hasPeerScreen) {
    nextActions.push("Fetch a BizRaport peer screen to validate PKD, revenue scale, and margin comparability.");
  }
  if (source.kind === "manual" || source.kind === "aiSuggested") {
    nextActions.push("Attach GPW/NewConnect, Damodaran, licensed provider, or analyst-reviewed evidence for the selected EV/EBITDA and EV/Revenue multiples.");
  }
  if (source.approvalStatus !== "approved") {
    nextActions.push("Approve the selected multiples only after outliers and source evidence are reviewed.");
  }

  return {
    posture,
    title: posture === "approved" ? "Approved market multiple support" : posture === "draft" ? "Draft market multiple support" : "Market multiple evidence required",
    summary: `${sourceKindLabels[source.kind]}${source.damodaranIndustry ? ` (${source.region ?? "Europe"} / ${source.damodaranIndustry})` : ""} is currently used for ${input.marketMultiples.evEbitdaMultiple.toFixed(1)}x EV/EBITDA and ${input.marketMultiples.evRevenueMultiple.toFixed(1)}x EV/Revenue. BizRaport peers support screening quality; they do not create direct trading multiples on their own.`,
    suggestedNextActions: nextActions,
    aiAnalystRole: "AI can rank peers, summarize public company descriptions, flag outliers, and draft rationale. The valuation engine should only use source-traced and analyst-approved multiples.",
  };
}
