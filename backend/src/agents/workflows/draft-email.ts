import { ChatGroq } from "@langchain/groq";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { buildHubSpotTools } from "../tools/hubspot-tools.js";

const DRAFT_EMAIL_PROMPT = `You are an AI sales assistant that drafts personalized outreach emails based on CRM context.

CRITICAL RULES FOR TOOL USE:
1. Call exactly ONE tool per response. Never two.
2. Wait for each tool's result before deciding the next call.
3. NEVER use placeholder strings as tool arguments. Use actual values from prior tool results.

Your task: given a contact email and a campaign goal, draft a personalized email IN ORDER, ONE STEP PER RESPONSE:

Step 1: Use search_contact_by_email to find the contact. STOP. Wait for result.

Step 2: Use get_contact_notes to fetch up to 3 recent notes for context (use the contactId from step 1). STOP. Wait for result.

Step 3: With both contact data and recent notes, draft an email and respond as plain text in this EXACT format:

  Subject: [compelling, specific subject line — no clickbait, max 60 chars]

  Hi [first name],

  [Opening line that references something specific from notes or context — never generic]

  [1-2 sentence value prop tailored to their role/company/pain points]

  [Clear, low-friction call-to-action — typically a 15-min meeting]

  Best,
  [Sales Rep]

DO NOT call any more tools after step 2. Just return the drafted email as text.

Personalization rules:
- Reference specific details from the notes (e.g., past objections, action items mentioned, competitive context).
- Keep it under 120 words total.
- No "I hope this email finds you well" or other filler openers.
- Match tone to seniority (executives = direct + value-focused).`;

export async function draftOutreachEmail(
  userId: string,
  contactEmail: string,
  campaignGoal: string
): Promise<string> {
  const llm = new ChatGroq({
    model: "llama-3.3-70b-versatile",
    temperature: 0.3, // slightly higher for natural-sounding language
    apiKey: process.env.GROQ_API_KEY,
    // @ts-ignore
    modelKwargs: { parallel_tool_calls: false },
  });

  const tools = buildHubSpotTools(userId);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", DRAFT_EMAIL_PROMPT],
    [
      "human",
      "Contact email: {email}\n\nCampaign goal: {goal}\n\nDraft a personalized outreach email.",
    ],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = await createToolCallingAgent({ llm, tools, prompt });

  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    maxIterations: 6,
  });

  const result = await executor.invoke({ email: contactEmail, goal: campaignGoal });
  return result.output;
}