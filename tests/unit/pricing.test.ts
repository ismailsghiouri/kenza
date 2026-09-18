import { describe, it, expect } from "vitest";
import { calculateSubtotal, applyTax, applyDiscount, calculateTotal } from "@/domain/pricing";

describe("calculateSubtotal", () => {
  it("sums price * quantity across all items", () => {
    const items = [
      { price: 100, quantity: 2 },
      { price: 50, quantity: 4 },
    ];
    expect(calculateSubtotal(items)).toBe(400);
  });

  it("returns 0 for an empty cart", () => {
    expect(calculateSubtotal([])).toBe(0);
  });

  it("returns 0 when every item has quantity 0", () => {
    expect(calculateSubtotal([{ price: 100, quantity: 0 }])).toBe(0);
  });

  it("throws when a price is negative", () => {
    expect(() => calculateSubtotal([{ price: -10, quantity: 1 }])).toThrow();
  });

  it("throws when a quantity is negative", () => {
    expect(() => calculateSubtotal([{ price: 10, quantity: -1 }])).toThrow();
  });
});

describe("applyTax", () => {
  it("applies the default 20% tax rate", () => {
    expect(applyTax(1000)).toBe(200);
  });

  it("applies a custom tax rate", () => {
    expect(applyTax(1000, 0.1)).toBe(100);
  });

  it("returns 0 for a subtotal of 0", () => {
    expect(applyTax(0)).toBe(0);
  });

  it("returns 0 when the rate is 0", () => {
    expect(applyTax(1000, 0)).toBe(0);
  });

  it("throws when subtotal is negative", () => {
    expect(() => applyTax(-100)).toThrow();
  });

  it("throws when rate is negative", () => {
    expect(() => applyTax(1000, -0.2)).toThrow();
  });
});

describe("applyDiscount", () => {
  it("applies the requested percent when under the cap", () => {
    expect(applyDiscount(1000, 5)).toEqual({ amount: 50, capped: false, applied: 5 });
  });

  it("caps the discount when the requested percent exceeds maxPercent", () => {
    expect(applyDiscount(1000, 15, 10)).toEqual({ amount: 100, capped: true, applied: 10 });
  });

  it("applies exactly the default max of 10% when requested is higher", () => {
    expect(applyDiscount(1000, 50)).toEqual({ amount: 100, capped: true, applied: 10 });
  });

  it("is not capped when percent equals maxPercent", () => {
    expect(applyDiscount(1000, 10, 10)).toEqual({ amount: 100, capped: false, applied: 10 });
  });

  it("returns a 0 amount for a subtotal of 0", () => {
    expect(applyDiscount(0, 10)).toEqual({ amount: 0, capped: false, applied: 10 });
  });

  it("returns a 0 amount when percent is 0", () => {
    expect(applyDiscount(1000, 0)).toEqual({ amount: 0, capped: false, applied: 0 });
  });

  it("throws when subtotal is negative", () => {
    expect(() => applyDiscount(-100, 5)).toThrow();
  });

  it("throws when percent is negative", () => {
    expect(() => applyDiscount(1000, -5)).toThrow();
  });
});

describe("calculateTotal", () => {
  it("sums subtotal, tax and delivery fee, then subtracts the discount", () => {
    expect(calculateTotal(1000, 200, 30, 100)).toBe(1130);
  });

  it("handles all-zero inputs", () => {
    expect(calculateTotal(0, 0, 0, 0)).toBe(0);
  });

  it("never returns a negative total", () => {
    expect(calculateTotal(100, 0, 0, 500)).toBe(0);
  });
});
