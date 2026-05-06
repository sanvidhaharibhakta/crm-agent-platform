import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const isLocal = process.env.NODE_ENV !== "production";

const client = new DynamoDBClient({
  region: "us-west-2",
  ...(isLocal && {
    endpoint: "http://localhost:8000",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  }),
});

export const docClient = DynamoDBDocumentClient.from(client);