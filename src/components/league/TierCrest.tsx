import { useState } from "react";
import { cn } from "@/lib/utils";
import { getTier, type TierName } from "@/lib/league-types";

// 티어색 후광(glory) 클래스 — 토큰 기반이라 테마에 맞게 색이 바뀜.
const HALO: Record<TierName, string> = {
  Bronze: "bg-tier-bronze",
  Silver: "bg-tier-silver",
  Gold: "bg-tier-gold",
  Platinum: "bg-tier-platinum",
  Diamond: "bg-tier-diamond",
};

// 티어 뱃지 이미지(/assets/tiers/{tier}.png) + 티어색 glory 후광.
export function TierCrest({
  rp,
  thresholds,
  size = 56,
  className,
}: {
  rp: number;
  thresholds?: Record<TierName, number>;
  size?: number;
  className?: string;
}) {
  const tier = getTier(rp, thresholds);
  const halo = HALO[tier];
  const glow = `drop-shadow(0 0 ${Math.round(size * 0.14)}px var(--color-tier-${tier.toLowerCase()}))`;
  const [err, setErr] = useState(false);

  return (
    <div className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      {/* glory 후광 (티어색, 2겹) */}
      <div className={cn("pointer-events-none absolute inset-0 rounded-full opacity-60 blur-xl animate-pulse", halo)} />
      <div className={cn("pointer-events-none absolute inset-[18%] rounded-full opacity-50 blur-md", halo)} />

      {err ? (
        <div
          className="relative flex items-center justify-center rounded-full border border-border/40 bg-surface-deep text-[10px] font-black uppercase tracking-tight text-foreground"
          style={{ width: size, height: size, filter: glow }}
        >
          {tier.slice(0, 4)}
        </div>
      ) : (
        <img
          src={`/assets/tiers/${tier.toLowerCase()}.png`}
          alt={`${tier} 티어`}
          onError={() => setErr(true)}
          className="relative object-contain"
          style={{ width: size, height: size, filter: glow }}
        />
      )}
    </div>
  );
}
