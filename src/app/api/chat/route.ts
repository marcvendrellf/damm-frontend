import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

import { buildSystemPrompt, plannerModel, plannerTemperature } from "@/agents/planner";
import { buildVisibleChatContext } from "@/agents/visible-context";
import { DEMO_MODE } from "@/lib/api/client";
import { parseChatContext } from "@/lib/chat/context";
import { toCoreMessages } from "@/lib/chat/message-converters";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEMO_REPLY =
  "I'm switched off in this demo. At the hackathon I ran on Gemini and answered from what was on screen, like a route, its stops and its truck. You can still plan a day with Add Route, then open a route to see its truck and its map.";

// Streams the fixed demo reply word by word, like a model would.
function demoReply() {
  const stream = createUIMessageStream({
    async execute({ writer }) {
      const id = "demo-reply";
      writer.write({ type: "text-start", id });
      for (const word of DEMO_REPLY.split(/(?<= )/)) {
        writer.write({ type: "text-delta", id, delta: word });
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: Request) {
  if (DEMO_MODE) return demoReply();

  const body = await req.json().catch(() => null);
  const messages = Array.isArray(body?.messages)
    ? (body.messages as UIMessage[])
    : [];
  const ctx = parseChatContext(body?.context);
  const modelMessages = toCoreMessages(messages);

  if (modelMessages.length === 0) {
    return new Response("Missing messages.", { status: 400 });
  }

  try {
    const visible = await buildVisibleChatContext(ctx);
    const result = streamText({
      model: plannerModel,
      system: buildSystemPrompt(visible?.prompt),
      messages: modelMessages,
      temperature: plannerTemperature,
    });
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[/api/chat] planner run failed", error);
    return new Response("Chat request failed. Please try again.", {
      status: 500,
    });
  }
}
