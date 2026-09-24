/**
 * The physical machine's reel counter wraps back to 1 after 9999, so the same
 * reelNumber string legitimately gets reused over time. `reelOccurrence`
 * (1 = first time this exact string was ever used) disambiguates repeats:
 * the 2nd use of "4639" displays as "A-4639", the 3rd as "B-4639", ... after
 * "Z" it continues "AA", "AB", ... (spreadsheet-column style). Each repeat
 * also gets a color tag so it stands out on the floor.
 */

const DUPLICATE_COLORS = [
  "red",
  "pink",
  "orange",
  "amber",
  "purple",
  "blue",
  "teal",
  "green",
  "indigo",
  "rose",
] as const;

export type ReelDuplicateColor = (typeof DUPLICATE_COLORS)[number];

/** 0-indexed -> "A", 25 -> "Z", 26 -> "AA", ... (bijective base-26). */
function bijectiveBase26(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

/** `null` for the first occurrence (no letter needed yet). */
export function reelOccurrenceLetter(occurrence: number): string | null {
  if (occurrence <= 1) return null;
  return bijectiveBase26(occurrence - 2);
}

/** `null` for the first occurrence (no color needed yet). */
export function reelOccurrenceColor(occurrence: number): ReelDuplicateColor | null {
  if (occurrence <= 1) return null;
  return DUPLICATE_COLORS[(occurrence - 2) % DUPLICATE_COLORS.length];
}

/** e.g. ("4639", 1) -> "4639"; ("4639", 2) -> "A-4639"; ("4639", 3) -> "B-4639". */
export function formatReelCode(reelNumber: string | null | undefined, occurrence: number): string {
  if (!reelNumber) return "";
  const letter = reelOccurrenceLetter(occurrence);
  return letter ? `${letter}-${reelNumber}` : reelNumber;
}

/** Literal Tailwind classes (JIT-safe — no dynamic class-name interpolation) per duplicate color. */
export const REEL_DUPLICATE_COLOR_CLASSES: Record<ReelDuplicateColor, string> = {
  red: "bg-red-50 text-red-700 border-red-200",
  pink: "bg-pink-50 text-pink-700 border-pink-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  teal: "bg-teal-50 text-teal-700 border-teal-200",
  green: "bg-green-50 text-green-700 border-green-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
};
