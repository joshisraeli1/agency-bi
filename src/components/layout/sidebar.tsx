"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Plug,
  GitMerge,
  Settings,
  BarChart3,
  MessageSquare,
  FileSpreadsheet,
  TrendingUp,
  PieChart,
  // Scale, // used by the hidden Reconciliation nav entry below
} from "lucide-react";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/client-data", label: "Client Data", icon: FileSpreadsheet },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/michael", label: "Michael", icon: TrendingUp },
  // Reconciliation moved to a dedicated tool. The page and its data are intact
  // and still reachable at /reconciliation for looking back — only the nav entry
  // is hidden, so the figures here can't be mistaken for the current source of
  // truth. Restore this line to bring it back.
  // { href: "/reconciliation", label: "Reconciliation", icon: Scale },
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/entities", label: "Entity Resolution", icon: GitMerge },
  { href: "/settings", label: "Settings", icon: Settings },
];

// The only entry a divisional leader sees.
const divisionNavItems = [{ href: "/division", label: "My Division", icon: PieChart }];

export function Sidebar({ divisionOnly = false }: { divisionOnly?: boolean }) {
  const pathname = usePathname();
  const items = divisionOnly ? divisionNavItems : navItems;

  return (
    <aside className="w-64 border-r bg-card flex flex-col h-full">
      <div className="p-6 border-b">
        <Image
          src="/swan-studio-logo.svg"
          alt="Swan Studio"
          width={140}
          height={26}
          className="h-6 w-auto"
          priority
        />
        <p className="text-xs text-muted-foreground mt-2 tracking-tight">Agency BI</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
