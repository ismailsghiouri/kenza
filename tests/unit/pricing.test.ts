import { describe, it, expect } from "vitest";
import {
  calculateLineItemTotal,
  calculateSubtotal,
  calculateDiscountAmount,
  calculateTaxAmount,
  calculateOrderTotal,
  formatPriceCents,
} from "@/domain/pricing";

describe("calculateLineItemTotal", () => {
  it("multiplies unit price by quantity", () => {
    expect(calculateLineItemTotal({ unitPriceCents: 1000, quantity: 3 })).toBe(3000);
  });
});

describe("calculateSubtotal", () => {
  it("sums the total of all line items", () => {
    const items = [
      { unitPriceCents: 1000, quantity: 2 },
      { unitPriceCents: 500, quantity: 4 },
    ];
    expect(calculateSubtotal(items)).toBe(4000);
  });

  it("returns 0 for an empty cart", () => {
    expect(calculateSubtotal([])).toBe(0);
  });
});

describe("calculateDiscountAmount", () => {
  it("computes a percentage discount rounded to the nearest cent", () => {
    expect(calculateDiscountAmount(1000, 10)).toBe(100);
    expect(calculateDiscountAmount(999, 10)).toBe(100);
  });

  it("returns 0 when discountPercent is 0", () => {
    expect(calculateDiscountAmount(1000, 0)).toBe(0);
  });

  it("throws when discountPercent is out of range", () => {
    expect(() => calculateDiscountAmount(1000, -1)).toThrow();
    expect(() => calculateDiscountAmount(1000, 101)).toThrow();
  });
});

describe("calculateTaxAmount", () => {
  it("computes tax rounded to the nearest cent", () => {
    expect(calculateTaxAmount(1000, 20)).toBe(200);
  });

  it("throws when taxRatePercent is negative", () => {
    expect(() => calculateTaxAmount(1000, -5)).toThrow();
  });
});

describe("calculateOrderTotal", () => {
  it("applies discount before tax and returns a full breakdown", () => {
    const items = [{ unitPriceCents: 1000, quantity: 2 }];

    const result = calculateOrderTotal(items, { discountPercent: 10, taxRatePercent: 20 });

    expect(result).toEqual({
      subtotalCents: 2000,
      discountCents: 200,
      taxCents: 360,
      totalCents: 2160,
    });
  });

  it("defaults to no discount and no tax", () => {
    const items = [{ unitPriceCents: 1500, quantity: 1 }];

    expect(calculateOrderTotal(items)).toEqual({
      subtotalCents: 1500,
      discountCents: 0,
      taxCents: 0,
      totalCents: 1500,
    });
  });
});

describe("formatPriceCents", () => {
  it("formats cents as a decimal amount with the default currency", () => {
    expect(formatPriceCents(2050)).toBe("20.50 MAD");
  });

  it("supports a custom currency", () => {
    expect(formatPriceCents(500, "EUR")).toBe("5.00 EUR");
  });
});
