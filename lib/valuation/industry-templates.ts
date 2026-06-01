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
    revenueGrowth: TemplateValue;
    ebitdaMargin: TemplateValue;
    capexPctRevenue: TemplateValue;
    nwcPctRevenue: TemplateValue;
    dlom: TemplateValue;
    beta: TemplateValue;
    evEbitdaMultiple: TemplateValue;
    evRevenueMultiple: TemplateValue;
  };
};

const internalSource = (value: number, confidence: TemplateConfidence = "medium"): TemplateValue => ({
  value,
  source: "Internal SME assumption",
  sourceDate: "2026-06-01 placeholder seed",
  confidence,
  isUserEditable: true,
  note: "Editable placeholder assumption for MVP onboarding; not external market data.",
});

const damodaranManualSeed = (value: number): TemplateValue => ({
  value,
  source: "Damodaran sector dataset",
  sourceDate: "manual seed pending automated import",
  confidence: "low",
  isUserEditable: true,
  note: "Manual seed pending automated import; not live market data.",
});

export const industryTemplates: IndustryTemplate[] = [
  {
    name: "Manufacturing",
    assumptions: {
      revenueGrowth: internalSource(0.045, "medium"),
      ebitdaMargin: internalSource(0.14, "medium"),
      capexPctRevenue: internalSource(0.045, "medium"),
      nwcPctRevenue: internalSource(0.13, "medium"),
      dlom: internalSource(0.18, "medium"),
      beta: damodaranManualSeed(1.05),
      evEbitdaMultiple: damodaranManualSeed(6.2),
      evRevenueMultiple: damodaranManualSeed(0.95),
    },
  },
  {
    name: "Software",
    assumptions: {
      revenueGrowth: internalSource(0.12, "low"),
      ebitdaMargin: internalSource(0.22, "low"),
      capexPctRevenue: internalSource(0.025, "medium"),
      nwcPctRevenue: internalSource(0.06, "medium"),
      dlom: internalSource(0.2, "medium"),
      beta: damodaranManualSeed(1.15),
      evEbitdaMultiple: damodaranManualSeed(8.5),
      evRevenueMultiple: damodaranManualSeed(2.5),
    },
  },
  {
    name: "Construction",
    assumptions: {
      revenueGrowth: internalSource(0.04, "medium"),
      ebitdaMargin: internalSource(0.1, "medium"),
      capexPctRevenue: internalSource(0.035, "medium"),
      nwcPctRevenue: internalSource(0.15, "medium"),
      dlom: internalSource(0.2, "medium"),
      beta: damodaranManualSeed(1.1),
      evEbitdaMultiple: damodaranManualSeed(5.5),
      evRevenueMultiple: damodaranManualSeed(0.65),
    },
  },
  {
    name: "Wholesale",
    assumptions: {
      revenueGrowth: internalSource(0.035, "medium"),
      ebitdaMargin: internalSource(0.075, "medium"),
      capexPctRevenue: internalSource(0.02, "medium"),
      nwcPctRevenue: internalSource(0.16, "medium"),
      dlom: internalSource(0.18, "medium"),
      beta: damodaranManualSeed(1.0),
      evEbitdaMultiple: damodaranManualSeed(5.8),
      evRevenueMultiple: damodaranManualSeed(0.45),
    },
  },
  {
    name: "Retail",
    assumptions: {
      revenueGrowth: internalSource(0.035, "medium"),
      ebitdaMargin: internalSource(0.08, "medium"),
      capexPctRevenue: internalSource(0.035, "medium"),
      nwcPctRevenue: internalSource(0.11, "medium"),
      dlom: internalSource(0.2, "medium"),
      beta: damodaranManualSeed(1.05),
      evEbitdaMultiple: damodaranManualSeed(6.0),
      evRevenueMultiple: damodaranManualSeed(0.6),
    },
  },
  {
    name: "Logistics",
    assumptions: {
      revenueGrowth: internalSource(0.05, "medium"),
      ebitdaMargin: internalSource(0.12, "medium"),
      capexPctRevenue: internalSource(0.07, "medium"),
      nwcPctRevenue: internalSource(0.1, "medium"),
      dlom: internalSource(0.18, "medium"),
      beta: damodaranManualSeed(1.1),
      evEbitdaMultiple: damodaranManualSeed(6.3),
      evRevenueMultiple: damodaranManualSeed(0.8),
    },
  },
  {
    name: "Real Estate",
    assumptions: {
      revenueGrowth: internalSource(0.03, "low"),
      ebitdaMargin: internalSource(0.3, "low"),
      capexPctRevenue: internalSource(0.08, "low"),
      nwcPctRevenue: internalSource(0.05, "low"),
      dlom: internalSource(0.22, "medium"),
      beta: damodaranManualSeed(0.9),
      evEbitdaMultiple: damodaranManualSeed(10.0),
      evRevenueMultiple: damodaranManualSeed(3.0),
    },
  },
  {
    name: "Professional Services",
    assumptions: {
      revenueGrowth: internalSource(0.05, "medium"),
      ebitdaMargin: internalSource(0.18, "medium"),
      capexPctRevenue: internalSource(0.015, "medium"),
      nwcPctRevenue: internalSource(0.08, "medium"),
      dlom: internalSource(0.2, "medium"),
      beta: damodaranManualSeed(0.95),
      evEbitdaMultiple: damodaranManualSeed(7.0),
      evRevenueMultiple: damodaranManualSeed(1.2),
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
    forecast: {
      ...input.forecast,
      revenueGrowth: Array(5).fill(assumptions.revenueGrowth.value),
      ebitdaMargin: Array(5).fill(assumptions.ebitdaMargin.value),
      capexPctRevenue: Array(5).fill(assumptions.capexPctRevenue.value),
    },
    workingCapital: {
      nwcPctRevenue: Array(5).fill(assumptions.nwcPctRevenue.value),
    },
    wacc: {
      ...input.wacc,
      beta: assumptions.beta.value,
    },
    discounts: {
      ...input.discounts,
      lackOfMarketability: assumptions.dlom.value,
    },
    marketMultiples: {
      ...input.marketMultiples,
      evEbitdaMultiple: assumptions.evEbitdaMultiple.value,
      evRevenueMultiple: assumptions.evRevenueMultiple.value,
    },
  };
}
