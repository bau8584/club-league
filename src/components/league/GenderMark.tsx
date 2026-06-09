import type { Gender } from "@/lib/league-types";
import { cn } from "@/lib/utils";

export function GenderMark({ gender, className }: { gender: Gender; className?: string }) {
  if (gender === "M") {
    return (
      <span
        title="남자"
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-full bg-neon-blue/15 text-[10px] font-black text-neon-blue ring-1 ring-neon-blue/40",
          className,
        )}
      >
        ♂
      </span>
    );
  }
  if (gender === "F") {
    return (
      <span
        title="여자"
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-full text-[10px] font-black ring-1",
          "bg-[oklch(0.78_0.16_350/0.18)] text-[oklch(0.82_0.18_350)] ring-[oklch(0.82_0.18_350/0.4)]",
          className,
        )}
      >
        ♀
      </span>
    );
  }
  return (
    <span
      title="미지정"
      className={cn(
        "inline-flex size-4 items-center justify-center rounded-full bg-muted/60 text-[9px] text-muted-foreground ring-1 ring-border/60",
        className,
      )}
    >
      ·
    </span>
  );
}
