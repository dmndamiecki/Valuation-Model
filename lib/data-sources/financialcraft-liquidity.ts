export type FinancialCraftSizeBucket = "large" | "medium" | "small" | "micro";

export type FinancialCraftLiquidityBenchmark = {
  sizeBucket: FinancialCraftSizeBucket;
  sizeLabel: string;
  capitalizationRange: string;
  premiumForLiquidity: number;
  lackOfMarketabilityDiscount: number;
  source: "FinancialCraft";
  sourcePeriod: "1Q2026";
  sourceDate: "2026-01-01";
  sourceUrl: string;
  sourcePdfUrl: string;
  methodology: string;
};

const SOURCE_URL = "https://financialcraft.pl/premia-za-plynnosc-i-dyskonto-za-brak-plynnosci/";
const SOURCE_PDF_URL = "https://financialcraft.pl/wp-content/uploads/2022/04/Premia-za-plynnosc-i-dyskonto-za-brak-plynnosci-1Q2026.pdf";

const BENCHMARKS: FinancialCraftLiquidityBenchmark[] = [
  {
    sizeBucket: "large",
    sizeLabel: "Large company",
    capitalizationRange: ">= PLN 1,100m",
    premiumForLiquidity: 0.12,
    lackOfMarketabilityDiscount: 0.11,
    source: "FinancialCraft",
    sourcePeriod: "1Q2026",
    sourceDate: "2026-01-01",
    sourceUrl: SOURCE_URL,
    sourcePdfUrl: SOURCE_PDF_URL,
    methodology: "FinancialCraft estimates liquidity premium and lack-of-marketability discount by company capitalization size.",
  },
  {
    sizeBucket: "medium",
    sizeLabel: "Medium company",
    capitalizationRange: "PLN 330m - 1,100m",
    premiumForLiquidity: 0.14,
    lackOfMarketabilityDiscount: 0.12,
    source: "FinancialCraft",
    sourcePeriod: "1Q2026",
    sourceDate: "2026-01-01",
    sourceUrl: SOURCE_URL,
    sourcePdfUrl: SOURCE_PDF_URL,
    methodology: "FinancialCraft estimates liquidity premium and lack-of-marketability discount by company capitalization size.",
  },
  {
    sizeBucket: "small",
    sizeLabel: "Small company",
    capitalizationRange: "PLN 39m - 330m",
    premiumForLiquidity: 0.16,
    lackOfMarketabilityDiscount: 0.14,
    source: "FinancialCraft",
    sourcePeriod: "1Q2026",
    sourceDate: "2026-01-01",
    sourceUrl: SOURCE_URL,
    sourcePdfUrl: SOURCE_PDF_URL,
    methodology: "FinancialCraft estimates liquidity premium and lack-of-marketability discount by company capitalization size.",
  },
  {
    sizeBucket: "micro",
    sizeLabel: "Micro company",
    capitalizationRange: "< PLN 39m",
    premiumForLiquidity: 0.23,
    lackOfMarketabilityDiscount: 0.19,
    source: "FinancialCraft",
    sourcePeriod: "1Q2026",
    sourceDate: "2026-01-01",
    sourceUrl: SOURCE_URL,
    sourcePdfUrl: SOURCE_PDF_URL,
    methodology: "FinancialCraft estimates liquidity premium and lack-of-marketability discount by company capitalization size.",
  },
];

export function getFinancialCraftLiquidityBenchmarks() {
  return BENCHMARKS;
}

export function getFinancialCraftLiquidityBenchmark(equityValuePln: number): FinancialCraftLiquidityBenchmark {
  if (equityValuePln >= 1_100_000_000) {
    return BENCHMARKS[0];
  }
  if (equityValuePln >= 330_000_000) {
    return BENCHMARKS[1];
  }
  if (equityValuePln >= 39_000_000) {
    return BENCHMARKS[2];
  }
  return BENCHMARKS[3];
}
