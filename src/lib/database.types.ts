// 수기 작성 DB 행 타입 (club_schema.sql 과 1:1). insert/update 페이로드에 붙여
// "없는 컬럼/NOT NULL 누락"을 컴파일 단계에서 잡는다.
// 사용 예: supabase.from("players").insert({ ... } satisfies PlayerInsert)

// ── players ─────────────────────────────────────────────
export type PlayerInsert = {
  league_id: string;            // NOT NULL
  user_id?: string | null;
  name?: string | null;
  nickname?: string | null;
  gender?: string;
  group_label?: string | null;
  birth_year?: number | null;
  rp?: number;
  tier?: string | null;
  win_count?: number;
  lose_count?: number;
  recent_matches?: string | null;
  display_name?: string | null;
  is_deleted?: boolean;
};
export type PlayerUpdate = Partial<PlayerInsert>;

// ── matches ─────────────────────────────────────────────
export type MatchInsert = {
  league_id: string;            // NOT NULL
  winner_id?: string | null;
  loser_id?: string | null;
  winner2_id?: string | null;   // 복식 승리팀 파트너
  loser2_id?: string | null;    // 복식 패배팀 파트너
  winner_score?: number | null;
  loser_score?: number | null;
  rp_delta_winner?: number | null;   // 이 경기로 승자에게 적용된 RP 변동(보너스/패널티 포함)
  rp_delta_loser?: number | null;    // 패자에게 적용된 RP 변동
  rp_delta_winner2?: number | null;  // 복식 승리팀 파트너
  rp_delta_loser2?: number | null;   // 복식 패배팀 파트너
  season?: string | null;
  status?: string;
};
export type MatchUpdate = Partial<MatchInsert>;

// ── leagues ─────────────────────────────────────────────
export type LeagueInsert = {
  owner_uid: string;            // NOT NULL
  name: string;                 // NOT NULL
  admin_uids?: string[];
  member_uids?: string[];
  settings?: Record<string, any>;
  is_deleted?: boolean;
};
export type LeagueUpdate = Partial<LeagueInsert>;
