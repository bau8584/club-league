import { describe, expect, it } from "bun:test";
import { buildAssignedMatchRows } from "./assignment-rows";

describe("buildAssignedMatchRows", () => {
  const base = Date.parse("2026-09-07T01:00:00.000Z");

  it("팀을 슬롯으로 펴고, 팀 미정 필드(player_ids)는 비운다", () => {
    const [row] = buildAssignedMatchRows({
      classId: "L",
      matches: [{ teamA: ["a", "b"], teamB: ["c", "d"] }],
      baseTimeMs: base,
    });
    expect(row.player_a_id).toBe("a");
    expect(row.player_a2_id).toBe("b");
    expect(row.player_b_id).toBe("c");
    expect(row.player_b2_id).toBe("d");
    expect(row.player_ids).toEqual([]);
    expect(row.status).toBe("waiting");
    // 코트 번호는 받지 않는다 — 틀려도 아무도 모르는 데이터는 받지 않는다.
    expect(row.court).toBeNull();
  });

  it("created_at을 1ms씩 벌려 큐 순서를 보존한다", () => {
    const rows = buildAssignedMatchRows({
      classId: "L",
      matches: [
        { teamA: ["a", "b"], teamB: ["c", "d"] },
        { teamA: ["e", "f"], teamB: ["g", "h"] },
        { teamA: ["i", "j"], teamB: ["k", "l"] },
      ],
      baseTimeMs: base,
    });
    const ts = rows.map((r) => Date.parse(r.created_at));
    expect(ts).toEqual([base, base + 1, base + 2]);
  });

  it("단식은 파트너 슬롯이 null이고 match_type이 자동으로 갈린다", () => {
    const [single] = buildAssignedMatchRows({
      classId: "L",
      matches: [{ teamA: ["a"], teamB: ["b"] }],
      baseTimeMs: base,
    });
    expect(single.match_type).toBe("single");
    expect(single.player_a2_id).toBeNull();
    expect(single.player_b2_id).toBeNull();

    const [double] = buildAssignedMatchRows({
      classId: "L",
      matches: [{ teamA: ["a", "b"], teamB: ["c", "d"] }],
      baseTimeMs: base,
    });
    expect(double.match_type).toBe("double");
  });

  it("슬롯이 빈 대진은 큐에 올리지 않는다", () => {
    const rows = buildAssignedMatchRows({
      classId: "L",
      matches: [
        { teamA: [], teamB: ["c", "d"] },
        { teamA: ["a", "b"], teamB: [] },
        { teamA: ["a", "b"], teamB: ["c", "d"] },
      ],
      baseTimeMs: base,
    });
    expect(rows).toHaveLength(1);
  });
});
