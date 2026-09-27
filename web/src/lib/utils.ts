import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeRandomId(prefix: string = 'id'): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    }
  } catch {}
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
