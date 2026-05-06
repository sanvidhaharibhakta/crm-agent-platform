import { CreateTableCommand, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({
  region: "us-west-2",
  endpoint: "http://localhost:8000",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

async function createTokensTable() {
  const existing = await client.send(new ListTablesCommand({}));
  if (existing.TableNames?.includes("CrmTokens")) {
    console.log("✓ Table 'CrmTokens' already exists");
    return;
  }

  await client.send(
    new CreateTableCommand({
      TableName: "CrmTokens",
      KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "userId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    })
  );

  console.log("✓ Created table 'CrmTokens'");
}

async function main() {
  try {
    await createTokensTable();
    console.log("\nAll tables ready.");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();