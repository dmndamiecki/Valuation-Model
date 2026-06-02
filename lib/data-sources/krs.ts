import { isKrs } from "./identifiers";
import type { CompanyProfileData, DataPoint } from "./types";

const KRS_BASE_URL = "https://api-krs.ms.gov.pl";
const SOURCE = "Public KRS API";

type KrsPrimitive = string | number | boolean | null;
type KrsJson = KrsPrimitive | KrsJson[] | { [key: string]: KrsJson | undefined };

export type KrsFetchRequest = {
  krs: string;
  rejestr?: string;
};

export type KrsDebugSnapshot = {
  responseKeys: string[];
  mappedResult: CompanyProfileData;
};

function dataPoint<T>(value: T, sourceDate: string, fetchedAt: string): DataPoint<T> {
  return {
    value,
    source: SOURCE,
    sourceUrl: KRS_BASE_URL,
    sourceDate,
    fetchedAt,
    confidence: "high",
    isUserOverridden: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function responseKeys(response: unknown) {
  return isRecord(response) ? Object.keys(response) : [];
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[łŁ]/g, "l")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-/]+/g, "_");
}

function directPath(response: unknown, path: string[]) {
  let cursor: unknown = response;
  for (const segment of path) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return null;
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor)) return null;
    cursor = cursor[segment];
  }
  return cursor === undefined || cursor === null ? null : cursor;
}

function firstPath(response: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = directPath(response, path);
    if (value !== null && value !== "") return value;
  }
  return null;
}

function findByNormalizedKey(response: unknown, keys: string[]): unknown {
  const normalizedKeys = keys.map(normalizeKey);
  const seen = new Set<unknown>();

  function visit(value: unknown): unknown {
    if (!value || seen.has(value)) return null;
    if (typeof value !== "object") return null;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found !== null && found !== undefined && found !== "") return found;
      }
      return null;
    }

    for (const [key, child] of Object.entries(value)) {
      if (normalizedKeys.includes(normalizeKey(key)) && child !== null && child !== undefined && child !== "") {
        return child;
      }
    }

    for (const child of Object.values(value)) {
      const found = visit(child);
      if (found !== null && found !== undefined && found !== "") return found;
    }

    return null;
  }

  return visit(response);
}

function stringValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function joinAddress(value: unknown) {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;

  const orderedKeys = ["ulica", "nrDomu", "nrLokalu", "miejscowosc", "kodPocztowy", "poczta", "kraj"];
  const parts = orderedKeys
    .map((key) => stringValue(value[key]))
    .filter((item): item is string => Boolean(item));

  return parts.length > 0 ? parts.join(", ") : null;
}

function firstString(response: unknown, paths: string[][], keys: string[]) {
  return stringValue(firstPath(response, paths)) ?? stringValue(findByNormalizedKey(response, keys));
}

function firstAddress(response: unknown) {
  const addressValue = firstPath(response, [
    ["odpis", "dane", "dzial1", "siedzibaIAdres", "adres"],
    ["odpis", "dane", "dzial1", "danePodmiotu", "siedzibaIAdres", "adres"],
    ["dane", "dzial1", "siedzibaIAdres", "adres"],
  ]) ?? findByNormalizedKey(response, ["adres"]);
  return joinAddress(addressValue) ?? stringValue(addressValue);
}

export async function fetchPublicKrsProfile({ krs, rejestr = "P" }: KrsFetchRequest) {
  if (!isKrs(krs)) {
    throw new Error("Invalid KRS. Expected exactly 10 digits.");
  }

  const url = new URL(`/api/krs/OdpisAktualny/${krs}`, KRS_BASE_URL);
  url.searchParams.set("rejestr", rejestr);
  url.searchParams.set("format", "json");

  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const body = (await response.json()) as KrsJson;
  if (!response.ok) {
    throw new Error(`Public KRS API request failed with status ${response.status}`);
  }
  return body;
}

export function mapKrsResponseToCompanyProfileData(response: unknown, fetchedAt = new Date().toISOString()): CompanyProfileData {
  const sourceDate = new Date(fetchedAt).toISOString().slice(0, 10);
  const companyName = firstString(response, [
    ["odpis", "dane", "dzial1", "danePodmiotu", "nazwa"],
    ["odpis", "dane", "dzial1", "danePodmiotu", "firma"],
  ], ["nazwa", "firma", "nazwaFirmy"]);
  const krs = firstString(response, [["odpis", "naglowekA", "numerKRS"]], ["numerKRS", "krs"]);
  const nip = firstString(response, [["odpis", "dane", "dzial1", "danePodmiotu", "identyfikatory", "nip"]], ["nip"]);
  const regon = firstString(response, [["odpis", "dane", "dzial1", "danePodmiotu", "identyfikatory", "regon"]], ["regon"]);
  const pkdCode = firstString(response, [
    ["odpis", "dane", "dzial3", "przedmiotDzialalnosci", "przedmiotPrzewazajacejDzialalnosci", "0", "kodDzial"],
  ], ["kodDzial", "kodPKD", "pkdCode", "pkd"]);
  const legalForm = firstString(response, [["odpis", "dane", "dzial1", "danePodmiotu", "formaPrawna"]], ["formaPrawna", "legalForm"]);
  const address = firstAddress(response);
  const shareCapital = firstString(response, [["odpis", "dane", "dzial1", "kapital", "wysokoscKapitaluZakladowego"]], ["wysokoscKapitaluZakladowego", "kapitalZakladowy", "shareCapital"]);
  const registrationStatus = firstString(response, [["odpis", "naglowekA", "stanZDnia"]], ["status", "stan", "registrationStatus"]);
  const warnings: string[] = [];

  if (!companyName) warnings.push("Company name was not found in Public KRS API response.");
  if (!krs) warnings.push("KRS number was not found in Public KRS API response.");

  return {
    status: "ready",
    companyName: dataPoint(companyName, sourceDate, fetchedAt),
    krs: dataPoint(krs, sourceDate, fetchedAt),
    nip: dataPoint(nip, sourceDate, fetchedAt),
    regon: dataPoint(regon, sourceDate, fetchedAt),
    pkdCode: dataPoint(pkdCode, sourceDate, fetchedAt),
    legalForm: dataPoint(legalForm, sourceDate, fetchedAt),
    address: dataPoint(address, sourceDate, fetchedAt),
    shareCapital: dataPoint(shareCapital, sourceDate, fetchedAt),
    registrationStatus: dataPoint(registrationStatus, sourceDate, fetchedAt),
    source: SOURCE,
    sourceUrl: KRS_BASE_URL,
    sourceDate,
    fetchedAt,
    warnings,
    notes: ["Public KRS API provides registry data only. Financial statement data still requires manual input or an external financial-data provider."],
  };
}

export function buildKrsDebugSnapshot(response: unknown, mappedResult: CompanyProfileData): KrsDebugSnapshot {
  return {
    responseKeys: responseKeys(response),
    mappedResult,
  };
}
