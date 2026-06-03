"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";

export function CollapsibleSection({
  title,
  icon,
  count,
  emptyHint,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  emptyHint: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const isEmpty = count === 0;
  const [open, setOpen] = useState(defaultOpen && !isEmpty);

  return (
    <Card>
      <CardHeader
        className={isEmpty ? "" : "cursor-pointer select-none"}
        onClick={isEmpty ? undefined : () => setOpen((o) => !o)}
      >
        <CardTitle className="flex items-center gap-2 text-base">
          {!isEmpty &&
            (open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ))}
          {icon} {title} <Badge variant="outline">{count}</Badge>
          {!isEmpty && !open && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              click to expand
            </span>
          )}
        </CardTitle>
      </CardHeader>
      {isEmpty ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        </CardContent>
      ) : open ? (
        <CardContent className="p-0">{children}</CardContent>
      ) : null}
    </Card>
  );
}
