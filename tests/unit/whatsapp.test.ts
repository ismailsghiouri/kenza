import { describe, it, expect } from "vitest";
import { verifyWebhookChallenge } from "@/lib/whatsapp";

describe("verifyWebhookChallenge", () => {
  it("returns null when mode is not subscribe", () => {
    expect(verifyWebhookChallenge("unsubscribe", "token", "challenge")).toBeNull();
  });

  it("returns null when challenge is missing", () => {
    expect(verifyWebhookChallenge("subscribe", "token", null)).toBeNull();
  });
});
