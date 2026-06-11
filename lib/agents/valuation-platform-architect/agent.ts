import "server-only";

import { Agent, run, tool, webSearchTool } from "@openai/agents";
import { z } from "zod";
import { VALUATION_PLATFORM_ARCHITECT_PROMPT } from "./prompt";
import {
  buildFocusInstruction,
  dataSourceEvaluationDimensions,
  platformCapabilityContext,
  qualityControlChecklist,
  roadmapStages,
  type ArchitectFocusArea,
} from "./context";

const emptyParameters = z.object({});

const getPlatformContext = tool({
  name: "get_platform_context",
  description: "Returns the current valuation platform scope, capabilities, and known method/data gaps.",
  parameters: emptyParameters,
  execute: async () => JSON.stringify(platformCapabilityContext, null, 2),
});

const getRoadmapFramework = tool({
  name: "get_roadmap_framework",
  description: "Returns the required roadmap stages and priority philosophy for platform recommendations.",
  parameters: emptyParameters,
  execute: async () => JSON.stringify(roadmapStages, null, 2),
});

const getQualityControlChecklist = tool({
  name: "get_quality_control_checklist",
  description: "Returns valuation quality-control topics that platform recommendations should consider.",
  parameters: emptyParameters,
  execute: async () => JSON.stringify(qualityControlChecklist, null, 2),
});

const getDataSourceEvaluationDimensions = tool({
  name: "get_data_source_evaluation_dimensions",
  description: "Returns the required data-source evaluation dimensions for data integration recommendations.",
  parameters: emptyParameters,
  execute: async () => JSON.stringify(dataSourceEvaluationDimensions, null, 2),
});

export type ValuationPlatformArchitectInput = {
  message: string;
  focusArea?: ArchitectFocusArea;
  includeWebResearch?: boolean;
};

export type ValuationPlatformArchitectResult = {
  agentName: string;
  focusArea: ArchitectFocusArea;
  usedWebResearch: boolean;
  output: string;
};

function buildArchitectAgent(includeWebResearch: boolean) {
  return new Agent({
    name: "Valuation Platform Architect",
    instructions: VALUATION_PLATFORM_ARCHITECT_PROMPT,
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    tools: [
      getPlatformContext,
      getRoadmapFramework,
      getQualityControlChecklist,
      getDataSourceEvaluationDimensions,
      ...(includeWebResearch ? [webSearchTool()] : []),
    ],
  });
}

export async function runValuationPlatformArchitect({
  message,
  focusArea = "all",
  includeWebResearch = false,
}: ValuationPlatformArchitectInput): Promise<ValuationPlatformArchitectResult> {
  const agent = buildArchitectAgent(includeWebResearch);
  const focusInstruction = buildFocusInstruction(focusArea);
  const researchInstruction = includeWebResearch
    ? "Use web research for claims about current vendor availability, pricing, APIs, source coverage, update cadence, or data licensing."
    : "Do not claim current vendor pricing, API availability, or market-data terms without saying current web verification is needed.";

  const result = await run(
    agent,
    [
      "Advise on improving the valuation platform itself, not on valuing a specific company.",
      focusInstruction,
      researchInstruction,
      "Before final recommendations, use the local platform context, roadmap framework, quality-control checklist, and data-source dimensions tools when relevant.",
      "User request:",
      message,
    ].join("\n\n"),
  );

  return {
    agentName: "Valuation Platform Architect",
    focusArea,
    usedWebResearch: includeWebResearch,
    output: String(result.finalOutput ?? ""),
  };
}
