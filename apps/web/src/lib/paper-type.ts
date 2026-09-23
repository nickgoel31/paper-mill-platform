/**
 * Fallback display labels for paper types not (yet) given a custom label in
 * the mill's Paper Types master data (Masters → Paper Types). Paper type is
 * no longer a fixed enum — components should prefer the dynamic
 * `{ value, label }[]` list from `getPaperTypeChoices()` and only fall back
 * to this map (or the raw value) when that list isn't available.
 */
export const PAPER_TYPE_LABELS: Record<string, string> = {
  NATURAL: "Natural",
  BY: "BY",
};
