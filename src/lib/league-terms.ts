import { useLeagueStore } from "./league-store";
import type { LeagueType } from "./league-types";

/**
 * 리그 유형(club/school)에 따라 달라지는 화면 용어 모음.
 * club(동호인)은 "회원/방장/레벨", school(학교)은 "학생/선생님/학년·반" 축을 쓴다.
 * 화면 문구에만 쓰고, DB 컬럼명이나 내부 식별자에는 쓰지 않는다.
 */
export type LeagueTerms = {
  /** 리그 참가자 1명 — 회원 / 학생 */
  member: string;
  /** 참가자 복수 — 회원들 / 학생들 */
  members: string;
  /** 최고 관리자 — 방장 / 선생님 */
  owner: string;
  /** 최고 관리자와 동급의 공동 권한자 — 공동방장 / 공동 담당 선생님 */
  coOwner: string;
  /** 공동 관리자 — 관리자 / 담당 선생님 */
  manager: string;
  /** 등록 명단 — 회원 명단 / 학생 명부 */
  roster: string;
  /** 이름 필드 라벨 — 닉네임 / 이름 */
  nameLabel: string;
  /** 조 편성 축 — 레벨 / 학년·반 */
  groupLabel: string;
};

export const CLUB_TERMS: LeagueTerms = {
  member: "회원",
  members: "회원",
  owner: "방장",
  coOwner: "공동방장",
  manager: "관리자",
  roster: "회원 명단",
  nameLabel: "닉네임",
  groupLabel: "레벨",
};

export const SCHOOL_TERMS: LeagueTerms = {
  member: "학생",
  members: "학생",
  owner: "선생님",
  coOwner: "공동 담당 선생님",
  manager: "담당 선생님",
  roster: "학생 명부",
  nameLabel: "이름",
  groupLabel: "학년·반",
};

export function termsFor(leagueType: LeagueType): LeagueTerms {
  return leagueType === "school" ? SCHOOL_TERMS : CLUB_TERMS;
}

/** 현재 로드된 리그의 유형에 맞는 용어 모음을 돌려준다. */
export function useLeagueTerms(): LeagueTerms {
  const { leagueType } = useLeagueStore();
  return termsFor(leagueType);
}

/** school 리그 여부 — 레벨 체계처럼 club 전용 UI를 숨길 때 쓴다. */
export function useIsSchoolLeague(): boolean {
  const { leagueType } = useLeagueStore();
  return leagueType === "school";
}
