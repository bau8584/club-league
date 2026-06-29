import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Megaphone, Plus, Check, X, BellRing, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeagueStore } from "@/lib/league-store";
import type { Student } from "@/lib/league-types";

const dn = (p: { name: string; nickname?: string | null }) => p.nickname || p.name;

export function MatchScheduler() {
  const { students, scheduledMatches, createScheduledMatch, callScheduledMatch, removeScheduledMatch, currentViewSeason } =
    useLeagueStore();
  const readOnly = currentViewSeason !== "현재 시즌";

  const [matchType, setMatchType] = useState<"single" | "double">("single");
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [a2Id, setA2Id] = useState("");
  const [b2Id, setB2Id] = useState("");
  const [court, setCourt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => dn(a).localeCompare(dn(b))),
    [students]
  );

  const reset = () => { setAId(""); setBId(""); setA2Id(""); setB2Id(""); setCourt(""); };

  const handleAdd = async () => {
    const need = matchType === "double" ? [aId, bId, a2Id, b2Id] : [aId, bId];
    if (need.some((x) => !x)) return toast.error("대결 인원을 모두 선택하세요.");
    if (new Set(need).size !== need.length) return toast.error("같은 회원을 중복 선택할 수 없습니다.");
    setSubmitting(true);
    const ok = await createScheduledMatch({
      matchType,
      playerAId: aId,
      playerBId: bId,
      playerA2Id: matchType === "double" ? a2Id : null,
      playerB2Id: matchType === "double" ? b2Id : null,
      court: court.trim() || null,
    });
    setSubmitting(false);
    if (ok) reset();
  };

  const PlayerSelect = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
      className="h-9 w-full rounded-lg border border-border/50 bg-input px-2.5 text-xs font-sans focus:border-neon-blue"
    >
      <option value="">{placeholder}</option>
      {sortedStudents.map((s) => (
        <option key={s.id} value={s.id}>{dn(s)}{s.group ? ` · ${s.group}` : ""}</option>
      ))}
    </select>
  );

  const teamLabel = (ids: (string | null)[]) =>
    ids.filter(Boolean).map((id) => { const s = byId.get(id as string); return s ? dn(s) : "?"; }).join("·");

  return (
    <div className="space-y-6 animate-in fade-in duration-200 max-w-3xl">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
          <Megaphone className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-black tracking-tight text-foreground">대진 호출</h2>
          <p className="text-[11px] text-muted-foreground">대진을 잡아 두고 “입장 호출”을 보내면 해당 회원 화면에 실시간 배너가 뜹니다.</p>
        </div>
      </div>

      {readOnly && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-600">
          과거 시즌 열람 중에는 대진을 추가/호출할 수 없습니다.
        </div>
      )}

      {/* 대진 추가 폼 */}
      <Card className="border border-border/40 bg-card/50 p-5 backdrop-blur shadow-lg">
        <div className="mb-3 flex gap-1.5">
          {(["single", "double"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMatchType(t)}
              disabled={readOnly}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
                matchType === t ? "border-neon-blue/50 bg-neon-blue/15 text-neon-blue" : "border-border/40 text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "single" ? "단식" : "복식"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-muted-foreground">A 팀</span>
            <PlayerSelect value={aId} onChange={setAId} placeholder="선수 A" />
            {matchType === "double" && <PlayerSelect value={a2Id} onChange={setA2Id} placeholder="파트너 A2" />}
          </div>
          <span className="text-center text-xs font-black text-muted-foreground">VS</span>
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-muted-foreground">B 팀</span>
            <PlayerSelect value={bId} onChange={setBId} placeholder="선수 B" />
            {matchType === "double" && <PlayerSelect value={b2Id} onChange={setB2Id} placeholder="파트너 B2" />}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            placeholder="코트/장소 (선택)"
            disabled={readOnly}
            className="h-9 max-w-[200px] border-border/50 bg-input text-xs"
          />
          <Button
            onClick={handleAdd}
            disabled={readOnly || submitting}
            className="h-9 rounded-xl bg-neon-blue px-4 text-xs font-black text-primary-foreground shadow-md hover:bg-neon-blue/90 active:scale-95"
          >
            <Plus className="mr-1 size-4" /> 대진 추가
          </Button>
        </div>
      </Card>

      {/* 대진 목록 */}
      <Card className="border border-border/40 bg-card/50 p-5 backdrop-blur shadow-lg">
        <span className="mb-3 block text-sm font-bold text-foreground">진행 중인 대진 ({scheduledMatches.length})</span>
        {scheduledMatches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/30 py-6 text-center text-[11px] text-muted-foreground">
            추가된 대진이 없습니다. 위에서 대진을 만들어 호출해 보세요.
          </p>
        ) : (
          <div className="space-y-2">
            {scheduledMatches.map((m) => {
              const called = m.status === "called";
              const teamA = teamLabel([m.player_a_id, m.player_a2_id]);
              const teamB = teamLabel([m.player_b_id, m.player_b2_id]);
              return (
                <div key={m.id} className="flex items-center gap-2 rounded-xl border border-border/30 bg-input/40 px-3 py-2">
                  <span className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black",
                    called ? "border-neon-green/40 bg-neon-green/15 text-neon-green" : "border-amber-500/40 bg-amber-500/10 text-amber-500"
                  )}>
                    {called ? <BellRing className="size-3" /> : <Hourglass className="size-3" />}
                    {called ? "호출됨" : "대기"}
                  </span>
                  <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-right font-bold text-foreground">{teamA}</span>
                    <span className="shrink-0 text-[10px] font-black text-muted-foreground">VS</span>
                    <span className="min-w-0 flex-1 truncate text-left font-bold text-foreground">{teamB}</span>
                  </div>
                  {m.court && <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:block">{m.court}</span>}
                  <div className="flex shrink-0 items-center gap-1">
                    {!called && (
                      <Button onClick={() => callScheduledMatch(m.id)} disabled={readOnly} size="sm"
                        className="h-7 rounded-lg bg-neon-green px-2.5 text-[10px] font-black text-white hover:bg-neon-green/90">
                        <BellRing className="mr-0.5 size-3" /> 입장 호출
                      </Button>
                    )}
                    <Button onClick={() => removeScheduledMatch(m.id)} variant="ghost" size="icon"
                      className="size-7 text-muted-foreground hover:text-win" title="완료(목록에서 제거)">
                      <Check className="size-4" />
                    </Button>
                    <Button onClick={() => removeScheduledMatch(m.id)} variant="ghost" size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive" title="취소(삭제)">
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
