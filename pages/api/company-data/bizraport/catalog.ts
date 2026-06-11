import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { buildBizRaportPeerBenchmarks } from "@/lib/valuation/peer-benchmarks";
import type { BizRaportCatalogFilters } from "@/lib/data-sources/bizraport-catalog";

const numericString = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === "") {
      return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  });

const querySchema = z.object({
  przychody_od: numericString,
  przychody_do: numericString,
  przychody_operacyjne_od: numericString,
  przychody_operacyjne_do: numericString,
  zysk_netto_od: numericString,
  zysk_netto_do: numericString,
  zysk_z_dzialalnosci_operacyjnej_od: numericString,
  zysk_z_dzialalnosci_operacyjnej_do: numericString,
  ebitda_od: numericString,
  ebitda_do: numericString,
  ebit_od: numericString,
  ebit_do: numericString,
  koszty_operacyjne_od: numericString,
  koszty_operacyjne_do: numericString,
  podatek_dochodowy_od: numericString,
  podatek_dochodowy_do: numericString,
  wynagrodzenia_od: numericString,
  wynagrodzenia_do: numericString,
  amortyzacja_od: numericString,
  amortyzacja_do: numericString,
  estymowana_wartosc_firmy_od: numericString,
  estymowana_wartosc_firmy_do: numericString,
  suma_bilansowa_od: numericString,
  suma_bilansowa_do: numericString,
  aktywa_trwale_od: numericString,
  aktywa_trwale_do: numericString,
  aktywa_obrotowe_od: numericString,
  aktywa_obrotowe_do: numericString,
  kapital_wlasny_od: numericString,
  kapital_wlasny_do: numericString,
  zobowiazania_i_rezerwy_na_zobowiazania_od: numericString,
  zobowiazania_i_rezerwy_na_zobowiazania_do: numericString,
  roa_od: numericString,
  roa_do: numericString,
  roe_od: numericString,
  roe_do: numericString,
  marza_netto_od: numericString,
  marza_netto_do: numericString,
  marza_operacyjna_od: numericString,
  marza_operacyjna_do: numericString,
  wskaznik_zadluzenia_od: numericString,
  wskaznik_zadluzenia_do: numericString,
  srednioroczny_wzrost_przychodow_3_lata_od: numericString,
  srednioroczny_wzrost_przychodow_3_lata_do: numericString,
  zatrudnienie_od: numericString,
  zatrudnienie_do: numericString,
  ostatni_rok_sprawozdania_od: numericString,
  ostatni_rok_sprawozdania_do: numericString,
  rok_wpisu_do_rejestru_od: numericString,
  rok_wpisu_do_rejestru_do: numericString,
  rok_rozpoczecia_dzialalnosci_od: numericString,
  rok_rozpoczecia_dzialalnosci_do: numericString,
  pkd_sekcja: z.string().optional(),
  pkd_dzial: z.string().optional(),
  pkd_podklasa: z.string().optional(),
  wojewodztwo: z.string().optional(),
  miasto: z.string().optional(),
  adres: z.string().optional(),
  powiat: z.string().optional(),
  gmina: z.string().optional(),
  kod_pocztowy_poczatek: z.string().optional(),
  kod_pocztowy_koncowka: z.string().optional(),
  opis: z.string().optional(),
  nie_wykreslona: z.string().optional(),
  czy_status_opp: z.string().optional(),
  czy_ma_jednostke_terenowa: z.string().optional(),
  czy_ma_jednostke_terenowa_poza_polska: z.string().optional(),
  czy_wiekszosciowy_udzialowiec: z.string().optional(),
  limit: numericString,
  sample_limit: numericString,
});

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeQuery(query: NextApiRequest["query"]) {
  return Object.fromEntries(Object.entries(query).map(([key, value]) => [key, firstQueryValue(value)]));
}

function isTak(value: string | undefined) {
  return value?.trim().toLowerCase() === "tak" || value?.trim().toLowerCase() === "true";
}

function toFilters(query: z.infer<typeof querySchema>): BizRaportCatalogFilters {
  return {
    przychodyOd: query.przychody_od,
    przychodyDo: query.przychody_do,
    przychodyOperacyjneOd: query.przychody_operacyjne_od,
    przychodyOperacyjneDo: query.przychody_operacyjne_do,
    zyskNettoOd: query.zysk_netto_od,
    zyskNettoDo: query.zysk_netto_do,
    zyskZDzialalnosciOperacyjnejOd: query.zysk_z_dzialalnosci_operacyjnej_od,
    zyskZDzialalnosciOperacyjnejDo: query.zysk_z_dzialalnosci_operacyjnej_do,
    ebitdaOd: query.ebitda_od,
    ebitdaDo: query.ebitda_do,
    ebitOd: query.ebit_od,
    ebitDo: query.ebit_do,
    kosztyOperacyjneOd: query.koszty_operacyjne_od,
    kosztyOperacyjneDo: query.koszty_operacyjne_do,
    podatekDochodowyOd: query.podatek_dochodowy_od,
    podatekDochodowyDo: query.podatek_dochodowy_do,
    wynagrodzeniaOd: query.wynagrodzenia_od,
    wynagrodzeniaDo: query.wynagrodzenia_do,
    amortyzacjaOd: query.amortyzacja_od,
    amortyzacjaDo: query.amortyzacja_do,
    estymowanaWartoscFirmyOd: query.estymowana_wartosc_firmy_od,
    estymowanaWartoscFirmyDo: query.estymowana_wartosc_firmy_do,
    sumaBilansowaOd: query.suma_bilansowa_od,
    sumaBilansowaDo: query.suma_bilansowa_do,
    aktywaTrwaleOd: query.aktywa_trwale_od,
    aktywaTrwaleDo: query.aktywa_trwale_do,
    aktywaObrotoweOd: query.aktywa_obrotowe_od,
    aktywaObrotoweDo: query.aktywa_obrotowe_do,
    kapitalWlasnyOd: query.kapital_wlasny_od,
    kapitalWlasnyDo: query.kapital_wlasny_do,
    zobowiazaniaIRezerwyOd: query.zobowiazania_i_rezerwy_na_zobowiazania_od,
    zobowiazaniaIRezerwyDo: query.zobowiazania_i_rezerwy_na_zobowiazania_do,
    roaOd: query.roa_od,
    roaDo: query.roa_do,
    roeOd: query.roe_od,
    roeDo: query.roe_do,
    marzaNettoOd: query.marza_netto_od,
    marzaNettoDo: query.marza_netto_do,
    marzaOperacyjnaOd: query.marza_operacyjna_od,
    marzaOperacyjnaDo: query.marza_operacyjna_do,
    wskaznikZadluzeniaOd: query.wskaznik_zadluzenia_od,
    wskaznikZadluzeniaDo: query.wskaznik_zadluzenia_do,
    sredniorocznyWzrostPrzychodow3LataOd: query.srednioroczny_wzrost_przychodow_3_lata_od,
    sredniorocznyWzrostPrzychodow3LataDo: query.srednioroczny_wzrost_przychodow_3_lata_do,
    zatrudnienieOd: query.zatrudnienie_od,
    zatrudnienieDo: query.zatrudnienie_do,
    ostatniRokSprawozdaniaOd: query.ostatni_rok_sprawozdania_od,
    ostatniRokSprawozdaniaDo: query.ostatni_rok_sprawozdania_do,
    rokWpisuDoRejestruOd: query.rok_wpisu_do_rejestru_od,
    rokWpisuDoRejestruDo: query.rok_wpisu_do_rejestru_do,
    rokRozpoczeciaDzialalnosciOd: query.rok_rozpoczecia_dzialalnosci_od,
    rokRozpoczeciaDzialalnosciDo: query.rok_rozpoczecia_dzialalnosci_do,
    pkdSekcja: query.pkd_sekcja,
    pkdDzial: query.pkd_dzial,
    pkdPodklasa: query.pkd_podklasa,
    wojewodztwo: query.wojewodztwo,
    miasto: query.miasto,
    adres: query.adres,
    powiat: query.powiat,
    gmina: query.gmina,
    kodPocztowyPoczatek: query.kod_pocztowy_poczatek,
    kodPocztowyKoncowka: query.kod_pocztowy_koncowka,
    opis: query.opis,
    nieWykreslona: isTak(query.nie_wykreslona),
    czyStatusOpp: isTak(query.czy_status_opp),
    czyMaJednostkeTerenowa: isTak(query.czy_ma_jednostke_terenowa),
    czyMaJednostkeTerenowaPozaPolska: isTak(query.czy_ma_jednostke_terenowa_poza_polska),
    czyWiekszosciowyUdzialowiec: isTak(query.czy_wiekszosciowy_udzialowiec),
    limit: query.limit,
  };
}

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ status: "error", error: "Method not allowed." });
  }

  const parsed = querySchema.safeParse(normalizeQuery(request.query));
  if (!parsed.success) {
    return response.status(400).json({ status: "error", error: "Invalid BizRaport catalog query.", issues: parsed.error.flatten() });
  }

  try {
    const result = await buildBizRaportPeerBenchmarks(toFilters(parsed.data), parsed.data.sample_limit);
    return response.status(200).json({ status: "ready", data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown BizRaport catalog error.";
    const status = message.includes("credentials") ? 500 : 400;
    return response.status(status).json({ status: "error", data: null, error: message });
  }
}
