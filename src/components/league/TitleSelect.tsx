import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Lock, Check, Crown } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useLeagueStore } from "@/lib/league-store";
import { TITLE_CATALOG, type TitleRarity } from "@/lib/title-calculator";
import { TITLE_RARITY_STYLE } from "./TitleBadge";
import type { Student } from "@/lib/league-types";

const RARITY_ORDER: TitleRarity[] = ["competitive", "achievement", "style"];
const RARITY_HEADING: Record<TitleRarity, string> = {
  competitive: "🏆 경쟁형 · 리그 1명",
  achievement: "💎 성취형",
  style: "🎭 성격형",
};

// 회원 프로필 옆 '호칭' 드롭다운 — 현재 대표 호칭을 보여주고, 클릭하면 선택 창이 열린다.
// 획득한 호칭만 선택 가능, 미획득은 조건과 함께 회색으로 표시.
export function TitleSelect({ me, isMe }: { me: Student; isMe: boolean }) {
  const { getEarnedTitles, getEquippedTitle, equipTitle } = useLeagueStore();
  const [open, setOpen] = useState(false);

  const earned = useMemo(() => new Set(getEarnedTitles(me.id)), [getEarnedTitles, me.id]);
  const equipped = getEquippedTitle(me); // 지금도 조건 충족 중인 것만 반환

  const grouped = useMemo(
    () => RARITY_ORDER.map((r) => ({ rarity: r, items: TITLE_CATALOG.filter((t) => t.rarity === r) })),
    []
  );

  // 표시용 현재 호칭 라벨
  const currentLabel = equipped
    ? { emoji: equipped.emoji, name: equipped.name, text: TITLE_RARITY_STYLE[equipped.rarity].text }
    : null;

  const pick = async (id: string | null) => {
    await equipTitle(id);
    setOpen(false);
  };

  // 남이 보는 화면(관리자 열람 등)에서는 선택 불가 — 현재 호칭만 정적으로
  if (!isMe) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Crown className="size-3.5 text-amber-500/70" />
        {currentLabel ? (
          <span className={cn("font-black", currentLabel.text)}>{currentLabel.emoji} {currentLabel.name}</span>
        ) : (
          <span className="text-muted-foreground">호칭 없음</span>
        )}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-black transition-all hover:border-neon-blue/50 active:scale-95",
            currentLabel ? "border-border/60 bg-card/60" : "border-dashed border-border/50 bg-background/30 text-muted-foreground"
          )}
          title="대표 호칭 선택"
        >
          <Crown className="size-3.5 text-amber-500" />
          {currentLabel ? (
            <span className={currentLabel.text}>{currentLabel.emoji} {currentLabel.name}</span>
          ) : (
            <span>호칭 선택</span>
          )}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] max-h-[65vh] overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-black text-foreground">대표 호칭 선택</span>
          <span className="text-[10px] text-muted-foreground">획득 {earned.size} / {TITLE_CATALOG.length}</span>
        </div>

        {/* 표시 안 함(해제) */}
        <button
          type="button"
          onClick={() => pick(null)}
          className={cn(
            "mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-bold transition-all hover:border-neon-blue/40",
            !equipped ? "border-neon-blue/40 bg-neon-blue/10 text-foreground" : "border-border/40 text-muted-foreground"
          )}
        >
          호칭 표시 안 함
          {!equipped && <Check className="size-3.5 text-neon-blue" />}
        </button>

        <div className="space-y-3">
          {grouped.map(({ rarity, items }) => {
            const style = TITLE_RARITY_STYLE[rarity];
            return (
              <div key={rarity}>
                <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  {RARITY_HEADING[rarity]}
                </div>
                <div className="space-y-1">
                  {items.map((t) => {
                    const has = earned.has(t.id);
                    const isEquipped = equipped?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={!has}
                        onClick={() => has && pick(t.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-all",
                          has ? cn(style.chip, "ring-1 hover:scale-[1.01] active:scale-[0.99] cursor-pointer") : "border-border/30 bg-background/20 opacity-55 cursor-not-allowed",
                          isEquipped && "ring-2",
                        )}
                      >
                        <span className={cn("text-base leading-none", !has && "grayscale opacity-60")}>{t.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className={cn("text-xs font-black", has ? style.text : "text-muted-foreground")}>{t.name}</span>
                            {isEquipped && <span className="rounded-full bg-neon-green/15 px-1.5 text-[9px] font-black text-neon-green">장착</span>}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">{t.description}</div>
                        </div>
                        {has ? (isEquipped ? <Check className="size-3.5 shrink-0 text-neon-green" /> : null) : <Lock className="size-3 shrink-0 text-muted-foreground/50" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
