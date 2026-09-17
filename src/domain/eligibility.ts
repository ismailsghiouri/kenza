export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

export interface StockCheckItem {
  productId: string;
  quantity: number;
}

export interface ProductStock {
  id: string;
  stock: number;
}

export interface StockIssue {
  productId: string;
  requested: number;
  available: number;
}

export function checkStockAvailability(
  cartItems: StockCheckItem[],
  products: ProductStock[],
): StockIssue[] {
  const stockById = new Map(products.map((product) => [product.id, product.stock]));
  const issues: StockIssue[] = [];

  for (const item of cartItems) {
    const available = stockById.get(item.productId) ?? 0;
    if (item.quantity > available) {
      issues.push({ productId: item.productId, requested: item.quantity, available });
    }
  }

  return issues;
}

export function isCartEligibleForCheckout(
  cartItems: StockCheckItem[],
  products: ProductStock[],
): boolean {
  if (cartItems.length === 0) {
    return false;
  }
  return checkStockAvailability(cartItems, products).length === 0;
}

export function meetsMinimumOrderAmount(subtotalCents: number, minimumCents: number): boolean {
  return subtotalCents >= minimumCents;
}

const MOROCCAN_PHONE_REGEX = /^\+212[5-7]\d{8}$/;

export function isValidMoroccanPhoneNumber(phone: string): boolean {
  return MOROCCAN_PHONE_REGEX.test(phone);
}

const CANCELLABLE_STATUSES: ReadonlySet<OrderStatus> = new Set(["pending", "confirmed"]);

export function isOrderCancellable(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.has(status);
}
