import type { ForecastYear } from "./forecast";
import type { TerminalValueAssumptions } from "./types";

export type DcfYear = ForecastYear & {
  discountFactor: number;
  presentValueFcf: number;
};

export type TerminalValueResult = {
  gordonSpread: number;
  isGordonGrowthValid: boolean;
  gordonTerminalValue: number;
  exitMultipleTerminalValue: number;
  selectedTerminalValue: number;
  presentValueTerminalValue: number;
};

export type DcfResult = {
  forecastYears: DcfYear[];
  terminalValue: TerminalValueResult;
  presentValueOfFcfs: number;
  enterpriseValue: number;
};

export function discountFactor(wacc: number, period: number): number {
  return 1 / Math.pow(1 + wacc, period);
}

export function calculateTerminalValue(
  years: ForecastYear[],
  wacc: number,
  terminal: TerminalValueAssumptions,
): TerminalValueResult {
  const finalYear = years[years.length - 1];
  const gordonSpread = wacc - terminal.perpetualGrowthRate;
  const isGordonGrowthValid = gordonSpread > 0;
  const gordonTerminalValue = isGordonGrowthValid
    ? (finalYear.freeCashFlow * (1 + terminal.perpetualGrowthRate)) / gordonSpread
    : Number.NaN;
  const exitMultipleTerminalValue = finalYear.ebitda * terminal.exitEbitdaMultiple;
  const selectedTerminalValue = terminal.method === "gordon" ? gordonTerminalValue : exitMultipleTerminalValue;
  const presentValueTerminalValue = selectedTerminalValue * discountFactor(wacc, years.length);

  return {
    gordonSpread,
    isGordonGrowthValid,
    gordonTerminalValue,
    exitMultipleTerminalValue,
    selectedTerminalValue,
    presentValueTerminalValue,
  };
}

export function calculateDcf(years: ForecastYear[], wacc: number, terminal: TerminalValueAssumptions): DcfResult {
  const forecastYears = years.map((year, index) => {
    const factor = discountFactor(wacc, index + 1);
    return { ...year, discountFactor: factor, presentValueFcf: year.freeCashFlow * factor };
  });
  const terminalValue = calculateTerminalValue(years, wacc, terminal);
  const presentValueOfFcfs = forecastYears.reduce((sum, year) => sum + year.presentValueFcf, 0);
  const enterpriseValue = presentValueOfFcfs + terminalValue.presentValueTerminalValue;

  return { forecastYears, terminalValue, presentValueOfFcfs, enterpriseValue };
}
