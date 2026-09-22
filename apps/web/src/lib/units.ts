import type { LengthUnit } from "@/generated/prisma/browser";

export type { LengthUnit };

export const CM_PER_INCH = 2.54;

export const UNIT_OPTIONS: LengthUnit[] = ["INCH", "CM"];

export function unitLabel(unit: LengthUnit): string {
  return unit === "CM" ? "cm" : "inch";
}

export function unitSuffix(unit: LengthUnit): string {
  return unit === "CM" ? " cm" : '"';
}

/** Convert a value in `unit` to its canonical-inches equivalent. */
export function toInches(value: number, unit: LengthUnit): number {
  return unit === "CM" ? value / CM_PER_INCH : value;
}

/** Convert a canonical-inches value to `unit`. */
export function fromInches(inches: number, unit: LengthUnit): number {
  return unit === "CM" ? inches * CM_PER_INCH : inches;
}

/** Convert a value between any two length units. */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value;
  return fromInches(toInches(value, from), to);
}

/**
 * Format a canonical-inches value for display in `unit` (defaults to inch, so
 * every existing call site that doesn't know about units keeps behaving exactly
 * as before).
 */
export function formatLength(inches: number | string | null | undefined, unit: LengthUnit = "INCH"): string {
  const num = typeof inches === "string" ? parseFloat(inches) : inches;
  if (num === null || num === undefined || isNaN(num)) return unit === "CM" ? "0.00 cm" : '0.00"';
  return `${fromInches(num, unit).toFixed(2)}${unitSuffix(unit)}`;
}
