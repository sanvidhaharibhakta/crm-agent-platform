import axios from "axios";

const HUBSPOT_AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize";
const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";

const SCOPES = [
  "crm.objects.companies.read",
  "crm.objects.companies.write",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.schemas.contacts.read",
  "crm.schemas.deals.read",
  "oauth",
].join(" ");

export interface HubSpotTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds until expiry
}

/**
 * Build the URL to send the user to so they can grant access.
 */
export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error("Missing HubSpot OAuth env vars");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });

  return `${HUBSPOT_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange the temporary `code` returned by HubSpot for real access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<HubSpotTokens> {
  const response = await axios.post(
    HUBSPOT_TOKEN_URL,
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      redirect_uri: process.env.HUBSPOT_REDIRECT_URI!,
      code,
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  return response.data;
}

/**
 * Use a refresh token to get a fresh access token (called when the current one is near expiry).
 */
export async function refreshAccessToken(refreshToken: string): Promise<HubSpotTokens> {
  const response = await axios.post(
    HUBSPOT_TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  return response.data;
}
