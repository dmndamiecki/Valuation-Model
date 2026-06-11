import type { CompanyFinancialData, DataPoint, ImportedFinancialYear } from "@/lib/data-sources/types";
import type { BridgeAssumptions, ImportedValueSource, ValuationImportMetadata, ValuationInput, WorkingCapitalAssumptions } from "./types";

type NumericPoint = DataPoint<number | null> | undefined;

export type BalanceSheetImportResult = {
  bridge: BridgeAssumptions;
  workingCapital: WorkingCapitalAssumptions;
  historicals: ValuationInput["historicals"];
  importMetadata: ValuationImportMetadata;
  notes: string[];
  warnings: string[];
};

function latestYear(data: CompanyFinancialData | null): ImportedFinancialYear | undefined {
  return data?.years.find((year) => {
    return Boolean(
      year.assets ||
      year.currentAssets ||
      year.fixedAssets ||
      year.equity ||
      year.liabilities ||
      year.cash ||
      year.debt ||
      year.leasing ||
      year.otherDebtLikeItems ||
      year.netWorkingCapital,
    );
  });
}

function numericValue(point: NumericPoint): number | null {
  return typeof point?.value === "number" && Number.isFinite(point.value) ? point.value : null;
}

function importedSource(point: NumericPoint, note?: string): ImportedValueSource | undefined {
  if (!point) {
    return undefined;
  }

  return {
    value: point.value,
    source: point.source,
    sourceUrl: point.sourceUrl,
    sourceDate: point.sourceDate,
    fetchedAt: point.fetchedAt,
    confidence: point.confidence,
    isUserOverridden: point.isUserOverridden,
    note,
  };
}

function unavailableSource(data: CompanyFinancialData | null, note: string): ImportedValueSource | undefined {
  if (!data) {
    return undefined;
  }

  return {
    value: null,
    source: data.source,
    sourceUrl: data.sourceUrl,
    sourceDate: data.sourceDate,
    fetchedAt: data.fetchedAt,
    confidence: "low",
    isUserOverridden: false,
    note,
  };
}

function deriveNwc(year: ImportedFinancialYear | undefined): {
  value: number | null;
  derivedFromIncompleteFields: boolean;
  point?: NumericPoint;
  warnings: string[];
} {
  if (!year) {
    return { value: null, derivedFromIncompleteFields: true, warnings: ["NWC unavailable because no imported balance sheet year exists."] };
  }

  const explicitNwc = numericValue(year.netWorkingCapital);
  if (explicitNwc !== null) {
    return { value: explicitNwc, derivedFromIncompleteFields: false, point: year.netWorkingCapital, warnings: [] };
  }

  const receivables = numericValue(year.receivables);
  const inventory = numericValue(year.inventory);
  const payables = numericValue(year.payables);
  const currentAssets = numericValue(year.currentAssets);
  const liabilities = numericValue(year.liabilities);
  const debtRatio = numericValue(year.debtRatio);
  const warnings: string[] = [];

  if (receivables !== null || inventory !== null || payables !== null) {
    if (receivables === null || inventory === null || payables === null) {
      warnings.push("NWC derived from incomplete receivables/inventory/payables fields.");
    }
    return {
      value: (receivables ?? 0) + (inventory ?? 0) - (payables ?? 0),
      derivedFromIncompleteFields: receivables === null || inventory === null || payables === null,
      warnings,
    };
  }

  if (currentAssets !== null && liabilities !== null && debtRatio !== null) {
    const currentLiabilitiesProxy = Math.max(0, liabilities * debtRatio);
    warnings.push("NWC uses current assets less a debt-ratio-based current liabilities proxy; review manually.");
    return {
      value: currentAssets - currentLiabilitiesProxy,
      derivedFromIncompleteFields: true,
      warnings,
    };
  }

  if (currentAssets !== null) {
    warnings.push("NWC uses current assets only because current liabilities/payables are unavailable.");
    return { value: currentAssets, derivedFromIncompleteFields: true, warnings };
  }

  return { value: null, derivedFromIncompleteFields: true, warnings: ["NWC unavailable from BizRaport balance sheet fields."] };
}

function repeatedFive(value: number): number[] {
  return Array(5).fill(value);
}

function deriveWorkingCapital(
  baseInput: ValuationInput,
  latest: ImportedFinancialYear | undefined,
  historicals: ValuationInput["historicals"],
): WorkingCapitalAssumptions {
  const latestHistorical = historicals[historicals.length - 1];
  const nwc = deriveNwc(latest);
  const nwcPctRevenue = latestHistorical.revenue > 0 && nwc.value !== null
    ? nwc.value / latestHistorical.revenue
    : baseInput.workingCapital.nwcPctRevenue[0] ?? 0;

  return {
    nwcPctRevenue: repeatedFive(Math.max(0, nwcPctRevenue)),
  };
}

export function applyImportedBalanceSheet(
  data: CompanyFinancialData | null,
  baseInput: ValuationInput,
  importedHistoricals: ValuationInput["historicals"],
): BalanceSheetImportResult {
  const latest = latestYear(data);
  const latestHistorical = importedHistoricals[importedHistoricals.length - 1];
  const cash = numericValue(data?.cash ?? latest?.cash);
  const debt = numericValue(data?.debt ?? latest?.debt);
  const leasing = numericValue(data?.leasing ?? latest?.leasing);
  const liabilities = numericValue(data?.liabilities ?? latest?.liabilities);
  const explicitOtherDebtLikeItems = numericValue(data?.otherDebtLikeItems ?? latest?.otherDebtLikeItems);
  const warnings: string[] = [];
  const notes: string[] = [];
  const liabilitiesUsedAsDebtProxy = debt === null && leasing === null && explicitOtherDebtLikeItems === null && liabilities !== null && liabilities > 0;
  const otherDebtLikeItems = liabilitiesUsedAsDebtProxy ? liabilities : explicitOtherDebtLikeItems;
  const nwc = deriveNwc(latest);
  const historicals = importedHistoricals.map((historical) => {
    if (historical.year !== latestHistorical.year || nwc.value === null) {
      return historical;
    }
    return { ...historical, netWorkingCapital: nwc.value };
  });

  if (cash === null) {
    warnings.push("Cash unavailable from BizRaport; model fallback remains zero until reviewed manually.");
  }
  if (debt === null && leasing === null && explicitOtherDebtLikeItems === null) {
    warnings.push("Financial debt unavailable from BizRaport; model fallback remains zero unless total liabilities are used as proxy.");
  }
  if (liabilitiesUsedAsDebtProxy) {
    warnings.push("Total liabilities used as conservative debt-like proxy; review actual financial debt manually.");
  }
  warnings.push(...nwc.warnings);

  if (latest?.assets || latest?.equity || latest?.liabilities) {
    notes.push("Latest-year BizRaport balance sheet fields captured for future asset-based valuation floor.");
  }

  return {
    bridge: {
      ...baseInput.bridge,
      cash: cash ?? baseInput.bridge.cash,
      debt: debt ?? baseInput.bridge.debt,
      leasing: leasing ?? baseInput.bridge.leasing,
      otherDebtLikeItems: otherDebtLikeItems ?? baseInput.bridge.otherDebtLikeItems,
    },
    workingCapital: deriveWorkingCapital(baseInput, latest, historicals),
    historicals,
    importMetadata: {
      bridge: {
        cash: importedSource(data?.cash ?? latest?.cash) ?? unavailableSource(data, "unavailable from BizRaport"),
        debt: importedSource(data?.debt ?? latest?.debt) ?? unavailableSource(data, "unavailable from BizRaport"),
        leasing: importedSource(data?.leasing ?? latest?.leasing),
        otherDebtLikeItems: liabilitiesUsedAsDebtProxy
          ? importedSource(data?.liabilities ?? latest?.liabilities, "Total liabilities used as conservative debt-like proxy; review actual financial debt manually.")
          : importedSource(data?.otherDebtLikeItems ?? latest?.otherDebtLikeItems),
        liabilities: importedSource(data?.liabilities ?? latest?.liabilities),
        cashUnavailable: cash === null,
        debtUnavailable: debt === null && leasing === null && explicitOtherDebtLikeItems === null,
        liabilitiesUsedAsDebtProxy,
        warnings,
      },
      workingCapital: {
        netWorkingCapital: nwc.point ? importedSource(nwc.point) : nwc.value === null ? unavailableSource(data, "unavailable from BizRaport") : undefined,
        currentAssets: importedSource(latest?.currentAssets),
        receivables: importedSource(latest?.receivables),
        inventory: importedSource(latest?.inventory),
        payables: importedSource(latest?.payables),
        derivedFromIncompleteFields: nwc.derivedFromIncompleteFields,
        warnings: nwc.warnings,
      },
      assetFloor: {
        assets: importedSource(latest?.assets),
        equity: importedSource(latest?.equity),
        liabilities: importedSource(data?.liabilities ?? latest?.liabilities),
        warnings: latest?.assets || latest?.equity || latest?.liabilities ? [] : ["Asset floor base unavailable from BizRaport balance sheet fields."],
      },
    },
    notes,
    warnings,
  };
}

