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
    beta: TemplateValue;
    equityRiskPremium: TemplateValue;
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

const betaManualSeed = (value: number): TemplateValue => ({
  value,
  source: "Damodaran sector dataset",
  sourceDate: "manual seed pending automated import",
  confidence: "low",
  isUserEditable: true,
  note: "Template seed for industry beta pending automated import; not live market data.",
});

const erpManualSeed = (value = 0.055): TemplateValue => internalSource(
  value,
  "low",
  "Template-level ERP seed used only until a country-specific ERP source is applied; not live market data.",
);

const dlomSeed = (value: number): TemplateValue => internalSource(value, "medium", "Editable private-company DLOM seed; should be reviewed for the specific facts and circumstances.");

export const industryTemplates: IndustryTemplate[] = [
  {
    name: "Manufacturing",
    assumptions: {
      dlom: dlomSeed(0.18),
      beta: betaManualSeed(1.05),
      equityRiskPremium: erpManualSeed(),
    },
  },
  {
    name: "Software",
    assumptions: {
      dlom: dlomSeed(0.2),
      beta: betaManualSeed(1.15),
      equityRiskPremium: erpManualSeed(),
    },
  },
  {
    name: "Construction",
    assumptions: {
      dlom: dlomSeed(0.2),
      beta: betaManualSeed(1.1),
      equityRiskPremium: erpManualSeed(),
    },
  },
  {
    name: "Wholesale",
    assumptions: {
      dlom: dlomSeed(0.18),
      beta: betaManualSeed(1.0),
      equityRiskPremium: erpManualSeed(),
    },
  },
  {
    name: "Retail",
    assumptions: {
      dlom: dlomSeed(0.2),
      beta: betaManualSeed(1.05),
      equityRiskPremium: erpManualSeed(),
    },
  },
  {
    name: "Logistics",
    assumptions: {
      dlom: dlomSeed(0.18),
      beta: betaManualSeed(1.1),
      equityRiskPremium: erpManualSeed(),
    },
  },
  {
    name: "Real Estate",
    assumptions: {
      dlom: dlomSeed(0.22),
      beta: betaManualSeed(0.9),
      equityRiskPremium: erpManualSeed(),
    },
  },
  {
    name: "Professional Services",
    assumptions: {
      dlom: dlomSeed(0.2),
      beta: betaManualSeed(0.95),
      equityRiskPremium: erpManualSeed(),
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
      beta: assumptions.beta.value,
      equityRiskPremium: assumptions.equityRiskPremium.value,
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
