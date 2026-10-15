"use client";

import { useEffect, useRef } from "react";

// Search's request guard owns the loading lock. An observer must not hold a
// separate lock while a request from an obsolete search is still pending.
export function useSearchPagination(loadMore: () => Promise<void>, disabled: boolean) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (disabled) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadMore();
    }, { threshold: 0.1, rootMargin: "200px" });
    if (targetRef.current) observer.observe(targetRef.current);
    return () => observer.disconnect();
  }, [disabled, loadMore]);
  return targetRef;
}
