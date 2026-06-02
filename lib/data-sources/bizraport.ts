import { cleanBizRaportKrs, digitsOnly, isKrs, isNip } from "./identifiers";
import type { CompanyFinancialData, DataPoint, ImportedFinancialYear } from "./types";

export { isKrs, isNip } from "./identifiers";

const BIZRAPORT_BASE_URL = "https://api.bizraport.pl";
const SOURCE = "BizRaport";

export type BizRaportSearchResult = {
  krs: string;
};

export type BizRaportSearchResponse = {
  data?: BizRaportSearchResult[];
  dane_uciete?: boolean;
};

export type BizRaportCompanyRequest = {
  krs?: string;
  nip?: string;
};

type BizRaportInfoField = {
  nazwa_pola?: string;
  wartosc?: string | number | null;
};

type BizRaportFinancialRow = {
  rok?: number | string;
  nazwa_wskaznika?: string;
  kwota?: number | string | null;
};

export type BizRaportCompanyResponse = {
  krs?: string;
  nip?: string | number;
  regon?: string | number;
  kod_pkd?: string;
  informacje_o_firmie?: BizRaportInfoField[];
  dane_finansowe?: BizRaportFinancialRow[];
  powiazania?: unknown[];
  udzialy?: unknown[];
};

function getCredentials() {
  const email = process.env.BIZRAPORT_EMAIL;
  const password = process.env.BIZRAPORT_API_KEY;

  if (!email || !password) {
    throw new Error("Missing BizRaport credentials. Configure BIZRAPORT_EMAIL and BIZRAPORT_API_KEY on the server.");
  }

  return { email, password };
}

function buildUrl(path: "/api/szukaj" | "/api/dane", params: Record<string, string | number | undefined>) {
  const { email, password } = getCredentials();
  const url = new URL(path, BIZRAPORT_BASE_URL);
  url.searchParams.set("email", email);
  url.searchParams.set("password", password);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`BizRaport request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function searchBizRaportCompanies(query: string, limit = 10) {
  if (!query.trim()) {
    throw new Error("Search query is required.");
  }
  const url = buildUrl("/api/szukaj", { q: query.trim(), limit });
  const response = await fetchJson<BizRaportSearchResponse>(url);

  return {
    ...response,
    data: response.data?.map((result) => ({ ...result, krs: cleanBizRaportKrs(result.krs) })) ?? [],
  };
}

export async function fetchBizRaportCompanyData({ krs, nip }: BizRaportCompanyRequest) {
  const normalizedKrs = krs ? cleanBizRaportKrs(krs) : undefined;
  const normalizedNip = nip ? String(nip).trim() : undefined;

  if (!normalizedKrs && !normalizedNip) {
    throw new Error("Either KRS or NIP is required.");
  }
  if (normalizedKrs && !isKrs(normalizedKrs)) {
    throw new Error("Invalid KRS. Expected a 10-digit KRS number.");
  }
  if (normalizedNip && !isNip(normalizedNip)) {
    throw new Error("Invalid NIP. Expected a 10-digit NIP number with a valid checksum.");
  }
  const url = buildUrl("/api/dane", { krs: normalizedKrs, nip: normalizedNip });
  return fetchJson<BizRaportCompanyResponse>(url);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
}

function parseAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = value.replace(/\s/g, "").replace(",", ".").replace(/[A-Za-złŁ€$£]+/g, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function dataPoint<T>(value: T, sourceDate: string, fetchedAt: string, confidence: "high" | "medium" | "low" = "high"): DataPoint<T> {
  return {
    value,
    source: SOURCE,
    sourceUrl: BIZRAPORT_BASE_URL,
    sourceDate,
    fetchedAt,
    confidence,
    isUserOverridden: false,
  };
}

function companyInfo(response: BizRaportCompanyResponse, key: string) {
  const normalizedKey = normalizeKey(key);
  return response.informacje_o_firmie?.find((field) => normalizeKey(String(field.nazwa_pola ?? "")) === normalizedKey)?.wartosc ?? null;
}

function assignFinancialMetric(year: ImportedFinancialYear, key: string, amount: number | null, sourceDate: string, fetchedAt: string) {
  const normalized = normalizeKey(key);
  const point = dataPoint(amount, sourceDate, fetchedAt, normalized === "ebitda" || normalized === "ebit" || normalized === "przychody" ? "high" : "medium");

  if (normalized === "przychody" || normalized === "revenue") {
    year.revenue = point;
  } else if (normalized === "ebitda") {
    year.ebitda = point;
  } else if (normalized === "ebit") {
    year.ebit = point;
  } else if (normalized === "zysk_netto" || normalized === "zysk netto" || normalized === "net_income") {
    year.netIncome = point;
  } else if (normalized === "roe") {
    year.roe = point;
  } else if (normalized === "roa") {
    year.roa = point;
  } else if (normalized.includes("marza") || normalized.includes("margin")) {
    year.margin = point;
  }
}

export function mapBizRaportResponseToCompanyFinancialData(response: BizRaportCompanyResponse, fetchedAt = new Date().toISOString()): CompanyFinancialData {
  const warnings: string[] = [];
  const notes: string[] = [];
  const yearsByYear = new Map<number, ImportedFinancialYear>();
  const latestYear = response.dane_finansowe?.reduce<number | null>((latest, row) => {
    const year = Number(row.rok);
    return Number.isFinite(year) ? Math.max(latest ?? year, year) : latest;
  }, null);
  const sourceDate = latestYear ? String(latestYear) : "No financial year available";

  response.dane_finansowe?.forEach((row) => {
    const yearNumber = Number(row.rok);
    if (!Number.isFinite(yearNumber) || !row.nazwa_wskaznika) {
      warnings.push("Skipped a financial row with missing year or metric name.");
      return;
    }
    const existing = yearsByYear.get(yearNumber) ?? { year: yearNumber };
    assignFinancialMetric(existing, row.nazwa_wskaznika, parseAmount(row.kwota), String(yearNumber), fetchedAt);
    yearsByYear.set(yearNumber, existing);
  });

  const years = Array.from(yearsByYear.values()).sort((a, b) => a.year - b.year);
  years.forEach((year) => {
    if (!year.revenue) warnings.push(`Revenue unavailable for ${year.year}.`);
    if (!year.ebitda) warnings.push(`EBITDA unavailable for ${year.year}.`);
  });
  if (years.length === 0) warnings.push("No financial data returned by BizRaport.");

  const name = companyInfo(response, "nazwa");
  const regon = response.regon ?? companyInfo(response, "regon");

  return {
    status: "ready",
    registrationNumber: response.krs ? cleanBizRaportKrs(response.krs) : String(response.nip ?? ""),
    krs: dataPoint(response.krs ? cleanBizRaportKrs(response.krs) : null, sourceDate, fetchedAt),
    nip: dataPoint(response.nip ? digitsOnly(response.nip) : null, sourceDate, fetchedAt),
    regon: dataPoint(regon ? String(regon) : null, sourceDate, fetchedAt),
    pkdCode: dataPoint(response.kod_pkd ?? null, sourceDate, fetchedAt),
    companyName: dataPoint(name ? String(name) : null, sourceDate, fetchedAt),
    source: SOURCE,
    sourceUrl: BIZRAPORT_BASE_URL,
    sourceDate,
    fetchedAt,
    years,
    warnings: Array.from(new Set(warnings)),
    notes,
  };
}
