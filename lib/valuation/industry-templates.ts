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
  source: "Internal SME assumption" | "Damodaran sector dataset";
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

const dlomSeed = (value: number): TemplateValue => internalSource(value, "medium", "Editable private-company DLOM seed; should be reviewed for the specific facts and circumstances.");

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
    discounts: {
      ...input.discounts,
      lackOfMarketability: assumptions.dlom.value,
    },
  };
}
