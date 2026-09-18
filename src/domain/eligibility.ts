export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateStock(stock: number, requested: number): ValidationResult {
  if (requested <= 0) {
    return { valid: false, error: "Requested quantity must be greater than zero" };
  }
  if (stock < requested) {
    return {
      valid: false,
      error: `Insufficient stock: ${stock} available, ${requested} requested`,
    };
  }
  return { valid: true };
}

export function validateDiscount(minOrder: number, subtotal: number): ValidationResult {
  if (subtotal < minOrder) {
    return {
      valid: false,
      error: `Minimum order amount of ${minOrder} not met (subtotal: ${subtotal})`,
    };
  }
  return { valid: true };
}

export function validateDeliveryCity(city: string, allowedCities: string[]): ValidationResult {
  if (!allowedCities.includes(city)) {
    return { valid: false, error: `Delivery not available in ${city}` };
  }
  return { valid: true };
}
