import { cleanBizRaportKrs } from "./identifiers";

const BIZRAPORT_BASE_URL = "https://api.bizraport.pl";
const DEFAULT_LIMIT = 250;
const MAX_CATALOG_LIMIT = 5000;
const MAX_FINANCIAL_SAMPLE = 25;

export type BizRaportCatalogFilters = {
  przychodyOd?: number;
  przychodyDo?: number;
  przychodyOperacyjneOd?: number;
  przychodyOperacyjneDo?: number;
  zyskNettoOd?: number;
  zyskNettoDo?: number;
  zyskZDzialalnosciOperacyjnejOd?: number;
  zyskZDzialalnosciOperacyjnejDo?: number;
  ebitdaOd?: number;
  ebitdaDo?: number;
  ebitOd?: number;
  ebitDo?: number;
  kosztyOperacyjneOd?: number;
  kosztyOperacyjneDo?: number;
  podatekDochodowyOd?: number;
  podatekDochodowyDo?: number;
  wynagrodzeniaOd?: number;
  wynagrodzeniaDo?: number;
  amortyzacjaOd?: number;
  amortyzacjaDo?: number;
  estymowanaWartoscFirmyOd?: number;
  estymowanaWartoscFirmyDo?: number;
  sumaBilansowaOd?: number;
  sumaBilansowaDo?: number;
  aktywaTrwaleOd?: number;
  aktywaTrwaleDo?: number;
  aktywaObrotoweOd?: number;
  aktywaObrotoweDo?: number;
  kapitalWlasnyOd?: number;
  kapitalWlasnyDo?: number;
  zobowiazaniaIRezerwyOd?: number;
  zobowiazaniaIRezerwyDo?: number;
  roaOd?: number;
  roaDo?: number;
  roeOd?: number;
  roeDo?: number;
  marzaNettoOd?: number;
  marzaNettoDo?: number;
  marzaOperacyjnaOd?: number;
  marzaOperacyjnaDo?: number;
  wskaznikZadluzeniaOd?: number;
  wskaznikZadluzeniaDo?: number;
  sredniorocznyWzrostPrzychodow3LataOd?: number;
  sredniorocznyWzrostPrzychodow3LataDo?: number;
  zatrudnienieOd?: number;
  zatrudnienieDo?: number;
  ostatniRokSprawozdaniaOd?: number;
  ostatniRokSprawozdaniaDo?: number;
  rokWpisuDoRejestruOd?: number;
  rokWpisuDoRejestruDo?: number;
  rokRozpoczeciaDzialalnosciOd?: number;
  rokRozpoczeciaDzialalnosciDo?: number;
  pkdSekcja?: string;
  pkdDzial?: string;
  pkdPodklasa?: string;
  wojewodztwo?: string;
  miasto?: string;
  adres?: string;
  powiat?: string;
  gmina?: string;
  kodPocztowyPoczatek?: string;
  kodPocztowyKoncowka?: string;
  opis?: string;
  nieWykreslona?: boolean;
  czyStatusOpp?: boolean;
  czyMaJednostkeTerenowa?: boolean;
  czyMaJednostkeTerenowaPozaPolska?: boolean;
  czyWiekszosciowyUdzialowiec?: boolean;
  limit?: number;
};

export type BizRaportCatalogCompany = {
  krs: string;
  raw: unknown;
};

export type BizRaportCatalogResult = {
  status: "ready";
  companies: BizRaportCatalogCompany[];
  returnedCount: number;
  requestedLimit: number;
  effectiveLimit: number;
  fetchedAt: string;
  source: "BizRaport";
  sourceUrl: string;
  warnings: string[];
};

type BizRaportCatalogResponse = {
  data?: unknown;
  wyniki?: unknown;
  krs?: unknown;
  dane_uciete?: boolean;
};

const filterParamMap: Record<keyof Omit<BizRaportCatalogFilters, "limit">, string> = {
  przychodyOd: "przychody_od",
  przychodyDo: "przychody_do",
  przychodyOperacyjneOd: "przychody_operacyjne_od",
  przychodyOperacyjneDo: "przychody_operacyjne_do",
  zyskNettoOd: "zysk_netto_od",
  zyskNettoDo: "zysk_netto_do",
  zyskZDzialalnosciOperacyjnejOd: "zysk_z_dzialalnosci_operacyjnej_od",
  zyskZDzialalnosciOperacyjnejDo: "zysk_z_dzialalnosci_operacyjnej_do",
  ebitdaOd: "ebitda_od",
  ebitdaDo: "ebitda_do",
  ebitOd: "ebit_od",
  ebitDo: "ebit_do",
  kosztyOperacyjneOd: "koszty_operacyjne_od",
  kosztyOperacyjneDo: "koszty_operacyjne_do",
  podatekDochodowyOd: "podatek_dochodowy_od",
  podatekDochodowyDo: "podatek_dochodowy_do",
  wynagrodzeniaOd: "wynagrodzenia_od",
  wynagrodzeniaDo: "wynagrodzenia_do",
  amortyzacjaOd: "amortyzacja_od",
  amortyzacjaDo: "amortyzacja_do",
  estymowanaWartoscFirmyOd: "estymowana_wartosc_firmy_od",
  estymowanaWartoscFirmyDo: "estymowana_wartosc_firmy_do",
  sumaBilansowaOd: "suma_bilansowa_od",
  sumaBilansowaDo: "suma_bilansowa_do",
  aktywaTrwaleOd: "aktywa_trwale_od",
  aktywaTrwaleDo: "aktywa_trwale_do",
  aktywaObrotoweOd: "aktywa_obrotowe_od",
  aktywaObrotoweDo: "aktywa_obrotowe_do",
  kapitalWlasnyOd: "kapital_wlasny_od",
  kapitalWlasnyDo: "kapital_wlasny_do",
  zobowiazaniaIRezerwyOd: "zobowiazania_i_rezerwy_na_zobowiazania_od",
  zobowiazaniaIRezerwyDo: "zobowiazania_i_rezerwy_na_zobowiazania_do",
  roaOd: "roa_od",
  roaDo: "roa_do",
  roeOd: "roe_od",
  roeDo: "roe_do",
  marzaNettoOd: "marza_netto_od",
  marzaNettoDo: "marza_netto_do",
  marzaOperacyjnaOd: "marza_operacyjna_od",
  marzaOperacyjnaDo: "marza_operacyjna_do",
  wskaznikZadluzeniaOd: "wskaznik_zadluzenia_od",
  wskaznikZadluzeniaDo: "wskaznik_zadluzenia_do",
  sredniorocznyWzrostPrzychodow3LataOd: "srednioroczny_wzrost_przychodow_3_lata_od",
  sredniorocznyWzrostPrzychodow3LataDo: "srednioroczny_wzrost_przychodow_3_lata_do",
  zatrudnienieOd: "zatrudnienie_od",
  zatrudnienieDo: "zatrudnienie_do",
  ostatniRokSprawozdaniaOd: "ostatni_rok_sprawozdania_od",
  ostatniRokSprawozdaniaDo: "ostatni_rok_sprawozdania_do",
  rokWpisuDoRejestruOd: "rok_wpisu_do_rejestru_od",
  rokWpisuDoRejestruDo: "rok_wpisu_do_rejestru_do",
  rokRozpoczeciaDzialalnosciOd: "rok_rozpoczecia_dzialalnosci_od",
  rokRozpoczeciaDzialalnosciDo: "rok_rozpoczecia_dzialalnosci_do",
  pkdSekcja: "pkd_sekcja",
  pkdDzial: "pkd_dzial",
  pkdPodklasa: "pkd_podklasa",
  wojewodztwo: "wojewodztwo",
  miasto: "miasto",
  adres: "adres",
  powiat: "powiat",
  gmina: "gmina",
  kodPocztowyPoczatek: "kod_pocztowy_poczatek",
  kodPocztowyKoncowka: "kod_pocztowy_koncowka",
  opis: "opis",
  nieWykreslona: "nie_wykreslona",
  czyStatusOpp: "czy_status_opp",
  czyMaJednostkeTerenowa: "czy_ma_jednostke_terenowa",
  czyMaJednostkeTerenowaPozaPolska: "czy_ma_jednostke_terenowa_poza_polska",
  czyWiekszosciowyUdzialowiec: "czy_wiekszosciowy_udzialowiec",
};

function getCredentials() {
  const email = process.env.BIZRAPORT_EMAIL;
  const password = process.env.BIZRAPORT_API_KEY;

  if (!email || !password) {
    throw new Error("Missing BizRaport credentials. Configure BIZRAPORT_EMAIL and BIZRAPORT_API_KEY on the server.");
  }

  return { email, password };
}

function effectiveLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? Number.NaN) || !limit) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(Math.trunc(limit), MAX_CATALOG_LIMIT));
}

export function effectiveFinancialSampleLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? Number.NaN) || !limit) {
    return 0;
  }
  return Math.max(0, Math.min(Math.trunc(limit), MAX_FINANCIAL_SAMPLE));
}

function appendFilterParams(url: URL, filters: BizRaportCatalogFilters) {
  for (const [key, param] of Object.entries(filterParamMap) as [keyof Omit<BizRaportCatalogFilters, "limit">, string][]) {
    const value = filters[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (typeof value === "boolean") {
      if (value) {
        url.searchParams.set(param, "tak");
      }
      continue;
    }
    url.searchParams.set(param, String(value));
  }
}

function buildCatalogUrl(filters: BizRaportCatalogFilters) {
  const { email, password } = getCredentials();
  const url = new URL("/api/katalog", BIZRAPORT_BASE_URL);
  url.searchParams.set("email", email);
  url.searchParams.set("password", password);
  appendFilterParams(url, filters);
  url.searchParams.set("limit", String(effectiveLimit(filters.limit)));
  return url;
}

function extractKrs(item: unknown): string | null {
  if (typeof item === "string" || typeof item === "number") {
    const normalized = cleanBizRaportKrs(String(item));
    return normalized || null;
  }
  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;
  const value = record.krs ?? record.KRS ?? record.nr_krs ?? record.numer_krs;
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = cleanBizRaportKrs(String(value));
  return normalized || null;
}

function extractRows(body: BizRaportCatalogResponse): unknown[] {
  const candidates = [body.data, body.wyniki, body.krs, body];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

export async function fetchBizRaportCatalog(filters: BizRaportCatalogFilters): Promise<BizRaportCatalogResult> {
  const fetchedAt = new Date().toISOString();
  const url = buildCatalogUrl(filters);
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const body = (await response.json()) as BizRaportCatalogResponse;

  if (!response.ok) {
    throw new Error(`BizRaport catalog request failed with status ${response.status}`);
  }

  const seen = new Set<string>();
  const companies = extractRows(body)
    .map((row) => ({ krs: extractKrs(row), raw: row }))
    .filter((row): row is BizRaportCatalogCompany => Boolean(row.krs))
    .filter((row) => {
      if (seen.has(row.krs)) {
        return false;
      }
      seen.add(row.krs);
      return true;
    });
  const requestedLimit = filters.limit ?? DEFAULT_LIMIT;
  const warnings: string[] = [];

  if ((filters.limit ?? DEFAULT_LIMIT) > MAX_CATALOG_LIMIT) {
    warnings.push(`Requested catalog limit was capped at ${MAX_CATALOG_LIMIT} for cost control.`);
  }
  if (body.dane_uciete) {
    warnings.push("BizRaport indicated that returned catalog data was truncated.");
  }

  return {
    status: "ready",
    companies,
    returnedCount: companies.length,
    requestedLimit,
    effectiveLimit: effectiveLimit(filters.limit),
    fetchedAt,
    source: "BizRaport",
    sourceUrl: BIZRAPORT_BASE_URL,
    warnings,
  };
}
