"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Building2, Calculator, LineChart as LineChartIcon } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateEquityBridge, calculatePrivateCompanyDiscounts } from "@/lib/valuation/bridge";
import { calculateDcf } from "@/lib/valuation/dcf";
import { calculateValuationDiagnostics } from "@/lib/valuation/diagnostics";
import { buildCombinedCsvExport, buildReportJson, buildReportSummaryText, buildValuationReport } from "@/lib/valuation/export";
import { defaultValuationInput } from "@/lib/valuation/default-data";
import { calculateNormalizationMarginUplift, forecastFinancials, normalizeLatestEbitda, sumNormalizationAdjustments } from "@/lib/valuation/forecast";
import {
  calculateEvToEquityBridgeOutput,
  calculateExecutiveSummary,
  calculatePrivateCompanyAdjustmentBridge,
  calculateTerminalValueBreakdown,
  calculateValuationWarnings,
} from "@/lib/valuation/output";
import { calculateScenarioAnalysis } from "@/lib/valuation/scenarios";
import { buildCenteredSensitivityCases, buildSensitivityTable } from "@/lib/valuation/sensitivity";
import { valuationInputSchema, type ValuationInput } from "@/lib/valuation/types";
import { calculateWacc } from "@/lib/valuation/wacc";

type PercentArrayKey = "revenueGrowth" | "ebitdaMargin" | "depreciationPctRevenue" | "capexPctRevenue";

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

function WorkflowHeader({ id, eyebrow, title, description, status }: { id: string; eyebrow: string; title: string; description: string; status: WorkflowStatus }) {
  return (
    <div id={id} className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">{eyebrow}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function WorkflowNav({ sections }: { sections: WorkflowSectionItem[] }) {
  return (
    <nav className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="flex min-w-max items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-500 hover:text-teal-800">
            <span>{section.label}</span>
            <span className={`rounded-full px-2 py-0.5 ${statusClassName(section.status)}`}>{section.status}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

type ScalarPath =
  | ["profile", "name" | "industry" | "currency" | "valuationDate"]
  | ["forecast", "taxRate"]
  | ["wacc", keyof ValuationInput["wacc"]]
  | ["terminalValue", "perpetualGrowthRate" | "exitEbitdaMultiple"]
  | ["bridge", keyof ValuationInput["bridge"]]
  | ["discounts", keyof ValuationInput["discounts"]]
  | ["marketMultiples", keyof ValuationInput["marketMultiples"]];

const currencyFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

function money(value: number, currency = "USD") {
  return Number.isFinite(value) ? `${currency} ${currencyFormatter.format(value)}` : "N/M";
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

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
        <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
        <p className="mt-2 text-sm text-slate-500">{helper}</p>
      </CardContent>
    </Card>
  );
}

function OutputRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 border-b border-slate-100 py-2 text-sm ${emphasis ? "font-bold text-slate-950" : "text-slate-700"}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
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
  const [input, setInput] = useState<ValuationInput>(defaultValuationInput);

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
    return { forecastYears, wacc, dcf, bridge, discounts, executiveSummary, terminalBreakdown, evToEquityBridge, privateCompanyAdjustmentBridge, warnings, scenarioAnalysis, diagnostics, waccCases, growthCases, sensitivity, valuationReport };
  }, [input]);

  function update(path: ScalarPath, value: string | number) {
    setInput((current) => ({
      ...current,
      [path[0]]: { ...current[path[0]], [path[1]]: value },
    }));
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

  const normalizedEbitda = normalizeLatestEbitda(input.historicals, input.normalizationAdjustments);
  const adjustmentTotal = sumNormalizationAdjustments(input.normalizationAdjustments);
  const normalizationMarginUplift = calculateNormalizationMarginUplift(input.historicals, input.normalizationAdjustments);
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

  return (
    <main className="min-h-screen px-6 py-8 lg:px-10">
      <section className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-8 text-white shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge className="border-teal-400/30 bg-teal-400/10 text-teal-100">DCF valuation MVP</Badge>
              <h1 className="mt-5 max-w-4xl text-4xl font-bold tracking-tight lg:text-5xl">SME private company valuation model</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
                Local-only Next.js model with Zod validation, transparent assumptions, pure valuation functions, and an investor-ready output bridge from enterprise value to adjusted equity value.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-slate-300">
              <div className="flex items-center gap-2"><Building2 size={18} /> {input.profile.name}</div>
              <div className="flex items-center gap-2"><Calculator size={18} /> Currency: {input.profile.currency} in 000s</div>
              <div className="flex items-center gap-2"><LineChartIcon size={18} /> Valuation date: {input.profile.valuationDate}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <MetricCard label="Enterprise Value" value={money(model.dcf.enterpriseValue, input.profile.currency)} helper="PV of explicit FCFs plus PV of terminal value" />
          <MetricCard label="Equity Value" value={money(model.bridge.equityValue, input.profile.currency)} helper="Enterprise value plus cash and assets less debt and costs" />
          <MetricCard label="Adjusted Equity Value" value={money(model.discounts.adjustedEquityValue, input.profile.currency)} helper="After marketability, key-person, and customer concentration discounts" />
        </div>

        {!validation.success && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="flex gap-3 p-4 text-sm text-amber-900">
              <AlertCircle className="mt-0.5" size={18} />
              <span>Zod validation is active. Please review assumptions: {validation.error.issues.map((issue) => issue.path.join(".")).join(", ")}</span>
            </CardContent>
          </Card>
        )}

        <WorkflowNav sections={workflowSections} />

        <WorkflowHeader id="company" eyebrow="Workflow 1" title="Company" description="Identify the business, currency, and valuation date before building the analysis." status={workflowSections[0].status} />
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card>
            <CardHeader>
              <CardTitle>1. Company Profile</CardTitle>
              <CardDescription>Core identifying inputs for the valuation memorandum.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Company name</Label><Input value={input.profile.name} onChange={(e) => update(["profile", "name"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Industry</Label><Input value={input.profile.industry} onChange={(e) => update(["profile", "industry"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><Input value={input.profile.currency} onChange={(e) => update(["profile", "currency"], e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Valuation date</Label><Input value={input.profile.valuationDate} onChange={(e) => update(["profile", "valuationDate"], e.target.value)} /></div>
            </CardContent>
          </Card>
        </div>

        <WorkflowHeader id="historical-financials" eyebrow="Workflow 2" title="Historical Financials" description="Capture the three-year historical baseline used for revenue, profitability, capex, and working capital context." status={workflowSections[1].status} />
        <Card>
          <CardHeader>
            <CardTitle>Historical Financials for 3 Years</CardTitle>
            <CardDescription>Actual results establish the revenue base, latest working capital, and profitability context.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
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

        <WorkflowHeader id="normalization" eyebrow="Workflow 3" title="Normalization" description="Review owner, non-recurring, and run-rate EBITDA adjustments that flow into forecast margins." status={workflowSections[2].status} />
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
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

        <WorkflowHeader id="forecast" eyebrow="Workflow 4" title="Forecast" description="Set operating assumptions for revenue, EBITDA, taxes, capex, and working capital over the explicit forecast period." status={workflowSections[3].status} />
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Forecast Assumptions for 5 Years</CardTitle>
              <CardDescription>FCFF formula: revenue × normalized EBITDA margin - cash taxes + D&A - capex - change in net working capital.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="py-2">Assumption</th>{model.forecastYears.map((y) => <th key={y.year}>{y.year}</th>)}</tr></thead>
                <tbody>
                  {[
                    ["Revenue growth", "revenueGrowth"],
                    ["Base EBITDA margin", "ebitdaMargin"],
                    ["D&A / revenue", "depreciationPctRevenue"],
                    ["Capex / revenue", "capexPctRevenue"],
                  ].map(([label, key]) => (
                    <tr key={key} className="border-b border-slate-100"><td className="py-3 font-medium">{label}</td>{input.forecast[key as PercentArrayKey].map((value, index) => <td key={index} className="pr-2"><NumberField label="" value={value} percent onChange={(next) => updateForecastArray(key as PercentArrayKey, index, next)} /></td>)}</tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 max-w-xs"><NumberField label="Tax rate" value={input.forecast.taxRate} percent onChange={(value) => update(["forecast", "taxRate"], value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>5. Working Capital Assumptions</CardTitle>
              <CardDescription>NWC is modeled as a percentage of revenue; cash flow impact is the period-over-period change.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-5">
                {input.workingCapital.nwcPctRevenue.map((value, index) => <NumberField key={index} label={`${model.forecastYears[index].year}`} value={value} percent onChange={(next) => updateWorkingCapital(index, next)} />)}
              </div>
              <ResponsiveContainer width="100%" height={240} className="mt-6">
                <AreaChart data={model.forecastYears}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis /><Tooltip formatter={(v: number) => money(v, input.profile.currency)} /><Area dataKey="freeCashFlow" name="Free Cash Flow" fill="#0f766e" stroke="#0f766e" fillOpacity={0.18} /></AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <WorkflowHeader id="wacc" eyebrow="Workflow 5" title="WACC" description="Build the discount rate using market inputs, private-company risk premia, capital structure, and tax assumptions." status={workflowSections[4].status} />
        <div className="grid gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>WACC Assumptions</CardTitle><CardDescription>Cost of equity = Rf + beta × ERP + size premium + CSRP.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <NumberField label="Risk-free rate" value={input.wacc.riskFreeRate} percent onChange={(v) => update(["wacc", "riskFreeRate"], v)} />
              <NumberField label="Equity risk premium" value={input.wacc.equityRiskPremium} percent onChange={(v) => update(["wacc", "equityRiskPremium"], v)} />
              <NumberField label="Beta" value={input.wacc.beta} onChange={(v) => update(["wacc", "beta"], v)} />
              <NumberField label="Size premium" value={input.wacc.sizePremium} percent onChange={(v) => update(["wacc", "sizePremium"], v)} />
              <NumberField label="Company-specific premium" value={input.wacc.companySpecificRiskPremium} percent onChange={(v) => update(["wacc", "companySpecificRiskPremium"], v)} />
              <NumberField label="Pre-tax cost of debt" value={input.wacc.preTaxCostOfDebt} percent onChange={(v) => update(["wacc", "preTaxCostOfDebt"], v)} />
              <NumberField label="Target debt / capital" value={input.wacc.targetDebtPctCapital} percent onChange={(v) => update(["wacc", "targetDebtPctCapital"], v)} />
              <div className="rounded-xl bg-slate-50 p-4 text-sm">WACC = {pct(model.wacc.equityWeight)} × {pct(model.wacc.costOfEquity)} + {pct(model.wacc.debtWeight)} × after-tax debt cost {pct(model.wacc.afterTaxCostOfDebt)} = <strong>{pct(model.wacc.wacc)}</strong><br />After-tax debt cost uses the forecast tax rate of {pct(input.forecast.taxRate)}.</div>
            </CardContent>
          </Card>
        </div>

        <WorkflowHeader id="dcf" eyebrow="Workflow 6" title="DCF" description="Review terminal value, EV-to-equity bridge, private-company discounts, and full DCF output schedules." status={workflowSections[5].status} />
        <div className="grid gap-6 xl:grid-cols-2">
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
            <CardHeader><CardTitle>8. EV to Equity Bridge</CardTitle><CardDescription>Equity value = EV + cash + non-operating assets - debt - leasing - other debt-like items - transaction costs.</CardDescription></CardHeader>
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

        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader><CardTitle>9. Private Company Discounts</CardTitle><CardDescription>Discounts compound multiplicatively to avoid double-counting retained value.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <NumberField label="Lack of marketability" value={input.discounts.lackOfMarketability} percent onChange={(v) => update(["discounts", "lackOfMarketability"], v)} />
              <NumberField label="Key-person discount" value={input.discounts.keyPersonDiscount} percent onChange={(v) => update(["discounts", "keyPersonDiscount"], v)} />
              <NumberField label="Customer concentration discount" value={input.discounts.customerConcentrationDiscount} percent onChange={(v) => update(["discounts", "customerConcentrationDiscount"], v)} />
              <div className="rounded-xl bg-slate-50 p-4 text-sm">Sequential equity discounts: key-person, customer concentration, then DLOM. Combined discount = 1 - Π(1 - discount) = <strong>{pct(model.discounts.combinedDiscountRate)}</strong><br />DLOM is applied only after the EV-to-equity bridge, not to enterprise value.</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>10. Valuation Output</CardTitle><CardDescription>Intermediate calculations from projected operating performance to present value.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={model.dcf.forecastYears}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis /><Tooltip formatter={(v: number) => money(v, input.profile.currency)} /><Legend /><Bar dataKey="freeCashFlow" name="FCF" fill="#0f766e" /><Bar dataKey="presentValueFcf" name="PV of FCF" fill="#0f3d5e" /></BarChart>
              </ResponsiveContainer>
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge>Professional valuation output</Badge>
              <h2 className="mt-3 text-2xl font-bold text-slate-950">Investment committee summary</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">A finance-ready output pack with headline valuation metrics, detailed DCF mechanics, terminal value support, bridge schedules, private company adjustments, automated methodology warnings, and exportable report files.</p>
            </div>
            <a href="#export" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800">Go to export</a>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Valuation Conclusion</CardTitle>
              <CardDescription>Generated from the structured valuation report object.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard label="Base Adjusted Equity" value={money(model.valuationReport.valuationConclusion.baseAdjustedEquityValue, input.profile.currency)} helper="Current user inputs" />
                <MetricCard label="Bear Case" value={money(model.valuationReport.valuationConclusion.bearAdjustedEquityValue, input.profile.currency)} helper="Downside scenario" />
                <MetricCard label="Bull Case" value={money(model.valuationReport.valuationConclusion.bullAdjustedEquityValue, input.profile.currency)} helper="Upside scenario" />
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                {model.valuationReport.valuationConclusion.keyValuationDrivers.map((driver) => <p key={driver}>{driver}</p>)}
                <p className="mt-3 font-medium text-slate-950">{model.valuationReport.valuationConclusion.methodologyNote}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Executive Summary</CardTitle>
              <CardDescription>Headline valuation conclusion and implied trading metrics.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Enterprise Value" value={money(model.executiveSummary.enterpriseValue, input.profile.currency)} helper="DCF enterprise value" />
              <MetricCard label="Equity Value" value={money(model.executiveSummary.equityValue, input.profile.currency)} helper="After EV-to-equity bridge" />
              <MetricCard label="Adjusted Equity Value" value={money(model.executiveSummary.adjustedEquityValue, input.profile.currency)} helper="After private company adjustments" />
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
            <CardContent className="overflow-x-auto">
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

          <div className="grid gap-6 xl:grid-cols-2">
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

        <WorkflowHeader id="market-approach" eyebrow="Workflow 7" title="Market Approach" description="Use manually entered benchmark EV/EBITDA and EV/Revenue multiples to triangulate DCF indications." status={workflowSections[6].status} />
        <Card>
          <CardHeader>
            <CardTitle>Market Approach</CardTitle>
            <CardDescription>Manual benchmark multiples converted to market enterprise value, market equity value, and blended DCF / market valuation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <NumberField label="Benchmark EV / EBITDA" value={input.marketMultiples.evEbitdaMultiple} onChange={(value) => update(["marketMultiples", "evEbitdaMultiple"], value)} />
              <NumberField label="Benchmark EV / Revenue" value={input.marketMultiples.evRevenueMultiple} onChange={(value) => update(["marketMultiples", "evRevenueMultiple"], value)} />
              <NumberField label="EV / EBITDA weighting" value={input.marketMultiples.ebitdaWeight} percent onChange={(value) => update(["marketMultiples", "ebitdaWeight"], value)} />
              <NumberField label="DCF blend weighting" value={input.marketMultiples.dcfWeight} percent onChange={(value) => update(["marketMultiples", "dcfWeight"], value)} />
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>Market Multiple Calculation</CardTitle><CardDescription>Weighted market EV from manually selected benchmark multiples.</CardDescription></CardHeader>
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
                <CardHeader><CardTitle>Blended Valuation</CardTitle><CardDescription>Example weighting combines DCF and market approach indications.</CardDescription></CardHeader>
                <CardContent>
                  <OutputRow label="DCF weighting" value={pct(model.valuationReport.marketValuation.blendedValuation.dcfWeight)} />
                  <OutputRow label="Market weighting" value={pct(model.valuationReport.marketValuation.blendedValuation.marketWeight)} />
                  <OutputRow label="Blended EV" value={money(model.valuationReport.marketValuation.blendedValuation.blendedEnterpriseValue, input.profile.currency)} emphasis />
                  <OutputRow label="Blended equity value" value={money(model.valuationReport.marketValuation.blendedValuation.blendedEquityValue, input.profile.currency)} emphasis />
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    {model.valuationReport.marketValuation.diagnostics.length > 0 ? model.valuationReport.marketValuation.diagnostics.map((diagnostic) => <p key={diagnostic.code}>{diagnostic.message} {diagnostic.suggestedAction}</p>) : <p>No market approach diagnostics triggered.</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <WorkflowHeader id="scenarios-sensitivity" eyebrow="Workflow 8" title="Scenarios & Sensitivity" description="Compare Bear, Base, and Bull outcomes and review WACC / terminal growth sensitivity." status={workflowSections[7].status} />
        <Card>
          <CardHeader>
            <CardTitle>Bear / Base / Bull Scenario Analysis</CardTitle>
            <CardDescription>Scenario outputs apply pure assumption adjustments to revenue growth, EBITDA margin, WACC, terminal growth, and DLOM. Base equals current user inputs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="overflow-x-auto">
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
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={model.scenarioAnalysis}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value: number) => money(value, input.profile.currency)} />
                <Legend />
                <Bar dataKey="adjustedEquityValue" name="Adjusted Equity Value" fill="#0f766e" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sensitivity Table</CardTitle><CardDescription>Adjusted equity value sensitivity to WACC and perpetual growth, using the Gordon growth method.</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto">
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
            <ResponsiveContainer width="100%" height={240} className="mt-6">
              <LineChart data={model.dcf.forecastYears}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis /><Tooltip formatter={(v: number) => money(v, input.profile.currency)} /><Legend /><Line type="monotone" dataKey="revenue" name="Revenue" stroke="#0f3d5e" strokeWidth={2} /><Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="#0f766e" strokeWidth={2} /></LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <WorkflowHeader id="diagnostics" eyebrow="Workflow 9" title="Diagnostics" description="Review automated quality-control checks before relying on the valuation conclusion." status={workflowSections[8].status} />
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
            {(["critical", "warning", "info"] as const).map((severity) => (
              <div key={severity} className="rounded-2xl border border-slate-200 bg-white p-4">
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
          </CardContent>
        </Card>

        <WorkflowHeader id="export" eyebrow="Workflow 10" title="Export" description="Copy the valuation summary or download the full local model as JSON and CSV files. No server-side APIs are used." status={workflowSections[9].status} />
        <Card>
          <CardHeader>
            <CardTitle>Export Valuation Package</CardTitle>
            <CardDescription>Export the structured valuation report and supporting tables for review, sharing, or offline analysis.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <button className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-600 hover:text-teal-800" onClick={copyReportSummary}>Copy report summary</button>
            <button className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-600 hover:text-teal-800" onClick={downloadJsonReport}>Download JSON</button>
            <button className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800" onClick={downloadCsvReport}>Download CSV</button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
