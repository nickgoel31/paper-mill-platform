import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatWeightKg(kg: number | string | null | undefined): string {
  if (kg === null || kg === undefined) return "0.000 MT";
  const num = typeof kg === "string" ? parseFloat(kg) : kg;
  if (isNaN(num)) return "0.000 MT";
  return `${(num / 1000).toFixed(3)} MT (${num.toLocaleString("en-IN")} kg)`;
}

export function formatWidthInch(inch: number | string | null | undefined): string {
  if (inch === null || inch === undefined) return "0.00\"";
  const num = typeof inch === "string" ? parseFloat(inch) : inch;
  if (isNaN(num)) return "0.00\"";
  return `${num.toFixed(2)}"`;
}

export function formatTrimPercent(percent: number | string | null | undefined): {
  text: string;
  badgeClass: string;
} {
  if (percent === null || percent === undefined) {
    return { text: "0.00%", badgeClass: "bg-gray-100 text-gray-800" };
  }
  const num = typeof percent === "string" ? parseFloat(percent) : percent;
  if (isNaN(num)) {
    return { text: "0.00%", badgeClass: "bg-gray-100 text-gray-800" };
  }
  
  const text = `${num.toFixed(2)}%`;
  // Hero metric color rule: green < 3%, amber 3–6%, red > 6%
  if (num < 3.0) {
    return { text, badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" };
  } else if (num <= 6.0) {
    return { text, badgeClass: "bg-amber-100 text-amber-800 border-amber-300" };
  } else {
    return { text, badgeClass: "bg-red-100 text-red-800 border-red-300" };
  }
}

export function formatCurrencyINR(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "₹0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(num);
}
