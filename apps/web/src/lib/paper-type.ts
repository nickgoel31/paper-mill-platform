import { PaperType } from "@/generated/prisma/browser";

/** Display names for the two paper types the mill produces. */
export const PAPER_TYPE_LABELS: Record<PaperType, string> = {
  [PaperType.NATURAL]: "Natural",
  [PaperType.BY]: "BY",
};

export const PAPER_TYPES = Object.values(PaperType) as PaperType[];
