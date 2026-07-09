import type { ValuationInput } from "./types";

export type IndustryTemplateName =
  | "Manufacturing"
  | "Software"
  | "Construction"
  | "Wholesale"
  | "Retail"
  | "Logistics"
  | "Real Estate"
  | "Professional Services";

export type TemplateConfidence = "high" | "medium" | "low";

export type TemplateValue = {
  value: number;
  source: "Internal SME assumption" | "Damodaran sector dataset" | "FinancialCraft liquidity benchmark";
  sourceUrl?: string;
  sourceDate: string;
  confidence: TemplateConfidence;
  isUserEditable: true;
  note?: string;
};

export type IndustryTemplate = {
  name: IndustryTemplateName;
  assumptions: {
    dlom: TemplateValue;
    defaultTaxRate?: TemplateValue;
  };
};

const internalSource = (value: number, confidence: TemplateConfidence = "medium", note = "Editable SME assumption for MVP onboarding; not external market data."): TemplateValue => ({
  value,
  source: "Internal SME assumption",
  sourceDate: "2026-06-01 manual seed",
  confidence,
  isUserEditable: true,
  note,
});

const dlomSeed = (value: number): TemplateValue => ({
  value,
  source: "FinancialCraft liquidity benchmark",
  sourceUrl: "https://financialcraft.pl/premia-za-plynnosc-i-dyskonto-za-brak-plynnosci/",
  sourceDate: "1Q2026",
  confidence: "medium",
  isUserEditable: true,
  note: "DLOM should be driven by FinancialCraft size bucket in the main model; template value is retained only as broad fallback context.",
});

export const industryTemplates: IndustryTemplate[] = [
  {
    name: "Manufacturing",
    assumptions: {
      dlom: dlomSeed(0.18),
    },
  },
  {
    name: "Software",
    assumptions: {
      dlom: dlomSeed(0.2),
    },
  },
  {
    name: "Construction",
    assumptions: {
      dlom: dlomSeed(0.2),
    },
  },
  {
    name: "Wholesale",
    assumptions: {
      dlom: dlomSeed(0.18),
    },
  },
  {
    name: "Retail",
    assumptions: {
      dlom: dlomSeed(0.2),
    },
  },
  {
    name: "Logistics",
    assumptions: {
      dlom: dlomSeed(0.18),
    },
  },
  {
    name: "Real Estate",
    assumptions: {
      dlom: dlomSeed(0.22),
    },
  },
  {
    name: "Professional Services",
    assumptions: {
      dlom: dlomSeed(0.2),
    },
  },
];

export function getIndustryTemplate(name: string) {
  return industryTemplates.find((template) => template.name === name);
}

export function applyIndustryTemplate(input: ValuationInput, template: IndustryTemplate): ValuationInput {
  const { assumptions } = template;

  return {
    ...input,
    profile: {
      ...input.profile,
      industry: template.name,
    },
    wacc: {
      ...input.wacc,
      taxRate: assumptions.defaultTaxRate?.value ?? input.wacc.taxRate,
    },
    forecast: {
      ...input.forecast,
      taxRate: assumptions.defaultTaxRate?.value ?? input.forecast.taxRate,
    },
    discounts: input.discounts,
  };
}
