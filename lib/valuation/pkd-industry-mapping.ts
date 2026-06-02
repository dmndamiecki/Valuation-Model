import type { IndustryTemplateName } from "./industry-templates";

export type PkdIndustrySuggestion = {
  pkdCode: string;
  division: number;
  industryTemplateName: IndustryTemplateName;
  message: string;
};

function parsePkdDivision(pkdCode: string) {
  const match = pkdCode.trim().match(/^(\d{2})/);
  if (!match) {
    return null;
  }

  const division = Number(match[1]);
  return Number.isInteger(division) ? division : null;
}

function mapDivisionToIndustryTemplate(division: number): IndustryTemplateName | null {
  if (division >= 10 && division <= 33) return "Manufacturing";
  if (division >= 41 && division <= 43) return "Construction";
  if (division === 46) return "Wholesale";
  if (division === 47) return "Retail";
  if (division === 45) return "Retail";
  if (division >= 49 && division <= 53) return "Logistics";
  if (division >= 58 && division <= 63) return "Software";
  if (division === 68) return "Real Estate";
  if (division >= 69 && division <= 74) return "Professional Services";
  return null;
}

export function suggestIndustryTemplateFromPkd(pkdCode: string): PkdIndustrySuggestion | null {
  const normalizedPkd = pkdCode.trim();
  const division = parsePkdDivision(normalizedPkd);
  if (division === null) {
    return null;
  }

  const industryTemplateName = mapDivisionToIndustryTemplate(division);
  if (!industryTemplateName) {
    return null;
  }

  return {
    pkdCode: normalizedPkd,
    division,
    industryTemplateName,
    message: `Suggested from PKD ${normalizedPkd}: ${industryTemplateName}`,
  };
}
