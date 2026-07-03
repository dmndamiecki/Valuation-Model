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
  matchMethod?: "pkd-subclass" | "pkd-division" | "app-industry" | "description-keyword" | "ai-review-needed";
  matchedPkd?: string | null;
  needsAiReview?: boolean;
  availableIndustryCount?: number;
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

type PkdIndustryMapEntry = {
  industry: string;
  confidence: DataConfidence;
  rationale: string;
};

const pkdSubclassMap: Record<string, PkdIndustryMapEntry> = {
  "10.71": { industry: "Food Processing", confidence: "high", rationale: "PKD 10.71 bakery and flour products map to Damodaran Food Processing." },
  "11.01": { industry: "Beverage (Alcoholic)", confidence: "high", rationale: "PKD 11.01 spirit production maps to Damodaran Beverage (Alcoholic)." },
  "11.05": { industry: "Beverage (Alcoholic)", confidence: "high", rationale: "PKD 11.05 beer production maps to Damodaran Beverage (Alcoholic)." },
  "11.07": { industry: "Beverage (Soft)", confidence: "high", rationale: "PKD 11.07 soft drinks and bottled water map to Damodaran Beverage (Soft)." },
  "18.11": { industry: "Publishing & Newspapers", confidence: "medium", rationale: "PKD 18.11 printing is closest to Damodaran Publishing & Newspapers for public-market evidence." },
  "26.11": { industry: "Semiconductor", confidence: "high", rationale: "PKD 26.11 electronic components map to Damodaran Semiconductor." },
  "26.20": { industry: "Computers/Peripherals", confidence: "high", rationale: "PKD 26.20 computer and peripheral manufacturing maps to Damodaran Computers/Peripherals." },
  "26.30": { industry: "Telecom. Equipment", confidence: "high", rationale: "PKD 26.30 communications equipment maps to Damodaran Telecom. Equipment." },
  "29.10": { industry: "Auto & Truck", confidence: "high", rationale: "PKD 29.10 motor vehicle manufacturing maps to Damodaran Auto & Truck." },
  "29.32": { industry: "Auto Parts", confidence: "high", rationale: "PKD 29.32 vehicle parts maps to Damodaran Auto Parts." },
  "30.11": { industry: "Shipbuilding & Marine", confidence: "high", rationale: "PKD 30.11 shipbuilding maps to Damodaran Shipbuilding & Marine." },
  "30.30": { industry: "Aerospace/Defense", confidence: "high", rationale: "PKD 30.30 aircraft and spacecraft maps to Damodaran Aerospace/Defense." },
  "35.11": { industry: "Power", confidence: "high", rationale: "PKD 35.11 power generation maps to Damodaran Power." },
  "36.00": { industry: "Utility (Water)", confidence: "high", rationale: "PKD 36.00 water collection and supply maps to Damodaran Utility (Water)." },
  "41.10": { industry: "Real Estate (Development)", confidence: "high", rationale: "PKD 41.10 development of building projects maps to Damodaran Real Estate (Development)." },
  "41.20": { industry: "Homebuilding", confidence: "high", rationale: "PKD 41.20 building construction maps to Damodaran Homebuilding." },
  "45.11": { industry: "Retail (Automotive)", confidence: "high", rationale: "PKD 45.11 vehicle sales maps to Damodaran Retail (Automotive)." },
  "46.17": { industry: "Food Wholesalers", confidence: "medium", rationale: "PKD 46.17 food and beverage agents are closest to Damodaran Food Wholesalers." },
  "47.11": { industry: "Retail (Grocery and Food)", confidence: "high", rationale: "PKD 47.11 grocery and food retail maps to Damodaran Retail (Grocery and Food)." },
  "49.10": { industry: "Transportation (Railroads)", confidence: "high", rationale: "PKD 49.10 rail passenger transport maps to Damodaran Transportation (Railroads)." },
  "49.20": { industry: "Transportation (Railroads)", confidence: "high", rationale: "PKD 49.20 rail freight transport maps to Damodaran Transportation (Railroads)." },
  "49.41": { industry: "Trucking", confidence: "high", rationale: "PKD 49.41 freight road transport maps to Damodaran Trucking." },
  "50.10": { industry: "Shipbuilding & Marine", confidence: "medium", rationale: "PKD 50 water transport is matched to Damodaran Shipbuilding & Marine as the closest marine public-market grouping." },
  "51.10": { industry: "Air Transport", confidence: "high", rationale: "PKD 51.10 passenger air transport maps to Damodaran Air Transport." },
  "55.10": { industry: "Hotel/Gaming", confidence: "high", rationale: "PKD 55.10 hotels maps to Damodaran Hotel/Gaming." },
  "56.10": { industry: "Restaurant/Dining", confidence: "high", rationale: "PKD 56.10 restaurants maps to Damodaran Restaurant/Dining." },
  "58.21": { industry: "Software (Entertainment)", confidence: "high", rationale: "PKD 58.21 video game publishing maps to Damodaran Software (Entertainment)." },
  "58.29": { industry: "Software (System & Application)", confidence: "high", rationale: "PKD 58.29 software publishing maps to Damodaran Software (System & Application)." },
  "59.11": { industry: "Entertainment", confidence: "medium", rationale: "PKD 59.11 film and video production maps to Damodaran Entertainment." },
  "60.10": { industry: "Broadcasting", confidence: "high", rationale: "PKD 60.10 radio broadcasting maps to Damodaran Broadcasting." },
  "61.20": { industry: "Telecom (Wireless)", confidence: "high", rationale: "PKD 61.20 wireless telecom maps to Damodaran Telecom (Wireless)." },
  "61.90": { industry: "Telecom. Services", confidence: "high", rationale: "PKD 61.90 telecom services maps to Damodaran Telecom. Services." },
  "62.01": { industry: "Software (System & Application)", confidence: "high", rationale: "PKD 62.01 software development maps to Damodaran Software (System & Application)." },
  "62.02": { industry: "Computer Services", confidence: "high", rationale: "PKD 62.02 IT consulting maps to Damodaran Computer Services." },
  "62.03": { industry: "Computer Services", confidence: "high", rationale: "PKD 62.03 IT infrastructure management maps to Damodaran Computer Services." },
  "63.11": { industry: "Information Services", confidence: "high", rationale: "PKD 63.11 data processing and hosting maps to Damodaran Information Services." },
  "63.12": { industry: "Software (Internet)", confidence: "high", rationale: "PKD 63.12 web portals map to Damodaran Software (Internet)." },
  "64.20": { industry: "Investments & Asset Management", confidence: "medium", rationale: "PKD 64.20 holding companies map to Damodaran Investments & Asset Management for public-market evidence." },
  "66.12": { industry: "Brokerage & Investment Banking", confidence: "high", rationale: "PKD 66.12 securities brokerage maps to Damodaran Brokerage & Investment Banking." },
  "68.10": { industry: "Real Estate (Development)", confidence: "high", rationale: "PKD 68.10 real estate trading maps to Damodaran Real Estate (Development)." },
  "68.20": { industry: "Real Estate (Operations & Services)", confidence: "high", rationale: "PKD 68.20 rental and management of own real estate maps to Damodaran Real Estate (Operations & Services)." },
  "69.10": { industry: "Business & Consumer Services", confidence: "medium", rationale: "PKD 69.10 legal services map to Damodaran Business & Consumer Services." },
  "70.22": { industry: "Business & Consumer Services", confidence: "high", rationale: "PKD 70.22 business consulting maps to Damodaran Business & Consumer Services." },
  "71.11": { industry: "Engineering/Construction", confidence: "medium", rationale: "PKD 71.11 architecture maps to Damodaran Engineering/Construction as the closest public-market service grouping." },
  "71.12": { industry: "Engineering/Construction", confidence: "high", rationale: "PKD 71.12 engineering activities map to Damodaran Engineering/Construction." },
  "72.11": { industry: "Drugs (Biotechnology)", confidence: "medium", rationale: "PKD 72.11 biotechnology R&D maps to Damodaran Drugs (Biotechnology)." },
  "73.11": { industry: "Advertising", confidence: "high", rationale: "PKD 73.11 advertising agencies map to Damodaran Advertising." },
  "75.00": { industry: "Healthcare Support Services", confidence: "medium", rationale: "PKD 75.00 veterinary activities map to Damodaran Healthcare Support Services." },
  "85.59": { industry: "Education", confidence: "high", rationale: "PKD 85.59 other education maps to Damodaran Education." },
  "86.10": { industry: "Hospitals/Healthcare Facilities", confidence: "high", rationale: "PKD 86.10 hospital activities map to Damodaran Hospitals/Healthcare Facilities." },
  "86.90": { industry: "Healthcare Support Services", confidence: "high", rationale: "PKD 86.90 other healthcare maps to Damodaran Healthcare Support Services." },
  "90.01": { industry: "Entertainment", confidence: "high", rationale: "PKD 90.01 performing arts maps to Damodaran Entertainment." },
  "92.00": { industry: "Hotel/Gaming", confidence: "high", rationale: "PKD 92 gambling and betting maps to Damodaran Hotel/Gaming." },
  "93.11": { industry: "Recreation", confidence: "high", rationale: "PKD 93.11 sports facilities map to Damodaran Recreation." },
};

const pkdDivisionMap: Record<number, PkdIndustryMapEntry> = {
  1: { industry: "Farming/Agriculture", confidence: "high", rationale: "PKD 01 agriculture maps to Damodaran Farming/Agriculture." },
  2: { industry: "Paper/Forest Products", confidence: "medium", rationale: "PKD 02 forestry maps to Damodaran Paper/Forest Products." },
  3: { industry: "Farming/Agriculture", confidence: "medium", rationale: "PKD 03 fishing and aquaculture use Damodaran Farming/Agriculture as closest sector evidence." },
  5: { industry: "Coal & Related Energy", confidence: "high", rationale: "PKD 05 coal mining maps to Damodaran Coal & Related Energy." },
  6: { industry: "Oil/Gas (Production and Exploration)", confidence: "high", rationale: "PKD 06 oil and gas extraction maps to Damodaran Oil/Gas (Production and Exploration)." },
  7: { industry: "Metals & Mining", confidence: "high", rationale: "PKD 07 metal ore mining maps to Damodaran Metals & Mining." },
  8: { industry: "Metals & Mining", confidence: "medium", rationale: "PKD 08 other mining is closest to Damodaran Metals & Mining." },
  9: { industry: "Oilfield Svcs/Equip.", confidence: "high", rationale: "PKD 09 mining support maps to Damodaran Oilfield Svcs/Equip." },
  10: { industry: "Food Processing", confidence: "high", rationale: "PKD 10 food manufacturing maps to Damodaran Food Processing." },
  11: { industry: "Beverage (Soft)", confidence: "medium", rationale: "PKD 11 beverage manufacturing maps to Damodaran beverage sectors; subclass improves alcoholic vs soft match." },
  12: { industry: "Tobacco", confidence: "high", rationale: "PKD 12 tobacco manufacturing maps to Damodaran Tobacco." },
  13: { industry: "Apparel", confidence: "medium", rationale: "PKD 13 textiles map to Damodaran Apparel as closest consumer-product sector." },
  14: { industry: "Apparel", confidence: "high", rationale: "PKD 14 apparel manufacturing maps to Damodaran Apparel." },
  15: { industry: "Shoe", confidence: "medium", rationale: "PKD 15 leather and footwear maps to Damodaran Shoe when footwear-oriented; otherwise review manually." },
  16: { industry: "Paper/Forest Products", confidence: "high", rationale: "PKD 16 wood products map to Damodaran Paper/Forest Products." },
  17: { industry: "Paper/Forest Products", confidence: "high", rationale: "PKD 17 paper products map to Damodaran Paper/Forest Products." },
  18: { industry: "Publishing & Newspapers", confidence: "medium", rationale: "PKD 18 printing and recorded media are closest to Damodaran Publishing & Newspapers." },
  19: { industry: "Oil/Gas Distribution", confidence: "medium", rationale: "PKD 19 refined petroleum and coke products are closest to Damodaran Oil/Gas Distribution." },
  20: { industry: "Chemical (Specialty)", confidence: "medium", rationale: "PKD 20 chemicals map to Damodaran Chemical sectors; specialty chemicals are the default SME proxy." },
  21: { industry: "Drugs (Pharmaceutical)", confidence: "high", rationale: "PKD 21 pharmaceuticals map to Damodaran Drugs (Pharmaceutical)." },
  22: { industry: "Rubber& Tires", confidence: "medium", rationale: "PKD 22 rubber and plastics map to Damodaran Rubber& Tires as closest public-market sector." },
  23: { industry: "Building Materials", confidence: "high", rationale: "PKD 23 non-metal mineral products map to Damodaran Building Materials." },
  24: { industry: "Steel", confidence: "high", rationale: "PKD 24 basic metals map to Damodaran Steel." },
  25: { industry: "Construction Supplies", confidence: "medium", rationale: "PKD 25 fabricated metal products map to Damodaran Construction Supplies unless a more specific metal sector is selected." },
  26: { industry: "Electronics (General)", confidence: "medium", rationale: "PKD 26 computer and electronic products map to Damodaran Electronics (General); subclass improves match." },
  27: { industry: "Electrical Equipment", confidence: "high", rationale: "PKD 27 electrical equipment maps to Damodaran Electrical Equipment." },
  28: { industry: "Machinery", confidence: "high", rationale: "PKD 28 machinery and equipment maps directly to Damodaran Machinery." },
  29: { industry: "Auto Parts", confidence: "medium", rationale: "PKD 29 motor vehicles and parts map to Damodaran Auto sectors; subclass improves OEM vs parts match." },
  30: { industry: "Auto Parts", confidence: "low", rationale: "PKD 30 other transport equipment needs subclass review; Auto Parts is a broad fallback." },
  31: { industry: "Furn/Home Furnishings", confidence: "high", rationale: "PKD 31 furniture maps to Damodaran Furn/Home Furnishings." },
  32: { industry: "Household Products", confidence: "low", rationale: "PKD 32 other manufacturing is broad; Household Products is a pragmatic SME fallback pending AI/manual review." },
  33: { industry: "Machinery", confidence: "medium", rationale: "PKD 33 repair and installation of machinery maps to Damodaran Machinery." },
  35: { industry: "Power", confidence: "high", rationale: "PKD 35 electricity and gas supply maps to Damodaran Power by default; subclass improves utility match." },
  36: { industry: "Utility (Water)", confidence: "high", rationale: "PKD 36 water supply maps to Damodaran Utility (Water)." },
  37: { industry: "Environmental & Waste Services", confidence: "high", rationale: "PKD 37 sewerage maps to Damodaran Environmental & Waste Services." },
  38: { industry: "Environmental & Waste Services", confidence: "high", rationale: "PKD 38 waste services maps to Damodaran Environmental & Waste Services." },
  39: { industry: "Environmental & Waste Services", confidence: "high", rationale: "PKD 39 remediation maps to Damodaran Environmental & Waste Services." },
  41: { industry: "Homebuilding", confidence: "medium", rationale: "PKD 41 building construction maps to Damodaran Homebuilding; subclass improves developer vs contractor match." },
  42: { industry: "Engineering/Construction", confidence: "high", rationale: "PKD 42 civil engineering maps to Damodaran Engineering/Construction." },
  43: { industry: "Engineering/Construction", confidence: "high", rationale: "PKD 43 specialized construction maps to Damodaran Engineering/Construction." },
  45: { industry: "Retail (Automotive)", confidence: "high", rationale: "PKD 45 vehicle trade and repair maps to Damodaran Retail (Automotive)." },
  46: { industry: "Retail (Distributors)", confidence: "medium", rationale: "PKD 46 wholesale trade maps to Damodaran Retail (Distributors); subclass can refine food wholesalers." },
  47: { industry: "Retail (General)", confidence: "medium", rationale: "PKD 47 retail trade maps to Damodaran Retail (General); subclass can refine grocery, automotive or special lines." },
  49: { industry: "Transportation", confidence: "medium", rationale: "PKD 49 land transport maps to Damodaran Transportation; subclass improves railroad/trucking match." },
  50: { industry: "Shipbuilding & Marine", confidence: "medium", rationale: "PKD 50 water transport maps to Damodaran Shipbuilding & Marine as closest marine grouping." },
  51: { industry: "Air Transport", confidence: "high", rationale: "PKD 51 air transport maps to Damodaran Air Transport." },
  52: { industry: "Transportation", confidence: "high", rationale: "PKD 52 warehousing and support activities map to Damodaran Transportation." },
  53: { industry: "Transportation", confidence: "medium", rationale: "PKD 53 postal and courier activities map to Damodaran Transportation." },
  55: { industry: "Hotel/Gaming", confidence: "high", rationale: "PKD 55 accommodation maps to Damodaran Hotel/Gaming." },
  56: { industry: "Restaurant/Dining", confidence: "high", rationale: "PKD 56 food service maps to Damodaran Restaurant/Dining." },
  58: { industry: "Publishing & Newspapers", confidence: "medium", rationale: "PKD 58 publishing maps to Damodaran Publishing & Newspapers; software subclasses map separately." },
  59: { industry: "Entertainment", confidence: "medium", rationale: "PKD 59 film, video and music production maps to Damodaran Entertainment." },
  60: { industry: "Broadcasting", confidence: "high", rationale: "PKD 60 broadcasting maps to Damodaran Broadcasting." },
  61: { industry: "Telecom. Services", confidence: "high", rationale: "PKD 61 telecommunications maps to Damodaran Telecom. Services." },
  62: { industry: "Computer Services", confidence: "medium", rationale: "PKD 62 IT activity maps to Damodaran Computer Services by default; software development subclasses map to Software (System & Application)." },
  63: { industry: "Information Services", confidence: "high", rationale: "PKD 63 information services maps to Damodaran Information Services." },
  64: { industry: "Financial Svcs. (Non-bank & Insurance)", confidence: "medium", rationale: "PKD 64 financial services map to Damodaran Financial Svcs. (Non-bank & Insurance); subclass can refine asset management." },
  65: { industry: "Insurance (General)", confidence: "medium", rationale: "PKD 65 insurance maps to Damodaran Insurance (General)." },
  66: { industry: "Investments & Asset Management", confidence: "medium", rationale: "PKD 66 auxiliary financial services map to Damodaran Investments & Asset Management; subclass can refine brokerage." },
  68: { industry: "Real Estate (General/Diversified)", confidence: "high", rationale: "PKD 68 real estate maps to Damodaran Real Estate (General/Diversified); subclass can refine operations or development." },
  69: { industry: "Business & Consumer Services", confidence: "medium", rationale: "PKD 69 legal and accounting services map to Damodaran Business & Consumer Services." },
  70: { industry: "Business & Consumer Services", confidence: "high", rationale: "PKD 70 management consulting maps to Damodaran Business & Consumer Services." },
  71: { industry: "Engineering/Construction", confidence: "medium", rationale: "PKD 71 architecture and engineering maps to Damodaran Engineering/Construction." },
  72: { industry: "Business & Consumer Services", confidence: "low", rationale: "PKD 72 R&D is broad; use AI/manual review unless biotech subclass is present." },
  73: { industry: "Advertising", confidence: "high", rationale: "PKD 73 advertising and market research maps to Damodaran Advertising." },
  74: { industry: "Business & Consumer Services", confidence: "medium", rationale: "PKD 74 other professional services map to Damodaran Business & Consumer Services." },
  75: { industry: "Healthcare Support Services", confidence: "medium", rationale: "PKD 75 veterinary activities map to Damodaran Healthcare Support Services." },
  77: { industry: "Business & Consumer Services", confidence: "medium", rationale: "PKD 77 rental and leasing maps to Damodaran Business & Consumer Services." },
  78: { industry: "Business & Consumer Services", confidence: "high", rationale: "PKD 78 employment activities map to Damodaran Business & Consumer Services." },
  79: { industry: "Recreation", confidence: "medium", rationale: "PKD 79 travel agency and tour operator activities map to Damodaran Recreation." },
  80: { industry: "Business & Consumer Services", confidence: "medium", rationale: "PKD 80 security and investigation maps to Damodaran Business & Consumer Services." },
  81: { industry: "Environmental & Waste Services", confidence: "medium", rationale: "PKD 81 facility services and landscape activities map to Environmental & Waste Services as closest public-market services grouping." },
  82: { industry: "Office Equipment & Services", confidence: "medium", rationale: "PKD 82 office administration and business support maps to Damodaran Office Equipment & Services." },
  84: { industry: "Diversified", confidence: "low", rationale: "PKD 84 public administration has no clean operating peer; Diversified is a low-confidence fallback." },
  85: { industry: "Education", confidence: "high", rationale: "PKD 85 education maps to Damodaran Education." },
  86: { industry: "Healthcare Support Services", confidence: "medium", rationale: "PKD 86 healthcare maps to Damodaran Healthcare Support Services; hospital subclasses map separately." },
  87: { industry: "Healthcare Support Services", confidence: "high", rationale: "PKD 87 residential care maps to Damodaran Healthcare Support Services." },
  88: { industry: "Healthcare Support Services", confidence: "medium", rationale: "PKD 88 social work maps to Damodaran Healthcare Support Services." },
  90: { industry: "Entertainment", confidence: "high", rationale: "PKD 90 creative arts and entertainment maps to Damodaran Entertainment." },
  91: { industry: "Recreation", confidence: "medium", rationale: "PKD 91 libraries, museums and cultural activities map to Damodaran Recreation." },
  92: { industry: "Hotel/Gaming", confidence: "high", rationale: "PKD 92 gambling and betting maps to Damodaran Hotel/Gaming." },
  93: { industry: "Recreation", confidence: "high", rationale: "PKD 93 sports and recreation maps to Damodaran Recreation." },
  94: { industry: "Business & Consumer Services", confidence: "low", rationale: "PKD 94 membership organizations use Damodaran Business & Consumer Services as a low-confidence fallback." },
  95: { industry: "Computer Services", confidence: "medium", rationale: "PKD 95 repair of computers and personal goods maps to Damodaran Computer Services by default." },
  96: { industry: "Business & Consumer Services", confidence: "medium", rationale: "PKD 96 other personal services map to Damodaran Business & Consumer Services." },
  97: { industry: "Business & Consumer Services", confidence: "low", rationale: "PKD 97 household employment uses Business & Consumer Services as a low-confidence fallback." },
  98: { industry: "Diversified", confidence: "low", rationale: "PKD 98 household own-use production has no clear public peer; Diversified is a low-confidence fallback." },
  99: { industry: "Diversified", confidence: "low", rationale: "PKD 99 extraterritorial organizations have no clear public peer; Diversified is a low-confidence fallback." },
};

function parsePkd(pkdCode: string) {
  const normalized = pkdCode.trim().toUpperCase();
  const match = normalized.match(/^(\d{2})(?:[.\s-]?(\d{2}))?/);
  if (!match) return null;
  const division = Number(match[1]);
  if (!Number.isInteger(division)) return null;
  return {
    normalized,
    division,
    subclassPrefix: match[2] ? `${match[1]}.${match[2]}` : null,
  };
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

function mapPkdToIndustry(pkdCode: string): (PkdIndustryMapEntry & { matchMethod: "pkd-subclass" | "pkd-division"; matchedPkd: string }) | null {
  const parsed = parsePkd(pkdCode);
  if (!parsed) return null;
  if (parsed.subclassPrefix && pkdSubclassMap[parsed.subclassPrefix]) {
    return {
      ...pkdSubclassMap[parsed.subclassPrefix],
      matchMethod: "pkd-subclass",
      matchedPkd: parsed.subclassPrefix,
    };
  }
  const divisionMatch = pkdDivisionMap[parsed.division];
  return divisionMatch ? {
    ...divisionMatch,
    matchMethod: "pkd-division",
    matchedPkd: String(parsed.division).padStart(2, "0"),
  } : null;
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

export function getDamodaranEuropeIndustryNames() {
  return snapshot.industries.map((industry) => industry.industryName);
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
      matchMethod: pkdMatch.matchMethod,
      matchedPkd: pkdMatch.matchedPkd,
      needsAiReview: pkdMatch.confidence !== "high",
      availableIndustryCount: snapshot.industries.length,
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
      matchMethod: "app-industry",
      matchedPkd: null,
      needsAiReview: true,
      availableIndustryCount: snapshot.industries.length,
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
      matchMethod: "description-keyword",
      matchedPkd: null,
      needsAiReview: true,
      availableIndustryCount: snapshot.industries.length,
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
    matchMethod: "ai-review-needed",
    matchedPkd: null,
    needsAiReview: true,
    availableIndustryCount: snapshot.industries.length,
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
