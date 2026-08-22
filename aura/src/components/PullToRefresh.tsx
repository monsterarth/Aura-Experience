"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 72;

/**
 * Puxar-para-atualizar do PWA instalado. Só dispara quando o container de scroll
 * em que o toque começou está no topo — o admin rola num container interno
 * (`[data-scroll-root]`), não no documento — e nunca com overlay aberto nem
 * dentro de áreas marcadas `data-no-ptr` (kanbans, mapas, scroll horizontal).
 */
export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      !!(window.navigator as unknown as { standalone?: boolean }).standalone;
    if (!isStandalone) return;

    const scrollTopAt = (target: EventTarget | null): number => {
      const el = target instanceof Element ? target : null;
      const root = el?.closest<HTMLElement>("[data-scroll-root]");
      if (root) return root.scrollTop;
      return document.documentElement.scrollTop || document.body.scrollTop;
    };

    const blocked = (target: EventTarget | null): boolean => {
      if (document.querySelector("[data-overlay-open]")) return true;
      const el = target instanceof Element ? target : null;
      return !!el?.closest("[data-no-ptr], [role=dialog], .ak-layer");
    };

    const onTouchStart = (e: TouchEvent) => {
      if (blocked(e.target)) { startYRef.current = null; return; }
      if (scrollTopAt(e.target) === 0) startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta > 0) {
        const d = Math.min(Math.sqrt(delta) * 8, THRESHOLD * 1.4);
        pullDistanceRef.current = d;
        setPullDistance(d);
      }
    };

    const onTouchEnd = () => {
      if (pullDistanceRef.current >= THRESHOLD) {
        setRefreshing(true);
        window.location.reload();
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        startYRef.current = null;
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const ready = progress >= 1;
  const indicatorY = refreshing ? 12 : Math.min(pullDistance * 0.7, 56) - 36;

  return (
    <>
      {(pullDistance > 4 || refreshing) && (
        <div
          className="fixed top-0 left-1/2 z-[9999] pointer-events-none"
          style={{
            transform: `translateX(-50%) translateY(${indicatorY}px)`,
            transition: pullDistance === 0 ? "transform 0.25s ease" : "none",
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          <div
            className="rounded-full p-2.5 shadow-xl transition-colors duration-150"
            style={{ background: "#1c1c1c", border: `1px solid ${ready ? "#9b6dff" : "rgba(255,255,255,0.12)"}` }}
          >
            <RefreshCw
              size={18}
              className={`transition-colors duration-150 ${refreshing ? "animate-spin" : ""}`}
              style={{ color: ready ? "#9b6dff" : "rgba(255,255,255,0.45)", ...(!refreshing ? { transform: `rotate(${progress * 320}deg)` } : {}) }}
            />
          </div>
        </div>
      )}
      {children}
    </>
  );
}
