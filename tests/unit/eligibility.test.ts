import { describe, it, expect } from "vitest";
import { validateStock, validateDiscount, validateDeliveryCity } from "@/domain/eligibility";

describe("validateStock", () => {
  it("is valid when stock covers the requested quantity", () => {
    expect(validateStock(5, 2)).toEqual({ valid: true });
  });

  it("is valid when requested exactly equals stock", () => {
    expect(validateStock(5, 5)).toEqual({ valid: true });
  });

  it("is invalid when requested exceeds stock (rupture)", () => {
    const result = validateStock(3, 10);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("is invalid when requested is 0", () => {
    const result = validateStock(5, 0);
    expect(result.valid).toBe(false);
  });

  it("is invalid when requested is negative", () => {
    const result = validateStock(5, -1);
    expect(result.valid).toBe(false);
  });

  it("is invalid when stock is 0", () => {
    const result = validateStock(0, 1);
    expect(result.valid).toBe(false);
  });
});

describe("validateDiscount", () => {
  it("is valid when subtotal meets the minimum order amount", () => {
    expect(validateDiscount(300, 500)).toEqual({ valid: true });
  });

  it("is valid when subtotal exactly equals the minimum", () => {
    expect(validateDiscount(300, 300)).toEqual({ valid: true });
  });

  it("is invalid when subtotal is below the minimum order amount", () => {
    const result = validateDiscount(300, 100);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("is valid when the minimum order is 0", () => {
    expect(validateDiscount(0, 0)).toEqual({ valid: true });
  });
});

describe("validateDeliveryCity", () => {
  const allowedCities = ["Casablanca", "Rabat", "Marrakech"];

  it("is valid for a city in the allowed list", () => {
    expect(validateDeliveryCity("Rabat", allowedCities)).toEqual({ valid: true });
  });

  it("is invalid for a city outside the delivery grid", () => {
    const result = validateDeliveryCity("Paris", allowedCities);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("is invalid when the allowed cities list is empty", () => {
    const result = validateDeliveryCity("Casablanca", []);
    expect(result.valid).toBe(false);
  });
});
