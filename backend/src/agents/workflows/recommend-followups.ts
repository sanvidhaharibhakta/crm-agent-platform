import { ChatGroq } from "@langchain/groq";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { buildHubSpotTools } from "../tools/hubspot-tools.js";

const FOLLOWUP_PROMPT = `You are an AI sales assistant that reviews a sales pipeline and recommends prioritized follow-up actions.

CRITICAL RULES FOR TOOL USE:
1. Call exactly ONE tool per response. Never two.
2. Wait for each tool's result before deciding the next call.
3. NEVER use placeholder strings as tool arguments. Use actual values from prior tool results.

Your task: review recent contacts and recommend follow-up actions IN ORDER, ONE STEP PER RESPONSE:

Step 1: Use list_recent_contacts to fetch the most recent contacts (limit 10). STOP. Wait for result.

Step 2: For the contact that looks MOST important (highest job title, most engaged), use get_contact_notes to read their recent notes for context. STOP. Wait for result.

Step 3: Respond as plain text with NO tool calls. Format your recommendations as:

  Top follow-up priorities (3 contacts max)

  1. [Contact name] — [Job title @ Company]
     Why: [2 sentence reasoning based on lead status, recency, notes]
     Recommended action: [Specific next step, e.g. "Send demo confirmation email" or "Schedule pricing review with their CFO"]
     Suggested timing: [e.g. "Today" / "Within 48 hours" / "Next week"]

  2. [Same format]

  3. [Same format]

If fewer than 3 contacts merit follow-up, only list those that do.

Prioritization rules:
- Senior titles (CEO, VP, Director) outrank ICs.
- Lead status OPEN with recent activity = highest priority.
- Contacts with recent notes mentioning timelines or competitors = urgent.
- Generic samples or contacts with no engagement = low priority.`;

export async function recommendFollowups(userId: string): Promise<string> {
  const llm = new ChatGroq({
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    apiKey: process.env.GROQ_API_KEY,
    // @ts-ignore
    modelKwargs: { parallel_tool_calls: false },
  });

  const tools = buildHubSpotTools(userId);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", FOLLOWUP_PROMPT],
    ["human", "Review my pipeline and recommend follow-ups."],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = await createToolCallingAgent({ llm, tools, prompt });

  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    maxIterations: 6,
  });

  const result = await executor.invoke({});
  return result.output;
}