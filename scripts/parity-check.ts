/**
 * 점수입력판 서버 계산 비교 시험 (PLAN-student-input.md 위험 ①).
 * 실제 리그의 최근 경기를, 그 경기 직전 상태로 되돌려 서버 계산(computeScoreInput)으로 다시 계산하고
 * 교사 태블릿이 그때 저장한 RP 변화(rp_delta_*)와 비교한다. 읽기 전용 계정만 쓴다.
 *
 *   bun scripts/parity-check.ts            # 최근 14일
 *   bun scripts/parity-check.ts 30         # 최근 30일
 *
 * 되돌리기 한계: 경기 뒤 휴면 감점·설정 변경·RP 직접 수정이 있었으면 다르게 나온다 → 그 리그는 따로 표시.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { computeScoreInput } from "../src/domain/score-input-calc";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const days = Number(process.argv[2] ?? 14);
const client = new pg.Client({ connectionString: env.READONLY_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const leagues = (await client.query(
  `select l.id, l.name, l.settings from leagues l
    where not l.is_deleted and exists (select 1 from matches m where m.league_id = l.id
      and m.created_at > now() - ($1 || ' days')::interval and m.rp_delta_winner is not null)`, [days])).rows;

const KEYS = ["underdogBonus","scoreDiffBonus","rivalBonus","firstWinBonus","revengeBonus","freshnessBonus","streakBonus","comebackBonus","marginBonus","mentoringBonus","greatMatchBonus","lossComfortBonus","willOfSteelBonus","arrogancePenalty","crushingPenalty","revengeAllowedPenalty","championPenalty","swampPenalty"];
function whyDiff(bd: any, out: any): string {
  if (!bd?.winner) return "";
  const parts: string[] = [];
  for (const [side, id] of [["winner", out.winnerId], ["loser", out.loserId]] as const) {
    const ps = out.playerStats.find((p: any) => p.id === id);
    if (!ps || !bd[side]) continue;
    for (const k of KEYS) if ((bd[side][k] ?? 0) !== (ps[k] ?? 0)) parts.push(`${side[0]}.${k} ${bd[side][k] ?? 0}→${ps[k] ?? 0}`);
    if (side === "winner" && bd.winner.baseWin != null) {
      const base = ps.delta - KEYS.slice(0, 13).filter(k => k !== "lossComfortBonus").reduce((a, k) => a + (ps[k] ?? 0), 0);
      if (base !== bd.winner.baseWin) parts.push(`w.base ${bd.winner.baseWin}→${base}`);
    }
  }
  return parts.join(" ");
}
let total = 0, same = 0, skipped = 0;
const report: string[] = [];
for (const lg of leagues) {
  const season = lg.settings?.season || "시즌 1";
  const players = (await client.query(
    `select * from players where league_id = $1 and (is_deleted is null or is_deleted = false)`, [lg.id])).rows;
  const all = (await client.query(
    `select * from matches where league_id = $1 and season = $2 order by created_at asc`, [lg.id, season])).rows;
  const decayAfter = (await client.query(
    `select min(created_at) as t from decay_log where league_id = $1`, [lg.id]).catch(() => ({ rows: [{ t: null }] }))).rows[0]?.t;

  const since = Date.now() - days * 86400000;
  let lgTotal = 0, lgSame = 0;
  const diffs: string[] = [];
  for (let k = all.length - 1; k >= 0; k--) {
    const M = all[k];
    if (new Date(M.created_at).getTime() < since) break;
    if (M.rp_delta_winner == null) continue;
    // 경기 M 직전 RP = 지금 RP − (M 과 그 뒤 경기들의 변화)
    const later = all.slice(k);
    const rpBefore = (id: string, now: number) => {
      let r = now;
      for (const x of later) {
        if (x.winner_id === id) r -= x.rp_delta_winner ?? 0;
        if (x.loser_id === id) r -= x.rp_delta_loser ?? 0;
        if (x.winner2_id === id) r -= x.rp_delta_winner2 ?? 0;
        if (x.loser2_id === id) r -= x.rp_delta_loser2 ?? 0;
      }
      return r;
    };
    const playerRows = players.map((p) => ({ ...p, rp: rpBefore(p.id, p.rp) }));
    const teamA = [M.winner_id, M.winner2_id].filter(Boolean);
    const teamB = [M.loser_id, M.loser2_id].filter(Boolean);
    let out;
    try {
      out = computeScoreInput({
        settings: lg.settings, playerRows, matchRows: all.slice(0, k),
        teamA, teamB, scoreA: M.winner_score ?? 21, scoreB: M.loser_score ?? 19,
        matchId: M.id, nowIso: new Date(M.created_at).toISOString(),
      });
    } catch { continue; }
    const want = [M.rp_delta_winner, M.rp_delta_loser, M.rp_delta_winner2, M.rp_delta_loser2];
    const got = [out.rpDeltaWinner, out.rpDeltaLoser, out.rpDeltaWinner2, out.rpDeltaLoser2];
    // 영수증(rp_breakdown)에 태블릿이 본 직전 RP 가 남아 있으면, 되돌린 RP 와 맞는지 본다.
    // 다르면 계산이 아니라 되돌리기(재구성)가 틀린 것 → 판정에서 뺀다.
    const bd = M.rp_breakdown;
    if (bd?.winner?.prevRp != null) {
      const pr = playerRows.find((p) => p.id === M.winner_id)?.rp;
      const pl = playerRows.find((p) => p.id === M.loser_id)?.rp;
      if (pr !== bd.winner.prevRp || (bd.loser?.prevRp != null && pl !== bd.loser.prevRp)) { skipped++; continue; }
    } else if (process.env.STRICT) { skipped++; continue; }
    lgTotal++;
    if (want.every((w, i) => (w ?? null) === (got[i] ?? null))) lgSame++;
    else if (diffs.length < (process.env.ALL ? 99 : 3)) diffs.push(`    ${M.created_at.toISOString?.() ?? M.created_at} 앞경기와 ${k ? Math.round((new Date(M.created_at).getTime() - new Date(all[k-1].created_at).getTime())/1000) : '-'}초  저장 ${JSON.stringify(want)}  서버 ${JSON.stringify(got)}  ${whyDiff(bd, out)}`);
  }
  total += lgTotal; same += lgSame;
  const tag = decayAfter && new Date(decayAfter).getTime() > since ? " (휴면감점 있음)" : "";
  report.push(`${lg.id.slice(0, 8)} ${lgSame}/${lgTotal}${tag}`, ...diffs);
}
await client.end();
console.log(report.join("\n"));
console.log(`\n합계 ${same}/${total} 일치 (${total ? ((same / total) * 100).toFixed(1) : 0}%)`);
