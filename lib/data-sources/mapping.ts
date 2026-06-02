import type { DataSource } from "./types";

export const dataSources: DataSource[] = [
  {
    id: "public-krs",
    name: "Public KRS API",
    category: "company",
    sourceUrl: "https://api-krs.ms.gov.pl",
    fetchStatus: "idle",
    description: "Free Polish registry profile source. Provides company profile data only, not financial statements.",
    supportedIdentifiers: ["KRS"],
    supportedFields: ["Company profile", "KRS", "NIP", "REGON", "PKD", "Legal form", "Address", "Share capital"],
  },
  {
    id: "bizraport",
    name: "BizRaport",
    category: "company",
    sourceUrl: "https://www.bizraport.pl/",
    fetchStatus: "idle",
    description: "Server-side company registry and financial-statement source. Requires BIZRAPORT_EMAIL and BIZRAPORT_API_KEY environment variables.",
    supportedIdentifiers: ["KRS", "NIP", "REGON"],
    supportedFields: ["Company profile", "Imported financial years", "Revenue", "EBITDA", "Cash", "Debt"],
  },
  {
    id: "companies-house",
    name: "Companies House",
    category: "company",
    sourceUrl: "https://find-and-update.company-information.service.gov.uk/",
    fetchStatus: "not_configured",
    description: "Planned UK company registry source. No live API call is made in this MVP.",
    supportedIdentifiers: ["Company number"],
    supportedFields: ["Company profile", "Filing metadata"],
  },
  {
    id: "sec",
    name: "SEC EDGAR",
    category: "company",
    sourceUrl: "https://www.sec.gov/edgar",
    fetchStatus: "not_configured",
    description: "Planned public-company filing source for comparable public data. No live API call is made in this MVP.",
    supportedIdentifiers: ["CIK", "Ticker"],
    supportedFields: ["Filing metadata", "Public-company financials"],
  },
  {
    id: "damodaran",
    name: "Damodaran sector dataset",
    category: "market",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html",
    fetchStatus: "not_configured",
    description: "Planned sector beta and multiple source. Current values are manual seeds pending automated import, not live market data.",
    supportedFields: ["Beta", "EV/EBITDA", "EV/Revenue", "Equity risk premium"],
  },
  {
    id: "fred",
    name: "FRED",
    category: "macro",
    sourceUrl: "https://fred.stlouisfed.org/",
    fetchStatus: "not_configured",
    description: "Planned macro data source for risk-free rates. Current values are manual placeholders, not live market data.",
    supportedFields: ["Risk-free rate", "Treasury yields"],
  },
];

export const countryCompanySourceMap: Record<string, string[]> = {
  Poland: ["public-krs", "bizraport"],
  "United Kingdom": ["companies-house"],
  "United States": ["sec"],
};

export function getCompanyDataSources(country: string) {
  const sourceIds = countryCompanySourceMap[country] ?? ["public-krs", "bizraport"];
  return dataSources.filter((source) => sourceIds.includes(source.id));
}

export function getMarketDataSources() {
  return dataSources.filter((source) => source.category === "market" || source.category === "macro");
}
