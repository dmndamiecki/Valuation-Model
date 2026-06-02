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

type BizRaportCompanyPayload = {
  krs?: string;
  nip?: string | number;
  regon?: string | number;
  kod_pkd?: string;
  pkd?: string;
  kodPkd?: string;
  informacje_o_firmie?: BizRaportInfoField[];
  dane_finansowe?: BizRaportFinancialRow[];
  powiazania?: unknown[];
  udzialy?: unknown[];
};

export type BizRaportCompanyResponse = BizRaportCompanyPayload & {
  data?: BizRaportCompanyPayload;
};

export type BizRaportDebugSnapshot = {
  responseKeys: string[];
  hasKrs: boolean;
  hasKodPkd: boolean;
  hasInformacjeOFirmie: boolean;
  hasDaneFinansowe: boolean;
  daneFinansoweCount: number;
  detectedIndicatorNames: string[];
  firstFinancialRows: BizRaportFinancialRow[];
  firstCompanyInfoRows: BizRaportInfoField[];
  mappedResult: CompanyFinancialData;
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

export function isBizRaportDebugEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview" || process.env.NEXT_PUBLIC_DEBUG_BIZRAPORT === "true";
}

function responseKeys(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
}

function unwrapBizRaportResponse(response: BizRaportCompanyResponse): BizRaportCompanyPayload {
  return response.data && typeof response.data === "object" ? response.data : response;
}

function summarizeBizRaportResponse(response: BizRaportCompanyResponse) {
  const payload = unwrapBizRaportResponse(response);
  return {
    responseKeys: responseKeys(response),
    hasKrs: Boolean(payload.krs),
    hasKodPkd: Boolean(payload.kod_pkd ?? payload.pkd ?? payload.kodPkd),
    hasInformacjeOFirmie: Array.isArray(payload.informacje_o_firmie),
    hasDaneFinansowe: Array.isArray(payload.dane_finansowe),
    daneFinansoweCount: payload.dane_finansowe?.length ?? 0,
  };
}

function logBizRaportDaneResponse(endpointPath: string, status: number, body: unknown) {
  if (!isBizRaportDebugEnabled()) {
    return;
  }

  const summary = body && typeof body === "object" ? summarizeBizRaportResponse(body as BizRaportCompanyResponse) : { responseKeys: [] };
  console.info("BizRaport /api/dane response", {
    requestedEndpointPath: endpointPath,
    httpStatus: status,
    ...summary,
  });
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const body = (await response.json()) as T;

  if (url.pathname === "/api/dane") {
    logBizRaportDaneResponse(url.pathname, response.status, body);
  }

  if (!response.ok) {
    throw new Error(`BizRaport request failed with status ${response.status}`);
  }
  return body;
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

function normalizeBizRaportKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[łŁ]/g, "l")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-/]+/g, "_");
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

function companyInfo(response: BizRaportCompanyPayload, keys: string[]) {
  const normalizedKeys = keys.map(normalizeBizRaportKey);
  return response.informacje_o_firmie?.find((field) => normalizedKeys.includes(normalizeBizRaportKey(String(field.nazwa_pola ?? ""))))?.wartosc ?? null;
}

function assignFinancialMetric(year: ImportedFinancialYear, key: string, amount: number | null, sourceDate: string, fetchedAt: string) {
  const normalized = normalizeBizRaportKey(key);
  const highConfidenceKeys = ["przychody", "przychody_netto", "ebitda", "ebit", "zysk_netto"];
  const point = dataPoint(amount, sourceDate, fetchedAt, highConfidenceKeys.includes(normalized) ? "high" : "medium");

  if (normalized === "przychody" || normalized === "przychody_netto") {
    year.revenue = point;
  } else if (normalized === "ebitda") {
    year.ebitda = point;
  } else if (normalized === "ebit") {
    year.ebit = point;
  } else if (normalized === "zysk_netto") {
    year.netIncome = point;
  } else if (normalized === "roe") {
    year.roe = point;
  } else if (normalized === "roa") {
    year.roa = point;
  } else if (normalized === "marza_ebitda") {
    year.ebitdaMargin = point;
  } else if (normalized === "marza_netto") {
    year.netMargin = point;
  } else if (normalized === "aktywa" || normalized === "aktywa_razem") {
    year.assets = point;
  } else if (normalized === "kapital_wlasny") {
    year.equity = point;
  } else if (normalized === "zobowiazania") {
    year.liabilities = point;
  } else if (normalized === "srodki_pieniezne") {
    year.cash = point;
  } else if (normalized === "naleznosci") {
    year.receivables = point;
  } else if (normalized === "zapasy") {
    year.inventory = point;
  }
}

export function buildBizRaportDebugSnapshot(response: BizRaportCompanyResponse, mappedResult: CompanyFinancialData): BizRaportDebugSnapshot {
  const payload = unwrapBizRaportResponse(response);
  const financialRows = payload.dane_finansowe ?? [];
  const companyInfoRows = payload.informacje_o_firmie ?? [];
  const detectedIndicatorNames = Array.from(new Set(financialRows.map((row) => String(row.nazwa_wskaznika ?? "")).filter(Boolean)));

  return {
    ...summarizeBizRaportResponse(response),
    detectedIndicatorNames,
    firstFinancialRows: financialRows.slice(0, 10),
    firstCompanyInfoRows: companyInfoRows.slice(0, 10),
    mappedResult,
  };
}

export function mapBizRaportResponseToCompanyFinancialData(response: BizRaportCompanyResponse, fetchedAt = new Date().toISOString()): CompanyFinancialData {
  const payload = unwrapBizRaportResponse(response);
  const warnings: string[] = [];
  const notes: string[] = [];
  const yearsByYear = new Map<number, ImportedFinancialYear>();
  const financialRows = payload.dane_finansowe;
  const detectedIndicatorNames = Array.from(new Set(financialRows?.map((row) => String(row.nazwa_wskaznika ?? "")).filter(Boolean) ?? []));
  const latestYear = financialRows?.reduce<number | null>((latest, row) => {
    const year = Number(row.rok);
    return Number.isFinite(year) ? Math.max(latest ?? year, year) : latest;
  }, null);
  const sourceDate = latestYear ? String(latestYear) : "No financial year available";

  if (!Array.isArray(financialRows)) {
    warnings.push("No dane_finansowe array returned by BizRaport.");
  }

  financialRows?.forEach((row) => {
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
  const hasMappedRevenue = years.some((year) => Boolean(year.revenue));
  const hasMappedEbitda = years.some((year) => Boolean(year.ebitda));

  if (Array.isArray(financialRows) && financialRows.length > 0 && (!hasMappedRevenue || !hasMappedEbitda)) {
    warnings.push("Financial data returned, but key valuation fields were not recognized.");
    notes.push(`Detected BizRaport indicators: ${detectedIndicatorNames.join(", ") || "none"}.`);
  }

  years.forEach((year) => {
    if (!year.revenue) warnings.push(`Revenue unavailable for ${year.year}.`);
    if (!year.ebitda) warnings.push(`EBITDA unavailable for ${year.year}.`);
  });

  const name = companyInfo(payload, ["nazwa", "nazwa_firmy", "pelna_nazwa", "pełna_nazwa"]);
  const regon = payload.regon ?? companyInfo(payload, ["regon"]);
  const pkdCode = payload.kod_pkd ?? payload.pkd ?? payload.kodPkd ?? null;
  const latestImportedYear = [...years].sort((a, b) => b.year - a.year)[0];

  return {
    status: "ready",
    registrationNumber: payload.krs ? cleanBizRaportKrs(payload.krs) : String(payload.nip ?? ""),
    krs: dataPoint(payload.krs ? cleanBizRaportKrs(payload.krs) : null, sourceDate, fetchedAt),
    nip: dataPoint(payload.nip ? digitsOnly(payload.nip) : null, sourceDate, fetchedAt),
    regon: dataPoint(regon ? String(regon) : null, sourceDate, fetchedAt),
    pkdCode: dataPoint(pkdCode, sourceDate, fetchedAt),
    companyName: dataPoint(name ? String(name) : null, sourceDate, fetchedAt),
    source: SOURCE,
    sourceUrl: BIZRAPORT_BASE_URL,
    sourceDate,
    fetchedAt,
    years,
    cash: latestImportedYear?.cash,
    warnings: Array.from(new Set(warnings)),
    notes: Array.from(new Set(notes)),
  };
}
