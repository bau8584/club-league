import { describe, expect, it } from "bun:test";
import { mentoringBonusOf, rivalClashBonus, upperStreakBonus } from "./match-calculator";
import { bonusesFromPreset, detectBonusPreset, fillNewBonusFields } from "@/lib/league-presets";
import type { DynamicBonuses } from "@/lib/league-types";

/**
 * 상위 전용 보너스 — 플래티넘·다이아만 받고, 골드 이하는 아무것도 바뀌지 않는다.
 * 눈금은 모멘턴 리그 실측(플래 본전 승률 57% → 목표 ~51%)에서 왔다.
 */
const b = bonusesFromPreset("balanced");

describe("정상 결전", () => {
  it("플래티넘이 같은 티어 이상의 상대를 이기면 받는다", () => {
    expect(rivalClashBonus(b, "Platinum", "Platinum")).toBe(6);
    expect(rivalClashBonus(b, "Platinum", "Diamond")).toBe(6);
    expect(rivalClashBonus(b, "Diamond", "Diamond")).toBe(8);
  });
  it("아래 티어를 이긴 건 결전이 아니다", () => {
    expect(rivalClashBonus(b, "Platinum", "Gold")).toBe(0);
    expect(rivalClashBonus(b, "Diamond", "Platinum")).toBe(0);
  });
  it("골드 이하는 같은 티어를 이겨도 받지 않는다", () => {
    expect(rivalClashBonus(b, "Gold", "Gold")).toBe(0);
    expect(rivalClashBonus(b, "Silver", "Diamond")).toBe(0);
  });
  it("꺼져 있으면 0", () => {
    expect(rivalClashBonus({ ...b, rivalEnabled: false }, "Platinum", "Platinum")).toBe(0);
  });
});

describe("상위 연승", () => {
  it("연승 기준(streakWins)은 일반 연승과 같이 쓴다", () => {
    expect(upperStreakBonus(b, "Platinum", 2)).toBe(0);
    expect(upperStreakBonus(b, "Platinum", 3)).toBe(5);
    expect(upperStreakBonus(b, "Diamond", 4)).toBe(6);
  });
  it("골드 이하는 일반 연승이 맡는다 — 여기선 0", () => {
    expect(upperStreakBonus(b, "Gold", 5)).toBe(0);
  });
});

describe("캐리(멘토링)", () => {
  it("플래티넘이 한 단계 낮은 짝과 이기면 받고, 다이아는 다이아 값", () => {
    expect(mentoringBonusOf(b, "Platinum", "Gold")).toBe(5);
    expect(mentoringBonusOf(b, "Diamond", "Silver")).toBe(7);
  });
  it("멘토 최소 티어 아래(골드)는 낮은 짝과 이겨도 받지 않는다", () => {
    expect(mentoringBonusOf(b, "Gold", "Silver")).toBe(0);
  });
  it("멘티 보너스는 프리셋에서 0 — 낮은 쪽이 강한 짝 덕에 점수를 더 받지 않는다", () => {
    expect(mentoringBonusOf(b, "Gold", "Platinum")).toBe(0);
  });
  it("mentorMinTier 가 없던 옛 설정은 모든 티어가 멘토가 된다(기존 동작 유지)", () => {
    const legacy: DynamicBonuses = { ...b, mentoring: { enabled: true, mentorRp: 10, menteeRp: 15, minTierGap: 1 } };
    expect(mentoringBonusOf(legacy, "Gold", "Silver")).toBe(10);
    expect(mentoringBonusOf(legacy, "Silver", "Gold")).toBe(15);
  });
});

describe("옛 설정 채우기", () => {
  const strip = (x: DynamicBonuses): DynamicBonuses => {
    const { rivalEnabled, rivalPlatinumRp, rivalDiamondRp, streakUpperEnabled, streakUpperPlatinumRp, streakUpperDiamondRp, ...rest } = x;
    return { ...rest, mentoring: { enabled: false, mentorRp: 10, menteeRp: 15, minTierGap: 1 } };
  };
  it("옛 항목이 어느 프리셋과 같으면 새 항목도 그 프리셋 값 — 경쟁 리그가 균형의 캐리를 받지 않는다", () => {
    const filled = fillNewBonusFields(strip(bonusesFromPreset("competitive")));
    expect(detectBonusPreset(filled)).toBe("competitive");
    expect(filled.mentoring?.enabled).toBe(false);
    expect(filled.rivalPlatinumRp).toBe(8);
  });
  it("균형이었던 리그는 균형으로 남는다", () => {
    expect(detectBonusPreset(fillNewBonusFields(strip(bonusesFromPreset("balanced"))))).toBe("balanced");
  });
  it("이미 새 형식이면 손대지 않는다", () => {
    const custom = { ...b, rivalPlatinumRp: 99 };
    expect(fillNewBonusFields(custom).rivalPlatinumRp).toBe(99);
  });
});
