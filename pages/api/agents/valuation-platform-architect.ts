import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { runValuationPlatformArchitect } from "@/lib/agents/valuation-platform-architect/agent";

const requestSchema = z.object({
  message: z.string().min(1),
  focusArea: z
    .enum(["valuation-methodology", "data-sources", "architecture", "quality-control", "roadmap", "all"])
    .default("all"),
  includeWebResearch: z.boolean().default(false),
});

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return response.status(500).json({
      error: "OPENAI_API_KEY is not configured for the valuation platform architect agent.",
    });
  }

  const parsed = requestSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      error: "Invalid request payload.",
      issues: parsed.error.flatten(),
    });
  }

  try {
    const result = await runValuationPlatformArchitect(parsed.data);
    return response.status(200).json(result);
  } catch (error) {
    console.error("Valuation Platform Architect agent failed", error);
    const apiError = error as { code?: string; type?: string; status?: number; message?: string };
    if (apiError.code === "insufficient_quota" || apiError.type === "insufficient_quota" || apiError.status === 429) {
      return response.status(402).json({
        error: "OpenAI rejected the agent run because this project has no available API quota. Add billing or credits in OpenAI Platform, then retry.",
      });
    }

    return response.status(500).json({
      error: error instanceof Error ? error.message : "Valuation Platform Architect agent run failed.",
    });
  }
}
