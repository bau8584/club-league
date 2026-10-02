// 점수입력판 Edge Function — 원본. 배포할 것은 같은 폴더의 index.ts(묶은 결과)다.
//   npm run build:fn   → index.ts 를 다시 만든다. 계산 파일(src/domain·src/lib)이 바뀌면 꼭 다시 묶어 배포.
//
// 학생 기기는 점수만 보낸다: { key, scheduledId, scoreA, scoreB }  (A = 줄의 team_a)
// 서버가 교사 태블릿과 같은 코드(computeScoreInput)로 RP 를 계산하고 record_match_by_key 로 저장한다.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 Edge 런타임이 자동 주입한다(따로 비밀 설정 없음).
import { createClient } from "npm:@supabase/supabase-js@2";
import { computeScoreInput } from "@/domain/score-input-calc";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...CORS } });
const fail = (message: string, status = 400) => json({ ok: false, message }, status);

const PLAYER_COLS = "id, league_id, user_id, rp, nickname, name, display_name, group_label, birth_year, grade, class_num, student_no, gender, equipped_title";
const MATCH_COLS = "id, winner_id, loser_id, winner2_id, loser2_id, winner_score, loser_score, rp_delta_winner, rp_delta_loser, rp_delta_winner2, rp_delta_loser2, created_at";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("method-not-allowed", 405);

  let body: any;
  try { body = await req.json(); } catch { return fail("잘못된 요청이에요."); }
  const key = String(body?.key ?? "");
  const scheduledId = String(body?.scheduledId ?? "");
  const scoreA = Number(body?.scoreA), scoreB = Number(body?.scoreB);
  const okScore = (n: number) => Number.isInteger(n) && n >= 0 && n <= 999;
  if (key.length < 12 || !scheduledId || !okScore(scoreA) || !okScore(scoreB)) return fail("점수를 다시 확인해 주세요.");
  if (scoreA === scoreB) return fail("비긴 경기는 넣을 수 없어요. 이긴 팀 점수가 더 커야 해요.");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // 1) 열쇠 → 오늘 살아 있는 수업
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: sess } = await db.from("assignment_sessions")
    .select("id, league_id").eq("input_key", key).eq("input_key_day", today).maybeSingle();
  if (!sess) return fail("입력이 닫혔어요. 선생님께 새 QR을 받아 주세요.", 403);

  // 2) 줄
  const { data: row } = await db.from("scheduled_matches")
    .select("id, session_id, status, player_a_id, player_a2_id, player_b_id, player_b2_id")
    .eq("id", scheduledId).maybeSingle();
  if (!row || row.session_id !== sess.id) return fail("이 경기를 찾을 수 없어요.", 404);
  if (row.status !== "waiting" && row.status !== "called") return fail("이미 기록된 경기예요.", 409);
  if (!row.player_a_id || !row.player_b_id) return fail("팀이 아직 안 정해진 줄이에요.");

  // 3) 계산 재료 — 리그 설정·선수·이번 시즌 경기
  const { data: league } = await db.from("leagues").select("settings").eq("id", sess.league_id).single();
  const season = (league?.settings?.season as string) || "시즌 1";
  const { data: players, error: pe } = await db.from("players").select(PLAYER_COLS)
    .eq("league_id", sess.league_id).or("is_deleted.is.null,is_deleted.eq.false");
  if (pe) return fail("잠시 뒤 다시 눌러 주세요.", 500);
  const matchRows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("matches").select(MATCH_COLS)
      .eq("league_id", sess.league_id).eq("season", season)
      .order("created_at", { ascending: true }).range(from, from + 999);
    if (error) return fail("잠시 뒤 다시 눌러 주세요.", 500);
    matchRows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  // 4) 계산 — 교사 태블릿과 같은 코드
  const matchId = crypto.randomUUID();
  let out;
  try {
    out = computeScoreInput({
      settings: league?.settings, playerRows: players || [], matchRows,
      teamA: [row.player_a_id, row.player_a2_id].filter(Boolean),
      teamB: [row.player_b_id, row.player_b2_id].filter(Boolean),
      scoreA, scoreB, matchId, nowIso: new Date().toISOString(),
    });
  } catch (e) {
    return fail((e as Error).message || "계산하지 못했어요.");
  }

  // 5) 저장 — 열쇠·줄 상태를 DB 가 한 번 더 확인하고 줄을 잠근다
  const { error: re } = await db.rpc("record_match_by_key", {
    p_key: key, p_scheduled_id: scheduledId, p_match_id: matchId,
    p_winner_id: out.winnerId, p_loser_id: out.loserId, p_winner2_id: out.winner2Id, p_loser2_id: out.loser2Id,
    p_winner_score: out.winnerScore, p_loser_score: out.loserScore,
    p_rp_delta_winner: out.rpDeltaWinner, p_rp_delta_loser: out.rpDeltaLoser,
    p_rp_delta_winner2: out.rpDeltaWinner2, p_rp_delta_loser2: out.rpDeltaLoser2,
  });
  if (re) return fail(re.message || "저장하지 못했어요.", 409);

  const aWon = scoreA > scoreB;
  return json({
    ok: true,
    // 학생 화면에 보여 줄 것: 줄의 팀 순서(A/B) 기준 RP 변화
    deltaA: [out.playerStats.find((p) => p.role === "A")?.delta ?? 0, out.playerStats.find((p) => p.role === "A2")?.delta ?? null],
    deltaB: [out.playerStats.find((p) => p.role === "B")?.delta ?? 0, out.playerStats.find((p) => p.role === "B2")?.delta ?? null],
    aWon,
  });
});
