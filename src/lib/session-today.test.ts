import { describe, expect, test } from "bun:test";
import { liveSession } from "./session-today";
import type { AssignmentSession } from "./league-types";

const at = (iso: string) =>
  ({ id: "s", league_id: "l", player_ids: ["a"], match_type: "double", started_at: iso }) as unknown as AssignmentSession;
const now = new Date("2026-09-12T20:00:00+09:00");

describe("liveSession", () => {
  test("학교는 날짜와 무관하게 살아 있다", () => {
    expect(liveSession(at("2026-09-05T10:00:00+09:00"), "school", now)).not.toBeNull();
  });
  test("동호회는 오늘 시작한 것만", () => {
    expect(liveSession(at("2026-09-12T18:00:00+09:00"), "club", now)).not.toBeNull();
    expect(liveSession(at("2026-09-05T18:00:00+09:00"), "club", now)).toBeNull();
  });
  test("명단이 비면 없는 것", () => {
    const s = { ...at("2026-09-12T18:00:00+09:00"), player_ids: [] } as unknown as AssignmentSession;
    expect(liveSession(s, "club", now)).toBeNull();
  });
});
