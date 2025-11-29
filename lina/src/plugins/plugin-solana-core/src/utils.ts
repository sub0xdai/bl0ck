import type { IAgentRuntime, Memory } from "@elizaos/core";

/**
 * Retrieves the authenticated user ID from entity metadata.
 * The JWT-authenticated userId is stored in entity.metadata.author_id,
 * NOT in message.entityId (which is an ElizaOS-generated internal ID).
 */
export async function getEntityUserId(
  runtime: IAgentRuntime,
  message: Memory
): Promise<string> {
  const entity = await runtime.getEntityById(message.entityId);
  const userId = entity?.metadata?.author_id;
  if (!userId) {
    throw new Error("User ID not found in entity metadata");
  }
  return userId as string;
}
