import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const VISITOR_KEY = "famaflix:anonymous-visitor";
const PULSE_INTERVAL = 4 * 60 * 1000;

type AnonymousPresenceRpc = (
  functionName: "record_anonymous_presence",
  args: { p_visitor_id: string },
) => Promise<unknown>;

type IdleCallbackWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function getVisitorId() {
  try {
    const current = localStorage.getItem(VISITOR_KEY);
    if (current) return current;
    const created = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function AnonymousPresenceTracker() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;

    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    const visitorId = getVisitorId();
    let interval: number | null = null;
    const pulse = () => {
      if (document.visibilityState !== "visible") return;
      void (supabase.rpc as unknown as AnonymousPresenceRpc)("record_anonymous_presence", {
        p_visitor_id: visitorId,
      });
    };

    const beginTracking = () => {
      pulse();
      interval = window.setInterval(pulse, PULSE_INTERVAL);
      document.addEventListener("visibilitychange", pulse);
      window.addEventListener("focus", pulse);
    };
    const idleWindow = window as IdleCallbackWindow;
    const idleHandle = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(beginTracking, { timeout: 2_000 })
      : window.setTimeout(beginTracking, 1_200);

    return () => {
      if (idleWindow.cancelIdleCallback && idleWindow.requestIdleCallback) {
        idleWindow.cancelIdleCallback(idleHandle);
      } else {
        window.clearTimeout(idleHandle);
      }
      if (interval !== null) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", pulse);
      window.removeEventListener("focus", pulse);
    };
  }, [pathname]);

  return null;
}
