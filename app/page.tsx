"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, AlertTriangle, ArrowRight, Building2, Calculator, CheckCircle2, Database, FileDown, Gauge, Layers3, LineChart as LineChartIcon, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { createDamodaranManualSeedSnapshot } from "@/lib/data-sources/damodaran";
import type { DamodaranBetaSuggestion } from "@/lib/data-sources/damodaran-beta";
import type { DamodaranErpSuggestion } from "@/lib/data-sources/damodaran-erp";
import type { DamodaranEuropeBenchmark } from "@/lib/data-sources/damodaran-europe";
import { createFredManualSeedSnapshot, type FredRiskFreeRateResult } from "@/lib/data-sources/fred";
import { cleanBizRaportKrs, isKrs, isNip } from "@/lib/data-sources/identifiers";
import { getCompanyDataSources, getMarketDataSources } from "@/lib/data-sources/mapping";
import type { CompanyFinancialData, CompanyProfileData, DataPoint, ImportedFinancialYear, MarketDataSnapshot } from "@/lib/data-sources/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateEquityBridge, calculatePrivateCompanyDiscounts } from "@/lib/valuation/bridge";
import { countryOptions, currencyOptions, formatCurrencyOption, getDefaultCurrencyForCountry } from "@/lib/valuation/company-profile";
import { calculateDcf } from "@/lib/valuation/dcf";
import { calculateValuationDiagnostics } from "@/lib/valuation/diagnostics";
import { buildCombinedCsvExport, buildPdfReportHtml, buildReportJson, buildReportSummaryText, buildValuationReport } from "@/lib/valuation/export";
import { createBlankValuationInput } from "@/lib/valuation/default-data";
import { calculateNormalizationMarginUplift, forecastFinancials, normalizeLatestEbitda, seedForecastFromHistoricals, sumNormalizationAdjustments, type HistoricalForecastSeed } from "@/lib/valuation/forecast";
import {
  calculateEvToEquityBridgeOutput,
  calculateExecutiveSummary,
  calculatePrivateCompanyAdjustmentBridge,
  calculateTerminalValueBreakdown,
  calculateValuationWarnings,
} from "@/lib/valuation/output";
import { calculateScenarioAnalysis } from "@/lib/valuation/scenarios";
import { applyIndustryTemplate, getIndustryTemplate, industryTemplates, type IndustryTemplate } from "@/lib/valuation/industry-templates";
import { assessMarketMultipleIntelligence, marketMultipleSourceKindLabel, type MarketMultipleSourceKind } from "@/lib/valuation/market-multiple-intelligence";
import type { BenchmarkAssistantResult } from "@/lib/valuation/benchmark-assistant";
import { summarizePublicComps } from "@/lib/valuation/public-comps";
import { suggestIndustryTemplateFromPkd, type PkdIndustrySuggestion } from "@/lib/valuation/pkd-industry-mapping";
import { buildValuationInputFromSimpleMode, simpleInputFromValuationInput, type SimpleModeInput } from "@/lib/valuation/simple-mode";
import { buildCenteredSensitivityCases, buildSensitivityTable } from "@/lib/valuation/sensitivity";
import { valuationInputSchema, type MarketMultipleSource, type ValuationInput } from "@/lib/valuation/types";
import { calculateWacc } from "@/lib/valuation/wacc";
import { applyImportedBalanceSheet } from "@/lib/valuation/balance-sheet-import";
import { runValuationEngines, type BlendedValuationRange, type ValuationEngineId, type ValuationEngineResult } from "@/lib/valuation/engine-runner";
import { buildBizRaportPeerFilters } from "@/lib/valuation/comparable-companies";
import type { PeerBenchmarkResult } from "@/lib/valuation/peer-benchmarks";

type PercentArrayKey = "revenueGrowth" | "ebitdaMargin" | "depreciationPctRevenue" | "capexPctRevenue";
type ValuationMode = "simple" | "professional";
type WizardInput = SimpleModeInput & { valuationType: ValuationMode; industryTemplateName: string; applyIndustryTemplate: boolean };
type BizRaportSearchItem = { krs: string };
type CombinedCompanyImportPreviewData = {
  krsProfile: CompanyProfileData | null;
  companyData: CompanyFinancialData | null;
  pkdSuggestion: PkdIndustrySuggestion | null;
  seed: HistoricalForecastSeed | null;
  notes: string[];
  warnings: string[];
};
type ImportedDataSummary = {
  sources: string[];
  companyName: string;
  latestFinancialYear: number | null;
  revenue: number | null;
  ebitda: number | null;
  industrySuggestion: string;
  forecastGenerated: boolean;
};
type DataReadinessItem = {
  label: string;
  status: "connected" | "partial" | "manual";
  detail: string;
};

const blankValuationInput = createBlankValuationInput();
const defaultSimpleModeInput = simpleInputFromValuationInput(blankValuationInput);
const defaultWizardInput: WizardInput = { ...defaultSimpleModeInput, valuationType: "simple", industryTemplateName: "", applyIndustryTemplate: false };

type WorkflowStatus = "complete" | "warning" | "missing inputs";

type WorkflowSectionItem = {
  id: string;
  label: string;
  status: WorkflowStatus;
};

function statusClassName(status: WorkflowStatus) {
  if (status === "complete") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-red-200 bg-red-50 text-red-800";
}

function StatusBadge({ status }: { status: WorkflowStatus }) {
  return <Badge className={statusClassName(status)}>{status}</Badge>;
}

function dataReadinessClassName(status: DataReadinessItem["status"]) {
  if (status === "connected") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "partial") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function DataReadinessPanel({ items, score }: { items: DataReadinessItem[]; score: number }) {
  return (
    <Card className="border-slate-300 bg-white">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Data readiness</CardTitle>
            <CardDescription>KRS, BizRaport, PKD, forecast seed, and WACC sources are checked before you rely on the valuation output.</CardDescription>
          </div>
          <Badge className={score >= 80 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : score >= 50 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}>Readiness {score}%</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 rounded-lg border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm font-semibold text-slate-950">{item.label}</p>
              <Badge className={`${dataReadinessClassName(item.status)} shrink-0`}>{item.status}</Badge>
            </div>
            <p className="mt-2 break-words text-xs leading-5 text-slate-600">{item.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function WorkflowHeader({ id, eyebrow, title, description, status }: { id: string; eyebrow: string; title: string; description: string; status: WorkflowStatus }) {
  return (
    <div id={id} className="scroll-mt-28 border-b border-slate-200 pb-4 pt-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function WorkflowNav({ sections }: { sections: WorkflowSectionItem[] }) {
  return (
    <nav className="sticky top-3 z-20 rounded-lg border border-slate-300 bg-white/94 p-2 shadow-[0_18px_42px_rgba(15,23,42,0.10)] backdrop-blur">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="flex min-w-max items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-teal-500 hover:bg-white hover:text-teal-800">
            <span>{section.label}</span>
            <span className={`rounded-full px-2 py-0.5 ${statusClassName(section.status)}`}>{section.status}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

function StageScrollRail({
  sections,
  activeId,
  progress,
}: {
  sections: WorkflowSectionItem[];
  activeId: string;
  progress: number;
}) {
  const activeSection = sections.find((section) => section.id === activeId) ?? sections[0];

  return (
    <aside aria-label="Current workbench stage" className="fixed right-4 top-1/2 z-30 hidden w-40 -translate-y-1/2 xl:block">
      <div className="rounded-2xl border border-teal-100 bg-white/88 p-3 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur">
        <div className="mb-3 rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 p-3">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-teal-700">You are in</p>
          <p className="mt-1 break-words text-sm font-bold leading-5 text-slate-950">{activeSection?.label ?? "Conclusion"}</p>
        </div>
        <div className="relative ml-2">
          <div className="absolute bottom-2 left-[9px] top-2 w-1 rounded-full bg-slate-100" />
          <div className="absolute left-[9px] top-2 w-1 rounded-full bg-gradient-to-b from-teal-500 via-emerald-400 to-blue-400 transition-all duration-300" style={{ height: `${Math.max(progress, 4)}%` }} />
          <div className="space-y-2">
            {sections.map((section) => {
              const active = section.id === activeId;
              return (
                <a key={section.id} href={`#${section.id}`} className="group relative flex min-w-0 items-center gap-3 rounded-lg px-1 py-1.5">
                  <span className={`relative z-10 h-5 w-5 shrink-0 rounded-full border-2 transition ${active ? "border-teal-700 bg-teal-600 shadow-[0_0_0_5px_rgba(20,184,166,0.15)]" : "border-white bg-slate-300 group-hover:bg-teal-300"}`} />
                  <span className={`truncate text-xs font-bold transition ${active ? "text-teal-900" : "text-slate-500 group-hover:text-slate-800"}`}>{section.label}</span>
                </a>
              );
            })}
          </div>
        </div>
        <div className="mt-3 rounded-full bg-slate-100 p-1">
          <div className="h-1.5 rounded-full bg-gradient-to-r from-teal-600 to-emerald-400 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </aside>
  );
}

type ScalarPath =
  | ["profile", keyof ValuationInput["profile"]]
  | ["forecast", "taxRate"]
  | ["wacc", keyof ValuationInput["wacc"]]
  | ["terminalValue", "perpetualGrowthRate" | "exitEbitdaMultiple"]
  | ["bridge", keyof ValuationInput["bridge"]]
  | ["discounts", keyof ValuationInput["discounts"]]
  | ["marketMultiples", keyof ValuationInput["marketMultiples"]];

const currencyFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const chartAxisStyle = { fill: "#64748b", fontSize: 12, fontWeight: 600 };
const chartGridColor = "#d8e1e7";
const chartTooltipStyle = {
  border: "1px solid #d8e1e7",
  borderRadius: 10,
  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)",
  color: "#0f172a",
};
const marketMultipleSourceKindOptions: MarketMultipleSourceKind[] = ["manual", "publicComparable", "damodaranSector", "licensedProvider", "aiSuggested"];

function money(value: number, currency = "USD") {
  return Number.isFinite(value) ? `${currency} ${currencyFormatter.format(value)}` : "N/M";
}

function chartMoney(value: unknown, currency = "USD") {
  const numericValue = typeof value === "number" ? value : Number(value ?? 0);
  return money(numericValue, currency);
}

function pct(value: number) {
  return Number.isFinite(value) ? percentFormatter.format(value) : "N/M";
}

function multiple(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(1)}x` : "N/M";
}

function asNumber(value: string) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function SourceMeta({ dataPoint }: { dataPoint: DataPoint<number | string | null> }) {
  return (
    <span className="block break-words text-xs text-slate-500">
      Source: {dataPoint.source} | Date: {dataPoint.sourceDate} | Confidence: {dataPoint.confidence}{dataPoint.isUserOverridden ? " | user override" : ""}
    </span>
  );
}

function DataPointRow({ label, dataPoint, formatter = String }: { label: string; dataPoint?: DataPoint<number | string | null>; formatter?: (value: number | string | null) => string }) {
  return (
    <div className="border-b border-slate-100 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-right font-semibold text-slate-950">{dataPoint && dataPoint.value !== null ? formatter(dataPoint.value) : "Unavailable"}</span>
      </div>
      {dataPoint ? <SourceMeta dataPoint={dataPoint} /> : <span className="block text-xs text-slate-500">No source connected yet.</span>}
    </div>
  );
}

function TemplateAssumptionTable({ template }: { template: IndustryTemplate }) {
  const rows = [
    {
      label: "Industry classification",
      value: template.name,
      source: "PKD / industry template",
      sourceDate: "Current model",
      confidence: "medium" as const,
      note: "Used for classification, private-company discounts, and industry context. Beta and ERP are sourced in Market Data Sources.",
      format: "text" as const,
    },
    {
      label: "DLOM",
      value: template.assumptions.dlom.value,
      source: template.assumptions.dlom.source,
      sourceDate: template.assumptions.dlom.sourceDate,
      confidence: template.assumptions.dlom.confidence,
      note: template.assumptions.dlom.note,
      format: "percent" as const,
    },
    ...(template.assumptions.defaultTaxRate ? [{
      label: "Default tax rate",
      value: template.assumptions.defaultTaxRate.value,
      source: template.assumptions.defaultTaxRate.source,
      sourceDate: template.assumptions.defaultTaxRate.sourceDate,
      confidence: template.assumptions.defaultTaxRate.confidence,
      note: template.assumptions.defaultTaxRate.note,
      format: "percent" as const,
    }] : []),
  ];

  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="p-3">Assumption</th><th className="p-3 text-right">Value</th><th className="p-3">Source</th><th className="p-3">Source date</th><th className="p-3">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-slate-100 align-top">
              <td className="p-3 font-semibold text-slate-800">{row.label}</td>
              <td className="p-3 text-right font-semibold text-slate-950">{row.format === "percent" ? pct(row.value as number) : String(row.value)}</td>
              <td className="p-3 text-slate-700">{row.source}{row.note ? <span className="block text-xs text-slate-500">{row.note}</span> : null}</td>
              <td className="p-3 text-slate-600">{row.sourceDate}</td>
              <td className="p-3"><Badge className={row.confidence === "low" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}>{row.confidence}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PkdSuggestionPanel({ suggestion }: { suggestion: PkdIndustrySuggestion | null }) {
  if (!suggestion) {
    return null;
  }

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-teal-950">{suggestion.message}</p>
          <p className="mt-1 text-xs text-teal-800">PKD division {suggestion.division} maps to the existing {suggestion.industryTemplateName} industry template. The template is applied automatically; forecast assumptions remain generated from historical financial statements.</p>
        </div>
        <Badge className="border-teal-200 bg-white text-teal-800">Applied automatically</Badge>
      </div>
    </div>
  );
}

function CombinedCompanyImportPreview({ preview, currency, onConfirm }: { preview: CombinedCompanyImportPreviewData; currency: string; onConfirm: () => void }) {
  const profile = preview.krsProfile;
  const data = preview.companyData;
  const latest = data?.years[0];
  const hasProfile = Boolean(profile || data);
  const hasFinancials = Boolean(latest);

  return (
    <div className="space-y-4 rounded-lg border border-teal-200 bg-teal-50/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-950">Review fetched company data</p>
          <p className="text-xs text-slate-600">Confirm that the registry profile, BizRaport financials, PKD template, and generated assumptions match the company before building the model.</p>
        </div>
        <Badge className="border-amber-200 bg-white text-amber-800">Needs confirmation</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">Company profile</h3>
          {hasProfile ? (
            <div className="mt-3">
              <DataPointRow label="Company name" dataPoint={profile?.companyName ?? data?.companyName} />
              <DataPointRow label="KRS" dataPoint={profile?.krs ?? data?.krs} />
              <DataPointRow label="NIP" dataPoint={profile?.nip ?? data?.nip} />
              <DataPointRow label="REGON" dataPoint={profile?.regon ?? data?.regon} />
              <DataPointRow label="PKD" dataPoint={profile?.pkdCode ?? data?.pkdCode} />
              <DataPointRow label="PKD description" dataPoint={data?.pkdDescription} />
              <DataPointRow label="Legal form" dataPoint={profile?.legalForm ?? data?.legalForm} />
              <DataPointRow label="Address" dataPoint={profile?.address} />
              <DataPointRow label="Website" dataPoint={data?.website} />
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">No profile data returned.</p>}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">Financials</h3>
          {hasFinancials ? (
            <div className="mt-3">
              <DataPointRow label="Latest year" dataPoint={{ value: latest!.year, source: data!.source, sourceUrl: data!.sourceUrl, sourceDate: data!.sourceDate, fetchedAt: data!.fetchedAt, confidence: "high", isUserOverridden: false }} formatter={(value) => String(value)} />
              <DataPointRow label="Revenue" dataPoint={latest!.revenue} formatter={(value) => money(Number(value), currency)} />
              <DataPointRow label="EBITDA" dataPoint={latest!.ebitda} formatter={(value) => money(Number(value), currency)} />
              <DataPointRow label="EBIT" dataPoint={latest!.ebit} formatter={(value) => money(Number(value), currency)} />
              <DataPointRow label="Net income" dataPoint={latest!.netIncome} formatter={(value) => money(Number(value), currency)} />
              <DataPointRow label="Assets" dataPoint={latest!.assets} formatter={(value) => money(Number(value), currency)} />
              <DataPointRow label="Equity" dataPoint={latest!.equity} formatter={(value) => money(Number(value), currency)} />
              <DataPointRow label="Liabilities" dataPoint={latest!.liabilities} formatter={(value) => money(Number(value), currency)} />
              <DataPointRow label="Employees" dataPoint={latest!.employees} formatter={(value) => Number(value).toFixed(0)} />
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">No BizRaport financial years available. Manual financial inputs will be requested later.</p>}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">Generated assumptions</h3>
          {preview.seed ? (
            <div className="mt-3 space-y-2 text-sm">
              <OutputRow label="Revenue growth" value={`${pct(preview.seed.revenueCagr)} · ${preview.seed.source}`} />
              <OutputRow label="EBITDA margin" value={`${pct(preview.seed.ebitdaMargin)} · ${preview.seed.source}`} />
              <OutputRow label="D&A / revenue" value={`${pct(preview.seed.depreciationPctRevenue)} · ${preview.seed.source}`} />
              <OutputRow label="CAPEX / revenue" value={`${pct(preview.seed.capexPctRevenue)} · ${preview.seed.source}`} />
              <OutputRow label="NWC / revenue" value={`${pct(preview.seed.nwcPctRevenue)} · ${preview.seed.source}`} />
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">Generated forecast assumptions require imported financials.</p>}
          {preview.pkdSuggestion ? <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3"><p className="text-sm font-semibold text-teal-950">{preview.pkdSuggestion.message}</p><p className="mt-1 text-xs text-teal-800">Selected industry template if imported: {preview.pkdSuggestion.industryTemplateName}. Forecast assumptions remain generated from historical financial statements.</p></div> : <p className="mt-3 text-sm text-slate-500">No PKD-based industry suggestion available.</p>}
        </div>
      </div>

      {preview.notes.length > 0 ? <p className="text-xs text-slate-600">{preview.notes.join(" ")}</p> : null}
      {preview.warnings.length > 0 ? <p className="text-xs text-amber-700">{preview.warnings.join(" ")}</p> : null}
      <div className="flex flex-col gap-3 border-t border-teal-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">If these details look right, apply them to the valuation model and choose the owner or extended view.</p>
        <button className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800" onClick={onConfirm}>Confirm and apply data</button>
      </div>
    </div>
  );
}

function ImportedDataSummaryCard({ summary }: { summary: ImportedDataSummary }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-950">Imported data summary</h3>
        <p className="mt-1 text-sm text-slate-500">Company data imported in the setup wizard. Fields remain editable; the model recalculates as assumptions change.</p>
      </div>
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <OutputRow label="Source" value={summary.sources.join(" / ") || "Manual"} />
        <OutputRow label="Company name" value={summary.companyName || "Unavailable"} />
        <OutputRow label="Latest financial year" value={summary.latestFinancialYear ? String(summary.latestFinancialYear) : "Unavailable"} />
        <OutputRow label="Revenue" value={summary.revenue !== null ? currencyFormatter.format(summary.revenue) : "Unavailable"} />
        <OutputRow label="EBITDA" value={summary.ebitda !== null ? currencyFormatter.format(summary.ebitda) : "Unavailable"} />
        <OutputRow label="Industry suggestion" value={summary.industrySuggestion || "Unavailable"} />
        <OutputRow label="Forecast generated" value={summary.forecastGenerated ? "Yes" : "No"} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 shadow-sm">
      <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-3 break-words text-2xl font-bold leading-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

type WorkbenchNextStepsProps = {
  mode: ValuationMode;
  sourceReadinessScore: number;
  marketMultipleSource: MarketMultipleSource;
  criticalCount: number;
  warningCount: number;
  benchmarkAssistantStatus: string;
  peerBenchmarkStatus: string;
  onOpenExtended: () => void;
};

function stepToneClassName(status: "ready" | "review" | "action") {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "review") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function WorkbenchNextSteps({
  mode,
  sourceReadinessScore,
  marketMultipleSource,
  criticalCount,
  warningCount,
  benchmarkAssistantStatus,
  peerBenchmarkStatus,
  onOpenExtended,
}: WorkbenchNextStepsProps) {
  const sourceStatus = sourceReadinessScore >= 80 ? "ready" : sourceReadinessScore >= 50 ? "review" : "action";
  const benchmarkStatus = marketMultipleSource.approvalStatus === "approved" ? "ready" : marketMultipleSource.kind === "manual" ? "action" : "review";
  const diagnosticsStatus = criticalCount > 0 ? "action" : warningCount > 0 ? "review" : "ready";
  const steps = [
    {
      number: "01",
      title: "Evidence quality",
      detail: sourceReadinessScore >= 80 ? "KRS, BizRaport and market inputs are connected enough for review." : "Confirm imported company data and market inputs before relying on the output.",
      status: sourceStatus,
      href: "#evidence-quality",
    },
    {
      number: "02",
      title: "Method evidence",
      detail: marketMultipleSource.approvalStatus === "approved"
        ? "Selected market evidence is approved."
        : "Run the benchmark assistant, review sector and peer evidence, then approve selected multiples.",
      status: benchmarkStatus,
      href: "#methods",
    },
    {
      number: "03",
      title: "Assumption review",
      detail: criticalCount > 0 ? "Critical diagnostics need attention before decision use." : warningCount > 0 ? "Warnings are active; review the relevant assumptions." : "No critical diagnostics are active.",
      status: diagnosticsStatus,
      href: "#assumptions",
    },
    {
      number: "04",
      title: "Export package",
      detail: "Create the report only after source data, benchmark evidence and diagnostics are reviewed.",
      status: diagnosticsStatus === "ready" && benchmarkStatus !== "action" ? "ready" : "review",
      href: "#export",
    },
  ] as const;

  return (
    <Card className="border-slate-300 bg-white/95">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Review path</CardTitle>
            <CardDescription>One valuation model, one headline conclusion. These cards guide the review without creating a second result.</CardDescription>
          </div>
          {mode === "simple" ? (
            <button className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800" onClick={onOpenExtended}>
              Open workbench
            </button>
          ) : (
            <Badge className="border-slate-200 bg-slate-50 text-slate-700">Workbench open</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-4">
          {steps.map((step) => (
            <a key={step.number} href={step.href} className="group block rounded-lg border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 transition hover:border-teal-500 hover:shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{step.number}</span>
                <Badge className={stepToneClassName(step.status)}>{step.status === "ready" ? "ready" : step.status === "review" ? "review" : "action"}</Badge>
              </div>
              <p className="mt-4 text-sm font-bold text-slate-950">{step.title}</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">{step.detail}</p>
            </a>
          ))}
        </div>
        {(benchmarkAssistantStatus || peerBenchmarkStatus) ? (
          <div className="grid gap-3 text-xs leading-5 text-slate-600 md:grid-cols-2">
            {benchmarkAssistantStatus ? <p className="rounded-md border border-teal-100 bg-teal-50 p-3"><strong className="text-teal-950">Benchmark assistant:</strong> {benchmarkAssistantStatus}</p> : null}
            {peerBenchmarkStatus ? <p className="rounded-md border border-slate-200 bg-slate-50 p-3"><strong className="text-slate-950">Peer screen:</strong> {peerBenchmarkStatus}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ValuationRangePanel({
  currency,
  low,
  base,
  high,
  confidenceScore,
  readinessHeadline,
}: {
  currency: string;
  low: number;
  base: number;
  high: number;
  confidenceScore: number;
  readinessHeadline: string;
}) {
  const range = Math.max(high - low, 1);
  const basePosition = Math.min(Math.max(((base - low) / range) * 100, 0), 100);

  return (
    <Card className="overflow-hidden border-slate-300 bg-white">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Conclusion: valuation range</CardTitle>
            <CardDescription>This is the one headline answer. Method detail, DCF math, source evidence and exports sit below in the workbench.</CardDescription>
          </div>
          <Badge className={confidenceScore >= 80 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : confidenceScore >= 60 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-800"}>Confidence {confidenceScore}%</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            ["Low indication", money(low, currency), "Lower end of active method range"],
            ["Headline value", money(base, currency), "Weighted midpoint across active methods"],
            ["High indication", money(high, currency), "Upper end of active method range"],
          ].map(([label, value, helper]) => (
            <div key={label} className="min-w-0 rounded-lg border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
              <p className="mt-3 break-words text-xl font-bold text-slate-950 sm:text-2xl">{value}</p>
              <p className="mt-2 text-sm text-slate-500">{helper}</p>
            </div>
          ))}
        </div>
        <div>
          <div className="relative h-4 rounded-full bg-slate-100 shadow-inner">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-800 to-emerald-500" style={{ width: `${basePosition}%` }} />
            <div className="absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border-2 border-white bg-slate-950 shadow-lg" style={{ left: `calc(${basePosition}% - 12px)` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs font-semibold text-slate-500">
            <span>{money(low, currency)}</span>
            <span>{money(high, currency)}</span>
          </div>
        </div>
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">{readinessHeadline}</p>
      </CardContent>
    </Card>
  );
}

function engineStatusClassName(status: ValuationEngineResult["status"]) {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "review") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "missing-data") return "border-red-200 bg-red-50 text-red-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function engineAccentClassName(status: ValuationEngineResult["status"]) {
  if (status === "ready") return "from-emerald-500 to-teal-700";
  if (status === "review") return "from-amber-400 to-orange-600";
  if (status === "missing-data") return "from-red-400 to-rose-700";
  return "from-slate-300 to-slate-500";
}

function diagnosticToneClassName(severity: ValuationEngineResult["diagnostics"][number]["severity"]) {
  if (severity === "critical") return "border-red-100 bg-red-50 text-red-900";
  if (severity === "warning") return "border-amber-100 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function clampPercent(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

function rangeMarkerPosition(value: number, low: number, high: number) {
  const span = Math.max(high - low, 1);
  return clampPercent(((value - low) / span) * 100);
}

function engineDetailValue(value: ValuationEngineResult["details"][string], currency: string) {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "n/a";
  if (Math.abs(value) >= 1000) return money(value, currency);
  if (Math.abs(value) <= 1 && value !== 0) return pct(value);
  return value.toFixed(2);
}

function EngineCockpit({
  cockpit,
  currency,
  selectedEngineId,
  onSelectEngine,
  onCloseSourceDrawer,
  onFetchComparablePeers,
  peerBenchmarkStatus,
}: {
  cockpit: BlendedValuationRange;
  currency: string;
  selectedEngineId: ValuationEngineId | null;
  onSelectEngine: (engineId: ValuationEngineId) => void;
  onCloseSourceDrawer: () => void;
  onFetchComparablePeers: () => void;
  peerBenchmarkStatus: string;
}) {
  const selectedEngine = cockpit.engineResults.find((engine) => engine.id === selectedEngineId) ?? null;
  const rangeSize = Math.max(cockpit.high - cockpit.low, 1);
  const basePosition = Math.min(Math.max(((cockpit.base - cockpit.low) / rangeSize) * 100, 0), 100);
  const readyCount = cockpit.engineResults.filter((engine) => engine.status === "ready").length;
  const reviewCount = cockpit.engineResults.filter((engine) => engine.status === "review").length;
  const missingCount = cockpit.engineResults.filter((engine) => engine.status === "missing-data").length;
  const weightedEngines = cockpit.engineResults.filter((engine) => engine.normalizedWeight > 0);

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="overflow-hidden border-slate-300 bg-white">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white"><Layers3 size={18} /></span>
                <div>
                  <CardTitle>Method Weighting</CardTitle>
                  <CardDescription>Breakdown of the headline conclusion by method. This is supporting evidence, not a second valuation answer.</CardDescription>
                </div>
              </div>
            </div>
            <Badge className={cockpit.confidenceBand === "high" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : cockpit.confidenceBand === "medium" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-800"}>
              Blended confidence {cockpit.confidenceScore}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
            <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-5 text-white shadow-lg shadow-slate-900/10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-teal-100">Same headline value, by method</p>
                  <p className="mt-3 break-words text-3xl font-bold leading-tight sm:text-4xl">{money(cockpit.base, currency)}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">The value shown in Conclusion, with inactive or missing-data engines excluded from the blend.</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md border border-white/10 bg-white/10 p-2">
                    <p className="font-bold text-emerald-200">{readyCount}</p>
                    <p className="mt-1 text-slate-300">ready</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/10 p-2">
                    <p className="font-bold text-amber-200">{reviewCount}</p>
                    <p className="mt-1 text-slate-300">review</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/10 p-2">
                    <p className="font-bold text-red-200">{missingCount}</p>
                    <p className="mt-1 text-slate-300">missing</p>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <div className="relative h-5 rounded-full bg-white/15 shadow-inner">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-300 via-emerald-300 to-white" style={{ width: `${basePosition}%` }} />
                  <div className="absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border-2 border-white bg-slate-950 shadow-lg" style={{ left: `calc(${basePosition}% - 14px)` }} />
                </div>
                <div className="mt-3 flex justify-between gap-4 text-xs font-semibold text-slate-300">
                  <span>{money(cockpit.low, currency)}</span>
                  <span>{money(cockpit.high, currency)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <Gauge size={18} className="text-teal-700" />
                <p className="text-sm font-bold text-slate-950">Method weighting</p>
              </div>
              <div className="mt-4 space-y-3">
                {weightedEngines.length ? weightedEngines.map((engine) => (
                  <div key={engine.id}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-bold text-slate-700">{engine.name}</span>
                      <span className="font-bold text-slate-950">{(engine.normalizedWeight * 100).toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-white shadow-inner">
                      <div className={`h-2 rounded-full bg-gradient-to-r ${engineAccentClassName(engine.status)}`} style={{ width: `${clampPercent(engine.normalizedWeight * 100)}%` }} />
                    </div>
                  </div>
                )) : <p className="text-sm text-slate-500">No active engine weights available yet.</p>}
              </div>
              <p className="mt-4 rounded-md border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
                Industry profile: <span className="font-bold text-slate-950">{cockpit.industryProfile.label}</span>. Active engines: {cockpit.activeEngines.length}. Excluded engines: {cockpit.excludedEngines.length}.
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {cockpit.engineResults.map((engine) => (
              <button
                key={engine.id}
                className={`min-w-0 rounded-lg border p-4 text-left transition hover:border-teal-600 ${selectedEngine?.id === engine.id ? "border-teal-600 bg-teal-50/60 shadow-md" : engine.normalizedWeight === 0 ? "border-slate-200 bg-slate-50 opacity-80" : "border-slate-200 bg-white shadow-sm"}`}
                onClick={() => onSelectEngine(engine.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">{engine.category}</p>
                    <p className="mt-1 break-words text-base font-bold text-slate-950">{engine.name}</p>
                  </div>
                  <Badge className={engineStatusClassName(engine.status)}>{engine.status}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">Base</p>
                    <p className="mt-1 font-bold text-slate-950">{Number.isFinite(engine.equityValue.base) ? money(engine.equityValue.base, currency) : "Excluded"}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">Weight</p>
                    <p className="mt-1 font-bold text-slate-950">{(engine.normalizedWeight * 100).toFixed(0)}%</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">Confidence</p>
                    <p className="mt-1 font-bold text-slate-950">{engine.confidenceScore}%</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="relative h-2 rounded-full bg-slate-100">
                    {Number.isFinite(engine.equityValue.low) && Number.isFinite(engine.equityValue.high) ? (
                      <div
                        className={`absolute top-0 h-2 rounded-full bg-gradient-to-r ${engineAccentClassName(engine.status)}`}
                        style={{
                          left: `${rangeMarkerPosition(engine.equityValue.low, cockpit.low, cockpit.high)}%`,
                          width: `${Math.max(2, rangeMarkerPosition(engine.equityValue.high, cockpit.low, cockpit.high) - rangeMarkerPosition(engine.equityValue.low, cockpit.low, cockpit.high))}%`,
                        }}
                      />
                    ) : null}
                    {Number.isFinite(engine.equityValue.base) ? (
                      <span className="absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded-full bg-slate-950" style={{ left: `${rangeMarkerPosition(engine.equityValue.base, cockpit.low, cockpit.high)}%` }} />
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[0.68rem] font-semibold text-slate-500">
                    <span>{money(cockpit.low, currency)}</span>
                    <span>{money(cockpit.high, currency)}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">
                  {engine.diagnostics[0]?.message ?? `${engine.inputSources.length + engine.calculationSources.length} source item(s) supporting this engine.`}
                </p>
                {engine.id === "comparableCompanies" ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <p className="font-bold text-slate-950">{engine.details.peerCount ?? 0}</p>
                      <p className="mt-1 text-slate-500">peers</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <p className="font-bold text-slate-950">{engine.details.sampledFinancialCount ?? 0}</p>
                      <p className="mt-1 text-slate-500">sampled</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <p className="font-bold text-slate-950">{engine.details.peerQualityScore ?? 0}%</p>
                      <p className="mt-1 text-slate-500">quality</p>
                    </div>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-300 bg-white xl:sticky xl:top-4 xl:self-start">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-50 text-teal-800"><Activity size={17} /></span>
                <CardTitle>Source drawer</CardTitle>
              </div>
              <CardDescription>{selectedEngine ? selectedEngine.name : "Select an engine to inspect sources."}</CardDescription>
            </div>
            {selectedEngine ? <button className="rounded-md border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 hover:border-teal-600 hover:text-teal-800" onClick={onCloseSourceDrawer}>Close</button> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedEngine ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">Status</p>
                  <p className="mt-1 font-bold text-slate-950">{selectedEngine.status}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">Confidence</p>
                  <p className="mt-1 font-bold text-slate-950">{selectedEngine.confidenceScore}%</p>
                </div>
              </div>
              {selectedEngine.diagnostics.length ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Method diagnostics</p>
                  <div className="mt-2 space-y-2">
                    {selectedEngine.diagnostics.map((diagnostic, index) => (
                      <div key={`${diagnostic.message}-${index}`} className={`flex gap-2 rounded-md border p-3 text-xs leading-5 ${diagnosticToneClassName(diagnostic.severity)}`}>
                        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                        <span>{diagnostic.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 rounded-md border border-emerald-100 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  <span>No method-level diagnostics are currently triggered.</span>
                </div>
              )}
              {selectedEngine.id === "comparableCompanies" ? (
                <div className="rounded-md border border-teal-100 bg-teal-50 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-950">BizRaport peer screen</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">Fetch a lean Polish SME peer set from PKD, revenue and EBITDA filters. Multiples remain manual/public-market sourced.</p>
                    </div>
                    <button className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-800" onClick={onFetchComparablePeers}>Fetch peers</button>
                  </div>
                  {peerBenchmarkStatus ? <p className="mt-2 text-xs leading-5 text-slate-600">{peerBenchmarkStatus}</p> : null}
                </div>
              ) : null}
              {Object.keys(selectedEngine.details).length ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Engine details</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(selectedEngine.details).map(([key, value]) => (
                      <div key={key} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                        <p className="font-semibold text-slate-500">{key}</p>
                        <p className="mt-1 break-words font-bold text-slate-950">{engineDetailValue(value, currency)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {[
                ["Input sources", selectedEngine.inputSources],
                ["Calculation sources", selectedEngine.calculationSources],
                ["Manual overrides", selectedEngine.manualOverrides],
              ].map(([title, sources]) => (
                <div key={title as string}>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{title as string}</p>
                  <div className="mt-2 space-y-2 border-l border-slate-200 pl-3">
                    {(sources as ValuationEngineResult["inputSources"]).length ? (sources as ValuationEngineResult["inputSources"]).map((source, index) => (
                      <div key={`${source.label}-${index}`} className="relative rounded-md border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-sm">
                        <span className="absolute -left-[19px] top-4 h-2.5 w-2.5 rounded-full border border-white bg-teal-700" />
                        <p className="font-bold text-slate-950">{source.label}</p>
                        <p>Source: {source.source}</p>
                        <p>Date: {source.sourceDate}</p>
                        <p>Confidence: {source.confidence}</p>
                        {source.note ? <p>Note: {source.note}</p> : null}
                      </div>
                    )) : <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">None captured yet.</p>}
                  </div>
                </div>
              ))}
              {selectedEngine.missingSources.length ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Missing sources</p>
                  <ul className="mt-2 space-y-2 text-xs text-slate-600">
                    {selectedEngine.missingSources.map((source) => <li key={source} className="rounded-md border border-red-100 bg-red-50 p-2">{source}</li>)}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">Click any engine card to see its imported values, manual inputs, calculation sources and missing evidence.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function OutputRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 border-b border-slate-100 py-2.5 text-sm ${emphasis ? "font-bold text-slate-950" : "text-slate-700"}`}>
      <span className="min-w-0">{label}</span>
      <span className="break-words text-right font-semibold">{value}</span>
    </div>
  );
}

function NumberField({ label, value, onChange, percent = false }: { label: string; value: number; onChange: (value: number) => void; percent?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        step={percent ? "0.1" : "1"}
        value={percent ? +(value * 100).toFixed(2) : +value.toFixed(2)}
        onChange={(event) => onChange(percent ? asNumber(event.target.value) / 100 : asNumber(event.target.value))}
      />
    </div>
  );
}

export default function Home() {
  const [workspaceStarted, setWorkspaceStarted] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardInput, setWizardInput] = useState<WizardInput>(defaultWizardInput);
  const [mode, setMode] = useState<ValuationMode>("simple");
  const [input, setInput] = useState<ValuationInput>(() => blankValuationInput);
  const [simpleInput, setSimpleInput] = useState<SimpleModeInput>(defaultSimpleModeInput);
  const [companyData, setCompanyData] = useState<CompanyFinancialData | null>(null);
  const [krsProfile, setKrsProfile] = useState<CompanyProfileData | null>(null);
  const [krsStatus, setKrsStatus] = useState("");
  const [marketData, setMarketData] = useState<MarketDataSnapshot | null>(null);
  const [bizRaportSearchResults, setBizRaportSearchResults] = useState<BizRaportSearchItem[]>([]);
  const [selectedBizRaportKrs, setSelectedBizRaportKrs] = useState("");
  const [bizRaportStatus, setBizRaportStatus] = useState("");
  const [forecastSeedNotes, setForecastSeedNotes] = useState<string[]>([]);
  const [forecastAutoSeeded, setForecastAutoSeeded] = useState(false);
  const [combinedImportPreview, setCombinedImportPreview] = useState<CombinedCompanyImportPreviewData | null>(null);
  const [combinedImportStatus, setCombinedImportStatus] = useState("");
  const [wizardImportApplied, setWizardImportApplied] = useState(false);
  const [importedDataSummary, setImportedDataSummary] = useState<ImportedDataSummary | null>(null);
  const [riskFreeRateSource, setRiskFreeRateSource] = useState<FredRiskFreeRateResult | null>(null);
  const [riskFreeRateStatus, setRiskFreeRateStatus] = useState("");
  const [riskFreeRateManuallyEdited, setRiskFreeRateManuallyEdited] = useState(false);
  const [erpSource, setErpSource] = useState<DamodaranErpSuggestion | null>(null);
  const [erpStatus, setErpStatus] = useState("");
  const [erpManuallyEdited, setErpManuallyEdited] = useState(false);
  const [betaSource, setBetaSource] = useState<DamodaranBetaSuggestion | null>(null);
  const [betaStatus, setBetaStatus] = useState("");
  const [betaManuallyEdited, setBetaManuallyEdited] = useState(false);
  const [damodaranEuropeBenchmark, setDamodaranEuropeBenchmark] = useState<DamodaranEuropeBenchmark | null>(null);
  const [damodaranEuropeStatus, setDamodaranEuropeStatus] = useState("");
  const [selectedEngineId, setSelectedEngineId] = useState<ValuationEngineId | null>(null);
  const [peerBenchmarks, setPeerBenchmarks] = useState<PeerBenchmarkResult | null>(null);
  const [peerBenchmarkStatus, setPeerBenchmarkStatus] = useState("");
  const [benchmarkAssistant, setBenchmarkAssistant] = useState<BenchmarkAssistantResult | null>(null);
  const [benchmarkAssistantStatus, setBenchmarkAssistantStatus] = useState("");
  const [activeStageId, setActiveStageId] = useState("valuation-conclusion");
  const [scrollProgress, setScrollProgress] = useState(0);

  const validation = useMemo(() => valuationInputSchema.safeParse(input), [input]);
  const model = useMemo(() => {
    const forecastYears = forecastFinancials(input.historicals, input.forecast, input.workingCapital, input.normalizationAdjustments);
    const wacc = calculateWacc({ ...input.wacc, taxRate: input.forecast.taxRate });
    const dcf = calculateDcf(forecastYears, wacc.wacc, input.terminalValue);
    const bridge = calculateEquityBridge(dcf.enterpriseValue, input.bridge);
    const discounts = calculatePrivateCompanyDiscounts(bridge.equityValue, input.discounts);
    const normalizedEbitdaForOutput = normalizeLatestEbitda(input.historicals, input.normalizationAdjustments);
    const executiveSummary = calculateExecutiveSummary(dcf, bridge, discounts, normalizedEbitdaForOutput, wacc, input.terminalValue);
    const terminalBreakdown = calculateTerminalValueBreakdown(dcf, wacc.wacc, input.terminalValue);
    const evToEquityBridge = calculateEvToEquityBridgeOutput(bridge);
    const privateCompanyAdjustmentBridge = calculatePrivateCompanyAdjustmentBridge(bridge, discounts);
    const warnings = calculateValuationWarnings(input, dcf, bridge);
    const scenarioAnalysis = calculateScenarioAnalysis(input);
    const diagnostics = calculateValuationDiagnostics(input);
    const waccCases = buildCenteredSensitivityCases(wacc.wacc, 0.01, 5);
    const growthCases = buildCenteredSensitivityCases(input.terminalValue.perpetualGrowthRate, 0.005, 5);
    const sensitivity = buildSensitivityTable(input, waccCases, growthCases);
    const valuationReport = buildValuationReport(input);
    const engineCockpit = runValuationEngines(input, peerBenchmarks);
    return { forecastYears, wacc, dcf, bridge, discounts, executiveSummary, terminalBreakdown, evToEquityBridge, privateCompanyAdjustmentBridge, warnings, scenarioAnalysis, diagnostics, waccCases, growthCases, sensitivity, valuationReport, engineCockpit };
  }, [input, peerBenchmarks]);

  function update(path: ScalarPath, value: string | number) {
    setInput((current) => ({
      ...current,
      [path[0]]: { ...current[path[0]], [path[1]]: value },
    }));
  }

  function updateMarketMultipleSource<K extends keyof MarketMultipleSource>(key: K, value: MarketMultipleSource[K]) {
    setInput((current) => ({
      ...current,
      marketMultiples: {
        ...current.marketMultiples,
        source: {
          ...current.marketMultiples.source,
          [key]: value,
          approvalStatus: key === "approvalStatus" ? value as MarketMultipleSource["approvalStatus"] : "draft",
        },
      },
    }));
  }

  function approveMarketMultiples() {
    setInput((current) => ({
      ...current,
      marketMultiples: {
        ...current.marketMultiples,
        source: {
          ...current.marketMultiples.source,
          approvalStatus: "approved",
          sourceDate: current.marketMultiples.source.sourceDate === "Current model" ? current.profile.valuationDate : current.marketMultiples.source.sourceDate,
        },
      },
    }));
  }

  function updateMarketMultipleValue(key: "evEbitdaMultiple" | "evRevenueMultiple", value: number) {
    setInput((current) => ({
      ...current,
      marketMultiples: {
        ...current.marketMultiples,
        [key]: value,
        source: {
          ...current.marketMultiples.source,
          approvalStatus: "draft",
        },
      },
    }));
  }

  function updateWizard<K extends keyof WizardInput>(key: K, value: WizardInput[K]) {
    setWizardInput((current) => ({ ...current, [key]: value }));
  }

  function updateWizardCountry(country: string) {
    setWizardInput((current) => ({
      ...current,
      country,
      currency: getDefaultCurrencyForCountry(country) ?? current.currency,
    }));
  }

  function dataPointText<T>(dataPoint: DataPoint<T | null> | undefined, fallback = "") {
    const value = dataPoint?.value;
    return value === null || value === undefined || value === "" ? fallback : String(value);
  }

  function firstAvailableText(fallback: string, ...dataPoints: Array<DataPoint<string | number | null> | undefined>) {
    for (const dataPoint of dataPoints) {
      const value = dataPoint?.value;
      if (value !== null && value !== undefined && value !== "") {
        return String(value);
      }
    }
    return fallback;
  }

  function importedYearsToHistoricals(data: CompanyFinancialData | null, baseInput: ValuationInput) {
    const importedYears = data ? importedYearsForHistoricals(data) : [];
    return baseInput.historicals.map((historical, index) => {
      const imported = importedYears[index];
      return imported ? {
        ...historical,
        year: imported.year,
        revenue: typeof imported.revenue?.value === "number" ? imported.revenue.value : historical.revenue,
        ebitda: typeof imported.ebitda?.value === "number" ? imported.ebitda.value : historical.ebitda,
        depreciation: typeof imported.depreciation?.value === "number" ? imported.depreciation.value : historical.depreciation,
        capex: typeof imported.capex?.value === "number" && imported.capex.value > 0 ? imported.capex.value : 0,
        netWorkingCapital: typeof imported.netWorkingCapital?.value === "number" ? imported.netWorkingCapital.value : historical.netWorkingCapital,
      } : historical;
    });
  }

  function buildImportedValuationInput(profile: CompanyProfileData | null, data: CompanyFinancialData | null, baseSimpleInput: SimpleModeInput = wizardInput) {
    const latestRevenue = data ? latestRevenueYear(data) : undefined;
    const latestEbitda = data ? latestEbitdaYear(data) : undefined;
    const pkdCode = firstAvailableText(baseSimpleInput.pkdCode, profile?.pkdCode, data?.pkdCode);
    const pkdSuggestion = suggestIndustryTemplateFromPkd(pkdCode);
    const nextSimpleInput: SimpleModeInput = {
      ...baseSimpleInput,
      companyName: firstAvailableText(baseSimpleInput.companyName, profile?.companyName, data?.companyName),
      registrationNumber: firstAvailableText(baseSimpleInput.registrationNumber, profile?.krs, data?.krs, data?.nip),
      nip: firstAvailableText(baseSimpleInput.nip, profile?.nip, data?.nip),
      regon: firstAvailableText(baseSimpleInput.regon, profile?.regon, data?.regon),
      pkdCode,
      legalForm: firstAvailableText(baseSimpleInput.legalForm, profile?.legalForm, data?.legalForm),
      address: firstAvailableText(baseSimpleInput.address, profile?.address),
      shareCapital: dataPointText(profile?.shareCapital, baseSimpleInput.shareCapital),
      registrationStatus: dataPointText(profile?.registrationStatus, baseSimpleInput.registrationStatus),
      website: firstAvailableText(baseSimpleInput.website, data?.website),
      industry: pkdSuggestion?.industryTemplateName ?? baseSimpleInput.industry,
      latestRevenue: typeof latestRevenue?.revenue?.value === "number" ? latestRevenue.revenue.value : baseSimpleInput.latestRevenue,
      latestEbitda: typeof latestEbitda?.ebitda?.value === "number" ? latestEbitda.ebitda.value : baseSimpleInput.latestEbitda,
      cash: typeof data?.cash?.value === "number" ? data.cash.value : baseSimpleInput.cash,
      debt: typeof data?.debt?.value === "number" ? data.debt.value : baseSimpleInput.debt,
    };

    const baseInput = buildValuationInputFromSimpleMode(nextSimpleInput);
    const importedHistoricals = importedYearsToHistoricals(data, baseInput);
    const balanceSheetImport = applyImportedBalanceSheet(data, baseInput, importedHistoricals);
    const inputWithImports: ValuationInput = {
      ...baseInput,
      profile: {
        ...baseInput.profile,
        companyName: nextSimpleInput.companyName,
        registrationNumber: nextSimpleInput.registrationNumber,
        nip: nextSimpleInput.nip,
        regon: nextSimpleInput.regon,
        pkdCode: nextSimpleInput.pkdCode,
        legalForm: nextSimpleInput.legalForm,
        address: nextSimpleInput.address,
        shareCapital: nextSimpleInput.shareCapital,
        registrationStatus: nextSimpleInput.registrationStatus,
        website: nextSimpleInput.website,
        industry: nextSimpleInput.industry,
      },
      historicals: balanceSheetImport.historicals,
      bridge: balanceSheetImport.bridge,
      workingCapital: balanceSheetImport.workingCapital,
      importMetadata: balanceSheetImport.importMetadata,
    };
    const seeded = data && data.years.length > 0 ? seedForecastFromHistoricals(inputWithImports) : { input: inputWithImports, seed: null };
    const template = pkdSuggestion ? getIndustryTemplate(pkdSuggestion.industryTemplateName) : null;
    const templateAppliedInput = template ? applyIndustryTemplate(seeded.input, template) : seeded.input;
    const finalInput = seeded.seed ? {
      ...templateAppliedInput,
      forecast: seeded.input.forecast,
      workingCapital: seeded.input.workingCapital,
      wacc: { ...templateAppliedInput.wacc, taxRate: seeded.input.wacc.taxRate },
    } : templateAppliedInput;

    return {
      input: finalInput,
      simpleInput: simpleInputFromValuationInput(finalInput),
      pkdSuggestion,
      seed: seeded.seed,
    };
  }

  function buildImportedDataSummary(profile: CompanyProfileData | null, data: CompanyFinancialData | null, suggestion: PkdIndustrySuggestion | null, forecastGenerated: boolean): ImportedDataSummary {
    const latest = data?.years[0];
    return {
      sources: [profile?.source, data?.source].filter((source): source is string => Boolean(source)),
      companyName: firstAvailableText("", profile?.companyName, data?.companyName),
      latestFinancialYear: latest?.year ?? null,
      revenue: typeof latest?.revenue?.value === "number" ? latest!.revenue.value : null,
      ebitda: typeof latest?.ebitda?.value === "number" ? latest!.ebitda.value : null,
      industrySuggestion: suggestion?.industryTemplateName ?? "",
      forecastGenerated,
    };
  }

  async function fetchJsonOrError(url: string, fallbackMessage: string) {
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? fallbackMessage);
    }
    return payload;
  }

  async function fetchComparableCompanyPeers() {
    setPeerBenchmarkStatus("Fetching BizRaport peer screen for Comparable Companies...");
    try {
      const filters = buildBizRaportPeerFilters(input);
      const params = new URLSearchParams();
      const setParam = (key: string, value: string | number | boolean | undefined) => {
        if (value === undefined || value === null || value === "") return;
        params.set(key, typeof value === "boolean" ? value ? "tak" : "" : String(value));
      };

      setParam("pkd_sekcja", filters.pkdSekcja);
      setParam("pkd_dzial", filters.pkdDzial);
      setParam("pkd_podklasa", filters.pkdPodklasa);
      setParam("przychody_od", filters.przychodyOd);
      setParam("przychody_do", filters.przychodyDo);
      setParam("ebitda_od", filters.ebitdaOd);
      setParam("ebitda_do", filters.ebitdaDo);
      setParam("nie_wykreslona", filters.nieWykreslona);
      setParam("limit", filters.limit ?? 250);
      setParam("sample_limit", 25);

      const payload = await fetchJsonOrError(`/api/company-data/bizraport/catalog?${params.toString()}`, "BizRaport peer screen failed.");
      const benchmark = payload.data as PeerBenchmarkResult;
      setPeerBenchmarks(benchmark);
      setSelectedEngineId("comparableCompanies");
      setPeerBenchmarkStatus(`Peer screen loaded: ${benchmark.catalogCount} catalog peers, ${benchmark.sampledFinancialCount} sampled financial profiles.`);
    } catch (error) {
      setPeerBenchmarks(null);
      setSelectedEngineId("comparableCompanies");
      setPeerBenchmarkStatus(error instanceof Error ? error.message : "BizRaport peer screen failed.");
    }
  }

  async function runBenchmarkAssistant() {
    setBenchmarkAssistantStatus("Running benchmark assistant...");
    try {
      const response = await fetch("/api/ai/benchmark-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, damodaranBenchmark: damodaranEuropeBenchmark, peerBenchmarks }),
      });
      const payload = await response.json() as BenchmarkAssistantResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Benchmark assistant failed.");
      }
      setBenchmarkAssistant(payload);
      const statusLabel = payload.status === "ready" ? "ready" : payload.status === "unavailable" ? "fallback ready" : "needs review";
      setBenchmarkAssistantStatus(`Benchmark assistant ${statusLabel}: ${payload.suggestedDamodaranIndustry ?? "manual industry review needed"}.`);
    } catch (error) {
      setBenchmarkAssistant(null);
      setBenchmarkAssistantStatus(error instanceof Error ? error.message : "Benchmark assistant failed.");
    }
  }

  function useBenchmarkAssistantAsSource() {
    if (!benchmarkAssistant) {
      setBenchmarkAssistantStatus("Run the benchmark assistant before applying its source context.");
      return;
    }

    const publicCompSummary = summarizePublicComps(benchmarkAssistant.suggestedPublicComps);
    setInput((current) => ({
      ...current,
      marketMultiples: {
        ...current.marketMultiples,
        source: {
          ...current.marketMultiples.source,
          kind: "aiSuggested",
          label: `Benchmark Assistant - ${benchmarkAssistant.suggestedDamodaranIndustry ?? "manual industry review"}`,
          sourceUrl: current.marketMultiples.source.sourceUrl,
          sourceDate: benchmarkAssistant.generatedAt,
          confidence: benchmarkAssistant.damodaranConfidence,
          approvalStatus: "draft",
          rationale: benchmarkAssistant.benchmarkRationale,
          damodaranIndustry: benchmarkAssistant.suggestedDamodaranIndustry ?? current.marketMultiples.source.damodaranIndustry,
          region: current.marketMultiples.source.region ?? "Europe",
          dataset: "AI-assisted benchmark selection; numeric data must be sourced separately",
          sourceFile: current.marketMultiples.source.sourceFile,
          sourceUpdatedAt: benchmarkAssistant.generatedAt,
          publicComparableCount: publicCompSummary.totalCount,
          publicComparableIncludedCount: publicCompSummary.includedCount,
          publicComparableExcludedCount: publicCompSummary.excludedCount,
          publicComparableStaleCount: publicCompSummary.staleCount,
          publicComparableNegativeEbitdaCount: publicCompSummary.negativeEbitdaCount,
          benchmarkAssistantGeneratedAt: benchmarkAssistant.generatedAt,
          benchmarkAssistantAuditNote: benchmarkAssistant.auditNote,
        },
      },
    }));
    setBenchmarkAssistantStatus("Benchmark assistant rationale attached. Multiples remain draft until source data is approved.");
  }

  function reviewSuggestedPublicComps() {
    if (!benchmarkAssistant) {
      setBenchmarkAssistantStatus("Run the benchmark assistant before reviewing public comps.");
      return;
    }

    const publicCompSummary = summarizePublicComps(benchmarkAssistant.suggestedPublicComps);
    setInput((current) => ({
      ...current,
      marketMultiples: {
        ...current.marketMultiples,
        source: {
          ...current.marketMultiples.source,
          kind: "publicComparable",
          label: `GPW/NewConnect watchlist - ${benchmarkAssistant.suggestedDamodaranIndustry ?? current.profile.industry}`,
          sourceDate: benchmarkAssistant.generatedAt,
          confidence: "low",
          approvalStatus: "draft",
          rationale: "Public comparable watchlist was generated by the benchmark assistant. Attach source-traced public-market financial data before using GPW/NewConnect multiples as valuation evidence.",
          damodaranIndustry: benchmarkAssistant.suggestedDamodaranIndustry ?? current.marketMultiples.source.damodaranIndustry,
          region: "Poland / Europe",
          dataset: "GPW/NewConnect public comps placeholder",
          sourceUpdatedAt: benchmarkAssistant.generatedAt,
          publicComparableCount: publicCompSummary.totalCount,
          publicComparableIncludedCount: publicCompSummary.includedCount,
          publicComparableExcludedCount: publicCompSummary.excludedCount,
          publicComparableStaleCount: publicCompSummary.staleCount,
          publicComparableNegativeEbitdaCount: publicCompSummary.negativeEbitdaCount,
          benchmarkAssistantGeneratedAt: benchmarkAssistant.generatedAt,
          benchmarkAssistantAuditNote: benchmarkAssistant.auditNote,
        },
      },
    }));
    setBenchmarkAssistantStatus("Public comps watchlist attached as draft. Add source-traced market data before approval.");
  }

  function applyRiskFreeRateResult(result: FredRiskFreeRateResult, force = false) {
    setRiskFreeRateSource(result);
    setRiskFreeRateStatus(result.message);
    if (result.value !== null && (force || !riskFreeRateManuallyEdited)) {
      setInput((current) => ({
        ...current,
        wacc: {
          ...current.wacc,
          riskFreeRate: result.value ?? current.wacc.riskFreeRate,
        },
      }));
    }
  }

  async function fetchRiskFreeRateFromFred(country = input.profile.country, forceApply = false) {
    setRiskFreeRateStatus("Refreshing risk-free rate from FRED...");
    try {
      const response = await fetch(`/api/market-data/risk-free-rate?country=${encodeURIComponent(country)}`);
      const payload = await response.json() as FredRiskFreeRateResult;
      if (!response.ok) {
        throw new Error(payload.message ?? "FRED risk-free rate fetch failed.");
      }
      applyRiskFreeRateResult(payload, forceApply);
      return payload;
    } catch (error) {
      const fallback: FredRiskFreeRateResult = {
        status: "error",
        message: error instanceof Error ? error.message : "FRED risk-free rate fetch failed.",
        country,
        value: null,
        source: "FRED",
        sourceUrl: "https://api.stlouisfed.org/fred/series/observations",
        seriesId: null,
        observationDate: null,
        fetchedAt: new Date().toISOString(),
        confidence: "low",
        isUserOverridden: false,
      };
      setRiskFreeRateSource(fallback);
      setRiskFreeRateStatus(fallback.message);
      return fallback;
    }
  }

  function applyErpSuggestion(suggestion: DamodaranErpSuggestion, force = false) {
    setErpSource(suggestion);
    setErpStatus(suggestion.warning ? `${suggestion.message} ${suggestion.warning}` : suggestion.message);
    if (suggestion.value !== null && (force || !erpManuallyEdited)) {
      setInput((current) => ({
        ...current,
        wacc: {
          ...current.wacc,
          equityRiskPremium: suggestion.value ?? current.wacc.equityRiskPremium,
        },
      }));
    }
  }

  async function fetchErpFromDamodaranSeed(country = input.profile.country, forceApply = false) {
    setErpStatus("Refreshing ERP from Damodaran manual seed...");
    try {
      const response = await fetch(`/api/market-data/equity-risk-premium?country=${encodeURIComponent(country)}&valuationDate=${encodeURIComponent(input.profile.valuationDate)}`);
      const payload = await response.json() as DamodaranErpSuggestion;
      if (!response.ok) {
        throw new Error(payload.message ?? "Damodaran ERP seed fetch failed.");
      }
      applyErpSuggestion(payload, forceApply);
      return payload;
    } catch (error) {
      const fallback: DamodaranErpSuggestion = {
        status: "fallback",
        message: error instanceof Error ? error.message : "Damodaran ERP seed fetch failed.",
        value: null,
        matureMarketErp: null,
        countryRiskPremium: null,
        totalErp: null,
        country,
        source: "Damodaran Country Risk Premiums",
        sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
        dataCurrentUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html",
        sourceDate: "2026-01-05",
        fetchedAt: new Date().toISOString(),
        datasetAgeDays: 0,
        refreshStatus: "manual_seed",
        confidence: "medium",
        isLiveData: false,
        isUserOverridden: false,
      };
      setErpSource(fallback);
      setErpStatus(fallback.message);
      return fallback;
    }
  }

  function applyBetaSuggestion(suggestion: DamodaranBetaSuggestion) {
    setBetaSource(suggestion);
    setBetaStatus(suggestion.warning ? `${suggestion.message} ${suggestion.warning}` : suggestion.message);
    if (suggestion.value !== null && !betaManuallyEdited) {
      setInput((current) => ({
        ...current,
        wacc: {
          ...current.wacc,
          beta: suggestion.value ?? current.wacc.beta,
        },
      }));
    }
  }

  async function fetchBetaFromDamodaranSeed(industry = input.profile.industry) {
    setBetaStatus("Refreshing beta from Damodaran Europe snapshot...");
    try {
      const response = await fetch(`/api/market-data/beta?industry=${encodeURIComponent(industry)}&valuationDate=${encodeURIComponent(input.profile.valuationDate)}`);
      const payload = await response.json() as DamodaranBetaSuggestion;
      if (!response.ok) {
        throw new Error(payload.message ?? "Damodaran beta seed fetch failed.");
      }
      applyBetaSuggestion(payload);
      return payload;
    } catch (error) {
      const fallback: DamodaranBetaSuggestion = {
        status: "fallback",
        message: error instanceof Error ? error.message : "Damodaran beta seed fetch failed.",
        value: null,
        unleveredBeta: null,
        cashAdjustedBeta: null,
        totalUnleveredBeta: null,
        costOfCapitalLocal: null,
        appIndustry: industry,
        damodaranIndustry: null,
        source: "Damodaran Europe Dataset",
        sourceUrl: "https://pages.stern.nyu.edu/~adamodar/pc/datasets/betaEurope.xls",
        dataCurrentUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html",
        sourceDate: "2026-01-05",
        fetchedAt: new Date().toISOString(),
        datasetAgeDays: 0,
        refreshStatus: "manual_seed",
        confidence: "medium",
        isLiveData: false,
        isUserOverridden: false,
      };
      setBetaSource(fallback);
      setBetaStatus(fallback.message);
      return fallback;
    }
  }

  async function fetchDamodaranEuropeBenchmark() {
    setDamodaranEuropeStatus("Loading Damodaran Europe benchmark...");
    try {
      const response = await fetch(`/api/market-data/damodaran/europe?pkdCode=${encodeURIComponent(input.profile.pkdCode)}&industry=${encodeURIComponent(input.profile.industry)}&description=${encodeURIComponent(input.profile.companyName)}`);
      const payload = await response.json() as DamodaranEuropeBenchmark;
      if (!response.ok || payload.status !== "ready" || !payload.industry) {
        throw new Error(payload.rationale || "Damodaran Europe benchmark is unavailable for this industry.");
      }

      setDamodaranEuropeBenchmark(payload);
      setDamodaranEuropeStatus(`${payload.damodaranIndustry} loaded from Damodaran Europe ${payload.sourceDate}.`);
      setInput((current) => ({
        ...current,
        wacc: betaManuallyEdited || payload.industry?.cashAdjustedUnleveredBeta === null || payload.industry?.cashAdjustedUnleveredBeta === undefined
          ? current.wacc
          : {
              ...current.wacc,
              beta: payload.industry.cashAdjustedUnleveredBeta,
            },
        marketMultiples: {
          ...current.marketMultiples,
          evEbitdaMultiple: payload.industry?.positiveEbitdaEvEbitda ?? current.marketMultiples.evEbitdaMultiple,
          evRevenueMultiple: payload.industry?.evSales ?? current.marketMultiples.evRevenueMultiple,
          source: {
            ...current.marketMultiples.source,
            kind: "damodaranSector",
            label: `Damodaran Europe - ${payload.damodaranIndustry}`,
            sourceUrl: payload.sourceUrl,
            sourceDate: payload.sourceDate,
            confidence: payload.confidence,
            approvalStatus: "draft",
            rationale: `${payload.rationale} Public-market Europe sector benchmark; review SME size, liquidity, control, and company-specific adjustments before approval.`,
            damodaranIndustry: payload.damodaranIndustry ?? undefined,
            region: payload.region,
            dataset: payload.source,
            sourceFile: payload.sourceUrl,
            sourceUpdatedAt: payload.sourceDate,
          },
        },
      }));

      if (!betaManuallyEdited && payload.industry.cashAdjustedUnleveredBeta !== null && payload.industry.cashAdjustedUnleveredBeta !== undefined) {
        applyBetaSuggestion({
          status: "ready",
          message: "Damodaran Europe beta benchmark loaded from local 2026 snapshot.",
          value: payload.industry.cashAdjustedUnleveredBeta,
          unleveredBeta: payload.industry.unleveredBeta ?? null,
          cashAdjustedBeta: payload.industry.cashAdjustedUnleveredBeta,
          totalUnleveredBeta: payload.industry.totalUnleveredBeta ?? null,
          costOfCapitalLocal: payload.industry.costOfCapitalLocal ?? null,
          appIndustry: input.profile.industry,
          damodaranIndustry: payload.damodaranIndustry,
          source: payload.source,
          sourceUrl: payload.sourceUrl,
          dataCurrentUrl: payload.dataCurrentUrl,
          sourceDate: payload.sourceDate,
          fetchedAt: payload.fetchedAt,
          datasetAgeDays: 0,
          refreshStatus: payload.refreshStatus as DamodaranBetaSuggestion["refreshStatus"],
          confidence: payload.confidence,
          isLiveData: false,
          isUserOverridden: false,
        });
      }

      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Damodaran Europe benchmark fetch failed.";
      setDamodaranEuropeBenchmark(null);
      setDamodaranEuropeStatus(message);
      return null;
    }
  }

  function refreshCoreMarketInputs(country = input.profile.country, industry = input.profile.industry) {
    void fetchRiskFreeRateFromFred(country);
    void fetchErpFromDamodaranSeed(country);
    void fetchBetaFromDamodaranSeed(industry);
  }

  async function fetchCombinedCompanyData() {
    const selectedKrs = cleanBizRaportKrs(wizardInput.registrationNumber);
    if (!isKrs(selectedKrs)) {
      setCombinedImportStatus("Enter a valid 10-digit KRS before fetching company data.");
      return;
    }

    setCombinedImportStatus("Fetching Public KRS profile and BizRaport financial data...");
    setCombinedImportPreview(null);
    setWizardImportApplied(false);
    const [krsResult, bizRaportResult] = await Promise.allSettled([
      fetchJsonOrError(`/api/company-data/krs/fetch?krs=${encodeURIComponent(selectedKrs)}&rejestr=P`, "Public KRS profile fetch failed."),
      fetchJsonOrError(`/api/company-data/bizraport/fetch?krs=${encodeURIComponent(selectedKrs)}`, "BizRaport fetch failed."),
    ]);

    const fetchedKrsProfile = krsResult.status === "fulfilled" ? krsResult.value.data as CompanyProfileData : null;
    const fetchedCompanyData = bizRaportResult.status === "fulfilled" ? bizRaportResult.value.data as CompanyFinancialData : null;
    const warnings = [
      ...(krsResult.status === "rejected" ? [`Public KRS: ${krsResult.reason instanceof Error ? krsResult.reason.message : "fetch failed"}`] : []),
      ...(bizRaportResult.status === "rejected" ? [`BizRaport: ${bizRaportResult.reason instanceof Error ? bizRaportResult.reason.message : "fetch failed"}`] : []),
      ...(fetchedKrsProfile?.warnings ?? []),
      ...(fetchedCompanyData?.warnings ?? []),
    ];

    if (!fetchedKrsProfile && !fetchedCompanyData) {
      setCombinedImportPreview({ krsProfile: null, companyData: null, pkdSuggestion: null, seed: null, notes: [], warnings });
      setCombinedImportStatus("No company data could be fetched. Use manual inputs or try another KRS.");
      return;
    }

    const imported = buildImportedValuationInput(fetchedKrsProfile, fetchedCompanyData);
    const notes = [
      ...(fetchedKrsProfile ? ["Public KRS profile data fetched."] : []),
      ...(fetchedCompanyData ? ["BizRaport financial data fetched."] : []),
      ...(imported.seed?.notes ?? []),
      ...(imported.input.importMetadata?.bridge?.warnings ?? []),
      ...(imported.input.importMetadata?.workingCapital?.warnings ?? []),
    ];
    const preview = { krsProfile: fetchedKrsProfile, companyData: fetchedCompanyData, pkdSuggestion: imported.pkdSuggestion, seed: imported.seed, notes, warnings };
    setKrsProfile(fetchedKrsProfile);
    setCompanyData(fetchedCompanyData);
    setCombinedImportPreview(preview);
    setCombinedImportStatus("Review the fetched company data, then confirm it before building the valuation model.");
  }

  function importCombinedCompanyData(preview: CombinedCompanyImportPreviewData | null = combinedImportPreview) {
    if (!preview || (!preview.krsProfile && !preview.companyData)) {
      setCombinedImportStatus("Fetch company data before importing.");
      return;
    }

    const imported = buildImportedValuationInput(preview.krsProfile, preview.companyData);
    setPeerBenchmarks(null);
    setPeerBenchmarkStatus("Comparable Companies peer screen needs to be refreshed for this company.");
    setBenchmarkAssistant(null);
    setBenchmarkAssistantStatus("Benchmark Assistant needs to be rerun for this company.");
    setInput(imported.input);
    setSimpleInput(imported.simpleInput);
    setWizardInput((current) => ({
      ...current,
      ...imported.simpleInput,
      industryTemplateName: imported.pkdSuggestion?.industryTemplateName ?? current.industryTemplateName,
      applyIndustryTemplate: Boolean(imported.pkdSuggestion),
    }));
    setForecastSeedNotes(imported.seed?.notes ?? []);
    setForecastAutoSeeded(Boolean(imported.seed));
    setImportedDataSummary(buildImportedDataSummary(preview.krsProfile, preview.companyData, imported.pkdSuggestion, Boolean(imported.seed)));
    refreshCoreMarketInputs(imported.input.profile.country, imported.input.profile.industry);
    setWizardImportApplied(true);
    setCombinedImportStatus("Company data confirmed and applied. Choose a valuation type to continue.");
    setWizardStep(2);
  }

  async function fetchKrsProfile(krsValue = input.profile.registrationNumber || wizardInput.registrationNumber) {
    const selectedKrs = cleanBizRaportKrs(krsValue);
    if (!isKrs(selectedKrs)) {
      setKrsStatus("Enter a valid 10-digit KRS before fetching the public profile.");
      return;
    }

    setKrsStatus("Fetching public KRS profile...");
    try {
      const response = await fetch(`/api/company-data/krs/fetch?krs=${encodeURIComponent(selectedKrs)}&rejestr=P`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Public KRS profile fetch failed.");
      }
      setKrsProfile(payload.data as CompanyProfileData);
      setKrsStatus("Public KRS profile fetched. Review preview before applying.");
    } catch (error) {
      setKrsProfile(null);
      setKrsStatus(error instanceof Error ? error.message : "Public KRS profile fetch failed.");
    }
  }

  function applyKrsProfile() {
    if (!krsProfile) {
      setKrsStatus("Fetch a public KRS profile before applying.");
      return;
    }

    const companyName = krsProfile.companyName?.value;
    const krs = krsProfile.krs?.value;
    const nip = krsProfile.nip?.value;
    const regon = krsProfile.regon?.value;
    const pkdCode = krsProfile.pkdCode?.value;
    const legalForm = krsProfile.legalForm?.value;
    const address = krsProfile.address?.value;
    const shareCapital = krsProfile.shareCapital?.value;
    const registrationStatus = krsProfile.registrationStatus?.value;

    setWizardInput((current) => ({
      ...current,
      companyName: companyName ? String(companyName) : current.companyName,
      registrationNumber: krs ? String(krs) : current.registrationNumber,
      nip: nip ? String(nip) : current.nip,
      regon: regon ? String(regon) : current.regon,
      pkdCode: pkdCode ? String(pkdCode) : current.pkdCode,
      legalForm: legalForm ? String(legalForm) : current.legalForm,
      address: address ? String(address) : current.address,
      shareCapital: shareCapital ? String(shareCapital) : current.shareCapital,
      registrationStatus: registrationStatus ? String(registrationStatus) : current.registrationStatus,
    }));
    setSimpleInput((current) => ({
      ...current,
      companyName: companyName ? String(companyName) : current.companyName,
      registrationNumber: krs ? String(krs) : current.registrationNumber,
      nip: nip ? String(nip) : current.nip,
      regon: regon ? String(regon) : current.regon,
      pkdCode: pkdCode ? String(pkdCode) : current.pkdCode,
      legalForm: legalForm ? String(legalForm) : current.legalForm,
      address: address ? String(address) : current.address,
      shareCapital: shareCapital ? String(shareCapital) : current.shareCapital,
      registrationStatus: registrationStatus ? String(registrationStatus) : current.registrationStatus,
    }));
    setInput((current) => ({
      ...current,
      profile: {
        ...current.profile,
        companyName: companyName ? String(companyName) : current.profile.companyName,
        registrationNumber: krs ? String(krs) : current.profile.registrationNumber,
        nip: nip ? String(nip) : current.profile.nip,
        regon: regon ? String(regon) : current.profile.regon,
        pkdCode: pkdCode ? String(pkdCode) : current.profile.pkdCode,
        legalForm: legalForm ? String(legalForm) : current.profile.legalForm,
        address: address ? String(address) : current.profile.address,
        shareCapital: shareCapital ? String(shareCapital) : current.profile.shareCapital,
        registrationStatus: registrationStatus ? String(registrationStatus) : current.profile.registrationStatus,
      },
    }));
    setKrsStatus("Public KRS profile applied after user confirmation.");
  }

  async function searchBizRaportFromWizard() {
    const query = wizardInput.registrationNumber || wizardInput.companyName;
    if (!query.trim()) {
      setBizRaportStatus("Enter a company name, KRS, NIP, or REGON before searching.");
      return;
    }
    setBizRaportStatus("Searching BizRaport...");
    try {
      const response = await fetch(`/api/company-data/bizraport/search?query=${encodeURIComponent(query)}&limit=10`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "BizRaport search failed.");
      }
      const results = ((payload.data ?? []) as BizRaportSearchItem[]).map((result) => ({ ...result, krs: cleanBizRaportKrs(result.krs) }));
      setBizRaportSearchResults(results);
      setBizRaportStatus(results.length > 0 ? "Select a KRS result to continue." : "No BizRaport results found.");
    } catch (error) {
      setBizRaportSearchResults([]);
      setBizRaportStatus(error instanceof Error ? error.message : "BizRaport search failed.");
    }
  }

  async function fetchBizRaportData(krsOrNip = selectedBizRaportKrs || input.profile.registrationNumber || wizardInput.registrationNumber) {
    if (!krsOrNip.trim()) {
      setBizRaportStatus("Enter or select a KRS/NIP before fetching data.");
      return;
    }
    setBizRaportStatus("Fetching BizRaport company data...");
    try {
      const selectedIdentifier = cleanBizRaportKrs(krsOrNip);
      const selectedFromBizRaportSearch = selectedBizRaportKrs === selectedIdentifier;
      const query = isKrs(selectedIdentifier) || selectedFromBizRaportSearch
        ? `krs=${encodeURIComponent(selectedIdentifier)}`
        : isNip(selectedIdentifier)
          ? `nip=${encodeURIComponent(selectedIdentifier)}`
          : `krs=${encodeURIComponent(selectedIdentifier)}`;
      const response = await fetch(`/api/company-data/bizraport/fetch?${query}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "BizRaport fetch failed.");
      }
      setCompanyData(payload.data as CompanyFinancialData);
      setBizRaportStatus("BizRaport data fetched. Review preview before applying.");
    } catch (error) {
      setCompanyData(null);
      setBizRaportStatus(error instanceof Error ? error.message : "BizRaport fetch failed.");
    }
  }

  function selectBizRaportKrs(krs: string) {
    const selectedKrs = cleanBizRaportKrs(krs);
    setSelectedBizRaportKrs(selectedKrs);
    setWizardInput((current) => ({ ...current, registrationNumber: selectedKrs }));
    setBizRaportStatus(`Selected KRS ${selectedKrs}.`);
  }

  function latestImportedYear(data: CompanyFinancialData) {
    return data.years[0];
  }

  function latestRevenueYear(data: CompanyFinancialData) {
    return data.years.find((year) => typeof year.revenue?.value === "number" && year.revenue.value > 0);
  }

  function latestEbitdaYear(data: CompanyFinancialData) {
    return data.years.find((year) => typeof year.ebitda?.value === "number");
  }

  function importedYearsForHistoricals(data: CompanyFinancialData) {
    return data.years.slice(0, 3).sort((a, b) => a.year - b.year);
  }

  function generateForecastFromHistoricalInputs() {
    setInput((current) => {
      const seeded = seedForecastFromHistoricals(current);
      setForecastSeedNotes(seeded.seed.notes);
      setForecastAutoSeeded(true);
      return seeded.input;
    });
  }

  function applyImportedCompanyData() {
    if (!companyData) {
      setBizRaportStatus("Fetch BizRaport data before applying.");
      return;
    }
    setPeerBenchmarks(null);
    setPeerBenchmarkStatus("Comparable Companies peer screen needs to be refreshed after importing company data.");
    setBenchmarkAssistant(null);
    setBenchmarkAssistantStatus("Benchmark Assistant needs to be rerun after importing company data.");
    const latestRevenue = latestRevenueYear(companyData);
    const latestEbitda = latestEbitdaYear(companyData);
    const companyName = companyData.companyName?.value || input.profile.companyName;
    const registrationNumber = companyData.krs?.value || companyData.nip?.value || input.profile.registrationNumber;
    const pkdCode = companyData.pkdCode?.value || input.profile.pkdCode;
    const website = companyData.website?.value || input.profile.website;
    const legalForm = companyData.legalForm?.value || input.profile.legalForm;

    if (mode === "simple") {
      const nextSimpleInput: SimpleModeInput = {
        ...simpleInput,
        companyName: String(companyName),
        registrationNumber: String(registrationNumber),
        website: website ? String(website) : simpleInput.website,
        pkdCode: pkdCode ? String(pkdCode) : "",
        legalForm: legalForm ? String(legalForm) : simpleInput.legalForm,
        latestRevenue: typeof latestRevenue?.revenue?.value === "number" ? latestRevenue.revenue.value : simpleInput.latestRevenue,
        latestEbitda: typeof latestEbitda?.ebitda?.value === "number" ? latestEbitda.ebitda.value : simpleInput.latestEbitda,
      };
      const baseInput = buildValuationInputFromSimpleMode(nextSimpleInput);
      const inputWithImportedHistoricals = {
        ...baseInput,
        historicals: importedYearsToHistoricals(companyData, baseInput),
        profile: { ...baseInput.profile, website: website ? String(website) : baseInput.profile.website, pkdCode: pkdCode ? String(pkdCode) : "", legalForm: legalForm ? String(legalForm) : baseInput.profile.legalForm },
      };
      const balanceSheetImport = applyImportedBalanceSheet(companyData, inputWithImportedHistoricals, inputWithImportedHistoricals.historicals);
      const seeded = seedForecastFromHistoricals({
        ...inputWithImportedHistoricals,
        historicals: balanceSheetImport.historicals,
        bridge: balanceSheetImport.bridge,
        workingCapital: balanceSheetImport.workingCapital,
        importMetadata: balanceSheetImport.importMetadata,
      });
      setSimpleInput({ ...nextSimpleInput, expectedAnnualRevenueGrowth: seeded.input.forecast.revenueGrowth[0], expectedEbitdaMargin: seeded.input.forecast.ebitdaMargin[0] });
      setForecastSeedNotes([...seeded.seed.notes, ...balanceSheetImport.warnings]);
      setForecastAutoSeeded(true);
      setInput({
        ...seeded.input,
        historicals: balanceSheetImport.historicals,
        bridge: balanceSheetImport.bridge,
        workingCapital: balanceSheetImport.workingCapital,
        importMetadata: balanceSheetImport.importMetadata,
      });
    } else {
      const importedYears = importedYearsForHistoricals(companyData);
      setInput((current) => {
        const importedHistoricals = current.historicals.map((historical, index) => {
          const imported = importedYears[index];
          return imported ? {
            ...historical,
            year: imported.year,
            revenue: typeof imported.revenue?.value === "number" ? imported.revenue.value : historical.revenue,
            ebitda: typeof imported.ebitda?.value === "number" ? imported.ebitda.value : historical.ebitda,
            depreciation: typeof imported.depreciation?.value === "number" ? imported.depreciation.value : historical.depreciation,
            capex: 0,
          } : historical;
        });
        const balanceSheetImport = applyImportedBalanceSheet(companyData, current, importedHistoricals);
        return {
          ...current,
          profile: {
            ...current.profile,
            companyName: String(companyName),
            registrationNumber: String(registrationNumber),
            website: website ? String(website) : current.profile.website,
            pkdCode: pkdCode ? String(pkdCode) : "",
            legalForm: legalForm ? String(legalForm) : current.profile.legalForm,
          },
          historicals: balanceSheetImport.historicals,
          bridge: balanceSheetImport.bridge,
          workingCapital: balanceSheetImport.workingCapital,
          importMetadata: balanceSheetImport.importMetadata,
        };
      });
    }
    setBizRaportStatus("Imported data applied after user confirmation.");
  }

  function refreshMarketDataPlaceholder() {
    const fetchedAt = new Date().toISOString();
    const damodaran = createDamodaranManualSeedSnapshot(fetchedAt);
    const fred = createFredManualSeedSnapshot(fetchedAt);
    const liveRiskFreeRate: DataPoint<number> | undefined = riskFreeRateSource?.value !== null && riskFreeRateSource?.value !== undefined ? {
      value: riskFreeRateSource.value,
      source: riskFreeRateSource.source,
      sourceUrl: riskFreeRateSource.sourceUrl,
      sourceDate: riskFreeRateSource.observationDate ?? riskFreeRateSource.fetchedAt,
      fetchedAt: riskFreeRateSource.fetchedAt,
      confidence: riskFreeRateSource.confidence,
      isUserOverridden: false,
    } : undefined;
    const seedEquityRiskPremium: DataPoint<number> | undefined = erpSource?.value !== null && erpSource?.value !== undefined ? {
      value: erpSource.value,
      source: `${erpSource.source} manual seed`,
      sourceUrl: erpSource.sourceUrl,
      sourceDate: erpSource.sourceDate,
      fetchedAt: erpSource.fetchedAt,
      confidence: erpSource.confidence,
      isUserOverridden: false,
    } : undefined;
    const seedBeta: DataPoint<number> | undefined = betaSource?.value !== null && betaSource?.value !== undefined ? {
      value: betaSource.value,
      source: `${betaSource.source} manual seed`,
      sourceUrl: betaSource.sourceUrl,
      sourceDate: betaSource.sourceDate,
      fetchedAt: betaSource.fetchedAt,
      confidence: betaSource.confidence,
      isUserOverridden: false,
    } : undefined;
    setMarketData({
      ...damodaran,
      riskFreeRate: liveRiskFreeRate ?? fred.riskFreeRate,
      equityRiskPremium: seedEquityRiskPremium ?? damodaran.equityRiskPremium,
      beta: seedBeta ?? damodaran.beta,
      notes: [
        ...(liveRiskFreeRate ? ["Risk-free rate shown from FRED live import."] : fred.notes),
        ...(seedEquityRiskPremium ? ["Equity risk premium shown from Damodaran 2026 manual seed dataset; this is not live data."] : damodaran.notes),
        ...(seedBeta ? ["Beta shown from Damodaran 2026 industry beta manual seed dataset; this is not live data."] : []),
      ],
    });
  }

  function startValuation() {
    if (wizardImportApplied && companyData?.years.length) {
      setMode(wizardInput.valuationType);
      setWorkspaceStarted(true);
      return;
    }

    if (wizardInput.valuationType === "simple") {
      const nextSimpleInput: SimpleModeInput = {
        companyName: wizardInput.companyName,
        country: wizardInput.country,
        currency: wizardInput.currency,
        registrationNumber: wizardInput.registrationNumber,
        nip: wizardInput.nip,
        regon: wizardInput.regon,
        pkdCode: wizardInput.pkdCode,
        legalForm: wizardInput.legalForm,
        address: wizardInput.address,
        shareCapital: wizardInput.shareCapital,
        registrationStatus: wizardInput.registrationStatus,
        website: wizardInput.website,
        industry: wizardInput.industry,
        latestRevenue: wizardInput.latestRevenue,
        latestEbitda: wizardInput.latestEbitda,
        cash: wizardInput.cash,
        debt: wizardInput.debt,
        expectedAnnualRevenueGrowth: wizardInput.expectedAnnualRevenueGrowth,
        expectedEbitdaMargin: wizardInput.expectedEbitdaMargin,
        valuationDate: wizardInput.valuationDate,
      };
      const baseInput = buildValuationInputFromSimpleMode(nextSimpleInput);
      const template = getIndustryTemplate(wizardInput.industryTemplateName);
      const nextInput = wizardInput.applyIndustryTemplate && template ? applyIndustryTemplate(baseInput, template) : baseInput;
      setSimpleInput(simpleInputFromValuationInput(nextInput));
      setInput(nextInput);
      setMode("simple");
      refreshCoreMarketInputs(nextInput.profile.country, nextInput.profile.industry);
    } else {
      const manualSimpleInput: SimpleModeInput = {
        companyName: wizardInput.companyName,
        country: wizardInput.country,
        currency: wizardInput.currency,
        registrationNumber: wizardInput.registrationNumber,
        nip: wizardInput.nip,
        regon: wizardInput.regon,
        pkdCode: wizardInput.pkdCode,
        legalForm: wizardInput.legalForm,
        address: wizardInput.address,
        shareCapital: wizardInput.shareCapital,
        registrationStatus: wizardInput.registrationStatus,
        website: wizardInput.website,
        industry: wizardInput.industry,
        latestRevenue: wizardInput.latestRevenue,
        latestEbitda: wizardInput.latestEbitda,
        cash: wizardInput.cash,
        debt: wizardInput.debt,
        expectedAnnualRevenueGrowth: wizardInput.expectedAnnualRevenueGrowth,
        expectedEbitdaMargin: wizardInput.expectedEbitdaMargin,
        valuationDate: wizardInput.valuationDate,
      };
      const baseInput = buildValuationInputFromSimpleMode(manualSimpleInput);
      const template = getIndustryTemplate(wizardInput.industryTemplateName);
      const nextInput = wizardInput.applyIndustryTemplate && template ? applyIndustryTemplate(baseInput, template) : baseInput;
      setInput(nextInput);
      setSimpleInput(simpleInputFromValuationInput(nextInput));
      setMode("professional");
      refreshCoreMarketInputs(nextInput.profile.country, nextInput.profile.industry);
    }
    setWorkspaceStarted(true);
  }

  function startNewValuation() {
    const nextBlankInput = createBlankValuationInput();
    const nextSimpleInput = simpleInputFromValuationInput(nextBlankInput);
    setWizardInput({ ...nextSimpleInput, valuationType: "simple", industryTemplateName: "", applyIndustryTemplate: false });
    setSimpleInput(nextSimpleInput);
    setInput(nextBlankInput);
    setKrsProfile(null);
    setCompanyData(null);
    setBizRaportSearchResults([]);
    setSelectedBizRaportKrs("");
    setKrsStatus("");
    setBizRaportStatus("");
    setForecastSeedNotes([]);
    setForecastAutoSeeded(false);
    setCombinedImportPreview(null);
    setCombinedImportStatus("");
    setWizardImportApplied(false);
    setImportedDataSummary(null);
    setPeerBenchmarks(null);
    setPeerBenchmarkStatus("");
    setBenchmarkAssistant(null);
    setBenchmarkAssistantStatus("");
    setRiskFreeRateSource(null);
    setRiskFreeRateStatus("");
    setRiskFreeRateManuallyEdited(false);
    setErpSource(null);
    setErpStatus("");
    setErpManuallyEdited(false);
    setBetaSource(null);
    setBetaStatus("");
    setBetaManuallyEdited(false);
    setWizardStep(1);
    setMode("simple");
    setWorkspaceStarted(false);
  }

  function selectWizardIndustryTemplate(templateName: string) {
    setWizardInput((current) => ({ ...current, industryTemplateName: templateName, industry: templateName }));
  }

  function applyTemplateToInput(templateName: string) {
    const template = getIndustryTemplate(templateName);
    if (!template) {
      return;
    }
    setInput((current) => applyIndustryTemplate(current, template));
    refreshCoreMarketInputs(input.profile.country, template.name);
  }

  function applySuggestedIndustryTemplate(suggestion: PkdIndustrySuggestion | null) {
    if (!suggestion) {
      return;
    }
    applyTemplateToInput(suggestion.industryTemplateName);
    setSimpleInput((current) => ({ ...current, industry: suggestion.industryTemplateName }));
  }

  function applyWizardSuggestedIndustryTemplate(suggestion: PkdIndustrySuggestion | null) {
    if (!suggestion) {
      return;
    }
    setWizardInput((current) => ({
      ...current,
      industry: suggestion.industryTemplateName,
      industryTemplateName: suggestion.industryTemplateName,
      applyIndustryTemplate: true,
    }));
  }

  function switchMode(nextMode: ValuationMode) {
    setSimpleInput(simpleInputFromValuationInput(input));
    setMode(nextMode);
  }

  function updateHistorical(index: number, key: keyof ValuationInput["historicals"][number], value: number) {
    setInput((current) => ({
      ...current,
      historicals: current.historicals.map((year, yearIndex) => (yearIndex === index ? { ...year, [key]: value } : year)),
    }));
  }

  function updateForecastArray(key: PercentArrayKey, index: number, value: number) {
    setInput((current) => ({
      ...current,
      forecast: {
        ...current.forecast,
        [key]: current.forecast[key].map((item, itemIndex) => (itemIndex === index ? value : item)),
      },
    }));
  }

  function updateWorkingCapital(index: number, value: number) {
    setInput((current) => ({
      ...current,
      workingCapital: {
        nwcPctRevenue: current.workingCapital.nwcPctRevenue.map((item, itemIndex) => (itemIndex === index ? value : item)),
      },
    }));
  }

  function updateAdjustment(index: number, amount: number) {
    setInput((current) => ({
      ...current,
      normalizationAdjustments: current.normalizationAdjustments.map((item, itemIndex) => (itemIndex === index ? { ...item, amount } : item)),
    }));
  }

  function downloadTextFile(filename: string, contents: string, mimeType: string) {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function copyReportSummary() {
    await navigator.clipboard.writeText(buildReportSummaryText(model.valuationReport));
  }

  function downloadJsonReport() {
    downloadTextFile("sme-dcf-valuation-report.json", buildReportJson(model.valuationReport), "application/json");
  }

  function downloadCsvReport() {
    downloadTextFile("sme-dcf-valuation-tables.csv", buildCombinedCsvExport(model.valuationReport), "text/csv");
  }

  function openPdfReport() {
    const reportWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!reportWindow) {
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(buildPdfReportHtml(model.valuationReport));
    reportWindow.document.close();
    reportWindow.focus();
    setTimeout(() => reportWindow.print(), 400);
  }

  const normalizedEbitda = normalizeLatestEbitda(input.historicals, input.normalizationAdjustments);
  const adjustmentTotal = sumNormalizationAdjustments(input.normalizationAdjustments);
  const normalizationMarginUplift = calculateNormalizationMarginUplift(input.historicals, input.normalizationAdjustments);
  const wizardIndustryTemplate = getIndustryTemplate(wizardInput.industryTemplateName);
  const professionalIndustryTemplate = getIndustryTemplate(input.profile.industry);
  const wizardPkdSuggestion = suggestIndustryTemplateFromPkd(wizardInput.pkdCode);
  const activePkdSuggestion = suggestIndustryTemplateFromPkd(input.profile.pkdCode);
  const companySources = getCompanyDataSources(input.profile.country);
  const marketSources = getMarketDataSources();
  const validationPaths = validation.success ? [] : validation.error.issues.map((issue) => String(issue.path[0] ?? ""));
  const hasValidationIssue = (paths: string[]) => paths.some((path) => validationPaths.includes(path));
  const hasAreaDiagnostic = (area: string) => model.diagnostics.diagnostics.some((diagnostic) => diagnostic.area === area && diagnostic.severity !== "info");
  const statusForInputs = (paths: string[], warning = false): WorkflowStatus => {
    if (hasValidationIssue(paths)) {
      return "missing inputs";
    }
    return warning ? "warning" : "complete";
  };
  const workflowSections: WorkflowSectionItem[] = [
    { id: "company", label: "1. Company", status: statusForInputs(["profile"]) },
    { id: "historical-financials", label: "2. Historical Financials", status: statusForInputs(["historicals"]) },
    { id: "normalization", label: "3. Normalization", status: statusForInputs(["normalizationAdjustments"], hasAreaDiagnostic("Normalization")) },
    { id: "forecast", label: "4. Forecast", status: statusForInputs(["forecast", "workingCapital"], hasAreaDiagnostic("Forecast")) },
    { id: "wacc", label: "5. WACC", status: statusForInputs(["wacc"], hasAreaDiagnostic("WACC")) },
    { id: "dcf", label: "6. DCF", status: statusForInputs(["terminalValue", "bridge", "discounts"], model.warnings.length > 0 || hasAreaDiagnostic("Terminal Value") || hasAreaDiagnostic("Bridge") || hasAreaDiagnostic("Discounts")) },
    { id: "market-approach", label: "7. Market Approach", status: statusForInputs(["marketMultiples"], model.valuationReport.marketValuation.diagnostics.length > 0) },
    { id: "scenarios-sensitivity", label: "8. Scenarios & Sensitivity", status: model.scenarioAnalysis.some((scenario) => scenario.warnings.length > 0) ? "warning" : "complete" },
    { id: "diagnostics", label: "9. Diagnostics", status: model.diagnostics.criticalCount > 0 ? "missing inputs" : model.diagnostics.warningCount > 0 ? "warning" : "complete" },
    { id: "export", label: "10. Export", status: validation.success ? "complete" : "warning" },
  ];
  const marketDataSourceRows = [
    {
      input: "Risk-free rate",
      currentValue: pct(input.wacc.riskFreeRate),
      source: riskFreeRateManuallyEdited && riskFreeRateSource?.value !== null && riskFreeRateSource?.value !== undefined ? `Manual override; source available from ${riskFreeRateSource.source}` : riskFreeRateSource?.value !== null && riskFreeRateSource?.value !== undefined ? riskFreeRateSource.source : "Manual input",
      date: riskFreeRateSource?.value !== null && riskFreeRateSource?.value !== undefined ? riskFreeRateSource.observationDate ?? riskFreeRateSource.fetchedAt : "Manual",
      status: riskFreeRateManuallyEdited ? "manual_override" : riskFreeRateSource?.value !== null && riskFreeRateSource?.value !== undefined ? riskFreeRateSource.status : "manual",
      confidence: riskFreeRateSource?.value !== null && riskFreeRateSource?.value !== undefined ? riskFreeRateSource.confidence : "low",
    },
    {
      input: "Equity risk premium",
      currentValue: pct(input.wacc.equityRiskPremium),
      source: erpManuallyEdited && erpSource?.value !== null && erpSource?.value !== undefined ? `Manual override; source available from ${erpSource.source}` : erpSource?.value !== null && erpSource?.value !== undefined ? `${erpSource.source} seed` : "Manual input",
      date: erpSource?.value !== null && erpSource?.value !== undefined ? erpSource.sourceDate : "Manual",
      status: erpManuallyEdited ? "manual_override" : erpSource?.value !== null && erpSource?.value !== undefined ? erpSource.refreshStatus : "manual",
      confidence: erpSource?.value !== null && erpSource?.value !== undefined ? erpSource.confidence : "low",
    },
    {
      input: "Beta",
      currentValue: input.wacc.beta.toFixed(2),
      source: betaManuallyEdited && betaSource?.value !== null && betaSource?.value !== undefined ? `Manual override; source available from ${betaSource.source}` : betaSource?.value !== null && betaSource?.value !== undefined ? `${betaSource.source} seed` : "Manual input",
      date: betaSource?.value !== null && betaSource?.value !== undefined ? betaSource.sourceDate : "Manual",
      status: betaManuallyEdited ? "manual_override" : betaSource?.value !== null && betaSource?.value !== undefined ? betaSource.refreshStatus : "manual",
      confidence: betaSource?.value !== null && betaSource?.value !== undefined ? betaSource.confidence : "low",
    },
  ];
  const marketMultipleIntelligence = assessMarketMultipleIntelligence(input, peerBenchmarks);
  const marketMultipleSource = input.marketMultiples.source;
  const dataReadinessItems: DataReadinessItem[] = [
    {
      label: "KRS registry",
      status: krsProfile ? "connected" : input.profile.registrationNumber ? "partial" : "manual",
      detail: krsProfile ? "Company profile was loaded from Public KRS." : input.profile.registrationNumber ? "KRS number is present; registry profile can be refreshed through a new valuation." : "No KRS profile connected yet.",
    },
    {
      label: "BizRaport financials",
      status: companyData?.years.length ? "connected" : importedDataSummary ? "partial" : "manual",
      detail: companyData?.years.length ? `${companyData.years.length} imported financial period(s) are mapped into historicals.` : "No BizRaport financial years are connected.",
    },
    {
      label: "PKD template",
      status: activePkdSuggestion ? "connected" : input.profile.industry ? "partial" : "manual",
      detail: activePkdSuggestion ? `${activePkdSuggestion.industryTemplateName} applied from PKD ${activePkdSuggestion.division}.` : "Industry can be selected manually when PKD mapping is unavailable.",
    },
    {
      label: "Forecast seed",
      status: forecastAutoSeeded ? "connected" : "manual",
      detail: forecastAutoSeeded ? "Forecast assumptions were generated from imported financials." : "Forecast assumptions are currently user-entered or template defaults.",
    },
    {
      label: "Market inputs",
      status: riskFreeRateSource || erpSource || betaSource ? riskFreeRateSource && erpSource && betaSource ? "connected" : "partial" : "manual",
      detail: riskFreeRateSource && erpSource && betaSource ? "Risk-free rate, ERP, and beta sources are loaded." : "Some WACC market sources are still manual.",
    },
  ];
  const connectedDataSources = dataReadinessItems.filter((item) => item.status === "connected").length;
  const partialDataSources = dataReadinessItems.filter((item) => item.status === "partial").length;
  const sourceReadinessScore = Math.min(100, Math.round(((connectedDataSources + partialDataSources * 0.5) / dataReadinessItems.length) * 100));
  const assumptionsStatus: WorkflowStatus = workflowSections
    .slice(0, 6)
    .some((section) => section.status === "missing inputs")
      ? "missing inputs"
      : workflowSections.slice(0, 6).some((section) => section.status === "warning")
        ? "warning"
        : "complete";
  const workbenchSections: WorkflowSectionItem[] = [
    { id: "valuation-conclusion", label: "Conclusion", status: model.diagnostics.criticalCount > 0 ? "warning" : "complete" },
    { id: "evidence-quality", label: "Evidence", status: sourceReadinessScore >= 80 ? "complete" : "warning" },
    { id: "methods", label: "Methods", status: model.valuationReport.marketValuation.diagnostics.length > 0 ? "warning" : "complete" },
    { id: "assumptions", label: "Assumptions", status: assumptionsStatus },
    { id: "risk", label: "Risk", status: workflowSections[8].status },
    { id: "export", label: "Export", status: workflowSections[9].status },
  ];
  const diagnosticPenalty = model.diagnostics.criticalCount * 20 + model.diagnostics.warningCount * 5;
  const valuationConfidenceScore = Math.max(20, Math.min(95, sourceReadinessScore + (model.diagnostics.criticalCount === 0 ? 10 : 0) - diagnosticPenalty));
  const decisionHeadline = model.diagnostics.criticalCount > 0
    ? "Use as a working draft until critical diagnostics are resolved."
    : valuationConfidenceScore >= 80
      ? "Ready for internal review, with assumptions still available for professional tuning."
      : "Good screening output, but source support and assumptions should be reviewed before relying on it.";

  useEffect(() => {
    const updateStageProgress = () => {
      const scrollTop = window.scrollY;
      const documentHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      setScrollProgress(Math.min(100, Math.max(0, (scrollTop / documentHeight) * 100)));

      const activeSection = workbenchSections
        .map((section) => ({ id: section.id, top: document.getElementById(section.id)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY }))
        .filter((section) => Number.isFinite(section.top))
        .reduce((current, section) => (section.top <= 170 && section.top > current.top ? section : current), { id: workbenchSections[0]?.id ?? "valuation-conclusion", top: Number.NEGATIVE_INFINITY });

      if (activeSection.id !== activeStageId) {
        setActiveStageId(activeSection.id);
      }
    };

    updateStageProgress();
    window.addEventListener("scroll", updateStageProgress, { passive: true });
    window.addEventListener("resize", updateStageProgress);
    return () => {
      window.removeEventListener("scroll", updateStageProgress);
      window.removeEventListener("resize", updateStageProgress);
    };
  }, [activeStageId, workbenchSections]);

  if (!workspaceStarted) {
    return (
      <main className="workbench-shell">
        <section className="workbench-container space-y-6">
          <div className="hero-panel rounded-xl p-6 lg:p-8">
            <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] xl:items-end">
              <div className="min-w-0">
                <Badge className="border-teal-200 bg-teal-50 text-teal-800">KRS-first SME valuation</Badge>
                <h1 className="mt-5 max-w-3xl break-words text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl lg:text-6xl">Build the first valuation from a KRS number.</h1>
                <p className="mt-4 max-w-3xl break-words text-base leading-7 text-slate-600 lg:text-lg">The app pulls the company profile, maps BizRaport financial ranges, applies PKD logic, seeds forecast and WACC assumptions, then lets you review and override the model.</p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button className="inline-flex max-w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/10 transition hover:bg-teal-800" onClick={fetchCombinedCompanyData}>
                    <Search size={17} />
                    Fetch and build model
                  </button>
                  <button className="inline-flex max-w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:border-teal-700 hover:text-teal-800" onClick={() => setWizardStep(3)}>
                    Manual fallback
                    <ArrowRight size={17} />
                  </button>
                </div>
              </div>
              <div className="grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-white/78 p-4 text-sm text-slate-700 shadow-sm backdrop-blur">
                {[
                  { Icon: Database, title: "KRS + BizRaport data first", detail: "Registry profile, financial ranges, and PKD context." },
                  { Icon: SlidersHorizontal, title: "Assumptions remain editable", detail: "Advisors can override WACC, forecast, bridge, and discounts." },
                  { Icon: ShieldCheck, title: "Diagnostics before export", detail: "Critical checks stay visible before the PDF/report package." },
                ].map(({ Icon, title, detail }) => (
                  <div key={title} className="flex min-w-0 gap-3 rounded-md border border-slate-200 bg-slate-50/80 p-3">
                    <Icon size={18} className="mt-0.5 shrink-0 text-teal-700" />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-950">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`grid gap-3 ${wizardImportApplied && companyData?.years.length ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            {[1, 2, ...(wizardImportApplied && companyData?.years.length ? [] : [3])].map((step) => (
              <button key={step} className={`rounded-lg border p-4 text-left text-sm font-bold shadow-sm transition ${wizardStep === step ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/10" : "border-slate-200 bg-white text-slate-700 hover:border-teal-500 hover:bg-slate-50"}`} onClick={() => setWizardStep(step as 1 | 2 | 3)}>
                <span className={`text-xs uppercase tracking-[0.2em] ${wizardStep === step ? "text-slate-300" : "text-slate-500"}`}>{step === 1 ? "Company data" : step === 2 ? "Model path" : "Fallback"}</span>
                <span className="mt-1 block">{step === 1 ? "Fetch and build" : step === 2 ? "Choose output depth" : "Manual numbers"}</span>
              </button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{wizardStep === 1 ? "Company lookup" : wizardStep === 2 ? "Valuation path" : "Manual financial fallback"}</CardTitle>
              <CardDescription>{wizardStep === 1 ? "One action builds the initial model from available Polish company data." : wizardStep === 2 ? "Choose the output depth after source data has been applied." : "Use manual inputs only when imported financials are unavailable or skipped."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {wizardStep === 1 && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5"><Label>KRS number</Label><Input value={wizardInput.registrationNumber} onChange={(event) => updateWizard("registrationNumber", cleanBizRaportKrs(event.target.value))} placeholder="0000795513" /><p className="text-xs text-slate-500">Enter a 10-digit KRS. The combined fetch calls Public KRS for profile data and BizRaport for financial data.</p></div>
                    <div className="space-y-1.5"><Label>Country</Label><Input list="country-options" value={wizardInput.country} onChange={(event) => updateWizardCountry(event.target.value)} placeholder="Search country" /><datalist id="country-options">{countryOptions.map((country) => <option key={country.name} value={country.name} />)}</datalist><p className="text-xs text-slate-500">Defaults to Poland / PLN for Polish KRS workflows.</p></div>
                    <div className="space-y-1.5"><Label>Currency</Label><select className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm transition file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100" value={wizardInput.currency} onChange={(event) => updateWizard("currency", event.target.value)}>{currencyOptions.map((currency) => <option key={currency.code} value={currency.code}>{formatCurrencyOption(currency)}</option>)}</select></div>
                    <div className="space-y-1.5"><Label>Valuation date</Label><Input value={wizardInput.valuationDate} onChange={(event) => updateWizard("valuationDate", event.target.value)} /></div>
                  </div>

                  <div className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-950">Build from KRS</p>
                        <p className="mt-1 text-sm text-slate-600">Fetch registry details, BizRaport ranges, PKD suggestion, forecast seed, and WACC source summary in one step.</p>
                      </div>
                      <button className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800" onClick={fetchCombinedCompanyData}><Search size={17} />Fetch and build model</button>
                    </div>
                    <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-5">
                      {["KRS profile", "BizRaport", "PKD", "Forecast", "WACC"].map((label) => (
                        <span key={label} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"><CheckCircle2 size={14} className="text-teal-700" />{label}</span>
                      ))}
                    </div>
                    {combinedImportStatus ? <p className="mt-3 text-sm text-slate-600">{combinedImportStatus}</p> : null}
                  </div>

                  {combinedImportPreview ? <><DataReadinessPanel items={dataReadinessItems} score={sourceReadinessScore} /><CombinedCompanyImportPreview preview={combinedImportPreview} currency={wizardInput.currency} onConfirm={() => importCombinedCompanyData(combinedImportPreview)} /></> : null}
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-5">
                  {importedDataSummary ? <><DataReadinessPanel items={dataReadinessItems} score={sourceReadinessScore} /><ImportedDataSummaryCard summary={importedDataSummary} /></> : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <button className={`rounded-lg border p-5 text-left transition ${wizardInput.valuationType === "simple" ? "border-teal-700 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-500"}`} onClick={() => updateWizard("valuationType", "simple")}>
                      <p className="text-lg font-bold text-slate-950">Conclusion view</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">A clean decision view: valuation range, confidence, source readiness, key risks, and next steps.</p>
                    </button>
                    <button className={`rounded-lg border p-5 text-left transition ${wizardInput.valuationType === "professional" ? "border-slate-950 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-500"}`} onClick={() => updateWizard("valuationType", "professional")}>
                      <p className="text-lg font-bold text-slate-950">Workbench view</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">The same valuation with editable assumptions, method detail, source trails, diagnostics, and exports.</p>
                    </button>
                  </div>
                  {wizardImportApplied && companyData?.years.length ? <Badge className="border-teal-200 bg-teal-50 text-teal-800">Model prefilled from KRS + BizRaport - Step 3 will be skipped</Badge> : <p className="text-sm text-slate-500">No imported financial years are available yet, so the wizard will ask for a manual financial starting point.</p>}
                </div>
              )}

              {wizardStep === 3 && (
                <div className="grid gap-4 md:grid-cols-2">
                  <NumberField label="Latest revenue" value={wizardInput.latestRevenue} onChange={(value) => updateWizard("latestRevenue", value)} />
                  <NumberField label="Latest EBITDA" value={wizardInput.latestEbitda} onChange={(value) => updateWizard("latestEbitda", value)} />
                  <NumberField label="Cash" value={wizardInput.cash} onChange={(value) => updateWizard("cash", value)} />
                  <NumberField label="Debt" value={wizardInput.debt} onChange={(value) => updateWizard("debt", value)} />
                  <NumberField label="Expected annual revenue growth" value={wizardInput.expectedAnnualRevenueGrowth} percent onChange={(value) => updateWizard("expectedAnnualRevenueGrowth", value)} />
                  <NumberField label="Expected EBITDA margin" value={wizardInput.expectedEbitdaMargin} percent onChange={(value) => updateWizard("expectedEbitdaMargin", value)} />
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <button className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-teal-600 hover:text-teal-800" onClick={() => setWizardStep((current) => (current === 1 ? 1 : ((current - 1) as 1 | 2 | 3)))}>Back</button>
                <div className="flex gap-3">
                  {wizardStep === 1 && <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800" onClick={() => setWizardStep(2)}>Skip lookup</button>}
                  {wizardStep === 2 && (wizardImportApplied && companyData?.years.length ? <button className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800" onClick={startValuation}>Start valuation</button> : <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800" onClick={() => setWizardStep(3)}>Continue</button>)}
                  {wizardStep === 3 && <button className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800" onClick={startValuation}>Start valuation</button>}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  return (
    <main className="workbench-shell">
      <section className="workbench-container space-y-6">
        <div className="hero-panel rounded-xl p-6">
          <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <Badge className="border-teal-200 bg-teal-50 text-teal-800">Polish SME valuation workbench</Badge>
              <h1 className="mt-4 max-w-4xl break-words text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">{input.profile.companyName}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                One headline valuation range with source quality, method evidence, editable assumptions, model checks, and export-ready outputs.
              </p>
            </div>
            <div className="grid gap-2 rounded-lg border border-slate-200 bg-white/80 p-4 text-sm text-slate-700 shadow-sm backdrop-blur sm:min-w-[320px]">
              <div className="flex items-center gap-2"><Building2 size={18} className="text-teal-700" /> {input.profile.country}</div>
              <div className="flex items-center gap-2"><Calculator size={18} className="text-teal-700" /> Currency: {input.profile.currency} in 000s</div>
              <div className="flex items-center gap-2"><LineChartIcon size={18} className="text-teal-700" /> Valuation date: {input.profile.valuationDate}</div>
              <button className="mt-2 inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 transition hover:border-teal-600 hover:text-teal-800" onClick={startNewValuation}><ArrowRight size={16} />Start new valuation</button>
            </div>
          </div>
        </div>

        <WorkflowNav sections={workbenchSections} />
        {mode === "professional" ? <StageScrollRail sections={workbenchSections} activeId={activeStageId} progress={scrollProgress} /> : null}

        <div id="valuation-conclusion" className="scroll-mt-28">
          <ValuationRangePanel
            currency={input.profile.currency}
            low={model.engineCockpit.low}
            base={model.engineCockpit.base}
            high={model.engineCockpit.high}
            confidenceScore={valuationConfidenceScore}
            readinessHeadline={decisionHeadline}
          />
        </div>
        <div id="evidence-quality" className="scroll-mt-28">
          <DataReadinessPanel items={dataReadinessItems} score={sourceReadinessScore} />
        </div>
        <Card className="border-slate-300 bg-white/95">
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">View mode</p>
              <p className="mt-1 text-sm text-slate-600">Same valuation, different level of detail. Switching views does not recalculate the model.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Valuation view">
              <button aria-pressed={mode === "simple"} className={`rounded-md border px-5 py-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-teal-200 ${mode === "simple" ? "border-teal-700 bg-teal-700 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-teal-600"}`} onClick={() => switchMode("simple")}>Conclusion</button>
              <button aria-pressed={mode === "professional"} className={`rounded-md border px-5 py-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-slate-200 ${mode === "professional" ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-950"}`} onClick={() => switchMode("professional")}>Workbench</button>
            </div>
          </CardContent>
        </Card>

        <WorkbenchNextSteps
          mode={mode}
          sourceReadinessScore={sourceReadinessScore}
          marketMultipleSource={marketMultipleSource}
          criticalCount={model.diagnostics.criticalCount}
          warningCount={model.diagnostics.warningCount}
          benchmarkAssistantStatus={benchmarkAssistantStatus}
          peerBenchmarkStatus={peerBenchmarkStatus}
          onOpenExtended={() => switchMode("professional")}
        />

        {mode === "simple" ? null : (
          <>

        <div id="methods" className="scroll-mt-28">
          <EngineCockpit
            cockpit={model.engineCockpit}
            currency={input.profile.currency}
            selectedEngineId={selectedEngineId}
            onSelectEngine={setSelectedEngineId}
            onCloseSourceDrawer={() => setSelectedEngineId(null)}
            onFetchComparablePeers={fetchComparableCompanyPeers}
            peerBenchmarkStatus={peerBenchmarkStatus}
          />
        </div>

        {!validation.success && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="flex gap-3 p-4 text-sm text-amber-900">
              <AlertCircle className="mt-0.5" size={18} />
              <span>Zod validation is active. Please review assumptions: {validation.error.issues.map((issue) => issue.path.join(".")).join(", ")}</span>
            </CardContent>
          </Card>
        )}

        <WorkflowHeader id="assumptions" eyebrow="Assumptions" title="Company & Source Setup" description="Editable company fields and source mapping. These inputs support the conclusion above; they are not a separate valuation summary." status={workflowSections[0].status} />
        <div className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Company Profile</CardTitle>
              <CardDescription>Core identifying inputs for the valuation memorandum.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Company name</Label><Input value={input.profile.companyName} onChange={(e) => update(["profile", "companyName"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Country</Label><Input value={input.profile.country} onChange={(e) => update(["profile", "country"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><Input value={input.profile.currency} onChange={(e) => update(["profile", "currency"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Industry</Label><Input value={input.profile.industry} onChange={(e) => update(["profile", "industry"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Registration Number</Label><Input value={input.profile.registrationNumber} onChange={(e) => update(["profile", "registrationNumber"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>NIP</Label><Input value={input.profile.nip} onChange={(e) => update(["profile", "nip"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>REGON</Label><Input value={input.profile.regon} onChange={(e) => update(["profile", "regon"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Website (optional)</Label><Input value={input.profile.website} onChange={(e) => update(["profile", "website"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>PKD code</Label><Input value={input.profile.pkdCode} onChange={(e) => update(["profile", "pkdCode"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Legal form</Label><Input value={input.profile.legalForm} onChange={(e) => update(["profile", "legalForm"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Address</Label><Input value={input.profile.address} onChange={(e) => update(["profile", "address"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Share capital</Label><Input value={input.profile.shareCapital} onChange={(e) => update(["profile", "shareCapital"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Registration status</Label><Input value={input.profile.registrationStatus} onChange={(e) => update(["profile", "registrationStatus"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Valuation date</Label><Input value={input.profile.valuationDate} onChange={(e) => update(["profile", "valuationDate"], e.target.value)} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Imported Data</CardTitle><CardDescription>Source data is imported in the setup wizard so the workbench stays focused on valuation decisions.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">Company data</h3>
                <p className="mt-1 text-sm text-slate-500">Available source mapping: {companySources.map((source) => source.name).join(", ") || "No mapped source"}</p>
              </div>
              {importedDataSummary ? <ImportedDataSummaryCard summary={importedDataSummary} /> : <p className="text-sm text-slate-500">No wizard import has been applied yet.</p>}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">To run a different KRS + BizRaport import, start a new valuation. This keeps the active model from mixing old source data with new assumptions.</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Industry Classification</CardTitle><CardDescription>PKD-driven classification and private-company assumptions. Market beta, ERP and sector multiples are consolidated in Market Data Sources.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <PkdSuggestionPanel suggestion={activePkdSuggestion} />
              <div className="space-y-1.5"><Label>Industry template selector</Label><select className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100" value={professionalIndustryTemplate?.name ?? ""} onChange={(event) => event.target.value ? applyTemplateToInput(event.target.value) : update(["profile", "industry"], "")}><option value="">Select template</option>{industryTemplates.map((template) => <option key={template.name} value={template.name}>{template.name}</option>)}</select><p className="text-xs text-slate-500">Selecting a template updates classification, DLOM, and optional tax defaults. WACC and multiples keep their own source trail.</p></div>
              {professionalIndustryTemplate ? <TemplateAssumptionTable template={professionalIndustryTemplate} /> : <p className="text-sm text-slate-500">Select an industry template to review classification, DLOM, and tax defaults.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Market Data Sources</CardTitle><CardDescription>Single evidence panel for rates, ERP, beta, sector multiples, and peer screens. Detailed source trails stay in the relevant method detail.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[760px] text-sm">
                  <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Input</th><th className="p-3 text-right">Current value</th><th className="p-3">Source</th><th className="p-3">Source date / observation date</th><th className="p-3">Status</th><th className="p-3">Confidence</th></tr></thead>
                  <tbody>
                    {marketDataSourceRows.map((row) => (
                      <tr key={row.input} className="border-b border-slate-100 align-top">
                        <td className="p-3 font-semibold text-slate-800">{row.input}</td>
                        <td className="p-3 text-right font-semibold text-slate-950">{row.currentValue}</td>
                        <td className="p-3 text-slate-700">{row.source}</td>
                        <td className="p-3 text-slate-600">{row.date}</td>
                        <td className="p-3 text-slate-700">{row.status}</td>
                        <td className="p-3"><Badge className={row.confidence === "low" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}>{row.confidence}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <p className="text-sm font-semibold text-slate-950">Market multiples source</p>
                  <Badge className={marketMultipleSource.approvalStatus === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}>{marketMultipleSource.approvalStatus}</Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{marketMultipleSource.label}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <OutputRow label="EV / EBITDA" value={multiple(input.marketMultiples.evEbitdaMultiple)} />
                  <OutputRow label="EV / Revenue" value={multiple(input.marketMultiples.evRevenueMultiple)} />
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">{marketMultipleIntelligence.aiAnalystRole}</p>
              </div>
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">Source summary updates automatically when the model starts. Manual overrides stay visible in Discount Rate and Market Multiples.</div>
              {(marketData?.notes.length || marketSources.length) ? (
                <details className="rounded-lg border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600">
                  <summary className="cursor-pointer text-sm font-bold text-slate-800">View source audit notes</summary>
                  {marketData?.notes.length ? <p className="mt-3">{marketData.notes.join(" ")}</p> : null}
                  <p className="mt-3">Configured adapters: {marketSources.map((source) => source.name).join(", ")}</p>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <WorkflowHeader id="historical-financials" eyebrow="Assumptions" title="Historical Baseline" description="Three-year operating history used to seed revenue, profitability, capex, and working capital assumptions." status={workflowSections[1].status} />
        <Card>
          <CardHeader>
            <CardTitle>Historical Financials for 3 Years</CardTitle>
            <CardDescription>Actual results establish the revenue base, latest working capital, and profitability context.</CardDescription>
          </CardHeader>
          <CardContent className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2">Year</th><th>Revenue</th><th>EBITDA</th><th>D&A</th><th>Capex</th><th>NWC</th><th>EBITDA Margin</th></tr></thead>
              <tbody>
                {input.historicals.map((year, index) => (
                  <tr key={year.year} className="border-b border-slate-100">
                    <td className="py-3 font-semibold">{year.year}</td>
                    {(["revenue", "ebitda", "depreciation", "capex", "netWorkingCapital"] as const).map((key) => (
                      <td key={key} className="pr-3"><Input type="number" value={year[key]} onChange={(e) => updateHistorical(index, key, asNumber(e.target.value))} /></td>
                    ))}
                    <td className="font-semibold text-teal-700">{pct(year.ebitda / year.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <WorkflowHeader id="normalization" eyebrow="Assumptions" title="EBITDA Adjustments" description="Owner, non-recurring, and run-rate adjustments that feed normalized EBITDA and forecast margins." status={workflowSections[2].status} />
        <div className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>EBITDA Normalization</CardTitle>
              <CardDescription>Formula: adjusted EBITDA = latest EBITDA + normalizing adjustments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {input.normalizationAdjustments.map((item, index) => (
                <NumberField key={item.label} label={item.label} value={item.amount} onChange={(value) => updateAdjustment(index, value)} />
              ))}
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                Latest EBITDA {money(input.historicals[2].ebitda, input.profile.currency)} + adjustments {money(adjustmentTotal, input.profile.currency)} = <strong>{money(normalizedEbitda, input.profile.currency)}</strong><br />Normalization margin uplift carried into forecast = <strong>{pct(normalizationMarginUplift)}</strong>
              </div>
            </CardContent>
          </Card>
        </div>

        <WorkflowHeader id="forecast" eyebrow="Assumptions" title="Operating Forecast" description="Revenue, margin, tax, capex, and working capital assumptions for the explicit forecast period." status={workflowSections[3].status} />
        <div className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Forecast Assumptions for 5 Years</CardTitle>
              <CardDescription>FCFF formula: revenue × normalized EBITDA margin - cash taxes + D&A - capex - change in net working capital.</CardDescription>
              <div className="mt-3 flex flex-wrap items-center gap-3"><button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-600 hover:text-teal-800" onClick={generateForecastFromHistoricalInputs}>Generate forecast from historicals</button>{forecastAutoSeeded ? <Badge className="border-teal-200 bg-teal-50 text-teal-800">Auto-generated from historical financials</Badge> : null}</div>
              {forecastSeedNotes.map((note) => <p key={note} className="mt-2 text-xs text-slate-500">{note}</p>)}
            </CardHeader>
            <CardContent className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="py-2">Assumption</th>{model.forecastYears.map((y) => <th key={y.year}>{y.year}</th>)}</tr></thead>
                <tbody>
                  {[
                    ["Revenue growth", "revenueGrowth"],
                    ["Base EBITDA margin", "ebitdaMargin"],
                    ["D&A / revenue", "depreciationPctRevenue"],
                    ["Capex / revenue", "capexPctRevenue"],
                  ].map(([label, key]) => (
                    <tr key={key} className="border-b border-slate-100"><td className="py-3 font-medium">{label}{forecastAutoSeeded ? <span className="mt-1 block text-xs font-normal text-slate-500">Generated from historical financial statements</span> : null}</td>{input.forecast[key as PercentArrayKey].map((value, index) => <td key={index} className="pr-2"><NumberField label="" value={value} percent onChange={(next) => updateForecastArray(key as PercentArrayKey, index, next)} /></td>)}</tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 max-w-xs"><NumberField label="Tax rate" value={input.forecast.taxRate} percent onChange={(value) => update(["forecast", "taxRate"], value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Working Capital Assumptions</CardTitle>
              <CardDescription>NWC is modeled as a percentage of revenue; cash flow impact is the period-over-period change.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-5">
                {input.workingCapital.nwcPctRevenue.map((value, index) => <NumberField key={index} label={`${model.forecastYears[index].year}`} value={value} percent onChange={(next) => updateWorkingCapital(index, next)} />)}
              </div>
              {forecastAutoSeeded ? <p className="mt-3 text-xs text-slate-500">NWC / revenue source: Generated from historical financial statements.</p> : null}
              <div className="chart-frame mt-6">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={model.forecastYears}><CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" /><XAxis dataKey="year" tick={chartAxisStyle} tickLine={false} axisLine={{ stroke: chartGridColor }} /><YAxis tick={chartAxisStyle} tickLine={false} axisLine={{ stroke: chartGridColor }} /><Tooltip contentStyle={chartTooltipStyle} formatter={(value) => chartMoney(value, input.profile.currency)} /><Area dataKey="freeCashFlow" name="Free Cash Flow" fill="#0f766e" stroke="#0f766e" fillOpacity={0.18} /></AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <WorkflowHeader id="wacc" eyebrow="Assumptions" title="Discount Rate" description="WACC build using market inputs, private-company premia, capital structure, and tax assumptions." status={workflowSections[4].status} />
        <div className="grid gap-5">
          <Card>
            <CardHeader><CardTitle>WACC Assumptions</CardTitle><CardDescription>Cost of equity = Rf + beta × ERP + size premium + CSRP.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <NumberField label="Risk-free rate" value={input.wacc.riskFreeRate} percent onChange={(v) => { setRiskFreeRateManuallyEdited(true); update(["wacc", "riskFreeRate"], v); }} />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">Risk-free rate source</p>
                    <p className="mt-1 text-slate-600">Current value: {pct(input.wacc.riskFreeRate)}</p>
                  </div>
                  <Badge className="border-teal-200 bg-white text-teal-800">Auto-updated</Badge>
                </div>
                {riskFreeRateSource ? (
                  <details className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                    <summary className="cursor-pointer text-xs font-bold text-slate-700">View source trail</summary>
                    <div className="mt-3 grid min-w-0 gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <span className="break-words"><strong>Source:</strong> {riskFreeRateSource.source}</span>
                      <span className="break-words"><strong>Series ID:</strong> {riskFreeRateSource.seriesId ?? "Unavailable"}</span>
                      <span className="break-words"><strong>Observation date:</strong> {riskFreeRateSource.observationDate ?? "Unavailable"}</span>
                      <span className="break-words"><strong>Fetched at:</strong> {riskFreeRateSource.fetchedAt}</span>
                      <span className="break-words"><strong>Confidence:</strong> {riskFreeRateSource.confidence}</span>
                      <span className="break-words"><strong>Source status:</strong> {riskFreeRateSource.status}</span>
                    </div>
                  </details>
                ) : <p className="mt-3 text-xs text-slate-500">No live FRED risk-free rate has been fetched yet.</p>}
                {riskFreeRateStatus ? <p className="mt-3 text-xs text-slate-500">{riskFreeRateStatus}{riskFreeRateManuallyEdited && riskFreeRateSource?.value !== null ? " Manual risk-free rate edits are preserved unless you refresh explicitly." : ""}</p> : null}
              </div>
              <NumberField label="Equity risk premium" value={input.wacc.equityRiskPremium} percent onChange={(v) => { setErpManuallyEdited(true); update(["wacc", "equityRiskPremium"], v); }} />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">Equity risk premium source</p>
                    <p className="mt-1 text-slate-600">Current ERP: {pct(input.wacc.equityRiskPremium)}</p>
                  </div>
                  <Badge className="border-teal-200 bg-white text-teal-800">Auto-updated</Badge>
                </div>
                {erpSource ? (
                  <details className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                    <summary className="cursor-pointer text-xs font-bold text-slate-700">View source trail</summary>
                    <div className="mt-3 grid min-w-0 gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <span className="break-words"><strong>Mature market ERP:</strong> {erpSource.matureMarketErp !== null ? pct(erpSource.matureMarketErp) : "Unavailable"}</span>
                      <span className="break-words"><strong>Country risk premium:</strong> {erpSource.countryRiskPremium !== null ? pct(erpSource.countryRiskPremium) : "Unavailable"}</span>
                      <span className="break-words"><strong>Total ERP:</strong> {erpSource.totalErp !== null ? pct(erpSource.totalErp) : "Unavailable"}</span>
                      <span className="break-words"><strong>Source:</strong> {erpSource.source}</span>
                      <span className="break-words"><strong>Source date:</strong> {erpSource.sourceDate}</span>
                      <span className="break-words"><strong>Dataset age:</strong> {erpSource.datasetAgeDays} days</span>
                      <span className="break-words"><strong>Source status:</strong> {erpSource.refreshStatus}</span>
                      <span className="break-words"><strong>Confidence:</strong> {erpSource.confidence}</span>
                    </div>
                  </details>
                ) : <p className="mt-3 text-xs text-slate-500">No Damodaran ERP seed has been loaded yet.</p>}
                {erpSource?.warning ? <p className="mt-3 text-xs font-semibold text-amber-700">{erpSource.warning}</p> : null}
                {erpStatus ? <p className="mt-3 text-xs text-slate-500">{erpStatus}{erpManuallyEdited && erpSource?.value !== null ? " Manual ERP edits are preserved during refresh and imports." : ""}</p> : null}
              </div>
              <NumberField label="Beta" value={input.wacc.beta} onChange={(v) => { setBetaManuallyEdited(true); update(["wacc", "beta"], v); }} />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">Beta source</p>
                    <p className="mt-1 text-slate-600">Current beta: {input.wacc.beta.toFixed(2)}</p>
                  </div>
                  <Badge className="border-teal-200 bg-white text-teal-800">Auto-updated</Badge>
                </div>
                {betaSource ? (
                  <details className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                    <summary className="cursor-pointer text-xs font-bold text-slate-700">View source trail</summary>
                    <div className="mt-3 grid min-w-0 gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <span className="break-words"><strong>App industry:</strong> {betaSource.appIndustry || "Unavailable"}</span>
                      <span className="break-words"><strong>Damodaran industry:</strong> {betaSource.damodaranIndustry ?? "Unavailable"}</span>
                      <span className="break-words"><strong>Unlevered beta:</strong> {betaSource.unleveredBeta !== null ? betaSource.unleveredBeta.toFixed(2) : "Unavailable"}</span>
                      <span className="break-words"><strong>Cash-adjusted beta:</strong> {betaSource.cashAdjustedBeta !== null ? betaSource.cashAdjustedBeta.toFixed(2) : "Unavailable"}</span>
                      <span className="break-words"><strong>Total beta:</strong> {betaSource.totalUnleveredBeta !== null && betaSource.totalUnleveredBeta !== undefined ? betaSource.totalUnleveredBeta.toFixed(2) : "Unavailable"}</span>
                      <span className="break-words"><strong>Sector WACC:</strong> {betaSource.costOfCapitalLocal !== null && betaSource.costOfCapitalLocal !== undefined ? pct(betaSource.costOfCapitalLocal) : "Unavailable"}</span>
                      <span className="break-words"><strong>Source:</strong> {betaSource.source}</span>
                      <span className="break-words"><strong>Source date:</strong> {betaSource.sourceDate}</span>
                      <span className="break-words"><strong>Dataset age:</strong> {betaSource.datasetAgeDays} days</span>
                      <span className="break-words"><strong>Source status:</strong> {betaSource.refreshStatus}</span>
                      <span className="break-words"><strong>Confidence:</strong> {betaSource.confidence}</span>
                    </div>
                  </details>
                ) : <p className="mt-3 text-xs text-slate-500">No Damodaran beta seed has been loaded yet.</p>}
                {betaSource?.warning ? <p className="mt-3 text-xs font-semibold text-amber-700">{betaSource.warning}</p> : null}
                {betaStatus ? <p className="mt-3 text-xs text-slate-500">{betaStatus}{betaManuallyEdited && betaSource?.value !== null ? " Manual beta edits are preserved during refresh and imports." : ""}</p> : null}
              </div>
              <NumberField label="Size premium" value={input.wacc.sizePremium} percent onChange={(v) => update(["wacc", "sizePremium"], v)} />
              <NumberField label="Company-specific premium" value={input.wacc.companySpecificRiskPremium} percent onChange={(v) => update(["wacc", "companySpecificRiskPremium"], v)} />
              <NumberField label="Pre-tax cost of debt" value={input.wacc.preTaxCostOfDebt} percent onChange={(v) => update(["wacc", "preTaxCostOfDebt"], v)} />
              <NumberField label="Target debt / capital" value={input.wacc.targetDebtPctCapital} percent onChange={(v) => update(["wacc", "targetDebtPctCapital"], v)} />
              <div className="rounded-xl bg-slate-50 p-4 text-sm">WACC = {pct(model.wacc.equityWeight)} × {pct(model.wacc.costOfEquity)} + {pct(model.wacc.debtWeight)} × after-tax debt cost {pct(model.wacc.afterTaxCostOfDebt)} = <strong>{pct(model.wacc.wacc)}</strong><br />After-tax debt cost uses the forecast tax rate of {pct(input.forecast.taxRate)}.</div>
            </CardContent>
          </Card>
        </div>

        <WorkflowHeader id="dcf" eyebrow="Method detail" title="DCF Indication" description="Income-approach mechanics: terminal value, EV-to-equity bridge, private-company discounts, and DCF support schedules." status={workflowSections[5].status} />
        <div className="grid gap-5">
          <Card>
            <CardHeader><CardTitle>Terminal Value</CardTitle><CardDescription>Gordon growth and exit multiple are both calculated; selected method drives EV.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <NumberField label="Perpetual growth" value={input.terminalValue.perpetualGrowthRate} percent onChange={(v) => update(["terminalValue", "perpetualGrowthRate"], v)} />
              <NumberField label="Exit EBITDA multiple" value={input.terminalValue.exitEbitdaMultiple} onChange={(v) => update(["terminalValue", "exitEbitdaMultiple"], v)} />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <button className={`rounded-xl border p-3 font-semibold ${input.terminalValue.method === "gordon" ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200"}`} onClick={() => setInput((c) => ({ ...c, terminalValue: { ...c.terminalValue, method: "gordon" } }))}>Gordon Growth</button>
                <button className={`rounded-xl border p-3 font-semibold ${input.terminalValue.method === "exitMultiple" ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200"}`} onClick={() => setInput((c) => ({ ...c, terminalValue: { ...c.terminalValue, method: "exitMultiple" } }))}>Exit Multiple</button>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6">Terminal FCFF × (1 + g) / (WACC - g) = {money(model.dcf.terminalValue.gordonTerminalValue, input.profile.currency)}<br />WACC - g spread = {pct(model.dcf.terminalValue.gordonSpread)}{!model.dcf.terminalValue.isGordonGrowthValid ? " (invalid; growth must be below WACC)" : ""}<br />Year 5 EBITDA × multiple = {money(model.dcf.terminalValue.exitMultipleTerminalValue, input.profile.currency)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>EV to Equity Bridge</CardTitle><CardDescription>Equity value = EV + cash + non-operating assets - debt - leasing - other debt-like items - transaction costs.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <NumberField label="Cash" value={input.bridge.cash} onChange={(v) => update(["bridge", "cash"], v)} />
              <NumberField label="Debt" value={input.bridge.debt} onChange={(v) => update(["bridge", "debt"], v)} />
              <NumberField label="Leasing" value={input.bridge.leasing} onChange={(v) => update(["bridge", "leasing"], v)} />
              <NumberField label="Other debt-like items" value={input.bridge.otherDebtLikeItems} onChange={(v) => update(["bridge", "otherDebtLikeItems"], v)} />
              <NumberField label="Transaction costs" value={input.bridge.transactionCosts} onChange={(v) => update(["bridge", "transactionCosts"], v)} />
              <NumberField label="Non-operating assets" value={input.bridge.nonOperatingAssets} onChange={(v) => update(["bridge", "nonOperatingAssets"], v)} />
              <div className="rounded-xl bg-slate-50 p-4 text-sm">Formula: EV + cash + non-operating assets - debt - leasing - other debt-like items - transaction costs = <strong>{money(model.bridge.equityValue, input.profile.currency)}</strong></div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5">
          <Card>
            <CardHeader><CardTitle>Private Company Discounts</CardTitle><CardDescription>Discounts compound multiplicatively to avoid double-counting retained value.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <NumberField label="Lack of marketability" value={input.discounts.lackOfMarketability} percent onChange={(v) => update(["discounts", "lackOfMarketability"], v)} />
              <NumberField label="Key-person discount" value={input.discounts.keyPersonDiscount} percent onChange={(v) => update(["discounts", "keyPersonDiscount"], v)} />
              <NumberField label="Customer concentration discount" value={input.discounts.customerConcentrationDiscount} percent onChange={(v) => update(["discounts", "customerConcentrationDiscount"], v)} />
              <div className="rounded-xl bg-slate-50 p-4 text-sm">Sequential equity discounts: key-person, customer concentration, then DLOM. Combined discount = 1 - Π(1 - discount) = <strong>{pct(model.discounts.combinedDiscountRate)}</strong><br />DLOM is applied only after the EV-to-equity bridge, not to enterprise value.</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>DCF Support Output</CardTitle><CardDescription>Intermediate calculations from projected operating performance to present value.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="chart-frame">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={model.dcf.forecastYears}><CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" /><XAxis dataKey="year" tick={chartAxisStyle} tickLine={false} axisLine={{ stroke: chartGridColor }} /><YAxis tick={chartAxisStyle} tickLine={false} axisLine={{ stroke: chartGridColor }} /><Tooltip contentStyle={chartTooltipStyle} formatter={(value) => chartMoney(value, input.profile.currency)} /><Legend /><Bar dataKey="freeCashFlow" name="FCF" fill="#0f766e" radius={[4, 4, 0, 0]} /><Bar dataKey="presentValueFcf" name="PV of FCF" fill="#0f3d5e" radius={[4, 4, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">PV of FCFs</p><p className="font-bold">{money(model.dcf.presentValueOfFcfs, input.profile.currency)}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">PV of TV</p><p className="font-bold">{money(model.dcf.terminalValue.presentValueTerminalValue, input.profile.currency)}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Discount amount</p><p className="font-bold">{money(model.discounts.totalDiscountAmount, input.profile.currency)}</p></div>
                <div className="rounded-xl bg-teal-50 p-4"><p className="text-xs text-teal-700">Adjusted equity</p><p className="font-bold text-teal-900">{money(model.discounts.adjustedEquityValue, input.profile.currency)}</p></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>DCF-only technical metrics</CardTitle>
              <CardDescription>Detailed income-approach outputs for advisors and analysts. The headline valuation range remains the blended view above.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <MetricCard label="DCF Enterprise Value" value={money(model.executiveSummary.enterpriseValue, input.profile.currency)} helper="Income-approach enterprise value" />
              <MetricCard label="DCF Equity Value" value={money(model.executiveSummary.equityValue, input.profile.currency)} helper="After EV-to-equity bridge" />
              <MetricCard label="DCF Adjusted Equity" value={money(model.executiveSummary.adjustedEquityValue, input.profile.currency)} helper="After private company adjustments" />
              <MetricCard label="EV / EBITDA" value={multiple(model.executiveSummary.evToNormalizedEbitda)} helper="EV divided by normalized EBITDA" />
              <MetricCard label="Equity / EBITDA" value={multiple(model.executiveSummary.equityToNormalizedEbitda)} helper="Equity value divided by normalized EBITDA" />
              <MetricCard label="Implied WACC" value={pct(model.executiveSummary.impliedWacc)} helper="Discount rate used in DCF" />
              <MetricCard label="Terminal Growth" value={pct(model.executiveSummary.terminalGrowth)} helper="Perpetual growth assumption" />
              <MetricCard label="TV / EV" value={pct(model.executiveSummary.terminalValueContribution)} helper="PV of terminal value as % of EV" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detailed DCF Table</CardTitle>
              <CardDescription>Forecast-year operating build from revenue through discounted FCFF.</CardDescription>
            </CardHeader>
            <CardContent className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead>
                  <tr className="border-b text-right text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 text-left">Forecast year</th><th>Revenue</th><th>EBITDA</th><th>EBIT</th><th>NOPAT</th><th>D&A</th><th>CAPEX</th><th>Change in NWC</th><th>FCFF</th><th>Discount Factor</th><th>PV of FCFF</th>
                  </tr>
                </thead>
                <tbody>
                  {model.dcf.forecastYears.map((year) => (
                    <tr key={year.year} className="border-b border-slate-100 text-right">
                      <td className="py-3 text-left font-semibold">{year.year}</td>
                      <td>{money(year.revenue, input.profile.currency)}</td>
                      <td>{money(year.ebitda, input.profile.currency)}</td>
                      <td>{money(year.ebit, input.profile.currency)}</td>
                      <td>{money(year.nopat, input.profile.currency)}</td>
                      <td>{money(year.depreciation, input.profile.currency)}</td>
                      <td>{money(year.capex, input.profile.currency)}</td>
                      <td>{money(year.changeInNwc, input.profile.currency)}</td>
                      <td className="font-semibold">{money(year.freeCashFlow, input.profile.currency)}</td>
                      <td>{year.discountFactor.toFixed(3)}</td>
                      <td className="font-semibold">{money(year.presentValueFcf, input.profile.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid gap-5">
            <Card>
              <CardHeader><CardTitle>Terminal Value Breakdown</CardTitle><CardDescription>Support for the selected terminal value method.</CardDescription></CardHeader>
              <CardContent>
                <OutputRow label="Final year FCFF" value={money(model.terminalBreakdown.finalYearFcff, input.profile.currency)} />
                <OutputRow label="Next year FCFF" value={money(model.terminalBreakdown.nextYearFcff, input.profile.currency)} />
                <OutputRow label="WACC" value={pct(model.terminalBreakdown.wacc)} />
                <OutputRow label="g" value={pct(model.terminalBreakdown.terminalGrowth)} />
                <OutputRow label="Terminal Value" value={money(model.terminalBreakdown.terminalValue, input.profile.currency)} />
                <OutputRow label="PV of Terminal Value" value={money(model.terminalBreakdown.presentValueTerminalValue, input.profile.currency)} emphasis />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>EV to Equity Bridge</CardTitle><CardDescription>Debt-free/cash-free conversion to equity value.</CardDescription></CardHeader>
              <CardContent>
                <OutputRow label="Enterprise Value" value={money(model.evToEquityBridge.enterpriseValue, input.profile.currency)} />
                <OutputRow label="Cash" value={money(model.evToEquityBridge.cash, input.profile.currency)} />
                <OutputRow label="Non-operating assets" value={money(model.evToEquityBridge.nonOperatingAssets, input.profile.currency)} />
                <OutputRow label="Debt" value={money(-model.evToEquityBridge.debt, input.profile.currency)} />
                <OutputRow label="Leasing" value={money(-model.evToEquityBridge.leasing, input.profile.currency)} />
                <OutputRow label="Other debt-like items" value={money(-model.evToEquityBridge.otherDebtLikeItems, input.profile.currency)} />
                <OutputRow label="Transaction costs" value={money(-model.evToEquityBridge.transactionCosts, input.profile.currency)} />
                <OutputRow label="Equity Value" value={money(model.evToEquityBridge.equityValue, input.profile.currency)} emphasis />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Private Company Adjustment Bridge</CardTitle><CardDescription>Equity-level discounts from marketable control value to adjusted equity value.</CardDescription></CardHeader>
              <CardContent>
                <OutputRow label="Equity Value before discounts" value={money(model.privateCompanyAdjustmentBridge.equityValueBeforeDiscounts, input.profile.currency)} />
                <OutputRow label="DLOM" value={money(-model.privateCompanyAdjustmentBridge.lackOfMarketabilityDiscountAmount, input.profile.currency)} />
                <OutputRow label="Key person discount" value={money(-model.privateCompanyAdjustmentBridge.keyPersonDiscountAmount, input.profile.currency)} />
                <OutputRow label="Customer concentration discount" value={money(-model.privateCompanyAdjustmentBridge.customerConcentrationDiscountAmount, input.profile.currency)} />
                <OutputRow label="Adjusted Equity Value" value={money(model.privateCompanyAdjustmentBridge.adjustedEquityValue, input.profile.currency)} emphasis />
              </CardContent>
            </Card>

            <Card className={model.warnings.length > 0 ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}>
              <CardHeader><CardTitle>Warnings</CardTitle><CardDescription>Automated checks for common DCF and private-company valuation issues.</CardDescription></CardHeader>
              <CardContent>
                {model.warnings.length > 0 ? (
                  <ul className="space-y-3 text-sm text-amber-950">
                    {model.warnings.map((warning) => <li key={warning.code} className="flex gap-2"><AlertCircle className="mt-0.5 shrink-0" size={16} /><span>{warning.message}</span></li>)}
                  </ul>
                ) : (
                  <p className="text-sm font-medium text-emerald-900">No valuation warnings triggered.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <WorkflowHeader id="market-approach" eyebrow="Method detail" title="Market Multiples" description="Source-traced EV/EBITDA and EV/Revenue evidence. AI helps select peers and rationale, but the numbers come from approved sources." status={workflowSections[6].status} />
        <Card>
          <CardHeader>
            <CardTitle>Market Approach</CardTitle>
            <CardDescription>Selected multiples convert normalized EBITDA and revenue into market enterprise value, then reconcile against DCF.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <NumberField label="Benchmark EV / EBITDA" value={input.marketMultiples.evEbitdaMultiple} onChange={(value) => updateMarketMultipleValue("evEbitdaMultiple", value)} />
              <NumberField label="Benchmark EV / Revenue" value={input.marketMultiples.evRevenueMultiple} onChange={(value) => updateMarketMultipleValue("evRevenueMultiple", value)} />
              <NumberField label="EV / EBITDA weighting" value={input.marketMultiples.ebitdaWeight} percent onChange={(value) => update(["marketMultiples", "ebitdaWeight"], value)} />
              <NumberField label="DCF blend weighting" value={input.marketMultiples.dcfWeight} percent onChange={(value) => update(["marketMultiples", "dcfWeight"], value)} />
            </div>

            <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-teal-950">Benchmark Assistant</p>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-teal-900">AI coordinates Damodaran, BizRaport and GPW/NewConnect peer selection. It writes rationale and checks; numeric valuation evidence must still come from source-traced data.</p>
                  {benchmarkAssistantStatus ? <p className="mt-2 text-xs font-semibold text-teal-800">{benchmarkAssistantStatus}</p> : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800" onClick={runBenchmarkAssistant}>Run benchmark assistant</button>
                  <button className="rounded-md border border-teal-300 bg-white px-4 py-2 text-sm font-bold text-teal-900 transition hover:bg-teal-100" onClick={useBenchmarkAssistantAsSource}>Attach rationale</button>
                  <button className="rounded-md border border-teal-300 bg-white px-4 py-2 text-sm font-bold text-teal-900 transition hover:bg-teal-100" onClick={reviewSuggestedPublicComps}>Review public comps</button>
                </div>
              </div>

              {benchmarkAssistant ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
                  <div className="rounded-md border border-teal-100 bg-white p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Suggested benchmark</p>
                        <p className="mt-1 text-base font-bold text-slate-950">{benchmarkAssistant.suggestedDamodaranIndustry ?? "Manual industry review needed"}</p>
                      </div>
                      <Badge className={benchmarkAssistant.damodaranConfidence === "high" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : benchmarkAssistant.damodaranConfidence === "medium" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-amber-200 bg-amber-50 text-amber-800"}>{benchmarkAssistant.damodaranConfidence}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{benchmarkAssistant.industryRationale}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{benchmarkAssistant.benchmarkRationale}</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {benchmarkAssistant.nextActions.slice(0, 4).map((action) => (
                        <div key={action} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-slate-700">{action}</div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-teal-100 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">BizRaport query</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{benchmarkAssistant.bizRaportRationale}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(benchmarkAssistant.bizRaportFilters).slice(0, 8).map(([key, value]) => (
                        <span key={key} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">{key}: {String(value)}</span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-teal-100 bg-white p-4 xl:col-span-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">GPW / NewConnect watchlist</p>
                      <Badge className="border-amber-200 bg-amber-50 text-amber-800">numbers pending source data</Badge>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {benchmarkAssistant.suggestedPublicComps.map((company) => (
                        <div key={`${company.market}-${company.ticker}`} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-slate-950">{company.ticker} · {company.companyName}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">{company.market}</p>
                            </div>
                            <Badge className="border-slate-200 bg-white text-slate-700">{company.inclusionStatus}</Badge>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-600">{company.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {benchmarkAssistant.sanityWarnings.length > 0 ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 xl:col-span-2">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">Sanity checks</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {benchmarkAssistant.sanityWarnings.map((warning) => (
                          <div key={`${warning.area}-${warning.message}`} className="rounded-md border border-amber-100 bg-white p-3 text-xs leading-5 text-amber-950">
                            <p className="font-bold">{warning.message}</p>
                            <p className="mt-1">{warning.suggestedAction}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-blue-950">Damodaran Europe benchmark</p>
                  <p className="mt-1 text-sm leading-6 text-blue-900">Use the 2026 Europe sector dataset for beta, WACC context, EV/EBITDA and EV/Sales. Values remain draft until approved.</p>
                  {damodaranEuropeStatus ? <p className="mt-2 text-xs font-semibold text-blue-800">{damodaranEuropeStatus}</p> : null}
                </div>
                <button className="rounded-md bg-blue-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800" onClick={fetchDamodaranEuropeBenchmark}>Use Damodaran Europe benchmark</button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                <div className="rounded-md border border-blue-100 bg-white p-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">Industry</p>
                  <p className="mt-1 break-words text-sm font-bold text-slate-950">{damodaranEuropeBenchmark?.damodaranIndustry ?? marketMultipleSource.damodaranIndustry ?? "Not loaded"}</p>
                </div>
                <div className="rounded-md border border-blue-100 bg-white p-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">Region</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">{damodaranEuropeBenchmark?.region ?? marketMultipleSource.region ?? "Europe"}</p>
                </div>
                <div className="rounded-md border border-blue-100 bg-white p-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">Beta</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">{damodaranEuropeBenchmark?.industry?.cashAdjustedUnleveredBeta ? damodaranEuropeBenchmark.industry.cashAdjustedUnleveredBeta.toFixed(2) : betaSource?.cashAdjustedBeta ? betaSource.cashAdjustedBeta.toFixed(2) : "N/M"}</p>
                </div>
                <div className="rounded-md border border-blue-100 bg-white p-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">Total beta</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">{damodaranEuropeBenchmark?.industry?.totalUnleveredBeta ? damodaranEuropeBenchmark.industry.totalUnleveredBeta.toFixed(2) : betaSource?.totalUnleveredBeta ? betaSource.totalUnleveredBeta.toFixed(2) : "N/M"}</p>
                </div>
                <div className="rounded-md border border-blue-100 bg-white p-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">WACC</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">{damodaranEuropeBenchmark?.industry?.costOfCapitalLocal ? pct(damodaranEuropeBenchmark.industry.costOfCapitalLocal) : betaSource?.costOfCapitalLocal ? pct(betaSource.costOfCapitalLocal) : "N/M"}</p>
                </div>
                <div className="rounded-md border border-blue-100 bg-white p-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">EV / EBITDA</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">{damodaranEuropeBenchmark?.industry?.positiveEbitdaEvEbitda ? multiple(damodaranEuropeBenchmark.industry.positiveEbitdaEvEbitda) : multiple(input.marketMultiples.evEbitdaMultiple)}</p>
                </div>
                <div className="rounded-md border border-blue-100 bg-white p-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">EV / Sales</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">{damodaranEuropeBenchmark?.industry?.evSales ? multiple(damodaranEuropeBenchmark.industry.evSales) : multiple(input.marketMultiples.evRevenueMultiple)}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-950">{marketMultipleIntelligence.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{marketMultipleIntelligence.summary}</p>
                  </div>
                  <Badge className={marketMultipleIntelligence.posture === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : marketMultipleIntelligence.posture === "draft" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-800"}>{marketMultipleIntelligence.posture}</Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Source type</Label>
                    <select className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100" value={marketMultipleSource.kind} onChange={(event) => updateMarketMultipleSource("kind", event.target.value as MarketMultipleSourceKind)}>
                      {marketMultipleSourceKindOptions.map((kind) => <option key={kind} value={kind}>{marketMultipleSourceKindLabel(kind)}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Source date</Label>
                    <Input value={marketMultipleSource.sourceDate} onChange={(event) => updateMarketMultipleSource("sourceDate", event.target.value)} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Source confidence</Label>
                    <select className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100" value={marketMultipleSource.confidence} onChange={(event) => updateMarketMultipleSource("confidence", event.target.value as MarketMultipleSource["confidence"])}>
                      <option value="low">Low - placeholder or weak support</option>
                      <option value="medium">Medium - analyst-reviewed source</option>
                      <option value="high">High - refreshed public or licensed source</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Source label</Label>
                    <Input value={marketMultipleSource.label} onChange={(event) => updateMarketMultipleSource("label", event.target.value)} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Source URL or note</Label>
                    <Input value={marketMultipleSource.sourceUrl ?? ""} onChange={(event) => updateMarketMultipleSource("sourceUrl", event.target.value)} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Rationale</Label>
                    <textarea className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100" value={marketMultipleSource.rationale} onChange={(event) => updateMarketMultipleSource("rationale", event.target.value)} />
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Badge className={marketMultipleSource.confidence === "low" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}>confidence {marketMultipleSource.confidence}</Badge>
                    <Badge className={marketMultipleSource.approvalStatus === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}>{marketMultipleSource.approvalStatus}</Badge>
                  </div>
                  <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800" onClick={approveMarketMultiples}>Approve selected multiples</button>
                </div>
              </div>

              <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
                <p className="text-sm font-bold text-teal-950">How to use AI here</p>
                <p className="mt-2 text-sm leading-6 text-teal-900">{marketMultipleIntelligence.aiAnalystRole}</p>
                <div className="mt-4 space-y-2">
                  {marketMultipleIntelligence.suggestedNextActions.map((action) => (
                    <div key={action} className="flex gap-2 rounded-md border border-teal-100 bg-white/70 p-3 text-xs leading-5 text-slate-700">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-teal-700" />
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>Market Indication</CardTitle><CardDescription>Weighted market EV from approved or draft benchmark multiples.</CardDescription></CardHeader>
                <CardContent>
                  <OutputRow label="Normalized EBITDA" value={money(model.valuationReport.marketValuation.normalizedEbitda, input.profile.currency)} />
                  <OutputRow label="Latest revenue" value={money(model.valuationReport.marketValuation.latestRevenue, input.profile.currency)} />
                  <OutputRow label="EV from EBITDA" value={money(model.valuationReport.marketValuation.impliedEvFromEbitda, input.profile.currency)} />
                  <OutputRow label="EV from revenue" value={money(model.valuationReport.marketValuation.impliedEvFromRevenue, input.profile.currency)} />
                  <OutputRow label="Weighted market EV" value={money(model.valuationReport.marketValuation.weightedMarketEnterpriseValue, input.profile.currency)} emphasis />
                  <OutputRow label="Market equity value" value={money(model.valuationReport.marketValuation.marketEquityBridge.equityValue, input.profile.currency)} emphasis />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>DCF vs. Market</CardTitle><CardDescription>Comparison of income approach and market approach indications.</CardDescription></CardHeader>
                <CardContent>
                  <OutputRow label="DCF EV" value={money(model.valuationReport.marketValuation.comparison.dcfEnterpriseValue, input.profile.currency)} />
                  <OutputRow label="Market EV" value={money(model.valuationReport.marketValuation.comparison.marketEnterpriseValue, input.profile.currency)} />
                  <OutputRow label="EV difference" value={pct(model.valuationReport.marketValuation.comparison.enterpriseValueDifferencePct)} emphasis />
                  <OutputRow label="DCF equity value" value={money(model.valuationReport.marketValuation.comparison.dcfEquityValue, input.profile.currency)} />
                  <OutputRow label="Market equity value" value={money(model.valuationReport.marketValuation.comparison.marketEquityValue, input.profile.currency)} />
                  <OutputRow label="Equity difference" value={pct(model.valuationReport.marketValuation.comparison.equityValueDifferencePct)} emphasis />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Method Reconciliation</CardTitle><CardDescription>Supporting comparison between DCF and market indications. The headline conclusion remains the range at the top.</CardDescription></CardHeader>
                <CardContent>
                  <OutputRow label="DCF weighting" value={pct(model.valuationReport.marketValuation.blendedValuation.dcfWeight)} />
                  <OutputRow label="Market weighting" value={pct(model.valuationReport.marketValuation.blendedValuation.marketWeight)} />
                  <OutputRow label="Illustrative method EV" value={money(model.valuationReport.marketValuation.blendedValuation.blendedEnterpriseValue, input.profile.currency)} emphasis />
                  <OutputRow label="Illustrative method equity" value={money(model.valuationReport.marketValuation.blendedValuation.blendedEquityValue, input.profile.currency)} emphasis />
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    {model.valuationReport.marketValuation.diagnostics.length > 0 ? model.valuationReport.marketValuation.diagnostics.map((diagnostic) => <p key={diagnostic.code}>{diagnostic.message} {diagnostic.suggestedAction}</p>) : <p>No market approach diagnostics triggered.</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <WorkflowHeader id="risk" eyebrow="Risk" title="Scenarios & Sensitivity" description="Compare Bear, Base, and Bull outcomes and review WACC / terminal growth sensitivity." status={workflowSections[7].status} />
        <Card>
          <CardHeader>
            <CardTitle>Bear / Base / Bull Scenario Analysis</CardTitle>
            <CardDescription>Scenario outputs apply pure assumption adjustments to revenue growth, EBITDA margin, WACC, terminal growth, and DLOM. Base equals current user inputs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead>
                  <tr className="border-b text-right text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 text-left">Scenario</th><th>Revenue growth adj.</th><th>EBITDA margin adj.</th><th>WACC adj.</th><th>Terminal g adj.</th><th>DLOM adj.</th><th>Enterprise Value</th><th>Equity Value</th><th>Adjusted Equity Value</th><th>EV / EBITDA</th><th>TV / EV</th><th>Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {model.scenarioAnalysis.map((scenario) => (
                    <tr key={scenario.name} className="border-b border-slate-100 text-right">
                      <td className="py-3 text-left font-semibold">{scenario.name}</td>
                      <td>{pct(scenario.assumptions.revenueGrowthAdjustment)}</td>
                      <td>{pct(scenario.assumptions.ebitdaMarginAdjustment)}</td>
                      <td>{pct(scenario.assumptions.waccAdjustment)}</td>
                      <td>{pct(scenario.assumptions.terminalGrowthAdjustment)}</td>
                      <td>{pct(scenario.assumptions.dlomAdjustment)}</td>
                      <td>{money(scenario.enterpriseValue, input.profile.currency)}</td>
                      <td>{money(scenario.equityValue, input.profile.currency)}</td>
                      <td className="font-semibold">{money(scenario.adjustedEquityValue, input.profile.currency)}</td>
                      <td>{multiple(scenario.evToEbitda)}</td>
                      <td>{pct(scenario.terminalValueContribution)}</td>
                      <td className="max-w-[220px] text-left text-amber-700">{scenario.warnings.length > 0 ? scenario.warnings.map((warning) => warning.message).join(" ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={model.scenarioAnalysis}>
                  <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={chartAxisStyle} tickLine={false} axisLine={{ stroke: chartGridColor }} />
                  <YAxis tick={chartAxisStyle} tickLine={false} axisLine={{ stroke: chartGridColor }} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => chartMoney(value, input.profile.currency)} />
                  <Legend />
                  <Bar dataKey="adjustedEquityValue" name="Adjusted Equity Value" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sensitivity Table</CardTitle><CardDescription>Adjusted equity value sensitivity to WACC and perpetual growth, using the Gordon growth method.</CardDescription></CardHeader>
          <CardContent className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr><th className="py-2 text-left">g \ WACC</th>{model.waccCases.map((item) => <th key={item} className="py-2 text-right">{pct(item)}</th>)}</tr></thead>
              <tbody>
                {model.sensitivity.map((row, rowIndex) => (
                  <tr key={model.growthCases[rowIndex]} className="border-t border-slate-100">
                    <td className="py-3 font-semibold text-slate-700">{pct(model.growthCases[rowIndex])}</td>
                    {row.map((cell) => <td key={`${cell.wacc}-${cell.terminalGrowth}`} className="py-3 text-right font-medium">{cell.isValid ? money(cell.adjustedEquityValue, input.profile.currency) : "N/M"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="chart-frame mt-6">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={model.dcf.forecastYears}><CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" /><XAxis dataKey="year" tick={chartAxisStyle} tickLine={false} axisLine={{ stroke: chartGridColor }} /><YAxis tick={chartAxisStyle} tickLine={false} axisLine={{ stroke: chartGridColor }} /><Tooltip contentStyle={chartTooltipStyle} formatter={(value) => chartMoney(value, input.profile.currency)} /><Legend /><Line type="monotone" dataKey="revenue" name="Revenue" stroke="#0f3d5e" strokeWidth={2.4} dot={{ r: 3 }} /><Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="#0f766e" strokeWidth={2.4} dot={{ r: 3 }} /></LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <WorkflowHeader id="diagnostics" eyebrow="Risk" title="Model Checks" description="Automated quality-control checks before relying on the valuation conclusion." status={workflowSections[8].status} />
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Valuation Diagnostics & Quality Control</CardTitle>
                <CardDescription>Professional QA checks grouped by severity across forecast, WACC, terminal value, bridge, discounts, and normalization.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge className={model.diagnostics.criticalCount > 0 ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>Critical: {model.diagnostics.criticalCount}</Badge>
                <Badge className={model.diagnostics.warningCount > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>Warnings: {model.diagnostics.warningCount}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {(["critical", "warning"] as const).map((severity) => (
              <div key={severity} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">{severity}</h4>
                  <Badge>{model.diagnostics.bySeverity[severity].length}</Badge>
                </div>
                {model.diagnostics.bySeverity[severity].length > 0 ? (
                  <div className="grid gap-3">
                    {model.diagnostics.bySeverity[severity].map((diagnostic) => (
                      <div key={diagnostic.code} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={severity === "critical" ? "border-red-200 bg-red-50 text-red-800" : severity === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700"}>{diagnostic.severity}</Badge>
                          <Badge className="border-slate-200 bg-white text-slate-700">{diagnostic.area}</Badge>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-950">{diagnostic.message}</p>
                        <p className="mt-1 text-sm text-slate-600">Suggested action: {diagnostic.suggestedAction}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No {severity} diagnostics triggered.</p>
                )}
              </div>
            ))}
            <details className="rounded-lg border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-bold uppercase tracking-wide text-slate-700">Info checks ({model.diagnostics.bySeverity.info.length})</summary>
              {model.diagnostics.bySeverity.info.length > 0 ? (
                <div className="mt-3 grid gap-3">
                  {model.diagnostics.bySeverity.info.map((diagnostic) => (
                    <div key={diagnostic.code} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border-slate-200 bg-white text-slate-700">{diagnostic.severity}</Badge>
                        <Badge className="border-slate-200 bg-white text-slate-700">{diagnostic.area}</Badge>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-950">{diagnostic.message}</p>
                      <p className="mt-1 text-sm text-slate-600">Suggested action: {diagnostic.suggestedAction}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No info diagnostics triggered.</p>
              )}
            </details>
          </CardContent>
        </Card>

        <WorkflowHeader id="export" eyebrow="Export" title="Export Package" description="Create a clean client-ready PDF report, copy the summary, or download model data for deeper review." status={workflowSections[9].status} />
        <Card>
          <CardHeader>
            <CardTitle>Export Valuation Package</CardTitle>
            <CardDescription>Use PDF for a polished review pack. JSON and CSV remain available for audit, handoff, and offline analysis.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800" onClick={openPdfReport}><FileDown size={17} />Create PDF report</button>
            <button className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-teal-600 hover:text-teal-800" onClick={copyReportSummary}>Copy report summary</button>
            <button className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-teal-600 hover:text-teal-800" onClick={downloadJsonReport}>Download JSON</button>
            <button className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-teal-600 hover:text-teal-800" onClick={downloadCsvReport}>Download CSV</button>
          </CardContent>
        </Card>
          </>
        )}
      </section>
    </main>
  );
}
