import { ChatGroq } from "@langchain/groq";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { buildHubSpotTools } from "../tools/hubspot-tools.js";

const QUALIFY_PROMPT = `You are an AI sales analyst. Your job is to qualify inbound leads.

CRITICAL RULES FOR TOOL USE:
1. You MUST call exactly ONE tool per response. Never two. Never zero.
2. After each tool returns a result, decide the SINGLE next action and call ONE tool.
3. NEVER use placeholder strings as tool arguments. Use actual values from prior tool results.

Your task: given a contact's email, do the following IN ORDER, ONE STEP PER RESPONSE:
- Step 1: Use search_contact_by_email to find the contact. STOP. Wait for result.
- Step 2: After receiving the contact data, score them 1-10 based on job title seniority, company, email domain, and profile completeness. Then call update_contact_property to set hs_lead_status (OPEN for 7+, IN_PROGRESS for 4-6, UNQUALIFIED for 1-3). STOP.
- Step 3: After the update succeeds, call add_note_to_contact with a note containing the score, 2-3 sentences of reasoning, and a suggested next action. STOP.
- Step 4: After the note is created, give your final summary as a text response with NO tool calls.

REMEMBER: One tool call per response. Never combine multiple tool calls.`;

export async function qualifyLead(userId: string, contactEmail: string): Promise<string> {
  const llm = new ChatGroq({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    apiKey: process.env.GROQ_API_KEY,
    // @ts-ignore - Groq supports this even if LangChain types don't list it
    modelKwargs: { parallel_tool_calls: false },
  });

  const tools = buildHubSpotTools(userId);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", QUALIFY_PROMPT],
    ["human", "Qualify the lead with email: {email}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = await createToolCallingAgent({ llm, tools, prompt });

  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    maxIterations: 10,
  });

  const result = await executor.invoke({ email: contactEmail });
  return result.output;
}