import { describe, expect, it } from "vitest";

import { notificationText } from "@/lib/notifications/text";
import { Constants } from "@/types/database.types";

describe("notificationText", () => {
  it("has a sentence for every kind the database can store", () => {
    for (const kind of Constants.public.Enums.notification_kind) {
      const text = notificationText(kind);
      expect(text.length).toBeGreaterThan(10);
      expect(text.endsWith(".")).toBe(true);
    }
  });

  it("uses a different sentence for each kind", () => {
    const sentences = Constants.public.Enums.notification_kind.map(notificationText);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it("falls back to a plain sentence for an unknown kind", () => {
    expect(notificationText("something_new" as never)).toBe("Something changed.");
  });
});
