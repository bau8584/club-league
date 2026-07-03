import { getTier, TIER_STYLES, getFullTierLabel, type TierName } from "@/lib/league-types";
import { cn } from "@/lib/utils";

export function TierBadge({ rp, thresholds, className, unranked }: { rp: number; thresholds?: Record<TierName, number>; className?: string; unranked?: boolean }) {
  if (unranked) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 shrink-0",
          "bg-muted/50 text-muted-foreground ring-border/50",
          className,
        )}
      >
        언랭크
      </span>
    );
  }
  const tier: TierName = getTier(rp, thresholds);
  const s = TIER_STYLES[tier];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 shrink-0",
        s.bg, s.text, s.ring,
        className,
      )}
    >
      {getFullTierLabel(rp, thresholds)}
    </span>
  );
}
