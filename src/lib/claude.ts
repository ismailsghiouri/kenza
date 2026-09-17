import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env["ANTHROPIC_API_KEY"];

    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    client = new Anthropic({ apiKey });
  }

  return client;
}

export const CLAUDE_MODEL = "claude-sonnet-5";
