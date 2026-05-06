import axios, { AxiosInstance } from "axios";
import { getTokens, saveTokens, StoredTokens } from "./token-store.js";
import { refreshAccessToken } from "./oauth.js";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

// If the token expires in less than this many ms, refresh proactively.
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export class HubSpotClient {
  private userId: string;
  private http: AxiosInstance;

  constructor(userId: string) {
    this.userId = userId;
    this.http = axios.create({ baseURL: HUBSPOT_API_BASE });
  }

  /**
   * Get a valid access token, refreshing if needed.
   */
  private async getValidAccessToken(): Promise<string> {
    const tokens = await getTokens(this.userId);
    if (!tokens) {
      throw new Error(`No tokens found for user ${this.userId}. User must reconnect HubSpot.`);
    }

    const now = Date.now();
    if (tokens.expiresAt - now < REFRESH_BUFFER_MS) {
      console.log(`Token for ${this.userId} is near expiry, refreshing...`);
      const fresh = await refreshAccessToken(tokens.refreshToken);
      const updated: StoredTokens = {
        ...tokens,
        accessToken: fresh.access_token,
        refreshToken: fresh.refresh_token, // HubSpot rotates refresh tokens
        expiresAt: Date.now() + fresh.expires_in * 1000,
      };
      await saveTokens(updated);
      return fresh.access_token;
    }

    return tokens.accessToken;
  }

  private async authedRequest<T>(config: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    url: string;
    data?: any;
    params?: any;
  }): Promise<T> {
    const token = await this.getValidAccessToken();
    const response = await this.http.request<T>({
      ...config,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  }

  // ===========================================================================
  // CONTACTS
  // ===========================================================================

  /** Fetch a list of contacts (most recent first). */
  async listContacts(limit = 10): Promise<any> {
    return this.authedRequest({
      method: "GET",
      url: "/crm/v3/objects/contacts",
      params: { limit, properties: "firstname,lastname,email,company,jobtitle,phone" },
    });
  }

  /** Fetch one contact by ID. */
  async getContact(contactId: string): Promise<any> {
    return this.authedRequest({
      method: "GET",
      url: `/crm/v3/objects/contacts/${contactId}`,
      params: { properties: "firstname,lastname,email,company,jobtitle,phone,lifecyclestage" },
    });
  }

  /** Create a new contact. */
  async createContact(properties: Record<string, string>): Promise<any> {
    return this.authedRequest({
      method: "POST",
      url: "/crm/v3/objects/contacts",
      data: { properties },
    });
  }

  /** Update properties on an existing contact. */
  async updateContact(contactId: string, properties: Record<string, string>): Promise<any> {
    return this.authedRequest({
      method: "PATCH",
      url: `/crm/v3/objects/contacts/${contactId}`,
      data: { properties },
    });
  }

  /** Search contacts by a property (e.g. by email). */
  async searchContacts(propertyName: string, value: string): Promise<any> {
    return this.authedRequest({
      method: "POST",
      url: "/crm/v3/objects/contacts/search",
      data: {
        filterGroups: [
          {
            filters: [{ propertyName, operator: "EQ", value }],
          },
        ],
        properties: ["firstname", "lastname", "email", "company", "jobtitle"],
        limit: 10,
      },
    });
  }

  // ===========================================================================
  // NOTES (engagement type used for AI-generated summaries)
  // ===========================================================================

  /** Attach a note to a contact (used for storing call summaries, etc.). */
  async createNoteOnContact(contactId: string, noteBody: string): Promise<any> {
    // Step 1: create the note engagement
    const note = await this.authedRequest<{ id: string }>({
      method: "POST",
      url: "/crm/v3/objects/notes",
      data: {
        properties: {
          hs_note_body: noteBody,
          hs_timestamp: Date.now().toString(),
        },
      },
    });

    // Step 2: associate the note with the contact
    await this.authedRequest({
      method: "PUT" as any,
      url: `/crm/v3/objects/notes/${note.id}/associations/contacts/${contactId}/202`,
      // 202 is the HubSpot association type ID for "Note → Contact"
    });

    return note;
  }
  /** Fetch all notes attached to a contact (most recent first). */
  async getContactNotes(contactId: string, limit = 5): Promise<any> {
    // First get note IDs associated with the contact
    const associations = await this.authedRequest<any>({
      method: "GET",
      url: `/crm/v3/objects/contacts/${contactId}/associations/notes`,
      params: { limit },
    });

    const noteIds = (associations.results ?? []).map((r: any) => r.id);
    if (noteIds.length === 0) return { notes: [] };

    // Batch-fetch the note bodies
    const notes = await Promise.all(
      noteIds.slice(0, limit).map((id: string) =>
        this.authedRequest<any>({
          method: "GET",
          url: `/crm/v3/objects/notes/${id}`,
          params: { properties: "hs_note_body,hs_timestamp" },
        })
      )
    );

    return { notes };
  }
}