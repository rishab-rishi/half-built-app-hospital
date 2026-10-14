"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("missing")));
    script.onerror = () => {
      loading = null;
      reject(new Error("load failed"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * One challenge per protected submission. Remount it (change `key`) after every use: tokens are
 * single-use. `cdata` (sent to Cloudflare as `cData`) binds the token to the current session for triage and diagnosis.
 */
export function TurnstileWidget({
  siteKey,
  action,
  cdata,
  onToken,
}: {
  siteKey: string;
  action: "admission" | "triage" | "diagnose";
  cdata?: string;
  onToken: (token: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    callback.current = onToken;
  });

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return;
        widgetId = api.render(box.current, {
          sitekey: siteKey,
          action,
          // Cloudflare's option is spelled cData. A lowercase "cdata" is silently ignored, the token then carries
          // no session binding, and the server (correctly) refuses it.
          ...(cdata ? { cData: cdata } : {}),
          theme: "auto",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(null),
          "error-callback": () => callback.current(null),
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      callback.current(null);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, action, cdata]);

  return (
    <div>
      <div ref={box} role="group" aria-label="Human verification" />
      {status === "loading" && <p className="text-sm text-muted-foreground">Loading the human check...</p>}
      {status === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          The human check could not load. Check your connection or any content blocker, then reload the page.
        </p>
      )}
    </div>
  );
}
