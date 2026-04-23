"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/auth-context";

export default function MyUploadsClient() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (user) router.replace(`/user/${user.id}/tracks`);
  }, [isLoading, router, user]);

  return <div className="kb-empty-state">Redirecting…</div>;
}
