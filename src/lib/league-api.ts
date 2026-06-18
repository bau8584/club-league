import { supabase } from "../supabaseClient";

// --- Auth API ---
export async function apiGetUser() {
  return supabase.auth.getUser();
}

export async function apiSignOut() {
  return supabase.auth.signOut();
}

// --- Classes API ---
export async function apiFetchClass(classId: string) {
  return supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();
}

export async function apiFetchClassSettings(classId: string) {
  return supabase
    .from("classes")
    .select("settings")
    .eq("id", classId)
    .single();
}

export async function apiUpdateClassSettings(classId: string, settings: any) {
  return supabase
    .from("classes")
    .update({ settings })
    .eq("id", classId);
}

export async function apiUpdateClassSettingsAndName(classId: string, className: string, settings: any) {
  return supabase
    .from("classes")
    .update({ class_name: className, settings })
    .eq("id", classId);
}

// --- Matches API ---
// season 을 주면 해당 시즌 경기만, 안 주면 전체.
export async function apiFetchMatches(classId: string, season?: string) {
  let q = supabase
    .from("matches")
    .select("*")
    .eq("class_id", classId);
  if (season) q = q.eq("season", season);
  return q.order("created_at", { ascending: true });
}

export async function apiInsertMatch(classId: string, winnerId: string, loserId: string) {
  return supabase
    .from("matches")
    .insert({
      class_id: classId,
      winner_id: winnerId,
      loser_id: loserId
    });
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
    .eq("class_id", classId);
}

export async function apiInsertMatchesBulk(matches: any[]) {
  return supabase
    .from("matches")
    .insert(matches);
}

export async function apiUpdateMatchWinnerLoser(matchId: string, winnerId: string, loserId: string) {
  return supabase
    .from("matches")
    .update({
      winner_id: winnerId,
      loser_id: loserId
    })
    .eq("id", matchId);
}

// --- Students API ---
// 교사용 학생 목록 조회 (real_name 포함)
export async function apiFetchStudents(classId: string) {
  return supabase
    .from("students")
    .select("id, class_id, rp, tier, win_count, lose_count, nickname, real_name, grade, class_number, student_no, gender, is_deleted, recent_matches, display_name")
    .eq("class_id", classId)
    .or("is_deleted.is.null,is_deleted.eq.false");
}

// 학생용/리더보드용 학생 목록 조회 (real_name 제외, display_name 사용)
export async function apiFetchStudentsPublic(classId: string) {
  return supabase
    .from("students_public")
    .select("id, class_id, rp, tier, win_count, lose_count, nickname, grade, class_number, student_no, gender, is_deleted, recent_matches, display_name")
    .eq("class_id", classId)
    .or("is_deleted.is.null,is_deleted.eq.false");
}

export async function apiUpdateStudentRp(studentId: string, rp: number) {
  return supabase
    .from("students")
    .update({ rp })
    .eq("id", studentId);
}

export async function apiResetStudentRp(studentId: string) {
  return supabase
    .from("students")
    .update({ rp: 1000 })
    .eq("id", studentId);
}

export async function apiResetAllClassStudentsRp(classId: string) {
  return supabase
    .from("students")
    .update({ rp: 1000 })
    .eq("class_id", classId);
}

export async function apiUpdateStudentFields(studentId: string, fields: {
  grade?: number;
  class_number?: number;
  student_no?: number;
  real_name?: string;
  nickname?: string | null;
  gender?: string;
}) {
  return supabase
    .from("students")
    .update(fields)
    .eq("id", studentId);
}

export async function apiInsertStudent(classId: string, info: {
  grade: number;
  class_number: number;
  student_no: number;
  real_name: string;
  nickname?: string | null;
  gender?: string;
  rp?: number;
}) {
  return supabase
    .from("students")
    .insert({
      class_id: classId,
      rp: info.rp ?? 1000,
      grade: info.grade,
      class_number: info.class_number,
      student_no: info.student_no,
      real_name: info.real_name,
      nickname: info.nickname ?? null,
      gender: info.gender ?? "U"
    })
    .select("id")
    .single();
}

export async function apiSoftDeleteStudent(studentId: string) {
  return supabase
    .from("students")
    .update({ is_deleted: true })
    .eq("id", studentId);
}

// 삭제된(휴지통) 학생 목록
export async function apiFetchDeletedStudents(classId: string) {
  return supabase
    .from("students")
    .select("id, rp, real_name, nickname, grade, class_number, student_no, gender")
    .eq("class_id", classId)
    .eq("is_deleted", true);
}

// 휴지통에서 복원
export async function apiRestoreStudent(studentId: string) {
  return supabase
    .from("students")
    .update({ is_deleted: false })
    .eq("id", studentId);
}

// 영구 삭제 (행 자체 제거)
export async function apiHardDeleteStudent(studentId: string) {
  return supabase
    .from("students")
    .delete()
    .eq("id", studentId);
}

export async function apiUpdateStudentInfo(studentId: string, payload: {
  grade?: number;
  class_number?: number;
  student_no?: number;
  real_name?: string;
  nickname?: string | null;
  gender?: string;
  rp?: number;
}) {
  return supabase
    .from("students")
    .update(payload)
    .eq("id", studentId);
}

export async function apiDeleteClassStudents(classId: string) {
  return supabase
    .from("students")
    .delete()
    .eq("class_id", classId);
}

export async function apiInsertStudentsBulk(students: any[]) {
  return supabase
    .from("students")
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
}) {
  const { error } = await supabase.rpc('record_match_transaction', {
    p_class_id: payload.classId,
    p_match_id: payload.matchId,
    p_winner_id: payload.winnerId,
    p_loser_id: payload.loserId,
    p_player_updates: payload.playerUpdates
  });
  if (error) throw error;
}

// --- Student Self-Service API (개인 코드/별명) ---
// 모든 쓰기는 서버 RPC를 거쳐 코드 검증 후에만 수행됩니다(코드는 클라이언트로 내려오지 않음).
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

// 교사 전용: 학생 개인 코드 초기화 (RLS로 교사만 허용)
export async function apiResetStudentCode(studentId: string) {
  return supabase.from("student_secrets").delete().eq("student_id", studentId);
}

// --- Seasons API ---
// 시즌 목록 (과거 스냅샷 + 현재). 각 행: { season, is_current }
export async function apiListSeasons(classId: string) {
  return supabase.rpc("list_class_seasons", { p_class_id: classId });
}

// 새 시즌 시작 (소유자/공동관리자만, 서버에서 권한 검증).
// 현재 순위 스냅샷 → 학생 RP/전적 초기화 → 시즌 라벨 변경을 한 트랜잭션에서 수행.
export async function apiStartNewSeason(classId: string, newSeason: string) {
  return supabase.rpc("start_new_season", { p_class_id: classId, p_new_season: newSeason });
}

// 과거 시즌 최종 순위 스냅샷 조회 (교사용 — real_name 포함, RLS로 교사만 허용)
export async function apiFetchSeasonStandings(classId: string, season: string) {
  return supabase
    .from("season_standings")
    .select("*")
    .eq("class_id", classId)
    .eq("season", season);
}

// 과거 시즌 순위 공개 조회 (학생/익명용 — real_name 제외)
export async function apiFetchSeasonStandingsPublic(classId: string, season: string) {
  return supabase.rpc("get_season_standings_public", {
    p_class_id: classId,
    p_season: season,
  });
}

// 과거 시즌으로 복귀 (이어서 진행)
export async function apiRestoreSeason(classId: string, targetSeason: string) {
  return supabase.rpc("restore_season", { p_class_id: classId, p_target_season: targetSeason });
}

// 시즌 이름 변경
export async function apiRenameSeason(classId: string, oldName: string, newName: string) {
  return supabase.rpc("rename_season", { p_class_id: classId, p_old: oldName, p_new: newName });
}

// 과거 시즌 삭제 (deleteMatches=true면 경기 원본까지 삭제)
export async function apiDeleteSeason(classId: string, season: string, deleteMatches = false) {
  return supabase.rpc("delete_season", { p_class_id: classId, p_season: season, p_delete_matches: deleteMatches });
}

// --- Class Secrets API ---
export async function apiFetchClassSecret(classId: string) {
  return supabase
    .from("class_secrets")
    .select("admin_code")
    .eq("class_id", classId)
    .single();
}

export async function apiUpdateClassSecret(classId: string, adminCode: string) {
  return supabase
    .from("class_secrets")
    .update({ admin_code: adminCode })
    .eq("class_id", classId);
}
