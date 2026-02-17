import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MarginBadgeProps {
  marginPercent: number;
  warningThreshold?: number;
  dangerThreshold?: number;
  className?: string;
}

export function MarginBadge({
  marginPercent,
  warningThreshold = 20,
  dangerThreshold = 10,
  className,
}: MarginBadgeProps) {
  const variant =
    marginPercent < dangerThreshold
      ? "destructive"
      : marginPercent < warningThreshold
      ? "secondary"
      : "default";

  return (
    <Badge variant={variant} className={cn(className)}>
      {marginPercent.toFixed(1)}%
    </Badge>
  );
}
