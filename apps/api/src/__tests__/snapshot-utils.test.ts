import { describe, expect, it } from "vitest";
import { flattenOddsSnapshot } from "../services/snapshot-utils";

describe("flattenOddsSnapshot", () => {
  it("converts legacy yes/no snapshots", () => {
    const result = flattenOddsSnapshot({
      e1: { yes: 0.6, no: 0.4 },
    });
    expect(result).toEqual({
      "e1:Yes": 0.6,
      "e1:No": 0.4,
    });
  });

  it("keeps label-based snapshots", () => {
    const result = flattenOddsSnapshot({
      e1: { Over: 0.45, Under: 0.55 },
    });
    expect(result).toEqual({
      "e1:Over": 0.45,
      "e1:Under": 0.55,
    });
  });
});
