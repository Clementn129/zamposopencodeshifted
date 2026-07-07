// Tax / VAT helpers for Zambian POS.
// Prices entered for products are treated as TAX-INCLUSIVE.
// We extract the tax portion at sale time based on business settings and
// per-product tax category (taxable / zero_rated / exempt).

export type TaxMode = 'none' | 'vat' | 'custom';
export type TaxCategory = 'taxable' | 'zero_rated' | 'exempt';

export interface BusinessTaxConfig {
  taxMode: TaxMode;
  vatRate: number;        // %, default 16
  customTaxName?: string | null;
  customTaxRate?: number | null;
}

export interface TaxLineInput {
  /** Final amount for this line after per-line AND proportional global discount (tax-inclusive). */
  lineAmount: number;
  taxCategory: TaxCategory;
}

export interface TaxBreakdown {
  /** Tax-exclusive amount (net subtotal). */
  netSubtotal: number;
  /** Tax (VAT or custom) total. */
  taxAmount: number;
  /** Grand total (== sum of line amounts; tax inclusive). */
  total: number;
  taxableAmount: number;     // inclusive taxable bucket
  zeroRatedAmount: number;
  exemptAmount: number;
  /** Effective rate used (%). 0 when mode is none. */
  rate: number;
  /** Friendly label for the tax (e.g. "VAT 16%", "Service Tax 5%"). */
  label: string;
}

export function getTaxRate(cfg: BusinessTaxConfig): number {
  if (cfg.taxMode === 'vat') return Number(cfg.vatRate) || 0;
  if (cfg.taxMode === 'custom') return Number(cfg.customTaxRate) || 0;
  return 0;
}

export function getTaxLabel(cfg: BusinessTaxConfig): string {
  const rate = getTaxRate(cfg);
  if (cfg.taxMode === 'vat') return `VAT ${rate}%`;
  if (cfg.taxMode === 'custom') return `${(cfg.customTaxName || 'Tax').trim()} ${rate}%`;
  return 'Tax';
}

/**
 * Calculate tax breakdown from line items.
 * Lines are expected to be tax-inclusive (matches the way owners enter prices).
 */
export function calculateTax(
  cfg: BusinessTaxConfig,
  lines: TaxLineInput[]
): TaxBreakdown {
  const total = lines.reduce((s, l) => s + (Number(l.lineAmount) || 0), 0);
  const rate = getTaxRate(cfg);
  const label = getTaxLabel(cfg);

  if (cfg.taxMode === 'none' || rate <= 0) {
    return {
      netSubtotal: total,
      taxAmount: 0,
      total,
      taxableAmount: 0,
      zeroRatedAmount: 0,
      exemptAmount: 0,
      rate: 0,
      label,
    };
  }

  let taxableAmount = 0;
  let zeroRatedAmount = 0;
  let exemptAmount = 0;
  let taxAmount = 0;

  for (const l of lines) {
    const amt = Number(l.lineAmount) || 0;
    switch (l.taxCategory) {
      case 'zero_rated':
        zeroRatedAmount += amt;
        break;
      case 'exempt':
        exemptAmount += amt;
        break;
      case 'taxable':
      default:
        taxableAmount += amt;
        taxAmount += (amt * rate) / (100 + rate);
        break;
    }
  }

  return {
    netSubtotal: total - taxAmount,
    taxAmount: round2(taxAmount),
    total: round2(total),
    taxableAmount: round2(taxableAmount),
    zeroRatedAmount: round2(zeroRatedAmount),
    exemptAmount: round2(exemptAmount),
    rate,
    label,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
