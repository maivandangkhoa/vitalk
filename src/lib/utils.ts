import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function staggerDelay(index: number, baseDelay = 0.05): number {
  return index * baseDelay;
}

export const statusColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-600 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  completed: 'bg-sky-50 text-sky-600 border-sky-200',
  cancelled: 'bg-rose-50 text-rose-600 border-rose-200',
};

export const paymentStatusColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-600 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  failed: 'bg-rose-50 text-rose-600 border-rose-200',
  refunded: 'bg-zinc-50 text-zinc-500 border-zinc-200',
};
