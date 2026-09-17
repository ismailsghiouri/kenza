export interface PricingLineItem {
  unitPriceCents: number;
  quantity: number;
}

export interface OrderTotalOptions {
  discountPercent?: number;
  taxRatePercent?: number;
}

export interface OrderTotalBreakdown {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

export function calculateLineItemTotal(item: PricingLineItem): number {
  return item.unitPriceCents * item.quantity;
}

export function calculateSubtotal(items: PricingLineItem[]): number {
  return items.reduce((sum, item) => sum + calculateLineItemTotal(item), 0);
}

export function calculateDiscountAmount(subtotalCents: number, discountPercent: number): number {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error("discountPercent must be between 0 and 100");
  }
  return Math.round((subtotalCents * discountPercent) / 100);
}

export function calculateTaxAmount(amountCents: number, taxRatePercent: number): number {
  if (taxRatePercent < 0) {
    throw new Error("taxRatePercent must not be negative");
  }
  return Math.round((amountCents * taxRatePercent) / 100);
}

export function calculateOrderTotal(
  items: PricingLineItem[],
  options: OrderTotalOptions = {},
): OrderTotalBreakdown {
  const subtotalCents = calculateSubtotal(items);
  const discountCents = calculateDiscountAmount(subtotalCents, options.discountPercent ?? 0);
  const taxableCents = subtotalCents - discountCents;
  const taxCents = calculateTaxAmount(taxableCents, options.taxRatePercent ?? 0);
  const totalCents = taxableCents + taxCents;

  return { subtotalCents, discountCents, taxCents, totalCents };
}

export function formatPriceCents(cents: number, currency = "MAD"): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}
