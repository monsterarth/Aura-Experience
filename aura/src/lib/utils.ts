// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utilitário para combinar classes do Tailwind de forma inteligente,
 * evitando conflitos e permitindo condicionais limpas.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}