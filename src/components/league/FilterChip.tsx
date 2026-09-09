import type React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 목록을 좁히는 칩. 순위표·공개 순위·학생 관리가 같은 모양을 쓴다 —
 * 화면마다 다르게 생기면 같은 동작인 줄 모른다.
 */
export function FilterChip({
  active, onClick, children, tone,
}: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: string }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border px-3 text-xs font-semibold transition-all",
        active
          ? "border-neon-blue/60 bg-neon-blue/15 text-neon-blue glow-primary"
          : cn("border-border/60 bg-card/40 hover:text-foreground", tone ?? "text-muted-foreground"),
      )}
    >
      {children}
    </Button>
  );
}
