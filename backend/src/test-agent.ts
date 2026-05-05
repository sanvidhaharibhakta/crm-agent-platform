import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import { HumanMessage } from "@langchain/core/messages";

async function main() {
  // Initialize the Groq LLM client
  const llm = new ChatGroq({
    model: "llama-3.3-70b-versatile",
    temperature: 0.3,
    apiKey: process.env.GROQ_API_KEY,
  });

  // Send a test message
  const response = await llm.invoke([
    new HumanMessage(
      "You are a CRM assistant. In one sentence, explain what 'lead qualification' means."
    ),
  ]);

  console.log("\n--- Agent Response ---");
  console.log(response.content);
  console.log("--- End ---\n");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});