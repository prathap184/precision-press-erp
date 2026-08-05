"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { Logo } from "@/components/shared/logo";
import { setActiveCurrency } from "@/lib/money";

export interface Organization {
  id: string;
  name: string;
  currency: string;
  country: string | null;
  timezone: string;
  // add more as needed
}

export const OrganizationContext = createContext<{ organization: Organization | null }>({ organization: null });

export function useOrganization() {
  return useContext(OrganizationContext);
}

export function OrgLoader({ children }: { children: React.ReactNode }) {
  const FADE_DURATION_MS = 400;
  const [state, setState] = useState<"loading" | "ready" | "fading">("loading");
  const [organization, setOrganization] = useState<Organization | null>(null);

  useEffect(() => {
    let isMounted = true;
    let readyTimer: number | null = null;

    const startFadeOut = () => {
      requestAnimationFrame(() => {
        if (!isMounted) return;
        setState("fading");
        readyTimer = window.setTimeout(() => {
          if (isMounted) setState("ready");
        }, FADE_DURATION_MS);
      });
    };

    const orgId = localStorage.getItem("activeOrgId");
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;

    fetch("/api/v1/organization", { headers })
      .then((r) => r.json())
      .then(async (data) => {
        let org = data.organization ?? data.organizations?.[0];
        if (!org && orgId) {
          localStorage.removeItem("activeOrgId");
          const retryRes = await fetch("/api/v1/organization");
          const retryData = await retryRes.json();
          org = retryData.organization ?? retryData.organizations?.[0];
        }
        return org;
      })
      .then((org) => {
        if (org) {
          if (org.id) {
            localStorage.setItem("activeOrgId", org.id);
          }
          setOrganization({
            ...org,
            country: org.country || "IN",
          });
          if (org.currency) {
            setActiveCurrency(org.currency);
          }
        }
        startFadeOut();
      })
      .catch(() => {
        startFadeOut();
      });

    return () => {
      isMounted = false;
      if (readyTimer) window.clearTimeout(readyTimer);
    };
  }, []);

  return (
    <OrganizationContext.Provider value={{ organization }}>
      {state !== "ready" && (
        <div
          className={`org-loader-overlay ${state === "fading" ? "org-loader-fade-out" : ""}`}
        >
          <div className="flex flex-col items-center gap-4">
            <Logo className="org-loader-logo h-10 w-auto" />
            <span className="text-sm font-medium tracking-tight text-muted-foreground/60">
              Pixel Marketing
            </span>
          </div>
        </div>
      )}
      {state === "ready" && children}
    </OrganizationContext.Provider>
  );
}
