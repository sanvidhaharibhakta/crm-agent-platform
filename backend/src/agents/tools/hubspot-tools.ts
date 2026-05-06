/**
 * LangChain tool definitions wrapping the HubSpotClient.
 *
 * Each tool exposes one CRM operation to the agent with a Zod schema
 * (so the LLM knows what arguments to provide) and a description
 * (so the LLM knows when to use it). Tool descriptions matter as
 * much as the system prompt — they drive tool selection accuracy.
 *
 * Schemas are intentionally flat (no nested objects) because Llama 3.3
 * struggles with nested argument structures during streaming.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HubSpotClient } from "../../services/hubspot/client.js";

/**
 * Factory that builds a set of HubSpot tools bound to a specific user.
 * Each agent invocation is "scoped" to one user's CRM data.
 */
export function buildHubSpotTools(userId: string) {
  const client = new HubSpotClient(userId);

  const searchContactByEmail = tool(
    async ({ email }: { email: string }) => {
      const result = await client.searchContacts("email", email);
      if (!result.results || result.results.length === 0) {
        return JSON.stringify({ found: false, message: "No contact found with that email." });
      }
      return JSON.stringify({ found: true, contact: result.results[0] });
    },
    {
      name: "search_contact_by_email",
      description:
        "Find a contact in the CRM by their email address. Returns contact details if found, or indicates no match.",
      schema: z.object({
        email: z.string().describe("The email address to search for."),
      }),
    }
  );

  const getContactById = tool(
    async ({ contactId }: { contactId: string }) => {
      const contact = await client.getContact(contactId);
      return JSON.stringify(contact);
    },
    {
      name: "get_contact_by_id",
      description: "Get full details of a contact by their HubSpot contact ID.",
      schema: z.object({
        contactId: z.string().describe("The HubSpot contact ID (numeric string)."),
      }),
    }
  );

  const listRecentContacts = tool(
    async ({ limit }: { limit: number }) => {
      const result = await client.listContacts(limit);
      return JSON.stringify(result.results ?? []);
    },
    {
      name: "list_recent_contacts",
      description:
        "List the most recent contacts in the CRM. Useful for getting a snapshot of recent leads.",
      schema: z.object({
        limit: z.number().min(1).max(50).default(10).describe("How many contacts to return."),
      }),
    }
  );

const updateContactProperty = tool(
    async ({ contactId, propertyName, propertyValue }: { contactId: string; propertyName: string; propertyValue: string }) => {
      const result = await client.updateContact(contactId, { [propertyName]: propertyValue });
      return JSON.stringify({ updated: true, id: result.id, propertyName, propertyValue });
    },
    {
      name: "update_contact_property",
      description:
        "Update ONE property on a contact. To update multiple properties, call this tool multiple times. Common properties: hs_lead_status (values: OPEN, IN_PROGRESS, CONNECTED, BAD_TIMING, UNQUALIFIED), lifecyclestage (values: lead, marketingqualifiedlead, salesqualifiedlead, opportunity, customer), jobtitle, company.",
      schema: z.object({
        contactId: z.string().describe("The HubSpot contact ID."),
        propertyName: z.string().describe("The property name to update, e.g., 'hs_lead_status'."),
        propertyValue: z.string().describe("The new value for the property, e.g., 'OPEN'."),
      }),
    }
  );

  const addNoteToContact = tool(
    async ({ contactId, note }: { contactId: string; note: string }) => {
      await client.createNoteOnContact(contactId, note);
      return JSON.stringify({ noteCreated: true });
    },
    {
      name: "add_note_to_contact",
      description:
        "Attach a note to a contact in the CRM. Useful for storing call summaries, meeting recaps, or context the team should see later.",
      schema: z.object({
        contactId: z.string().describe("The HubSpot contact ID."),
        note: z.string().describe("The full text of the note. Use HTML or plain text."),
      }),
    }
  );
  const getContactNotes = tool(
    async ({ contactId, limit }: { contactId: string; limit: number }) => {
      const result = await client.getContactNotes(contactId, limit);
      return JSON.stringify(result);
    },
    {
      name: "get_contact_notes",
      description:
        "Fetch the most recent notes attached to a contact. Useful for understanding past conversations and context before drafting outreach.",
      schema: z.object({
        contactId: z.string().describe("The HubSpot contact ID."),
        limit: z.number().min(1).max(10).default(3).describe("How many notes to fetch."),
      }),
    }
  );

  return [
    searchContactByEmail,
    getContactById,
    listRecentContacts,
    updateContactProperty,
    addNoteToContact,
    getContactNotes,
  ];
}