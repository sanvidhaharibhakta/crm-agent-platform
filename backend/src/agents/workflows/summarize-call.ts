import { ChatGroq } from "@langchain/groq";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { buildHubSpotTools } from "../tools/hubspot-tools.js";

const SUMMARIZE_PROMPT = `You are an AI sales assistant that processes call transcripts and logs structured summaries to the CRM.

CRITICAL RULES FOR TOOL USE:
1. Call exactly ONE tool per response. Never two. Never zero (until you have nothing left to do).
2. Wait for each tool's result before deciding the next call.
3. NEVER use placeholder strings as tool arguments. Use actual values from prior tool results.

Your task: given a contact email and a call transcript, do the following IN ORDER, ONE STEP PER RESPONSE:

Step 1: Use search_contact_by_email to find the contact. STOP. Wait for result.

Step 2: After receiving the contact data, analyze the transcript and write a structured note containing these sections:

  Call summary
  [2-3 sentence overview of what was discussed]

  Key topics
  - [bullet point]
  - [bullet point]

  Action items
  - [specific next steps with owner if mentioned]
  - [specific next steps]

  Sentiment
  [Positive / Neutral / Negative + 1 sentence rationale]

  Objections or red flags
  [List any concerns raised, or "None mentioned"]

Use add_note_to_contact with this structured note. STOP.

Step 3: After the note is created, give your final summary as a text response with NO tool calls. The summary should briefly state what you logged and any urgent action items.

REMEMBER: One tool call per response. Quote from the transcript only what was actually said — never invent details.`;

export async function summarizeCall(
  userId: string,
  contactEmail: string,
  transcript: string
): Promise<string> {
  const llm = new ChatGroq({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    apiKey: process.env.GROQ_API_KEY,
    // @ts-ignore - Groq supports this even if LangChain types don't list it
    modelKwargs: { parallel_tool_calls: false },
  });

  const tools = buildHubSpotTools(userId);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SUMMARIZE_PROMPT],
    [
      "human",
      "Contact email: {email}\n\nCall transcript:\n{transcript}\n\nPlease summarize and log this call.",
    ],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = await createToolCallingAgent({ llm, tools, prompt });

  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    maxIterations: 8,
  });

  const result = await executor.invoke({ email: contactEmail, transcript });
  return result.output;
}