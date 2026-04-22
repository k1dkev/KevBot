"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/auth-context";

export default function MyUploadsClient() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (user) {
      router.replace(`/user/${user.id}`);
    }
  }, [isLoading, router, user]);

  return (
    <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">
      Redirecting…
    </div>
  );
}
