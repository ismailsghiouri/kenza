export interface PricingItem {
  price: number;
  quantity: number;
}

export interface DiscountResult {
  amount: number;
  capped: boolean;
  applied: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateSubtotal(items: PricingItem[]): number {
  return round2(
    items.reduce((sum, item) => {
      if (item.price < 0 || item.quantity < 0) {
        throw new Error("price and quantity must be non-negative");
      }
      return sum + item.price * item.quantity;
    }, 0),
  );
}

export function applyTax(subtotal: number, rate: number = 0.2): number {
  if (subtotal < 0) {
    throw new Error("subtotal must be non-negative");
  }
  if (rate < 0) {
    throw new Error("rate must be non-negative");
  }
  return round2(subtotal * rate);
}

export function applyDiscount(
  subtotal: number,
  percent: number,
  maxPercent: number = 10,
): DiscountResult {
  if (subtotal < 0) {
    throw new Error("subtotal must be non-negative");
  }
  if (percent < 0) {
    throw new Error("percent must be non-negative");
  }

  const capped = percent > maxPercent;
  const applied = capped ? maxPercent : percent;

  return {
    amount: round2((subtotal * applied) / 100),
    capped,
    applied,
  };
}

export function calculateTotal(
  subtotal: number,
  tax: number,
  deliveryFee: number,
  discount: number,
): number {
  return Math.max(0, round2(subtotal + tax + deliveryFee - discount));
}
