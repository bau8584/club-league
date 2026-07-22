import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Crown, Lock, Check } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import { TITLE_CATALOG, type TitleRarity } from "@/lib/title-calculator";
import { TITLE_RARITY_STYLE } from "./TitleBadge";
import type { Student } from "@/lib/league-types";

const RARITY_ORDER: TitleRarity[] = ["competitive", "achievement", "style"];
const RARITY_HEADING: Record<TitleRarity, string> = {
  competitive: "🏆 경쟁형 · 리그에 1명",
  achievement: "💎 성취형",
  style: "🎭 성격형",
};

// 나의 기록 탭 안의 '호칭' 섹션 — 획득/미획득 호칭을 보여주고 대표 호칭 1개를 장착.
export function TitleCollection({ me, isMe }: { me: Student; isMe: boolean }) {
  const { getEarnedTitles, equipTitle } = useLeagueStore();

  const earned = useMemo(() => new Set(getEarnedTitles(me.id)), [getEarnedTitles, me.id]);
  const equipped = me.equippedTitle ?? null;
  // 장착했지만 지금은 조건 미충족(경쟁형 주인 교체 등)이면 표시상 해제된 것으로 취급
  const equippedActive = equipped && earned.has(equipped) ? equipped : null;

  const grouped = useMemo(
    () => RARITY_ORDER.map((r) => ({ rarity: r, items: TITLE_CATALOG.filter((t) => t.rarity === r) })),
    []
  );

  return (
    <Card className="border border-border/60 bg-card/40 p-5 md:p-6 backdrop-blur-xl shadow-lg">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
            <Crown className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-black tracking-tight text-foreground">호칭</h3>
            <p className="text-[11px] text-muted-foreground">
              획득한 호칭 {earned.size}개 · {isMe ? "하나를 골라 닉네임 옆에 장착하세요" : "이번 시즌 경기로 자동 획득"}
            </p>
          </div>
        </div>
        {isMe && equippedActive && (
          <button
            type="button"
            onClick={() => equipTitle(null)}
            className="shrink-0 rounded-lg border border-border/50 px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            장착 해제
          </button>
        )}
      </div>

      <div className="space-y-5">
        {grouped.map(({ rarity, items }) => {
          const style = TITLE_RARITY_STYLE[rarity];
          return (
            <div key={rarity}>
              <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                {RARITY_HEADING[rarity]}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((t) => {
                  const has = earned.has(t.id);
                  const isEquipped = equippedActive === t.id;
                  const clickable = isMe && has;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && equipTitle(isEquipped ? null : t.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                        has ? cn(style.chip, "ring-1") : "border-border/30 bg-background/20 opacity-60",
                        isEquipped && "ring-2 ring-offset-1 ring-offset-background",
                        clickable && "hover:scale-[1.01] active:scale-[0.99] cursor-pointer",
                      )}
                    >
                      <span className={cn("text-xl leading-none", !has && "grayscale opacity-50")}>{t.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("text-sm font-black", has ? style.text : "text-muted-foreground")}>
                            {t.name}
                          </span>
                          {isEquipped && (
                            <span className="rounded-full bg-neon-green/15 px-1.5 py-0.5 text-[9px] font-black text-neon-green">
                              장착 중
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">{t.description}</div>
                      </div>
                      <span className="shrink-0">
                        {has ? (
                          <span className={cn("flex size-5 items-center justify-center rounded-full", isEquipped ? "bg-neon-green/15 text-neon-green" : "text-muted-foreground/50")}>
                            <Check className="size-3.5 stroke-[3]" />
                          </span>
                        ) : (
                          <Lock className="size-3.5 text-muted-foreground/50" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
