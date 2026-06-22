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
  extra?: { winner2Id?: string | null; loser2Id?: string | null; winnerScore?: number | null; loserScore?: number | null }
) {
  const patch: MatchUpdate = { winner_id: winnerId, loser_id: loserId };
  if (extra) {
    patch.winner2_id = extra.winner2Id ?? null;
    patch.loser2_id = extra.loser2Id ?? null;
    patch.winner_score = extra.winnerScore ?? null;
    patch.loser_score = extra.loserScore ?? null;
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
    .select("id, league_id, user_id, rp, tier, win_count, lose_count, nickname, name, group_label, birth_year, gender, is_deleted, recent_matches, display_name")
    .eq("league_id", classId)
    .or("is_deleted.is.null,is_deleted.eq.false");
}

// 공개/리더보드용 선수 목록 (name 제외, display_name 사용)
export async function apiFetchStudentsPublic(classId: string) {
  return supabase
    .from("players_public")
    .select("id, league_id, rp, tier, win_count, lose_count, nickname, group_label, gender, is_deleted, recent_matches, display_name")
    .eq("league_id", classId)
    .or("is_deleted.is.null,is_deleted.eq.false");
}

export async function apiUpdateStudentRp(studentId: string, rp: number) {
  return supabase
    .from("players")
    .update({ rp })
    .eq("id", studentId);
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
    p_loser_score: payload.loserScore ?? null
  });
  if (error) throw error;
}

// --- Player Self-Service API (개인 코드/별명) ---
export async function apiStudentHasCode(studentId: string) {
  return supabase.rpc("student_has_code", { p_student_id: studentId });
}

export async function apiVerifyStudentCode(studentId: string, code: string) {
  return supabase.rpc("verify_student_code", { p_student_id: studentId, p_code: code });
}

export async function apiClaimStudent(studentId: string, code: string, nickname: string | null) {
  return supabase.rpc("claim_student", {
    p_student_id: studentId,
    p_code: code,
    p_nickname: nickname
  });
}

export async function apiUpdateStudentNickname(studentId: string, code: string, nickname: string | null) {
  return supabase.rpc("update_student_nickname", {
    p_student_id: studentId,
    p_code: code,
    p_nickname: nickname
  });
}

export async function apiChangeStudentCode(studentId: string, oldCode: string, newCode: string) {
  return supabase.rpc("change_student_code", {
    p_student_id: studentId,
    p_old_code: oldCode,
    p_new_code: newCode
  });
}

// 관리자 전용: 선수 개인 코드 초기화
export async function apiResetStudentCode(studentId: string) {
  return supabase.from("player_secrets").delete().eq("player_id", studentId);
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

export async function apiRestoreSeason(classId: string, targetSeason: string) {
  return supabase.rpc("restore_season", { p_class_id: classId, p_target_season: targetSeason });
}

export async function apiRenameSeason(classId: string, oldName: string, newName: string) {
  return supabase.rpc("rename_season", { p_class_id: classId, p_old: oldName, p_new: newName });
}

export async function apiDeleteSeason(classId: string, season: string, deleteMatches = false) {
  return supabase.rpc("delete_season", { p_class_id: classId, p_season: season, p_delete_matches: deleteMatches });
}

// --- League Secrets API ---
export async function apiFetchClassSecret(classId: string) {
  return supabase
    .from("league_secrets")
    .select("admin_code")
    .eq("league_id", classId)
    .single();
}

export async function apiUpdateClassSecret(classId: string, adminCode: string) {
  return supabase
    .from("league_secrets")
    .update({ admin_code: adminCode })
    .eq("league_id", classId);
}
