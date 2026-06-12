import europeSnapshot from "@/data/market/damodaran-europe-2026.json";
import type { DataConfidence } from "./types";

export type DamodaranEuropeIndustry = {
  industryName: string;
  numberOfFirms?: number | null;
  leveredBeta?: number | null;
  unleveredBeta?: number | null;
  cashAdjustedUnleveredBeta?: number | null;
  totalUnleveredBeta?: number | null;
  totalLeveredBeta?: number | null;
  marketCorrelation?: number | null;
  costOfEquity?: number | null;
  costOfDebt?: number | null;
  afterTaxCostOfDebt?: number | null;
  debtToCapital?: number | null;
  costOfCapitalUsd?: number | null;
  costOfCapitalLocal?: number | null;
  evSales?: number | null;
  positiveEbitdaEvEbitda?: number | null;
  allFirmsEvEbitda?: number | null;
};

export type DamodaranEuropeSnapshot = typeof europeSnapshot & {
  industries: DamodaranEuropeIndustry[];
  sourceFiles: Record<string, string>;
};

export type DamodaranEuropeSuggestion = {
  status: "ready" | "fallback";
  appIndustry: string;
  pkdCode: string;
  damodaranIndustry: string | null;
  confidence: DataConfidence;
  rationale: string;
  alternatives: string[];
};

export type DamodaranEuropeBenchmark = DamodaranEuropeSuggestion & {
  source: string;
  region: string;
  sourceUrl: string;
  dataCurrentUrl: string;
  sourceDate: string;
  fetchedAt: string;
  refreshStatus: string;
  isLiveData: false;
  industry: DamodaranEuropeIndustry | null;
};

const snapshot = europeSnapshot as DamodaranEuropeSnapshot;

const appIndustryMap: Record<string, string> = {
  Manufacturing: "Machinery",
  Software: "Computer Services",
  Construction: "Engineering/Construction",
  Wholesale: "Retail (Distributors)",
  Retail: "Retail (General)",
  Logistics: "Transportation",
  "Real Estate": "Real Estate (General/Diversified)",
  "Professional Services": "Business & Consumer Services",
};

const pkdDivisionMap: Array<{ from: number; to: number; industry: string; confidence: DataConfidence; rationale: string }> = [
  { from: 10, to: 12, industry: "Food Processing", confidence: "medium", rationale: "Food and beverage manufacturing PKD divisions map to Damodaran Food Processing." },
  { from: 13, to: 15, industry: "Apparel", confidence: "medium", rationale: "Textiles, apparel and leather manufacturing map to Damodaran Apparel." },
  { from: 16, to: 18, industry: "Paper/Forest Products", confidence: "low", rationale: "Wood, paper and printing PKD divisions use the closest Damodaran paper/forest-products grouping." },
  { from: 20, to: 20, industry: "Chemical (Specialty)", confidence: "medium", rationale: "Chemical manufacturing maps to Damodaran specialty chemicals unless a more specific manual industry is selected." },
  { from: 21, to: 21, industry: "Drugs (Pharmaceutical)", confidence: "medium", rationale: "Pharmaceutical manufacturing maps to Damodaran Drugs (Pharmaceutical)." },
  { from: 22, to: 23, industry: "Building Materials", confidence: "medium", rationale: "Rubber, plastics and mineral products are closest to Damodaran Building Materials for SME screening." },
  { from: 24, to: 25, industry: "Steel", confidence: "medium", rationale: "Metals and fabricated metal products map to Damodaran Steel." },
  { from: 26, to: 27, industry: "Electronics (General)", confidence: "medium", rationale: "Computer, electronic and electrical manufacturing map to Damodaran Electronics (General)." },
  { from: 28, to: 28, industry: "Machinery", confidence: "high", rationale: "PKD 28 is machinery and equipment manufacturing, directly matched to Damodaran Machinery." },
  { from: 29, to: 30, industry: "Auto Parts", confidence: "medium", rationale: "Vehicle and transport-equipment manufacturing map to Damodaran Auto Parts for private SME screening." },
  { from: 31, to: 33, industry: "Machinery", confidence: "medium", rationale: "Furniture, other manufacturing and repair use Damodaran Machinery as the broad industrial proxy." },
  { from: 41, to: 43, industry: "Engineering/Construction", confidence: "high", rationale: "Construction PKD divisions directly map to Damodaran Engineering/Construction." },
  { from: 45, to: 47, industry: "Retail (General)", confidence: "medium", rationale: "Trade and retail PKD divisions map to Damodaran retail/distribution benchmarks." },
  { from: 49, to: 53, industry: "Transportation", confidence: "high", rationale: "Transportation and logistics PKD divisions directly map to Damodaran Transportation." },
  { from: 58, to: 61, industry: "Computer Services", confidence: "medium", rationale: "Publishing, media and telecom software-enabled SME activity maps to Computer Services as a practical default." },
  { from: 62, to: 62, industry: "Computer Services", confidence: "high", rationale: "PKD 62 covers IT and software services, directly matched to Damodaran Computer Services." },
  { from: 63, to: 63, industry: "Information Services", confidence: "high", rationale: "PKD 63 information services map to Damodaran Information Services." },
  { from: 68, to: 68, industry: "Real Estate (General/Diversified)", confidence: "high", rationale: "Real estate PKD maps directly to Damodaran Real Estate (General/Diversified)." },
  { from: 69, to: 74, industry: "Business & Consumer Services", confidence: "medium", rationale: "Professional, scientific and technical services map to Damodaran Business & Consumer Services." },
  { from: 86, to: 88, industry: "Healthcare Support Services", confidence: "medium", rationale: "Healthcare and social work PKD divisions map to healthcare support services for SME screening." },
];

function parsePkdDivision(pkdCode: string) {
  const match = pkdCode.trim().match(/^(\d{2})/);
  if (!match) return null;
  const division = Number(match[1]);
  return Number.isInteger(division) ? division : null;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function findIndustry(industryName: string | null | undefined) {
  if (!industryName) return null;
  const normalized = normalize(industryName);
  return snapshot.industries.find((industry) => normalize(industry.industryName) === normalized) ?? null;
}

function directIndustryMatch(appIndustry: string) {
  return findIndustry(appIndustry) ?? findIndustry(appIndustryMap[appIndustry]);
}

function mapPkdToIndustry(pkdCode: string) {
  const division = parsePkdDivision(pkdCode);
  if (division === null) return null;
  return pkdDivisionMap.find((entry) => division >= entry.from && division <= entry.to) ?? null;
}

function nearestAlternatives(industryName: string | null, appIndustry: string) {
  const candidates = [
    industryName,
    appIndustryMap[appIndustry],
    "Machinery",
    "Computer Services",
    "Business & Consumer Services",
    "Engineering/Construction",
    "Retail (General)",
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(candidates)).filter((name) => Boolean(findIndustry(name))).slice(0, 5);
}

export function getDamodaranEuropeSnapshot() {
  return snapshot;
}

export function suggestDamodaranEuropeIndustry(params: { pkdCode?: string; appIndustry?: string; description?: string }): DamodaranEuropeSuggestion {
  const pkdCode = params.pkdCode ?? "";
  const appIndustry = params.appIndustry ?? "";
  const pkdMatch = mapPkdToIndustry(pkdCode);
  const pkdIndustry = findIndustry(pkdMatch?.industry);

  if (pkdMatch && pkdIndustry) {
    return {
      status: "ready",
      appIndustry,
      pkdCode,
      damodaranIndustry: pkdIndustry.industryName,
      confidence: pkdMatch.confidence,
      rationale: pkdMatch.rationale,
      alternatives: nearestAlternatives(pkdIndustry.industryName, appIndustry),
    };
  }

  const appIndustryMatch = directIndustryMatch(appIndustry);
  if (appIndustryMatch) {
    return {
      status: "ready",
      appIndustry,
      pkdCode,
      damodaranIndustry: appIndustryMatch.industryName,
      confidence: "medium",
      rationale: `Selected app industry ${appIndustry} maps to Damodaran ${appIndustryMatch.industryName}.`,
      alternatives: nearestAlternatives(appIndustryMatch.industryName, appIndustry),
    };
  }

  const normalizedDescription = normalize(params.description ?? "");
  const keywordMatch =
    normalizedDescription.includes("software") || normalizedDescription.includes("it ") || normalizedDescription.includes("saas")
      ? findIndustry("Computer Services")
      : normalizedDescription.includes("construction")
        ? findIndustry("Engineering/Construction")
        : null;

  if (keywordMatch) {
    return {
      status: "ready",
      appIndustry,
      pkdCode,
      damodaranIndustry: keywordMatch.industryName,
      confidence: "low",
      rationale: `Description keywords suggest Damodaran ${keywordMatch.industryName}. Review before approval.`,
      alternatives: nearestAlternatives(keywordMatch.industryName, appIndustry),
    };
  }

  return {
    status: "fallback",
    appIndustry,
    pkdCode,
    damodaranIndustry: null,
    confidence: "low",
    rationale: "No PKD, app industry, or description mapping could be matched to a Damodaran Europe industry.",
    alternatives: nearestAlternatives(null, appIndustry),
  };
}

export function getDamodaranEuropeBenchmark(params: { pkdCode?: string; appIndustry?: string; description?: string }): DamodaranEuropeBenchmark {
  const suggestion = suggestDamodaranEuropeIndustry(params);
  const industry = findIndustry(suggestion.damodaranIndustry);
  const fetchedAt = new Date().toISOString();

  return {
    ...suggestion,
    source: snapshot.source,
    region: snapshot.region,
    sourceUrl: snapshot.sourceFiles.vebitda,
    dataCurrentUrl: snapshot.dataCurrentUrl,
    sourceDate: snapshot.sourceDate,
    fetchedAt,
    refreshStatus: snapshot.refreshStatus,
    isLiveData: false,
    industry,
  };
}
