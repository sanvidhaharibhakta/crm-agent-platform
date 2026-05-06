import "dotenv/config";
import express, { Request, Response } from "express";
import crypto from "crypto";
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
} from "./services/hubspot/oauth.js";
import { saveTokens } from "./services/hubspot/token-store.js";

const app = express();
const PORT = 3001;

// In-memory store of OAuth state values (for CSRF protection).
// In a real app, store these in DynamoDB or Redis with a short TTL.
const pendingStates = new Set<string>();

// Step 1: User clicks "Connect HubSpot" — we send them to HubSpot's consent screen.
app.get("/oauth/install", (req: Request, res: Response) => {
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.add(state);
  const url = buildAuthorizeUrl(state);
  res.redirect(url);
});

// Step 2: HubSpot redirects user back here with `?code=...&state=...`
app.get("/oauth/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query;

  // Validate the state to prevent CSRF
  if (!state || typeof state !== "string" || !pendingStates.has(state)) {
    res.status(400).send("Invalid state parameter");
    return;
  }
  pendingStates.delete(state);

  if (!code || typeof code !== "string") {
    res.status(400).send("Missing authorization code");
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Get the HubSpot portal/account ID from the token info endpoint
    const portalInfo = await fetch(
      `https://api.hubapi.com/oauth/v1/access-tokens/${tokens.access_token}`
    ).then((r) => r.json());

    const userId = `hub_${portalInfo.hub_id}`;

    await saveTokens({
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      hubId: portalInfo.hub_id,
    });

    res.send(`
      <h2>✅ HubSpot connected!</h2>
      <p>User ID: <code>${userId}</code></p>
      <p>HubSpot Portal: <code>${portalInfo.hub_domain}</code></p>
      <p>Now try: <a href="/test/contacts?userId=${userId}">Fetch contacts</a></p>
    `);
  } catch (err: any) {
    console.error("OAuth error:", err.response?.data ?? err.message);
    res.status(500).send(`OAuth error: ${err.message}`);
  }
});

app.get("/", (_req: Request, res: Response) => {
  res.send(`
    <h1>CRM Agent Platform - Dev</h1>
    <p><a href="/oauth/install">Connect HubSpot</a></p>
  `);
});

// Test endpoint — fetches contacts using the stored OAuth token.
app.get("/test/contacts", async (req: Request, res: Response) => {
  const userId = req.query.userId;
  if (!userId || typeof userId !== "string") {
    res.status(400).send("Missing ?userId=");
    return;
  }

  try {
    const { HubSpotClient } = await import("./services/hubspot/client.js");
    const client = new HubSpotClient(userId);
    const contacts = await client.listContacts(5);

    res.send(`
      <h2>Contacts for ${userId}</h2>
      <pre>${JSON.stringify(contacts, null, 2)}</pre>
      <p><a href="/">Back</a></p>
    `);
  } catch (err: any) {
    console.error("Error:", err.response?.data ?? err.message);
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Agent test endpoint
app.use(express.json()); // enables JSON parsing on req.body
app.post("/agent/run", async (req: Request, res: Response) => {
  const { userId, input } = req.body;
  if (!userId || !input) {
    res.status(400).json({ error: "userId and input are required" });
    return;
  }

  try {
    const { runCrmAgent } = await import("./agents/crm-agent.js");
    const output = await runCrmAgent(userId, input);
    res.json({ output });
  } catch (err: any) {
    console.error("Agent error:", err);
    res.status(500).json({ error: err.message });
  }
});
// Workflow: Qualify a lead by email
app.post("/workflows/qualify-lead", async (req: Request, res: Response) => {
  const { userId, email } = req.body;
  if (!userId || !email) {
    res.status(400).json({ error: "userId and email are required" });
    return;
  }
  try {
    const { qualifyLead } = await import("./agents/workflows/qualify-lead.js");
    const output = await qualifyLead(userId, email);
    res.json({ output });
  } catch (err: any) {
    console.error("Workflow error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`   Visit http://localhost:${PORT} to start the OAuth flow\n`);
});