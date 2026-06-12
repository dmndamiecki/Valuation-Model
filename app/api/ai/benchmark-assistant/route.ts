import { NextResponse } from "next/server";
import { getDamodaranEuropeBenchmark, suggestDamodaranEuropeIndustry, type DamodaranEuropeBenchmark } from "@/lib/data-sources/damodaran-europe";
import { buildBenchmarkAssistantFallback, benchmarkAssistantResultSchema, type BenchmarkAssistantResult } from "@/lib/valuation/benchmark-assistant";
import { buildBizRaportPeerFilters } from "@/lib/valuation/comparable-companies";
import type { PeerBenchmarkResult } from "@/lib/valuation/peer-benchmarks";
import { summarizePublicComps } from "@/lib/valuation/public-comps";
import { valuationInputSchema, type ValuationInput } from "@/lib/valuation/types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

type RequestBody = {
  input?: unknown;
  damodaranBenchmark?: DamodaranEuropeBenchmark | null;
  peerBenchmarks?: PeerBenchmarkResult | null;
};

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const output = Array.isArray(record.output) ? record.output : [];
  const textParts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") textParts.push(text);
    }
  }

  return textParts.join("\n").trim();
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function buildPrompt(input: ValuationInput, damodaranBenchmark: DamodaranEuropeBenchmark | null, peerBenchmarks: PeerBenchmarkResult | null, fallback: BenchmarkAssistantResult) {
  const latestHistorical = [...input.historicals].sort((a, b) => b.year - a.year)[0];
  return [
    {
      role: "developer",
      content: "You are a valuation benchmark assistant for Polish private SME valuation. You may recommend industries, peer tickers, BizRaport filters, rationale and warnings. Never invent EV/EBITDA, EV/Sales, beta, WACC, market cap, EBITDA, revenue, enterprise value or any valuation number. If numeric public market data is missing, set numeric fields to null and mark the source as pending. Return JSON only.",
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Suggest a benchmark set for the current private SME valuation model.",
        company: {
          name: input.profile.companyName,
          country: input.profile.country,
          currency: input.profile.currency,
          krs: input.profile.registrationNumber,
          nip: input.profile.nip,
          regon: input.profile.regon,
          pkdCode: input.profile.pkdCode,
          appIndustry: input.profile.industry,
          legalForm: input.profile.legalForm,
          website: input.profile.website,
        },
        latestHistorical,
        currentMarketMultiples: input.marketMultiples,
        damodaranBenchmark,
        bizRaportPeerScreen: peerBenchmarks ? {
          catalogCount: peerBenchmarks.catalogCount,
          sampledFinancialCount: peerBenchmarks.sampledFinancialCount,
          metrics: peerBenchmarks.metrics,
          warnings: peerBenchmarks.warnings,
        } : null,
        ruleBasedFallback: fallback,
        requiredShape: {
          status: "ready",
          generatedAt: fallback.generatedAt,
          model: fallback.model,
          suggestedDamodaranIndustry: "string or null",
          damodaranConfidence: "high | medium | low",
          industryRationale: "string",
          suggestedPublicComps: "array of GPW/NewConnect watchlist companies; numbers must be null unless supplied in input",
          bizRaportFilters: "object with BizRaport filters",
          bizRaportRationale: "string",
          sanityWarnings: "array of warning objects",
          benchmarkRationale: "string",
          nextActions: "array of strings",
          auditNote: "string confirming AI did not create valuation numbers",
        },
      }),
    },
  ];
}

export async function POST(request: Request) {
  const generatedAt = new Date().toISOString();
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const body = await request.json().catch(() => ({})) as RequestBody;
  const parsedInput = valuationInputSchema.safeParse(body.input);

  if (!parsedInput.success) {
    return NextResponse.json({ status: "error", error: "Invalid valuation input for benchmark assistant." }, { status: 400 });
  }

  const input = parsedInput.data;
  const industrySuggestion = suggestDamodaranEuropeIndustry({
    pkdCode: input.profile.pkdCode,
    appIndustry: input.profile.industry,
    description: `${input.profile.companyName} ${input.profile.website}`,
  });
  const damodaranBenchmark = body.damodaranBenchmark ?? await getDamodaranEuropeBenchmark({
    pkdCode: input.profile.pkdCode,
    appIndustry: input.profile.industry,
    description: input.profile.companyName,
  });
  const peerBenchmarks = body.peerBenchmarks ?? null;
  const bizRaportFilters = buildBizRaportPeerFilters(input);
  const fallback = buildBenchmarkAssistantFallback({
    generatedAt,
    model,
    suggestedDamodaranIndustry: industrySuggestion.damodaranIndustry,
    damodaranConfidence: industrySuggestion.confidence,
    industryRationale: industrySuggestion.rationale,
    bizRaportFilters,
    damodaranBenchmark,
    peerBenchmarks,
  });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(buildBenchmarkAssistantFallback({
      generatedAt,
      model,
      suggestedDamodaranIndustry: industrySuggestion.damodaranIndustry,
      damodaranConfidence: industrySuggestion.confidence,
      industryRationale: industrySuggestion.rationale,
      bizRaportFilters,
      damodaranBenchmark,
      peerBenchmarks,
      unavailableReason: "OpenAI API key is not configured on the server.",
    }));
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: buildPrompt(input, damodaranBenchmark, peerBenchmarks, fallback),
        temperature: 0.2,
        max_output_tokens: 1800,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "OpenAI benchmark assistant request failed.");
    }

    const parsed = benchmarkAssistantResultSchema.safeParse(parseJsonObject(extractOutputText(payload)));
    if (!parsed.success) {
      throw new Error("AI benchmark assistant returned an invalid response shape.");
    }

    const publicCompSummary = summarizePublicComps(parsed.data.suggestedPublicComps);
    return NextResponse.json({
      ...parsed.data,
      suggestedPublicComps: parsed.data.suggestedPublicComps.map((company) => ({
        ...company,
        marketCap: null,
        netDebt: null,
        enterpriseValue: null,
        revenue: null,
        ebitda: null,
        evRevenue: null,
        evEbitda: null,
      })),
      nextActions: [
        ...parsed.data.nextActions,
        `${publicCompSummary.totalCount} public comparable candidate(s) require source-traced GPW/NewConnect data before use.`,
      ],
      auditNote: `${parsed.data.auditNote} Numeric public-company valuation fields were cleared server-side unless supplied by a trusted data connector.`,
    });
  } catch (error) {
    return NextResponse.json(buildBenchmarkAssistantFallback({
      generatedAt,
      model,
      suggestedDamodaranIndustry: industrySuggestion.damodaranIndustry,
      damodaranConfidence: industrySuggestion.confidence,
      industryRationale: industrySuggestion.rationale,
      bizRaportFilters,
      damodaranBenchmark,
      peerBenchmarks,
      unavailableReason: error instanceof Error ? error.message : "AI benchmark assistant failed.",
    }));
  }
}
