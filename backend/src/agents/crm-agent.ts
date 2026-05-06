/**
 * General-purpose CRM agent. Accepts a free-text user request and decides
 * autonomously which HubSpot tools to call to fulfill it.
 *
 * Uses LangChain's AgentExecutor with a tool-calling agent backed by
 * Groq's Llama 3.3 70B. Parallel tool calls are disabled to work around
 * a known streaming-parser bug in Llama where multiple tool calls get
 * concatenated into malformed JSON.
 */

import { ChatGroq } from "@langchain/groq";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { buildHubSpotTools } from "./tools/hubspot-tools.js";

const SYSTEM_PROMPT = `You are an AI assistant that helps a sales team manage their HubSpot CRM.

CRITICAL RULES FOR TOOL USE:
1. Call tools ONE AT A TIME. Never call multiple tools in a single response.
2. Wait for each tool's result before deciding the next step.
3. NEVER use placeholder strings like "result of previous call" as a tool argument. Only use actual values you have already received.
4. If you need a contact ID for an action, FIRST call search_contact_by_email or get_contact_by_id, then in your NEXT response, use the actual ID number from that result.

Your responsibilities:
- Qualify inbound leads by examining their contact info and enriching their record.
- Draft personalized outreach emails based on contact context.
- Schedule and recommend follow-ups.
- Summarize call transcripts and store them as notes on the relevant contact.

Accuracy rules:
- Quote field values from tool results EXACTLY. Do not invent or paraphrase.
- If a field is null, say "not provided." Do not make up a value.
- Report exactly what tools return. If asked for 3 but only 2 came back, say so honestly.

After completing a task, briefly summarize what you did.`;

export async function runCrmAgent(userId: string, userInput: string): Promise<string> {
const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0,
  apiKey: process.env.GROQ_API_KEY,
  // @ts-ignore - Groq supports this even if LangChain types don't list it
  modelKwargs: { parallel_tool_calls: false },
});

  const tools = buildHubSpotTools(userId);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = await createToolCallingAgent({ llm, tools, prompt });

  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    maxIterations: 10,
    returnIntermediateSteps: false,
  });

  const result = await executor.invoke({ input: userInput });
  return result.output;
}