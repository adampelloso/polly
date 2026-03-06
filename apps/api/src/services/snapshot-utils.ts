export function flattenOddsSnapshot(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [eventId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const map = value as Record<string, unknown>;

    const hasLegacyYesNo =
      typeof map.yes === "number" || typeof map.no === "number";
    if (hasLegacyYesNo) {
      if (typeof map.yes === "number") out[`${eventId}:Yes`] = map.yes;
      if (typeof map.no === "number") out[`${eventId}:No`] = map.no;
      continue;
    }

    for (const [outcomeLabel, probability] of Object.entries(map)) {
      if (typeof probability === "number") {
        out[`${eventId}:${outcomeLabel}`] = probability;
      }
    }
  }

  return out;
}
