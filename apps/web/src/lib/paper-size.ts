import { PaperSize } from "@/generated/prisma/browser";

/** Display names for the two reel/sheet sizes the mill produces. */
export const PAPER_SIZE_LABELS: Record<PaperSize, string> = {
  [PaperSize.BABY]: "Baby",
  [PaperSize.NORMAL]: "Normal",
};

export const PAPER_SIZES = Object.values(PaperSize) as PaperSize[];
