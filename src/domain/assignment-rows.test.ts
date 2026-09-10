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

  it("발급받은 번호부터 1씩 올려 붙인다", () => {
    const rows = buildAssignedMatchRows({
      classId: "L",
      matches: [
        { teamA: ["a", "b"], teamB: ["c", "d"] },
        { teamA: ["e", "f"], teamB: ["g", "h"] },
        { teamA: ["i", "j"], teamB: ["k", "l"] },
      ],
      baseTimeMs: base,
      sessionId: "S",
      startSeq: 7,
    });
    expect(rows.map((r) => r.seq)).toEqual([7, 8, 9]);
    expect(rows.every((r) => r.session_id === "S")).toBe(true);
  });

  // 번호는 걸러내기 전이 아니라 실제로 큐에 올라가는 줄에만 붙어야 한다.
  // 빈 슬롯에 번호를 태우면 아무도 부르지 않을 번호가 중간에 사라진다.
  it("걸러진 대진은 번호를 먹지 않는다", () => {
    const rows = buildAssignedMatchRows({
      classId: "L",
      matches: [
        { teamA: [], teamB: ["c", "d"] },
        { teamA: ["a", "b"], teamB: ["c", "d"] },
        { teamA: ["e", "f"], teamB: ["g", "h"] },
      ],
      baseTimeMs: base,
      startSeq: 1,
    });
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
  });

  it("번호를 못 받으면 번호 없는 줄로 들어간다", () => {
    const rows = buildAssignedMatchRows({
      classId: "L",
      matches: [{ teamA: ["a", "b"], teamB: ["c", "d"] }],
      baseTimeMs: base,
    });
    expect(rows[0].seq).toBeNull();
    expect(rows[0].session_id).toBeNull();
  });
});
