"use client";

import { useEffect, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-browser-client";
import { logger } from "@/lib/logging/browser";

const log = logger.child({ component: "oauth" });

const DEFAULT_REDIRECT = "/tracks";

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // just a guard to prevent the code from being used twice when in development
  const codeConsumed = useRef(false);

  useEffect(() => {
    if (codeConsumed.current) {
      return;
    }
    codeConsumed.current = true;

    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const stateParam = searchParams.get("state");

    let redirectTarget = DEFAULT_REDIRECT;
    if (stateParam) {
      const storageKey = `oauth-state:${stateParam}`;
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as { redirect?: string | null };
          if (parsed?.redirect && parsed.redirect.startsWith("/")) {
            redirectTarget = parsed.redirect;
          }
        }
      } catch (storageError) {
        log.warn({ err: storageError }, "oauth.redirect.resolve.failed");
      } finally {
        try {
          sessionStorage.removeItem(storageKey);
        } catch (cleanupError) {
          log.warn({ err: cleanupError }, "oauth.redirect.cleanup.failed");
        }
      }
    }

    if (error) {
      log.warn({}, "oauth.provider.rejected");
      router.push("/?error=oauth_error");
      return;
    }

    if (!code) {
      log.warn({}, "oauth.code.missing");
      router.push("/?error=no_code");
      return;
    }

    const exchangeCode = async () => {
      try {
        const data = await api.auth.exchangeDiscordCode(code);
        if (data.access_token) {
          router.push(redirectTarget);
        } else {
          log.error({}, "oauth.token.missing");
          router.push("/?error=no_token");
        }
      } catch (error) {
        log.warn({ err: error }, "oauth.exchange.failed");
        const status = (error as { status?: number } | null)?.status;
        const errorCode = status && status >= 400 && status < 500 ? "exchange_failed" : "exchange_error";
        router.push(`/?error=${errorCode}`);
      }
    };

    exchangeCode();
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Completing login...</h1>
        <p className="text-muted-foreground">Please wait while we authenticate you.</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Loading...</h1>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
