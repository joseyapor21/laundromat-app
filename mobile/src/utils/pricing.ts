/**
 * Pricing utility functions for the laundromat app
 */

/**
 * Round a number to the nearest quarter (0.25, 0.50, 0.75, 1.00)
 * @param value - The value to round
 * @returns The value rounded to the nearest quarter
 */
export function roundToNearestQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

/**
 * Calculate the price for a weight-based extra item
 *
 * Rules:
 * 1. Calculate proportional price: (weight / perWeightUnit) * pricePerUnit
 * 2. Apply minimum: The result should never be less than the base price (pricePerUnit)
 * 3. Round to nearest quarter (0.25, 0.50, 0.75, 1.00)
 *
 * Example:
 * - 20 lbs at $3.00 per 15 lbs = (20/15) * 3.00 = $4.00 (rounded to quarter)
 * - 10 lbs at $3.00 per 15 lbs = $3.00 (minimum applies, not $2.00)
 *
 * @param totalWeight - The total weight in pounds
 * @param perWeightUnit - The weight unit (e.g., 15 for "per 15 lbs")
 * @param pricePerUnit - The price per weight unit (e.g., 3.00 for "$3.00 per 15 lbs")
 * @returns The calculated price, rounded to nearest quarter, with minimum applied
 */
export function calculateWeightBasedPrice(
  totalWeight: number,
  perWeightUnit: number,
  pricePerUnit: number
): number {
  if (totalWeight <= 0 || perWeightUnit <= 0 || pricePerUnit <= 0) {
    return 0;
  }

  // Calculate proportional price
  const proportionalPrice = (totalWeight / perWeightUnit) * pricePerUnit;

  // Apply minimum: never less than the base price
  const priceWithMinimum = Math.max(proportionalPrice, pricePerUnit);

  // Round to nearest quarter
  return roundToNearestQuarter(priceWithMinimum);
}

/**
 * Calculate the quantity multiplier for weight-based items
 * This is used for display purposes (e.g., "x 1.33" for 20 lbs / 15 lbs)
 *
 * @param totalWeight - The total weight in pounds
 * @param perWeightUnit - The weight unit (e.g., 15 for "per 15 lbs")
 * @returns The quantity multiplier (minimum 1)
 */
export function calculateWeightBasedQuantity(
  totalWeight: number,
  perWeightUnit: number
): number {
  if (totalWeight <= 0 || perWeightUnit <= 0) {
    return 0;
  }

  // Calculate proportional quantity, but minimum is 1 (matches the minimum price logic)
  const proportionalQty = totalWeight / perWeightUnit;
  return Math.max(proportionalQty, 1);
}
