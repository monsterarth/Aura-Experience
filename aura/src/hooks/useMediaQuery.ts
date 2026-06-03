"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe media query hook.
 * Returns `false` during SSR and the first client render (until mounted),
 * then reflects the real match — avoids hydration mismatches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True on phone-sized viewports (< 768px, i.e. below Tailwind's `md`). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
