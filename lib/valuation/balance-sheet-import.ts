import type { ImportedFinancialYear } from "@/lib/data-sources/types";
import type { BridgeAssumptions } from "./types";

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pointValue(year: ImportedFinancialYear | null | undefined, key: keyof ImportedFinancialYear): number | null {
  const item = year?.[key];
  if (item && typeof item === "object" && "value" in item) {
    return numeric(item.value);
  }
  return null;
}

export type ImportedBridgeDerivation = {
  bridge: Partial<BridgeAssumptions>;
  importedLiabilities: number | null;
  liabilitiesProxyUsed: boolean;
  cashUnavailable: boolean;
  notes: string[];
  warnings: string[];
};

export type ImportedWorkingCapitalDerivation = {
  estimatedNwc: number | null;
  nwcPctRevenue: number | null;
  totalLiabilitiesProxyUsed: boolean;
  notes: string[];
  warnings: string[];
};

export type ImportedAssetFloorInputs = {
  fixedAssets: number | null;
  currentAssets: number | null;
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
};

export function deriveBridgeFromImportedFinancials(latestFinancialYear: ImportedFinancialYear | null | undefined): ImportedBridgeDerivation {
  const cash = pointValue(latestFinancialYear, "cash");
  const liabilities = pointValue(latestFinancialYear, "liabilities");
  const notes: string[] = [];
  const warnings: string[] = [];
  const cashUnavailable = cash === null;
  const liabilitiesProxyUsed = liabilities !== null && liabilities > 0;

  if (cashUnavailable) {
    notes.push("Cash unavailable from BizRaport; bridge cash remains 0 until manually entered.");
  }

  if (liabilitiesProxyUsed) {
    warnings.push("BizRaport provides total liabilities, not net financial debt. Liabilities were used as a conservative debt-like proxy and should be reviewed.");
  }

  return {
    bridge: {
      cash: cash ?? 0,
      debt: 0,
      leasing: 0,
      otherDebtLikeItems: liabilitiesProxyUsed ? liabilities : 0,
      nonOperatingAssets: 0,
    },
    importedLiabilities: liabilities,
    liabilitiesProxyUsed,
    cashUnavailable,
    notes,
    warnings,
  };
}

export function deriveWorkingCapitalFromImportedFinancials(latestFinancialYear: ImportedFinancialYear | null | undefined): ImportedWorkingCapitalDerivation {
  const currentAssets = pointValue(latestFinancialYear, "currentAssets");
  const liabilities = pointValue(latestFinancialYear, "liabilities");
  const revenue = pointValue(latestFinancialYear, "revenue");
  const notes: string[] = [];
  const warnings: string[] = [];

  if (currentAssets !== null && liabilities !== null) {
    const estimatedNwc = currentAssets - liabilities;
    warnings.push("NWC uses total liabilities proxy because current liabilities/payables were unavailable.");
    return {
      estimatedNwc,
      nwcPctRevenue: revenue && revenue > 0 ? estimatedNwc / revenue : null,
      totalLiabilitiesProxyUsed: true,
      notes,
      warnings,
    };
  }

  if (currentAssets !== null) {
    notes.push("Current assets were imported, but current liabilities/payables were unavailable; NWC was not forced.");
  }

  return {
    estimatedNwc: null,
    nwcPctRevenue: null,
    totalLiabilitiesProxyUsed: false,
    notes,
    warnings,
  };
}

export function deriveAssetFloorInputsFromImportedFinancials(latestFinancialYear: ImportedFinancialYear | null | undefined): ImportedAssetFloorInputs {
  return {
    fixedAssets: pointValue(latestFinancialYear, "fixedAssets"),
    currentAssets: pointValue(latestFinancialYear, "currentAssets"),
    assets: pointValue(latestFinancialYear, "assets"),
    liabilities: pointValue(latestFinancialYear, "liabilities"),
    equity: pointValue(latestFinancialYear, "equity"),
  };
}
