import { supabase } from "../supabaseClient";
import type { PlayerInsert, MatchInsert, MatchUpdate } from "../lib/database.types";
import { buildAssignedMatchRows, type AssignedMatchInput } from "../domain/assignment-rows";

// 동호회 스키마(leagues/players/matches/league_secrets/players_public)에 대응.
// 프론트엔드 호환을 위해 함수/파라미터 이름은 유지하되, 테이블/컬럼은 클럽 이름 사용.

// --- Auth API ---
export async function apiGetUser() {
  return supabase.auth.getUser();
}

export async function apiSignOut() {
  return supabase.auth.signOut();
}

// --- Leagues API ---
export async function apiFetchClass(classId: string) {
  return supabase
    .from("leagues")
    .select("*")
    .eq("id", classId)
    .maybeSingle();
}

export async function apiFetchClassSettings(classId: string) {
  return supabase
    .from("leagues")
    .select("settings")
    .eq("id", classId)
    .single();
}

export async function apiUpdateClassSettings(classId: string, settings: any) {
  return supabase
    .from("leagues")
    .update({ settings })
    .eq("id", classId);
}

export async function apiUpdateClassSettingsAndName(classId: string, className: string, settings: any) {
  return supabase
    .from("leagues")
    .update({ name: className, settings })
    .eq("id", classId);
}

// --- Matches API ---
// season 을 주면 해당 시즌 경기만, 안 주면 전체.
// PostgREST 기본 1000행 상한을 넘기지 않도록 1000행씩 페이지네이션해 전부 가져온다.
// (경기가 1000건을 넘는 활성 리그에서 통계가 잘리는 버그 방지)
export async function apiFetchMatches(classId: string, season?: string) {
  const PAGE = 1000;
  const all: any[] = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from("matches")
      .select("*")
      .eq("league_id", classId);
    if (season) q = q.eq("season", season);
    const { data, error } = await q
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return { data: all, error: null };
}

// --- 대진 호출(예정 경기) ---
/**
 * 큐 읽기. `sessionId`를 주면 그 세션의 줄만 본다(학교 — 옆 반 수업이 섞이면 안 된다).
 *
 * 세션 밖의 줄(session_id is null)은 함께 본다. 도전장과 회원 예약은 특정 수업에 속한
 * 것이 아니고, 마이그레이션 이전에 만들어진 줄도 여기 해당한다. 걸러내면 쓰던 큐가
 * 배포와 동시에 화면에서 사라진다.
 */
export async function apiFetchScheduledMatches(classId: string, sessionId?: string | null) {
  let q = supabase
    .from("scheduled_matches")
    .select("*")
    .eq("league_id", classId)
    .in("status", ["waiting", "called", "challenge"]);
  if (sessionId) q = q.or(`session_id.eq.${sessionId},session_id.is.null`);
  return q.order("created_at", { ascending: true });
}

// 도전장 생성 (회원이 상대 지목) / 응답(수락→called, 거절→cancelled)
export async function apiCreateChallenge(payload: {
  classId: string; challengerId: string; targetId: string; matchType?: "single" | "double";
}) {
  return supabase.from("scheduled_matches").insert({
    league_id: payload.classId,
    player_a_id: payload.challengerId,
    player_b_id: payload.targetId,
    match_type: payload.matchType ?? "single",
    status: "challenge",
  });
}

export async function apiRespondChallenge(id: string, accept: boolean) {
  return supabase.from("scheduled_matches").update({ status: accept ? "called" : "cancelled" }).eq("id", id);
}

export async function apiCreateScheduledMatch(payload: {
  classId: string;
  matchType: "single" | "double";
  playerAId: string;
  playerBId: string;
  playerA2Id?: string | null;
  playerB2Id?: string | null;
  court?: string | null;
  /** 손으로 넣은 대진도 지금 도는 수업의 줄이다. 안 찍으면 옆 반 화면에도 뜬다. */
  sessionId?: string | null;
}) {
  return supabase.from("scheduled_matches").insert({
    league_id: payload.classId,
    session_id: payload.sessionId ?? null,
    match_type: payload.matchType,
    player_a_id: payload.playerAId,
    player_b_id: payload.playerBId,
    player_a2_id: payload.playerA2Id ?? null,
    player_b2_id: payload.playerB2Id ?? null,
    court: payload.court ?? null,
  });
}

/**
 * 배정 전용 bulk insert — 계산기가 낸 대진을 큐에 한 번에 넣는다.
 *
 * `apiCreateReservation`을 재사용하지 않는다. 같은 테이블에 쓰지만 검증 규칙이 다르다.
 * 예약은 1인 3개 제한과 "본인 포함" 검사가 있고 팀 미정(player_ids)이지만,
 * 배정은 운영진이 남들 경기를 대량 생성하는 것이고 팀이 이미 확정(슬롯 4개)이다.
 * 한 함수에 "배정이면 이 검사 건너뛰기" 플래그를 달기 시작하면 두 기능이 서로를 망가뜨린다.
 * 읽는 쪽(목록·취소)은 그대로 공유한다.
 *
 * `court`는 항상 null이다 — 아무도 그 데이터를 안 쓰고, 눈으로 보면 알고, 틀려도 아무도 안 고친다.
 * created_at은 행마다 1ms씩 벌려 넣는다. 한 번의 insert는 트랜잭션 시각이 같아
 * default now()로는 큐 순서가 뒤섞이는데, 상위 N개가 곧 "진행 중"이므로 순서가 곧 의미다.
 */
export async function apiBulkCreateAssignedMatches(payload: AssignedMatchInput) {
  const rows = buildAssignedMatchRows(payload);
  if (rows.length === 0) return { data: [], error: null };
  return supabase.from("scheduled_matches").insert(rows).select();
}

// --- 배정 세션(참가자 명단) ---
// 명단과 큐가 다른 저장소에 있으면 계산이 틀린다. 큐가 이미 서버에 있으므로 명단도 서버에 둔다.

/** 내 세션을 찾는다. 학교는 `ownerId`(내 계정)로, 동호회는 주인 없는 한 행으로. */
export async function apiFetchAssignmentSession(classId: string, ownerId?: string | null) {
  const q = supabase.from("assignment_sessions").select("*").eq("league_id", classId);
  return (ownerId ? q.eq("owner_id", ownerId) : q.is("owner_id", null)).maybeSingle();
}

/**
 * [새로 시작] / 명단 수정.
 * `startedAt`을 주면 새 세션(경계)이고, 안 주면 기존 세션의 명단만 고치는 것이다.
 *
 * upsert 를 쓰지 않는다. 유일성이 부분 인덱스(owner_id is null / is not null)로 걸려 있는데,
 * PostgREST 의 onConflict 는 컬럼 목록만 받을 뿐 인덱스의 조건절을 표현하지 못해 충돌을
 * 인식하지 못한다. 찾아서 UPDATE, 없으면 INSERT 로 명시한다.
 *
 * 두 기기가 동시에 [새로 시작]을 눌러 둘 다 INSERT 로 가면 부분 인덱스가 한쪽을 막는다(23505).
 * 막힌 쪽은 상대가 방금 만든 행을 다시 찾아 UPDATE 한다 — 이기는 쪽이 정해질 뿐 행은 하나다.
 */
export async function apiUpsertAssignmentSession(payload: {
  classId: string;
  ownerId?: string | null;
  playerIds: string[];
  matchType: "single" | "double";
  startedAt?: string;
  /** [새로 시작]에서 번호를 1번으로 되돌린다. 같은 행을 계속 쓰므로 저절로 초기화되지 않는다. */
  resetSeq?: boolean;
}) {
  const ownerId = payload.ownerId ?? null;
  const fields = {
    player_ids: payload.playerIds,
    match_type: payload.matchType,
    ...(payload.startedAt ? { started_at: payload.startedAt } : {}),
    ...(payload.resetSeq ? { next_seq: 1 } : {}),
    updated_at: new Date().toISOString(),
  };

  const write = async () => {
    const { data: found } = await apiFetchAssignmentSession(payload.classId, ownerId);
    if (found) {
      return supabase
        .from("assignment_sessions")
        .update(fields)
        .eq("id", (found as { id: string }).id)
        .select()
        .maybeSingle();
    }
    return supabase
      .from("assignment_sessions")
      .insert({ league_id: payload.classId, owner_id: ownerId, ...fields })
      .select()
      .maybeSingle();
  };

  const first = await write();
  // 23505 = unique_violation. 상대가 먼저 만들었다는 뜻이므로 한 번만 다시 시도한다.
  if (first.error?.code === "23505") return write();
  return first;
}

/**
 * 대진 번호 `n`개를 발급받아 첫 번호를 돌려준다.
 * 서버에서 원자적으로 더한다 — 폰과 태블릿이 동시에 채우면 #7 이 두 개 생기기 때문이다.
 */
export async function apiAllocMatchSeq(sessionId: string, n: number) {
  return supabase.rpc("alloc_match_seq", { p_session_id: sessionId, p_n: n });
}

/**
 * 세션 경계에서 미소화 큐를 비운다. 날짜로는 못 자른다 — 같은 날 3교시와 4교시는 날짜가 같다.
 *
 * `sessionId`를 주면 그 세션의 줄만 지운다. 여기가 옆 반 대기열이 통째로 날아가던 자리다.
 * 세션 밖의 줄 중에서는 **내가 만든 것만** 함께 지운다(마이그레이션 이전에 내가 뽑아둔 줄).
 * 남의 옛 줄까지 쓸어버리면 고치려던 문제를 그대로 되풀이한다.
 */
export async function apiClearQueue(classId: string, opts?: { sessionId?: string | null; myUid?: string | null }) {
  const q = supabase
    .from("scheduled_matches")
    .delete()
    .eq("league_id", classId)
    .in("status", ["waiting", "called"]);
  if (!opts?.sessionId) return q;
  const mine = opts.myUid ? `,and(session_id.is.null,created_by.eq.${opts.myUid})` : "";
  return q.or(`session_id.eq.${opts.sessionId}${mine}`);
}

export async function apiUpdateScheduledStatus(id: string, status: "waiting" | "called" | "done" | "cancelled") {
  return supabase.from("scheduled_matches").update({ status }).eq("id", id);
}

// 인원 소집 예약 — 팀 미정, 참가자만 지정(player_ids). 결과 입력 때 팀이 확정된다.
export async function apiCreateReservation(payload: {
  classId: string;
  playerIds: string[];
  matchType?: "single" | "double";
  court?: string | null;
}) {
  return supabase.from("scheduled_matches").insert({
    league_id: payload.classId,
    match_type: payload.matchType ?? "double",
    player_ids: payload.playerIds,
    court: payload.court ?? null,
    status: "waiting",
  });
}

// 예약을 완료 처리한다. result_match_id(경기 링크)는 그 경기가 비동기 RPC로 아직
// DB에 커밋되기 전이라 외래키 위반이 나므로 여기서는 설정하지 않는다(status 만 done).
export async function apiLinkScheduledResult(id: string, _matchId: string) {
  return supabase.from("scheduled_matches")
    .update({ status: "done" })
    .eq("id", id);
}

// 예약 참가자(player_ids) 수정 — 참가/빼기/추가
export async function apiUpdateReservationPlayers(id: string, playerIds: string[]) {
  return supabase.from("scheduled_matches").update({ player_ids: playerIds }).eq("id", id);
}

// 알림 발신 기록(누가/언제) — 1분 쿨다운 계산 + 발신자 표시용
export async function apiTouchReservationNotify(id: string, by: string | null) {
  return supabase.from("scheduled_matches")
    .update({ notified_by: by, notified_at: new Date().toISOString() })
    .eq("id", id);
}

export async function apiDeleteScheduledMatch(id: string) {
  return supabase.from("scheduled_matches").delete().eq("id", id);
}

export async function apiInsertMatch(classId: string, winnerId: string, loserId: string) {
  return supabase
    .from("matches")
    .insert({
      league_id: classId,
      winner_id: winnerId,
      loser_id: loserId
    } satisfies MatchInsert);
}

export async function apiDeleteMatch(matchId: string) {
  return supabase
    .from("matches")
    .delete()
    .eq("id", matchId);
}

// 경기 롤백: 저장된 델타로 서버에서 원자적으로 rp 역산 + 경기 삭제(동시성 안전).
export async function apiRollbackMatch(classId: string, matchId: string) {
  const { error } = await supabase.rpc("rollback_match", { p_class_id: classId, p_match_id: matchId });
  if (error) throw error;
}

// RP 정합성 재계산(관리자): 현 시즌 경기 델타·감점 기준으로 rp를 다시 맞춘다.
export async function apiRecomputeLeagueRp(classId: string) {
  return supabase.rpc("recompute_league_rp", { p_class_id: classId });
}

export async function apiDeleteStudentMatches(studentId: string) {
  return supabase
    .from("matches")
    .delete()
    .or(`winner_id.eq.${studentId},loser_id.eq.${studentId}`);
}

export async function apiDeleteClassMatches(classId: string) {
  return supabase
    .from("matches")
    .delete()
    .eq("league_id", classId);
}

export async function apiInsertMatchesBulk(matches: any[]) {
  return supabase
    .from("matches")
    .insert(matches);
}

export async function apiUpdateMatchWinnerLoser(
  matchId: string,
  winnerId: string,
  loserId: string,
  extra?: {
    winner2Id?: string | null; loser2Id?: string | null;
    winnerScore?: number | null; loserScore?: number | null;
    rpDeltaWinner?: number | null; rpDeltaLoser?: number | null;
    rpDeltaWinner2?: number | null; rpDeltaLoser2?: number | null;
  }
) {
  const patch: MatchUpdate = { winner_id: winnerId, loser_id: loserId };
  if (extra) {
    patch.winner2_id = extra.winner2Id ?? null;
    patch.loser2_id = extra.loser2Id ?? null;
    patch.winner_score = extra.winnerScore ?? null;
    patch.loser_score = extra.loserScore ?? null;
    patch.rp_delta_winner = extra.rpDeltaWinner ?? null;
    patch.rp_delta_loser = extra.rpDeltaLoser ?? null;
    patch.rp_delta_winner2 = extra.rpDeltaWinner2 ?? null;
    patch.rp_delta_loser2 = extra.rpDeltaLoser2 ?? null;
  }
  return supabase
    .from("matches")
    .update(patch)
    .eq("id", matchId);
}

// --- Players API ---
// 관리자용 선수 목록 (name 포함)
export async function apiFetchStudents(classId: string) {
  return supabase
    .from("players")
    .select("id, league_id, user_id, rp, tier, win_count, lose_count, nickname, name, group_label, birth_year, grade, class_num, student_no, gender, is_deleted, recent_matches, display_name, equipped_title")
    .eq("league_id", classId)
    .or("is_deleted.is.null,is_deleted.eq.false");
}

// 공개/리더보드용 선수 목록 (name 제외, display_name 사용)
export async function apiFetchStudentsPublic(classId: string) {
  return supabase
    .from("players_public")
    .select("id, league_id, user_id, rp, tier, win_count, lose_count, nickname, group_label, gender, is_deleted, recent_matches, display_name, equipped_title, grade, class_num, student_no")
    .eq("league_id", classId)
    .or("is_deleted.is.null,is_deleted.eq.false");
}

/**
 * 무인증 공개 순위표 전용 조회.
 * 학교 리그면 서버에서 이름을 성만 남겨(홍○○) 내려준다 — 응답 본문에 실명이 담기지 않도록
 * 마스킹은 반드시 DB(RPC)에서 한다. players_public 은 anon 권한이 회수돼 있다.
 */
export async function apiFetchRankingPublic(classId: string) {
  return supabase.rpc("get_ranking_public", { p_class_id: classId });
}

/** 교실 화면에서 고를 학년·반 목록. */
export async function apiFetchClassOptionsPublic(classId: string) {
  return supabase.rpc("get_class_options_public", { p_league_id: classId });
}

/**
 * 교실 화면 — 대기열 + 등급. 로그인 없이 연다.
 *
 * 대기열의 실명 여부, 무엇을 보여줄지는 전부 서버가 정한다. 화면에서 가리는 방식이면
 * 실명이 이미 브라우저까지 내려온 뒤라 조금만 아는 사람은 그냥 꺼내 본다.
 */
export async function apiFetchClassViewPublic(payload: {
  classId: string;
  ownerId?: string | null;
  grade?: number | null;
  classNum?: number | null;
}) {
  return supabase.rpc("get_class_view_public", {
    p_league_id: payload.classId,
    p_owner_id: payload.ownerId ?? null,
    p_grade: payload.grade ?? null,
    p_class_num: payload.classNum ?? null,
  });
}

export async function apiUpdateStudentRp(studentId: string, rp: number) {
  return supabase
    .from("players")
    .update({ rp })
    .eq("id", studentId);
}

// 휴면 감점 수동 실시 — 대상 entries를 RPC로 일괄 차감 + decay_log 기록. batch_id 반환.
export async function apiApplyDormancyDecay(
  classId: string,
  season: string,
  entries: { player_id: string; player_name: string; tier: string; decay_rp: number }[]
) {
  return supabase.rpc("apply_dormancy_decay", {
    p_class_id: classId,
    p_season: season,
    p_entries: entries,
  });
}

// 휴면 감점 내역 조회 (관리자 전용, 최신순)
export async function apiFetchDecayLog(classId: string) {
  return supabase
    .from("decay_log")
    .select("*")
    .eq("league_id", classId)
    .order("applied_at", { ascending: false })
    .limit(300);
}

export async function apiResetStudentRp(studentId: string) {
  return supabase
    .from("players")
    .update({ rp: 1000 })
    .eq("id", studentId);
}

export async function apiResetAllClassStudentsRp(classId: string) {
  return supabase
    .from("players")
    .update({ rp: 1000 })
    .eq("league_id", classId);
}

export async function apiUpdateStudentFields(studentId: string, fields: {
  name?: string | null;
  nickname?: string | null;
  gender?: string;
  group_label?: string | null;
  birth_year?: number | null;
  grade?: number | null;
  class_num?: number | null;
  student_no?: number | null;
  equipped_title?: string | null;
}) {
  return supabase
    .from("players")
    .update(fields)
    .eq("id", studentId);
}

export async function apiInsertStudent(classId: string, info: {
  name?: string | null;
  nickname?: string | null;
  gender?: string;
  group_label?: string | null;
  birth_year?: number | null;
  grade?: number | null;
  class_num?: number | null;
  student_no?: number | null;
  user_id?: string | null;
  rp?: number;
}) {
  return supabase
    .from("players")
    .insert({
      league_id: classId,
      rp: info.rp ?? 1000,
      name: info.name ?? null,
      nickname: info.nickname ?? null,
      gender: info.gender ?? "U",
      group_label: info.group_label ?? null,
      birth_year: info.birth_year ?? null,
      grade: info.grade ?? null,
      class_num: info.class_num ?? null,
      student_no: info.student_no ?? null,
      user_id: info.user_id ?? null
    } satisfies PlayerInsert)
    .select("id")
    .single();
}

export async function apiSoftDeleteStudent(studentId: string) {
  return supabase
    .from("players")
    .update({ is_deleted: true })
    .eq("id", studentId);
}

// 삭제된(휴지통) 선수 목록
export async function apiFetchDeletedStudents(classId: string) {
  return supabase
    .from("players")
    .select("id, rp, name, nickname, group_label, gender")
    .eq("league_id", classId)
    .eq("is_deleted", true);
}

// 휴지통에서 복원
export async function apiRestoreStudent(studentId: string) {
  return supabase
    .from("players")
    .update({ is_deleted: false })
    .eq("id", studentId);
}

// 영구 삭제 (행 자체 제거)
export async function apiHardDeleteStudent(studentId: string) {
  return supabase
    .from("players")
    .delete()
    .eq("id", studentId);
}

export async function apiUpdateStudentInfo(studentId: string, payload: {
  name?: string;
  nickname?: string | null;
  gender?: string;
  group_label?: string | null;
  rp?: number;
  birth_year?: number | null;
  grade?: number | null;
  class_num?: number | null;
  student_no?: number | null;
}) {
  return supabase
    .from("players")
    .update(payload)
    .eq("id", studentId);
}

export async function apiDeleteClassStudents(classId: string) {
  return supabase
    .from("players")
    .delete()
    .eq("league_id", classId);
}

export async function apiInsertStudentsBulk(students: any[]) {
  return supabase
    .from("players")
    .insert(students);
}

// 안전한 복원: 서버에서 원자적(트랜잭션)으로 삭제+삽입. 실패 시 자동 롤백.
export async function apiRestoreClassData(classId: string, students: any[], matches: any[]) {
  return supabase.rpc("restore_class_data", {
    p_class_id: classId,
    p_students: students,
    p_matches: matches,
  });
}

export async function apiRecordMatchTransaction(payload: {
  classId: string;
  matchId: string;
  winnerId: string;
  loserId: string;
  playerUpdates: { id: string; rp: number }[];
  winner2Id?: string | null;
  loser2Id?: string | null;
  winnerScore?: number | null;
  loserScore?: number | null;
  rpDeltaWinner?: number | null;
  rpDeltaLoser?: number | null;
  rpDeltaWinner2?: number | null;
  rpDeltaLoser2?: number | null;
}) {
  const { error } = await supabase.rpc('record_match_transaction', {
    p_class_id: payload.classId,
    p_match_id: payload.matchId,
    p_winner_id: payload.winnerId,
    p_loser_id: payload.loserId,
    p_player_updates: payload.playerUpdates,
    p_winner2_id: payload.winner2Id ?? null,
    p_loser2_id: payload.loser2Id ?? null,
    p_winner_score: payload.winnerScore ?? null,
    p_loser_score: payload.loserScore ?? null,
    p_rp_delta_winner: payload.rpDeltaWinner ?? null,
    p_rp_delta_loser: payload.rpDeltaLoser ?? null,
    p_rp_delta_winner2: payload.rpDeltaWinner2 ?? null,
    p_rp_delta_loser2: payload.rpDeltaLoser2 ?? null
  });
  if (error) throw error;
}

// 결과 영수증 스냅샷 저장 (record_match_transaction RPC 성공 직후 호출)
export async function apiSaveMatchBreakdown(matchId: string, breakdown: unknown) {
  return supabase.from("matches").update({ rp_breakdown: breakdown }).eq("id", matchId);
}

// --- 일반 회원(self-signup) API ---
// 명단의 비어있는 닉네임(계정 미연결)을 내 계정에 연동
export async function apiClaimPlayer(playerId: string) {
  return supabase.rpc("claim_player", { p_player_id: playerId });
}

// 방장: 멤버 ↔ 관리자 승격/강등
export async function apiSetMemberAdmin(classId: string, uid: string, makeAdmin: boolean) {
  return supabase.rpc("set_member_admin", { p_class_id: classId, p_uid: uid, p_make_admin: makeAdmin });
}

// 관리자: 리그 멤버(uid·이메일·역할) 목록 — 연동 계정 조회용 (security definer, 관리자 전용)
export async function apiGetLeagueMembers(classId: string) {
  return supabase.rpc("get_league_members", { p_class_id: classId });
}

// 관리자: 선수 닉네임에서 계정 연동 해제 (user_id=null). 전적·명단 행은 보존.
export async function apiUnlinkPlayer(playerId: string) {
  return supabase.from("players").update({ user_id: null }).eq("id", playerId);
}

// 방장(최고관리자) 위임 — 소유권 이전 + 기존 방장은 공동방장으로 환원
export async function apiTransferOwnership(classId: string, newOwner: string) {
  return supabase.rpc("transfer_ownership", { p_class_id: classId, p_new_owner: newOwner });
}

// 공동방장 지정/해제 (원조 방장 전용)
export async function apiSetCoOwner(classId: string, uid: string, make: boolean) {
  return supabase.rpc("set_co_owner", { p_class_id: classId, p_uid: uid, p_make: make });
}

// 레벨 이름변경/삭제 시 그 레벨이던 회원들의 group_label 일괄 이전(p_new=null이면 정리)
export async function apiSetPlayerLevel(classId: string, oldName: string, newName: string | null) {
  return supabase.rpc("set_player_level", { p_class_id: classId, p_old: oldName, p_new: newName });
}

// --- Seasons API ---
export async function apiListSeasons(classId: string) {
  return supabase.rpc("list_class_seasons", { p_class_id: classId });
}

export async function apiStartNewSeason(classId: string, newSeason: string) {
  return supabase.rpc("start_new_season", { p_class_id: classId, p_new_season: newSeason });
}

// 과거 시즌 최종 순위 (관리자용 — name 포함)
export async function apiFetchSeasonStandings(classId: string, season: string) {
  return supabase
    .from("season_standings")
    .select("*")
    .eq("league_id", classId)
    .eq("season", season);
}

// 과거 시즌 순위 공개 조회 (name 제외)
export async function apiFetchSeasonStandingsPublic(classId: string, season: string) {
  return supabase.rpc("get_season_standings_public", {
    p_class_id: classId,
    p_season: season,
  });
}


export async function apiRenameSeason(classId: string, oldName: string, newName: string) {
  return supabase.rpc("rename_season", { p_class_id: classId, p_old: oldName, p_new: newName });
}

export async function apiDeleteSeason(classId: string, season: string, deleteMatches = false) {
  return supabase.rpc("delete_season", { p_class_id: classId, p_season: season, p_delete_matches: deleteMatches });
}

// --- 무인증 공개 순위표(B안) ---
// 비로그인(anon) 사용자도 호출 가능. 리그명/유형/티어 기준선 등 렌더 최소 정보만 반환.
export async function apiFetchLeaguePublic(classId: string) {
  return supabase.rpc("get_league_public", { p_class_id: classId });
}

// 리그 이름만 변경 (헤더의 인라인 제목 편집용).
// settings 는 건드리지 않는다 — 화면에 들고 있던 오래된 설정으로 덮어쓰는 사고를 막는다.
export async function apiUpdateClassName(classId: string, className: string) {
  return supabase.from("leagues").update({ name: className }).eq("id", classId);
}

// 여러 선수를 한 번에 소프트 삭제 (선택 삭제용).
// 한 명씩 호출하면 스토어의 동기화 잠금에 막혀 첫 건만 반영된다.
export async function apiSoftDeleteStudents(studentIds: string[]) {
  return supabase.from("players").update({ is_deleted: true }).in("id", studentIds);
}
