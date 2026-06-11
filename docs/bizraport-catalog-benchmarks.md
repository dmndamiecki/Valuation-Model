# BizRaport Catalog Benchmark Layer

BizRaport `/api/katalog` is now treated as the low-cost peer screening source for Polish SME valuation benchmarks.

## Endpoint

`GET /api/company-data/bizraport/catalog`

Example:

```text
/api/company-data/bizraport/catalog?pkd_dzial=62&wojewodztwo=MAZOWIECKIE&przychody_od=1000000&przychody_do=50000000&limit=250&sample_limit=10
```

## Cost Control

- `limit` is capped at 5,000 even though BizRaport supports larger catalog exports.
- `sample_limit` is capped at 25.
- `sample_limit=0` returns only the peer KRS screen and does not call `/api/dane` for peer financials.
- Benchmark metrics are calculated only from the controlled `/api/dane` sample.

## Valuation Use

Use this layer to validate:

- EBITDA margin
- Operating margin
- Net and operating margin
- ROA / ROE
- Debt ratio
- Revenue scale
- Assets, equity and liabilities
- 3-year revenue CAGR where enough history is available
- Employee scale and labor intensity where available
- Geography, PKD, legal status, company age and activity-status filters

This should support diagnostics and forecast reasonableness checks before it is used in report output.

The catalog adapter now supports the broader documented API filter set, including operating revenue, operating profit, operating costs, tax, salaries, depreciation, estimated company value, latest filing year, registration year, activity start year, address/postal filters, territorial-unit flags and majority-shareholder flags. These are available for future peer-set construction but are not yet integrated into final valuation outputs.
