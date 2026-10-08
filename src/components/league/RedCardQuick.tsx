import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLeagueStore } from "@/lib/league-store";
import { classKeyOf, type Student } from "@/lib/league-types";

/**
 * 경기장에서 바로 주는 레드카드(관리자만).
 * 수업 중이면 그 수업 참석자에서 고르고, 수업이 없으면 전체 명단에서 찾아 고른다.
 * 취소·기록 보기는 선수 관리 화면에 그대로 둔다.
 */
export function RedCardQuick() {
  const { students, assignmentSession, dynamicPenalties, giveRedCard } = useLeagueStore();
  const redCardDefault = dynamicPenalties?.redCardRp ?? 50;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Student | null>(null);
  const [amount, setAmount] = useState(redCardDefault);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const sessionIds = assignmentSession?.player_ids ?? [];
  const inSession = sessionIds.length > 0;

  const candidates = useMemo(() => {
    const base = inSession ? students.filter((s) => sessionIds.includes(s.id)) : students;
    const q = query.trim();
    const hit = q ? base.filter((s) => `${s.name} ${s.nickname ?? ""} ${classKeyOf(s)}`.includes(q)) : base;
    return [...hit].sort(
      (a, b) =>
        classKeyOf(a).localeCompare(classKeyOf(b), "ko", { numeric: true }) ||
        (a.nickname || a.name).localeCompare(b.nickname || b.name, "ko"),
    );
  }, [students, sessionIds, inSession, query]);

  const close = () => { setOpen(false); setTarget(null); setQuery(""); };
  const pick = (s: Student) => { setTarget(s); setAmount(redCardDefault); setNote(""); };
  const give = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      if (await giveRedCard(target.id, Math.max(1, amount || 0), note)) close();
    } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 py-2.5 text-sm font-black text-rose-500 transition-all hover:bg-rose-500/20 active:scale-[0.99]">
        🟥 레드카드 주기
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={close}>
          <div className="relative flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl border border-rose-500/40 bg-background p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={close} title="닫기" className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"><X className="size-5" /></button>

            {!target ? (
              <>
                <h3 className="mb-1 text-base font-black text-rose-500">🟥 레드카드 — 누구에게?</h3>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  {inSession ? `지금 수업 참석자 ${sessionIds.length}명 중에서 골라요.` : "수업 중이 아니라 전체 명단에서 골라요."}
                </p>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름 찾기"
                  className="mb-2 h-9 bg-input border-border/30 text-xs" />
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                  {candidates.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">찾는 사람이 없어요.</p>}
                  {candidates.map((s) => (
                    <button key={s.id} type="button" onClick={() => pick(s)}
                      className="flex w-full items-center justify-between rounded-lg bg-muted/20 px-3 py-2 text-left text-sm font-bold hover:bg-rose-500/15">
                      <span className="truncate">{s.nickname || s.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{classKeyOf(s)} · {s.rp} RP</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3 className="mb-1 text-base font-black text-rose-500">🟥 레드카드 — {target.nickname || target.name}</h3>
                <p className="mb-4 text-[11px] text-muted-foreground">지금 {target.rp} RP · 스포츠맨십 위반 감점. 취소는 관리자 › 선수 관리에서 할 수 있어요.</p>
                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-2 text-xs font-bold">
                    감점
                    <span className="flex items-center gap-1">
                      <span className="text-rose-500">−</span>
                      <Input type="number" min={1} value={amount}
                        onChange={(e) => { const v = parseInt(e.target.value, 10); setAmount(isNaN(v) ? 0 : v); }}
                        className="h-8 w-20 text-center font-mono font-bold text-rose-500 bg-input border-border/30 p-0" />
                      <span className="text-rose-500">RP</span>
                    </span>
                  </label>
                  <Input value={note} maxLength={100} onChange={(e) => setNote(e.target.value)}
                    placeholder="사유 (안 적어도 됨 · 관리자만 봄)" className="h-9 bg-input border-border/30 text-xs" />
                  <button onClick={give} disabled={busy || amount < 1}
                    className="flex w-full items-center justify-center rounded-xl bg-rose-500 py-2.5 text-sm font-black text-white transition-all hover:bg-rose-500/85 active:scale-[0.98] disabled:opacity-50">
                    {busy ? "처리 중..." : `레드카드 주기 (−${Math.max(1, amount || 0)} RP)`}
                  </button>
                  <button onClick={() => setTarget(null)} className="w-full text-xs font-bold text-muted-foreground hover:text-foreground">← 다른 사람 고르기</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
