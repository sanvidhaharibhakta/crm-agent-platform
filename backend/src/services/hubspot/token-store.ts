import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../dynamodb.js";

const TABLE = "CrmTokens";

export interface StoredTokens {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix epoch milliseconds
  hubId: number; // HubSpot portal ID
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: tokens,
    })
  );
}

export async function getTokens(userId: string): Promise<StoredTokens | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE,
      Key: { userId },
    })
  );
  return (result.Item as StoredTokens) ?? null;
}