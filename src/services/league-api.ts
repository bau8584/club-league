import { supabase } from "../supabaseClient";
import type { PlayerInsert, MatchInsert, MatchUpdate } from "../lib/database.types";

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
    .single();
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
export async function apiFetchScheduledMatches(classId: string) {
  return supabase
    .from("scheduled_matches")
    .select("*")
    .eq("league_id", classId)
    .in("status", ["waiting", "called", "challenge"])
    .order("created_at", { ascending: true });
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
}) {
  return supabase.from("scheduled_matches").insert({
    league_id: payload.classId,
    match_type: payload.matchType,
    player_a_id: payload.playerAId,
    player_b_id: payload.playerBId,
    player_a2_id: payload.playerA2Id ?? null,
    player_b2_id: payload.playerB2Id ?? null,
    court: payload.court ?? null,
  });
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
    .select("id, league_id, user_id, rp, tier, win_count, lose_count, nickname, name, group_label, birth_year, gender, is_deleted, recent_matches, display_name, equipped_title")
    .eq("league_id", classId)
    .or("is_deleted.is.null,is_deleted.eq.false");
}

// 공개/리더보드용 선수 목록 (name 제외, display_name 사용)
export async function apiFetchStudentsPublic(classId: string) {
  return supabase
    .from("players_public")
    .select("id, league_id, user_id, rp, tier, win_count, lose_count, nickname, group_label, gender, is_deleted, recent_matches, display_name, equipped_title")
    .eq("league_id", classId)
    .or("is_deleted.is.null,is_deleted.eq.false");
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
