"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon?: LucideIcon;
  exact?: boolean;
  badge?: string | number;
  title?: string;
}

export function TabLayout({
  tabs,
  children,
}: {
  tabs: Tab[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const normalizedTabs = useMemo(() => {
    const isAccounting = pathname.startsWith("/accounting");
    return tabs.map((tab) => {
      let href = tab.href;
      if (isAccounting && !href.startsWith("/accounting")) {
        href = `/accounting${href.startsWith("/") ? href : `/${href}`}`;
      } else if (!isAccounting && href.startsWith("/accounting")) {
        href = href.replace(/^\/accounting/, "");
      }
      return { ...tab, href };
    });
  }, [tabs, pathname]);

  // Hide tabs on detail pages (path has more segments than any tab href)
  const isDetailPage = !normalizedTabs.some((tab) =>
    tab.exact ? pathname === tab.href : pathname === tab.href
  ) && normalizedTabs.some((tab) => pathname.startsWith(tab.href + "/"));

  let blurKey = pathname;
  if (isDetailPage) {
    const matchedTab = normalizedTabs.find((tab) => pathname.startsWith(tab.href + "/"));
    if (matchedTab) {
      const rest = pathname.slice(matchedTab.href.length + 1);
      const idSegment = rest.split("/")[0];
      blurKey = `${matchedTab.href}/${idSegment}`;
    }
  }

  return (
    <div>
      {!isDetailPage && (
        <nav className="-mt-2 mb-6 sm:mb-8 flex items-center gap-1 overflow-x-auto border-b border-border scrollbar-none">
          {normalizedTabs.map((tab) => {
            const isActive = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                title={tab.title}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {Icon && <Icon className="size-3.5" />}
                {tab.label}
                {tab.badge != null && (
                  <span className="ml-1 flex size-4.5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    {tab.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
      <BlurReveal key={blurKey}>{children}</BlurReveal>
    </div>
  );
}
