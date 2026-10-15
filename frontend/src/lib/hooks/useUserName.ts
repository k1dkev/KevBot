import { useEffect, useState } from "react";
import { api } from "@/lib/api-browser-client";

const cache = new Map<number, Promise<string | null>>();

export function fetchUserName(userId: number): Promise<string | null> {
  let pending = cache.get(userId);
  if (!pending) {
    pending = api.users
      .fetch(userId)
      .then((u) => u.discord_username ?? null)
      .catch(() => null);
    cache.set(userId, pending);
  }
  return pending;
}

export function useUserName(userId: number | null | undefined): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (userId == null) {
      setName(null);
      return;
    }
    let cancelled = false;
    fetchUserName(userId).then((n) => {
      if (!cancelled) setName(n);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return name;
}
