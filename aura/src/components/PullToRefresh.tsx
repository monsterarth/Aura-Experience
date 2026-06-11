"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 72;

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      !!(window.navigator as any).standalone;
    if (!isStandalone) return;

    const onTouchStart = (e: TouchEvent) => {
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      if (scrollTop === 0) {
        startYRef.current = e.touches[0].clientY;
      }
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
          }}
        >
          <div
            className={`bg-[#1a1a2e] border rounded-full p-2.5 shadow-xl transition-colors duration-150 ${
              ready ? "border-[#9b6dff]" : "border-white/10"
            }`}
          >
            <RefreshCw
              size={18}
              className={`transition-colors duration-150 ${ready ? "text-[#9b6dff]" : "text-white/40"} ${refreshing ? "animate-spin" : ""}`}
              style={!refreshing ? { transform: `rotate(${progress * 320}deg)` } : undefined}
            />
          </div>
        </div>
      )}
      {children}
    </>
  );
}
