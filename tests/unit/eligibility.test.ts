import { describe, it, expect } from "vitest";
import {
  checkStockAvailability,
  isCartEligibleForCheckout,
  meetsMinimumOrderAmount,
  isValidMoroccanPhoneNumber,
  isOrderCancellable,
  validateDiscount,
} from "@/domain/eligibility";

describe("checkStockAvailability", () => {
  it("returns no issues when stock covers every requested item", () => {
    const cartItems = [{ productId: "p1", quantity: 2 }];
    const products = [{ id: "p1", stock: 5 }];

    expect(checkStockAvailability(cartItems, products)).toEqual([]);
  });

  it("reports an issue when quantity exceeds available stock", () => {
    const cartItems = [{ productId: "p1", quantity: 10 }];
    const products = [{ id: "p1", stock: 3 }];

    expect(checkStockAvailability(cartItems, products)).toEqual([
      { productId: "p1", requested: 10, available: 3 },
    ]);
  });

  it("treats an unknown product as having 0 stock", () => {
    const cartItems = [{ productId: "missing", quantity: 1 }];

    expect(checkStockAvailability(cartItems, [])).toEqual([
      { productId: "missing", requested: 1, available: 0 },
    ]);
  });

  it("allows a request exactly equal to available stock", () => {
    const cartItems = [{ productId: "p1", quantity: 5 }];
    const products = [{ id: "p1", stock: 5 }];

    expect(checkStockAvailability(cartItems, products)).toEqual([]);
  });

  it("returns no issues for an empty cart", () => {
    expect(checkStockAvailability([], [])).toEqual([]);
  });

  it("reports every under-stocked item across a multi-item cart", () => {
    const cartItems = [
      { productId: "p1", quantity: 2 },
      { productId: "p2", quantity: 10 },
    ];
    const products = [
      { id: "p1", stock: 5 },
      { id: "p2", stock: 4 },
    ];

    expect(checkStockAvailability(cartItems, products)).toEqual([
      { productId: "p2", requested: 10, available: 4 },
    ]);
  });
});

describe("isCartEligibleForCheckout", () => {
  it("returns false for an empty cart", () => {
    expect(isCartEligibleForCheckout([], [])).toBe(false);
  });

  it("returns true when all items are in stock", () => {
    const cartItems = [{ productId: "p1", quantity: 1 }];
    const products = [{ id: "p1", stock: 1 }];

    expect(isCartEligibleForCheckout(cartItems, products)).toBe(true);
  });

  it("returns false when any item is out of stock", () => {
    const cartItems = [{ productId: "p1", quantity: 2 }];
    const products = [{ id: "p1", stock: 1 }];

    expect(isCartEligibleForCheckout(cartItems, products)).toBe(false);
  });
});

describe("meetsMinimumOrderAmount", () => {
  it("returns true when the subtotal exceeds the minimum", () => {
    expect(meetsMinimumOrderAmount(5000, 3000)).toBe(true);
  });

  it("returns true when the subtotal exactly equals the minimum", () => {
    expect(meetsMinimumOrderAmount(3000, 3000)).toBe(true);
  });

  it("returns false when the subtotal is below the minimum", () => {
    expect(meetsMinimumOrderAmount(2999, 3000)).toBe(false);
  });

  it("returns true when the minimum is 0", () => {
    expect(meetsMinimumOrderAmount(0, 0)).toBe(true);
  });
});

describe("isValidMoroccanPhoneNumber", () => {
  it("accepts a valid Moroccan mobile number", () => {
    expect(isValidMoroccanPhoneNumber("+212600000001")).toBe(true);
  });

  it.each(["+212500000001", "+212700000001"])(
    "accepts other valid leading digits (%s)",
    (phone) => {
      expect(isValidMoroccanPhoneNumber(phone)).toBe(true);
    },
  );

  it("rejects a number missing the country code", () => {
    expect(isValidMoroccanPhoneNumber("0600000001")).toBe(false);
  });

  it("rejects a number with an invalid leading digit", () => {
    expect(isValidMoroccanPhoneNumber("+212800000001")).toBe(false);
  });

  it("rejects a number that is too short", () => {
    expect(isValidMoroccanPhoneNumber("+21260000")).toBe(false);
  });

  it("rejects a number that is too long", () => {
    expect(isValidMoroccanPhoneNumber("+2126000000011")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidMoroccanPhoneNumber("")).toBe(false);
  });
});

describe("isOrderCancellable", () => {
  it.each(["en préparation"] as const)("returns true for %s orders", (status) => {
    expect(isOrderCancellable(status)).toBe(true);
  });

  it.each(["livrée", "annulée", "retournée", "panier abandonné"] as const)(
    "returns false for %s orders",
    (status) => {
      expect(isOrderCancellable(status)).toBe(false);
    },
  );
});

describe("validateDiscount", () => {
  it("accepts an active discount with a valid percent", () => {
    expect(validateDiscount({ code: "PROMO10", percent: 10, active: true })).toBe(true);
  });

  it("rejects an inactive discount", () => {
    expect(validateDiscount({ code: "PROMO10", percent: 10, active: false })).toBe(false);
  });

  it("rejects a null or undefined discount", () => {
    expect(validateDiscount(null)).toBe(false);
    expect(validateDiscount(undefined)).toBe(false);
  });

  it("rejects a discount with a 0 percent", () => {
    expect(validateDiscount({ code: "ZERO", percent: 0, active: true })).toBe(false);
  });

  it("rejects a discount with a percent above 100", () => {
    expect(validateDiscount({ code: "TOOMUCH", percent: 150, active: true })).toBe(false);
  });

  it("accepts the boundary value of 100 percent", () => {
    expect(validateDiscount({ code: "FREE", percent: 100, active: true })).toBe(true);
  });
});
