import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TierBadge } from "@/components/league/TierBadge";
import { GenderMark } from "@/components/league/GenderMark";
import { cn } from "@/lib/utils";
import type { Gender, Student, TierName } from "@/lib/league-types";

const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 80 }, (_, i) => CURRENT_YEAR - 10 - i);

// 일반 회원 온보딩: 명단의 기존 닉네임에 연동하거나, 새 프로필을 만들어 내 계정에 연결한다.
export function Onboarding({
  students,
  thresholds,
  levelMode = "free",
  levels = [],
  onClaim,
  onCreate,
}: {
  students: Student[];
  thresholds?: Record<TierName, number>;
  levelMode?: "preset" | "free";
  levels?: { name: string; description?: string }[];
  onClaim: (playerId: string) => Promise<boolean>;
  onCreate: (profile: { nickname: string; gender: Gender; group?: string | null; birthYear?: number | null }) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"link" | "create">("link");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ nickname: string; group: string; gender: Gender; birthYear: string }>({
    nickname: "", group: "", gender: "U", birthYear: "",
  });

  // 계정 미연결 + 미삭제 명단
  const unlinked = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => !s.userId)
      .filter((s) => (q ? (s.nickname || s.name || "").toLowerCase().includes(q) : true))
      .sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name, "ko"));
  }, [students, search]);

  const handleClaim = async (id: string) => {
    setBusy(true);
    try { await onClaim(id); } finally { setBusy(false); }
  };

  const handleCreate = async () => {
    const nickname = form.nickname.trim();
    if (!nickname) return;
    setBusy(true);
    try {
      await onCreate({
        nickname,
        gender: form.gender,
        group: form.group.trim() || null,
        birthYear: form.birthYear ? Number(form.birthYear) : null,
      });
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Card className="border-border/60 bg-card/60 p-5 sm:p-6 backdrop-blur">
        <h2 className="text-lg font-black text-foreground">내 프로필 설정</h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          리그에 참여했습니다. 명단에 내 닉네임이 있으면 연동하고, 없으면 새로 만들어 시작하세요.
        </p>

        <div className="mt-4 inline-flex rounded-xl bg-muted/40 p-1 border border-border/30">
          <button
            type="button"
            onClick={() => setTab("link")}
            className={cn("px-4 py-1.5 rounded-lg text-xs font-black transition-all", tab === "link" ? "bg-neon-blue/15 text-neon-blue" : "text-muted-foreground hover:text-foreground")}
          >
            기존 닉네임 연동
          </button>
          <button
            type="button"
            onClick={() => setTab("create")}
            className={cn("px-4 py-1.5 rounded-lg text-xs font-black transition-all", tab === "create" ? "bg-neon-blue/15 text-neon-blue" : "text-muted-foreground hover:text-foreground")}
          >
            새로 만들기
          </button>
        </div>

        {tab === "link" ? (
          <div className="mt-4 space-y-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="닉네임 검색"
              className="h-9 bg-input border-border/40"
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-h-[50vh] overflow-y-auto">
              {unlinked.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handleClaim(s.id)}
                  className="relative flex min-h-[4.5rem] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-border/60 bg-[#0e1322]/80 px-2 py-3 text-center transition-all hover:border-neon-blue/60 hover:bg-accent/40 active:scale-95 disabled:opacity-50"
                >
                  {s.group && <span className="absolute top-1 left-1.5 max-w-[60%] truncate text-[9px] text-gray-500">{s.group}</span>}
                  <GenderMark gender={s.gender} className="absolute top-1 right-1.5 size-3 text-[8px]" />
                  <span className="text-sm font-bold text-white">{s.nickname || s.name}</span>
                  <TierBadge rp={s.rp} thresholds={thresholds} />
                </button>
              ))}
              {unlinked.length === 0 && (
                <p className="col-span-full py-6 text-center text-xs text-muted-foreground">
                  {search.trim() ? "검색 결과가 없습니다." : "연동 가능한 닉네임이 없습니다. [새로 만들기]로 등록하세요."}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground">닉네임</label>
              <Input
                value={form.nickname}
                onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                placeholder="닉네임"
                className="h-9 mt-1 bg-input border-border/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">레벨 (선택)</label>
                {levelMode === "preset" && levels.length > 0 ? (
                  <select
                    value={form.group}
                    onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
                    className="h-9 mt-1 w-full rounded-md bg-input border border-border/40 px-2 text-sm"
                  >
                    <option value="">선택 안 함</option>
                    {levels.map((lv) => <option key={lv.name} value={lv.name}>{lv.name}</option>)}
                  </select>
                ) : (
                  <Input
                    value={form.group}
                    onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
                    placeholder="레벨"
                    className="h-9 mt-1 bg-input border-border/40"
                  />
                )}
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">나이(연생) (선택)</label>
                <select
                  value={form.birthYear}
                  onChange={(e) => setForm((f) => ({ ...f, birthYear: e.target.value }))}
                  className="h-9 mt-1 w-full rounded-md bg-input border border-border/40 px-2 text-sm"
                >
                  <option value="">선택 안 함</option>
                  {BIRTH_YEARS.map((y) => <option key={y} value={y}>{y}년생</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-muted-foreground mr-1">성별</span>
              {(["M", "F", "U"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, gender: g }))}
                  className={cn(
                    "h-8 px-3 rounded-md text-[11px] font-black border transition-all active:scale-95",
                    form.gender === g
                      ? (g === "M" ? "border-sky-500/60 bg-sky-500/20 text-sky-400" : g === "F" ? "border-pink-500/60 bg-pink-500/20 text-pink-400" : "border-neon-blue/60 bg-neon-blue/20 text-neon-blue")
                      : "border-border/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {g === "M" ? "남" : g === "F" ? "녀" : "미정"}
                </button>
              ))}
            </div>
            <Button
              onClick={handleCreate}
              disabled={busy || !form.nickname.trim()}
              className="w-full h-10 bg-gradient-to-r from-neon-blue to-tier-diamond text-primary-foreground font-bold disabled:opacity-40"
            >
              프로필 만들고 시작하기
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
