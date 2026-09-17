import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppMessage, verifyWebhookChallenge } from "@/lib/whatsapp";
import { kenzaGraph } from "@/graph/graph";
import type { WhatsAppWebhookPayload } from "@/types";

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const challenge = verifyWebhookChallenge(
    searchParams.get("hub.mode"),
    searchParams.get("hub.verify_token"),
    searchParams.get("hub.challenge"),
  );

  if (challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as WhatsAppWebhookPayload;

  const message = payload.entry[0]?.changes[0]?.value.messages?.[0];

  if (!message || message.type !== "text" || !message.text) {
    return NextResponse.json({ status: "ignored" });
  }

  const final = await kenzaGraph.invoke({
    customerPhone: message.from,
    conversationId: message.from,
    rawMessage: message.text.body,
  });

  const reply = final.messages.at(-1)?.content ?? "";

  if (reply) {
    await sendWhatsAppMessage(message.from, reply);
  }

  return NextResponse.json({ status: "ok" });
}
