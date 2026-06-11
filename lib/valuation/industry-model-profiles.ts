export type IndustryModelProfile = {
  id: string;
  label: string;
  pkdSections: string[];
  pkdDivisions: string[];
  defaultEngineWeights: Record<string, number>;
  marginGuardrails: {
    ebitdaLow: number;
    ebitdaHigh: number;
  };
  growthGuardrails: {
    revenueCagrLow: number;
    revenueCagrHigh: number;
  };
  assetIntensity: "low" | "medium" | "high";
  notes: string[];
};

export const defaultIndustryModelProfile: IndustryModelProfile = {
  id: "pl-sme-general",
  label: "Polish SME general model",
  pkdSections: [],
  pkdDivisions: [],
  defaultEngineWeights: {
    dcf: 0.3,
    comparableCompanies: 0.15,
    marketMultiples: 0.15,
    assetBasedFloor: 0.1,
    scenarioAnalysis: 0.15,
    monteCarlo: 0.15,
  },
  marginGuardrails: { ebitdaLow: 0.05, ebitdaHigh: 0.35 },
  growthGuardrails: { revenueCagrLow: -0.1, revenueCagrHigh: 0.2 },
  assetIntensity: "medium",
  notes: ["General Polish SME weighting until a more specific PKD profile is available."],
};

export const industryModelProfiles: IndustryModelProfile[] = [
  {
    ...defaultIndustryModelProfile,
    id: "pkd-c-manufacturing",
    label: "PKD C manufacturing",
    pkdSections: ["C"],
    pkdDivisions: [],
    defaultEngineWeights: {
      dcf: 0.25,
      comparableCompanies: 0.15,
      marketMultiples: 0.15,
      assetBasedFloor: 0.2,
      scenarioAnalysis: 0.1,
      monteCarlo: 0.15,
    },
    assetIntensity: "high",
    notes: ["Manufacturing usually deserves a stronger asset-floor check because fixed assets and working capital can be material."],
  },
  {
    ...defaultIndustryModelProfile,
    id: "pkd-j-technology",
    label: "PKD J information and communication",
    pkdSections: ["J"],
    pkdDivisions: ["58", "59", "60", "61", "62", "63"],
    defaultEngineWeights: {
      dcf: 0.35,
      comparableCompanies: 0.2,
      marketMultiples: 0.15,
      assetBasedFloor: 0.05,
      scenarioAnalysis: 0.1,
      monteCarlo: 0.15,
    },
    assetIntensity: "low",
    notes: ["Technology and software businesses should not over-weight book assets unless liquidation value is the purpose."],
  },
  {
    ...defaultIndustryModelProfile,
    id: "pkd-g-trade",
    label: "PKD G wholesale and retail trade",
    pkdSections: ["G"],
    pkdDivisions: [],
    defaultEngineWeights: {
      dcf: 0.25,
      comparableCompanies: 0.2,
      marketMultiples: 0.2,
      assetBasedFloor: 0.1,
      scenarioAnalysis: 0.1,
      monteCarlo: 0.15,
    },
    marginGuardrails: { ebitdaLow: 0.02, ebitdaHigh: 0.2 },
    assetIntensity: "medium",
    notes: ["Trade businesses need careful margin and working-capital diagnostics because low margins can still be economically normal."],
  },
];

function parsePkd(pkdCode: string) {
  const normalized = pkdCode.trim().toUpperCase();
  const division = normalized.match(/\d{2}/)?.[0] ?? "";
  const section = normalized.match(/^[A-Z]/)?.[0] ?? "";
  return { section, division };
}

export function getIndustryModelProfile(pkdCode: string): IndustryModelProfile {
  const { section, division } = parsePkd(pkdCode);
  return (
    industryModelProfiles.find((profile) => profile.pkdDivisions.includes(division)) ??
    industryModelProfiles.find((profile) => profile.pkdSections.includes(section)) ??
    defaultIndustryModelProfile
  );
}
