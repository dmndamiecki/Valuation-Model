export type DataConfidence = "high" | "medium" | "low";

export type DataFetchStatus = "idle" | "loading" | "ready" | "not_configured" | "error";

export type DataPoint<T = number | string> = {
  value: T;
  source: string;
  sourceUrl: string;
  sourceDate: string;
  fetchedAt: string;
  confidence: DataConfidence;
  isUserOverridden: boolean;
};

export type ImportedFinancialYear = {
  year: number;
  revenue?: DataPoint<number | null>;
  ebitda?: DataPoint<number | null>;
  ebit?: DataPoint<number | null>;
  netIncome?: DataPoint<number | null>;
  roe?: DataPoint<number | null>;
  roa?: DataPoint<number | null>;
  margin?: DataPoint<number | null>;
  ebitdaMargin?: DataPoint<number | null>;
  netMargin?: DataPoint<number | null>;
  assets?: DataPoint<number | null>;
  equity?: DataPoint<number | null>;
  liabilities?: DataPoint<number | null>;
  cash?: DataPoint<number | null>;
  receivables?: DataPoint<number | null>;
  inventory?: DataPoint<number | null>;
  depreciation?: DataPoint<number | null>;
  capex?: DataPoint<number | null>;
  netWorkingCapital?: DataPoint<number | null>;
};


export type CompanyProfileData = {
  status: DataFetchStatus;
  companyName?: DataPoint<string | null>;
  krs?: DataPoint<string | null>;
  nip?: DataPoint<string | null>;
  regon?: DataPoint<string | null>;
  pkdCode?: DataPoint<string | null>;
  legalForm?: DataPoint<string | null>;
  address?: DataPoint<string | null>;
  shareCapital?: DataPoint<string | null>;
  registrationStatus?: DataPoint<string | null>;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  sourceDate: string;
  warnings: string[];
  notes: string[];
};

export type CompanyFinancialData = {
  status: DataFetchStatus;
  companyName?: DataPoint<string | null>;
  registrationNumber: string;
  krs?: DataPoint<string | null>;
  nip?: DataPoint<string | null>;
  regon?: DataPoint<string | null>;
  pkdCode?: DataPoint<string | null>;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  sourceDate: string;
  years: ImportedFinancialYear[];
  cash?: DataPoint<number | null>;
  debt?: DataPoint<number | null>;
  warnings: string[];
  notes: string[];
};

export type MarketDataSnapshot = {
  status: DataFetchStatus;
  sourceDate: string;
  fetchedAt: string;
  riskFreeRate?: DataPoint<number>;
  equityRiskPremium?: DataPoint<number>;
  beta?: DataPoint<number>;
  evEbitdaMultiple?: DataPoint<number>;
  evRevenueMultiple?: DataPoint<number>;
  notes: string[];
};

export type DataSource = {
  id: string;
  name: string;
  category: "company" | "market" | "macro";
  sourceUrl: string;
  fetchStatus: DataFetchStatus;
  description: string;
  supportedIdentifiers?: string[];
  supportedFields: string[];
};
