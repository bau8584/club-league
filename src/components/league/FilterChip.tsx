import type React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 목록을 좁히는 칩. 순위표·공개 순위·학생 관리가 같은 모양을 쓴다 —
 * 화면마다 다르게 생기면 같은 동작인 줄 모른다.
 */
export function FilterChip({
  active, onClick, children, tone, disabled, title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: string;
  /** 고를 수는 없지만 존재는 알려야 하는 칩(예: 그 날 경기가 없는 반). 흐리게 남는다. */
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-8 rounded-full border px-3 text-xs font-semibold transition-all",
        active
          ? "border-neon-blue/60 bg-neon-blue/15 text-neon-blue glow-primary"
          : cn("border-border/60 bg-card/40 hover:text-foreground", tone ?? "text-muted-foreground"),
        disabled && "border-dashed border-border/40 bg-transparent text-muted-foreground/40 opacity-60 hover:text-muted-foreground/40",
      )}
    >
      {children}
    </Button>
  );
}
