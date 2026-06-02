export type CountryOption = {
  name: string;
  defaultCurrency: string;
};

export type CurrencyOption = {
  code: string;
  symbol: string;
  name: string;
};

export const countryOptions: CountryOption[] = [
  { name: "Poland", defaultCurrency: "PLN" },
  { name: "Germany", defaultCurrency: "EUR" },
  { name: "Czech Republic", defaultCurrency: "CZK" },
  { name: "Slovakia", defaultCurrency: "EUR" },
  { name: "Austria", defaultCurrency: "EUR" },
  { name: "United Kingdom", defaultCurrency: "GBP" },
  { name: "France", defaultCurrency: "EUR" },
  { name: "Italy", defaultCurrency: "EUR" },
  { name: "Spain", defaultCurrency: "EUR" },
  { name: "Netherlands", defaultCurrency: "EUR" },
  { name: "Sweden", defaultCurrency: "SEK" },
  { name: "Norway", defaultCurrency: "NOK" },
  { name: "Denmark", defaultCurrency: "DKK" },
  { name: "Finland", defaultCurrency: "EUR" },
  { name: "Switzerland", defaultCurrency: "CHF" },
  { name: "United States", defaultCurrency: "USD" },
  { name: "Canada", defaultCurrency: "CAD" },
  { name: "Australia", defaultCurrency: "AUD" },
];

export const currencyOptions: CurrencyOption[] = [
  { code: "PLN", symbol: "zł", name: "Polish zloty" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US dollar" },
  { code: "GBP", symbol: "£", name: "British pound" },
  { code: "CHF", symbol: "CHF", name: "Swiss franc" },
  { code: "CZK", symbol: "Kč", name: "Czech koruna" },
  { code: "SEK", symbol: "kr", name: "Swedish krona" },
  { code: "NOK", symbol: "kr", name: "Norwegian krone" },
  { code: "DKK", symbol: "kr", name: "Danish krone" },
  { code: "CAD", symbol: "$", name: "Canadian dollar" },
  { code: "AUD", symbol: "$", name: "Australian dollar" },
];

export const futureCompanyDataSources = [
  "KRS",
  "NIP",
  "REGON",
  "Companies House",
  "SEC",
  "BizRaport",
] as const;

export function getDefaultCurrencyForCountry(country: string) {
  return countryOptions.find((option) => option.name === country)?.defaultCurrency;
}

export function formatCurrencyOption(option: CurrencyOption) {
  return `${option.code} (${option.symbol}) — ${option.name}`;
}
