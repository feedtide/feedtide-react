import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { FeedTideConfig } from "./types";

interface FeedTideContextValue {
  config: FeedTideConfig;
}

const FeedTideContext = createContext<FeedTideContextValue | null>(null);

function generateFingerprint(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return "fp_" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Persist anonymous ID in sessionStorage so it survives re-renders
let cachedAnonId: string | null = null;
function getAnonymousId(): string {
  if (cachedAnonId) return cachedAnonId;
  if (typeof sessionStorage !== "undefined") {
    const stored = sessionStorage.getItem("feedtide_anon_id");
    if (stored) {
      cachedAnonId = stored;
      return stored;
    }
  }
  const id = generateFingerprint();
  cachedAnonId = id;
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("feedtide_anon_id", id);
  }
  return id;
}

export interface FeedTideProviderProps extends FeedTideConfig {
  children: ReactNode;
}

export function FeedTideProvider({
  children,
  appId,
  userId,
  signature,
  userEmail,
  userName,
  baseUrl = "https://feedtide.com",
  timestamp,
  theme,
}: FeedTideProviderProps) {
  const resolvedUserId = userId || getAnonymousId();

  const value = useMemo<FeedTideContextValue>(() => {
    return {
      config: {
        appId,
        userId: resolvedUserId,
        signature,
        userEmail,
        userName,
        baseUrl,
        timestamp,
        theme,
      },
    };
  }, [appId, resolvedUserId, signature, userEmail, userName, baseUrl, timestamp, theme]);

  return (
    <FeedTideContext.Provider value={value}>
      {children}
    </FeedTideContext.Provider>
  );
}

export function useFeedTide(): FeedTideContextValue {
  const ctx = useContext(FeedTideContext);
  if (!ctx) {
    throw new Error("useFeedTide must be used within a <FeedTideProvider>");
  }
  return ctx;
}

export function useFeedTideOptional(): FeedTideContextValue | null {
  return useContext(FeedTideContext);
}

export { getAnonymousId };
