import { useEffect, useRef, useCallback } from "react";

interface UseInfiniteScrollOptions {
  threshold?: number;
  rootMargin?: string;
  disabled?: boolean;
}

export function useInfiniteScroll(
  onIntersect: () => Promise<void>,
  { threshold, rootMargin, disabled }: UseInfiniteScrollOptions = {},
) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef(false); // guard without causing re-renders

  // Stable wrapper around onIntersect
  const handleIntersect = useCallback(
    async (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (!entry.isIntersecting) return;
      if (disabled || loadingRef.current) return;

      loadingRef.current = true;
      try {
        await onIntersect();
      } finally {
        loadingRef.current = false;
      }
    },
    [onIntersect, disabled],
  );

  // Create observer and attach to target in ONE effect
  useEffect(() => {
    if (disabled) return;

    const obs = new IntersectionObserver(handleIntersect, {
      threshold: threshold ?? 0.1,
      rootMargin: rootMargin ?? "200px",
    });
    observerRef.current = obs;

    const el = targetRef.current;
    if (el) obs.observe(el);

    return () => {
      obs.disconnect();
      observerRef.current = null;
    };
  }, [handleIntersect, threshold, rootMargin, disabled]);

  // If the target ref node changes later, re-observe it
  const setTarget = useCallback(
    (node: HTMLDivElement | null) => {
      // detach old
      const prev = targetRef.current;
      if (prev && observerRef.current) {
        observerRef.current.unobserve(prev);
      }
      // attach new
      targetRef.current = node;
      if (node && observerRef.current && !disabled) {
        observerRef.current.observe(node);
      }
    },
    [disabled],
  );

  return { targetRef: setTarget, isLoadingRef: loadingRef };
}
