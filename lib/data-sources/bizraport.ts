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
  [key: string]: unknown;
  krs?: string;
  nip?: string | number;
  regon?: string | number;
  kod_pkd?: string;
  opis_pkd?: string;
  pkd?: string;
  kodPkd?: string;
  informacje_o_firmie?: BizRaportInfoField[];
  dane_finansowe?: BizRaportFinancialRow[];
  powiazania?: unknown[];
  udzialy?: unknown[];
};

export type BizRaportCompanyResponse = BizRaportCompanyPayload & {
  data?: BizRaportCompanyPayload | BizRaportCompanyPayload[];
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
  if (Array.isArray(response.data)) {
    return response.data[0] ?? response;
  }

  if (response.data && typeof response.data === "object") {
    return response.data;
  }

  return response;
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

function payloadValue(payload: BizRaportCompanyPayload, key: string): number | string | null {
  const value = payload[key];
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function rangeMidpoint(
  payload: BizRaportCompanyPayload,
  baseKey: string,
): { midpoint: number | null; from: number | null; to: number | null } {
  const from = parseAmount(payloadValue(payload, `${baseKey}_od`));
  const to = parseAmount(payloadValue(payload, `${baseKey}_do`));
  const values = [from, to].filter((value): value is number => value !== null);
  const midpoint = values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
  return { midpoint, from, to };
}

function assignRangeMetric(
  year: ImportedFinancialYear,
  payload: BizRaportCompanyPayload,
  baseKey: string,
  metricName: string,
  sourceDate: string,
  fetchedAt: string,
  notes: string[],
  confidence: "high" | "medium" | "low" = "medium",
) {
  const range = rangeMidpoint(payload, baseKey);
  if (range.midpoint === null) {
    return;
  }

  assignFinancialMetric(year, metricName, range.midpoint, sourceDate, fetchedAt);
  if (range.from !== null || range.to !== null) {
    notes.push(`${metricName}: mapped from BizRaport range ${baseKey}_od=${range.from ?? "n/a"} and ${baseKey}_do=${range.to ?? "n/a"} using midpoint ${range.midpoint}.`);
  }

  const mappedKey = normalizeBizRaportKey(metricName);
  const point = dataPoint(range.midpoint, sourceDate, fetchedAt, confidence);
  if (mappedKey === "przychody") year.revenue = point;
  if (mappedKey === "przychody_operacyjne" && !year.revenue) year.revenue = point;
  if (mappedKey === "ebitda") year.ebitda = point;
  if (mappedKey === "ebit") year.ebit = point;
  if (mappedKey === "zysk_netto") year.netIncome = point;
  if (mappedKey === "podatek_dochodowy") year.incomeTax = point;
  if (mappedKey === "wynagrodzenia") year.salaries = point;
  if (mappedKey === "amortyzacja") year.depreciation = point;
  if (mappedKey === "suma_bilansowa") year.assets = point;
  if (mappedKey === "aktywa_trwale") year.fixedAssets = point;
  if (mappedKey === "aktywa_obrotowe") year.currentAssets = point;
  if (mappedKey === "kapital_wlasny") year.equity = point;
  if (mappedKey === "zobowiazania_i_rezerwy") year.liabilities = point;
  if (mappedKey === "zatrudnienie") year.employees = point;
}

function assignRangePercent(
  year: ImportedFinancialYear,
  payload: BizRaportCompanyPayload,
  baseKey: string,
  target: "roa" | "roe" | "netMargin" | "operatingMargin" | "debtRatio",
  sourceDate: string,
  fetchedAt: string,
  notes: string[],
) {
  const range = rangeMidpoint(payload, baseKey);
  if (range.midpoint === null) {
    return;
  }
  const value = range.midpoint > 1 ? range.midpoint / 100 : range.midpoint;
  year[target] = dataPoint(value, sourceDate, fetchedAt, "medium");
  notes.push(`${target}: mapped from BizRaport percentage range ${baseKey}_od=${range.from ?? "n/a"} and ${baseKey}_do=${range.to ?? "n/a"} using midpoint ${value}.`);
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
  const normalizedAmount = normalized === "amortyzacja" || normalized === "wynagrodzenia" ? (amount === null ? null : Math.abs(amount)) : amount;
  const highConfidenceKeys = ["przychody", "ebitda", "ebit", "zysk_netto", "zysk_operacyjny", "amortyzacja"];
  const point = dataPoint(normalizedAmount, sourceDate, fetchedAt, highConfidenceKeys.includes(normalized) ? "high" : "medium");

  if (normalized === "przychody") {
    year.revenue = point;
  } else if (normalized === "ebitda") {
    year.ebitda = point;
  } else if (normalized === "ebit" || normalized === "zysk_operacyjny") {
    year.ebit = point;
  } else if (normalized === "zysk_netto") {
    year.netIncome = point;
  } else if (normalized === "amortyzacja") {
    year.depreciation = point;
  } else if (normalized === "aktywa_obrotowe") {
    year.currentAssets = point;
  } else if (normalized === "aktywa_trwale") {
    year.fixedAssets = point;
  } else if (normalized === "suma_bilansowa") {
    year.assets = point;
  } else if (normalized === "kapital_wlasny") {
    year.equity = point;
  } else if (normalized === "zobowiazania_i_rezerwy") {
    year.liabilities = point;
  } else if (normalized === "wskaznik_zadluzenia") {
    year.debtRatio = point;
  } else if (normalized === "marza_netto") {
    year.netMargin = point;
  } else if (normalized === "marza_operacyjna") {
    year.operatingMargin = point;
  } else if (normalized === "roe") {
    year.roe = point;
  } else if (normalized === "roa") {
    year.roa = point;
  } else if (normalized === "zatrudnienie") {
    year.employees = point;
  } else if (normalized === "wynagrodzenia") {
    year.salaries = point;
  } else if (normalized === "podatek_dochodowy") {
    year.incomeTax = point;
  } else if (normalized === "wartosc_firmy_minimalna") {
    year.bizRaportMinCompanyValue = point;
  } else if (normalized === "wartosc_firmy_srednia") {
    year.bizRaportAvgCompanyValue = point;
  } else if (normalized === "wartosc_firmy_maksymalna") {
    year.bizRaportMaxCompanyValue = point;
  }
}

function deriveEbitda(year: ImportedFinancialYear, sourceDate: string, fetchedAt: string) {
  if (year.ebitda || typeof year.ebit?.value !== "number" || typeof year.depreciation?.value !== "number") {
    return;
  }

  year.ebitda = dataPoint(year.ebit.value + year.depreciation.value, sourceDate, fetchedAt, "medium");
}

function applyFlatRangePayload(
  payload: BizRaportCompanyPayload,
  yearsByYear: Map<number, ImportedFinancialYear>,
  sourceDate: string,
  fetchedAt: string,
  notes: string[],
) {
  const hasFlatRanges = [
    "przychody",
    "zysk_netto",
    "ebitda",
    "ebit",
    "suma_bilansowa",
    "kapital_wlasny",
    "zobowiazania_i_rezerwy_na_zobowiazania",
  ].some((baseKey) => payloadValue(payload, `${baseKey}_od`) !== null || payloadValue(payload, `${baseKey}_do`) !== null);

  if (!hasFlatRanges) {
    return;
  }

  const fallbackYear = new Date(fetchedAt).getUTCFullYear() - 1;
  const year = yearsByYear.get(fallbackYear) ?? { year: fallbackYear };
  const rangeSourceDate = `${sourceDate}; ${fallbackYear} / BizRaport range snapshot`;

  assignRangeMetric(year, payload, "przychody", "przychody", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "przychody_operacyjne", "przychody_operacyjne", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "zysk_netto", "zysk_netto", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "zysk_z_dzialalnosci_operacyjnej", "zysk_operacyjny", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "ebit", "ebit", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "ebitda", "ebitda", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "podatek_dochodowy", "podatek_dochodowy", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "wynagrodzenia", "wynagrodzenia", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "amortyzacja", "amortyzacja", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "suma_bilansowa", "suma_bilansowa", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "aktywa_trwale", "aktywa_trwale", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "aktywa_obrotowe", "aktywa_obrotowe", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "kapital_wlasny", "kapital_wlasny", rangeSourceDate, fetchedAt, notes, "medium");
  assignRangeMetric(year, payload, "zobowiazania_i_rezerwy_na_zobowiazania", "zobowiazania_i_rezerwy", rangeSourceDate, fetchedAt, notes, "low");
  assignRangeMetric(year, payload, "zatrudnienie", "zatrudnienie", rangeSourceDate, fetchedAt, notes, "medium");

  assignRangePercent(year, payload, "roa", "roa", rangeSourceDate, fetchedAt, notes);
  assignRangePercent(year, payload, "roe", "roe", rangeSourceDate, fetchedAt, notes);
  assignRangePercent(year, payload, "marza_netto", "netMargin", rangeSourceDate, fetchedAt, notes);
  assignRangePercent(year, payload, "marza_operacyjna", "operatingMargin", rangeSourceDate, fetchedAt, notes);
  assignRangePercent(year, payload, "wskaznik_zadluzenia", "debtRatio", rangeSourceDate, fetchedAt, notes);

  deriveEbitda(year, rangeSourceDate, fetchedAt);
  yearsByYear.set(fallbackYear, year);
}

function textPayloadValue(payload: BizRaportCompanyPayload, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
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

  applyFlatRangePayload(payload, yearsByYear, sourceDate, fetchedAt, notes);

  yearsByYear.forEach((year) => deriveEbitda(year, String(year.year), fetchedAt));

  const years = Array.from(yearsByYear.values()).sort((a, b) => b.year - a.year);
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

  const name = companyInfo(payload, ["nazwa"]) ?? textPayloadValue(payload, ["nazwa", "firma", "miasto"]);
  const website = companyInfo(payload, ["adres_strony_internetowej"]);
  const legalForm = companyInfo(payload, ["forma_prawna"]);
  const regon = payload.regon ?? companyInfo(payload, ["regon"]);
  const pkdCode = payload.kod_pkd ?? payload.pkd ?? payload.kodPkd ?? textPayloadValue(payload, ["pkd_podklasa", "pkd_dzial", "pkd_sekcja"]);
  const pkdDescription = payload.opis_pkd ?? textPayloadValue(payload, ["opis"]);
  const latestImportedYear = years.find((year) => typeof year.cash?.value === "number");
  const latestLiabilitiesYear = years.find((year) => typeof year.liabilities?.value === "number");

  return {
    status: "ready",
    registrationNumber: payload.krs ? cleanBizRaportKrs(payload.krs) : String(payload.nip ?? ""),
    krs: dataPoint(payload.krs ? cleanBizRaportKrs(payload.krs) : null, sourceDate, fetchedAt),
    nip: dataPoint(payload.nip ? digitsOnly(payload.nip) : null, sourceDate, fetchedAt),
    regon: dataPoint(regon ? String(regon) : null, sourceDate, fetchedAt),
    pkdCode: dataPoint(pkdCode, sourceDate, fetchedAt),
    pkdDescription: dataPoint(pkdDescription, sourceDate, fetchedAt),
    website: dataPoint(website ? String(website) : null, sourceDate, fetchedAt),
    legalForm: dataPoint(legalForm ? String(legalForm) : null, sourceDate, fetchedAt),
    companyName: dataPoint(name ? String(name) : null, sourceDate, fetchedAt),
    source: SOURCE,
    sourceUrl: BIZRAPORT_BASE_URL,
    sourceDate,
    fetchedAt,
    years,
    cash: latestImportedYear?.cash,
    debt: latestLiabilitiesYear?.liabilities
      ? dataPoint(latestLiabilitiesYear.liabilities.value, latestLiabilitiesYear.liabilities.sourceDate, fetchedAt, "low")
      : undefined,
    warnings: Array.from(new Set(warnings)),
    notes: Array.from(new Set(notes)),
  };
}
