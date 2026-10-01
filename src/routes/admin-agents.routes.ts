import { Router, Request, Response } from "express";
import { PrismaClient, Agent } from "@prisma/client";
import { generateAgentApiKey, hashApiKey } from "../middleware/agent-auth";

const prisma = new PrismaClient();
const router = Router();

function serializeAgent(agent: Agent) {
  return {
    agent_id: agent.id,
    name: agent.name,
    legalplace_email: agent.legalplaceEmail,
    api_key_prefix: agent.apiKeyPrefix,
    active: agent.active,
    created_at: agent.createdAt,
  };
}

function newKey() {
  const apiKey = generateAgentApiKey();
  return { apiKey, apiKeyHash: hashApiKey(apiKey), apiKeyPrefix: apiKey.slice(0, 12) };
}

/**
 * POST /api/admin/agents
 * Registers an agent linked to a LegalPlace account. The API key is only returned once.
 */
router.post("/", async (req: Request, res: Response) => {
  const { name, legalplace_email } = req.body ?? {};

  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name est requis." });
    return;
  }
  if (
    typeof legalplace_email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legalplace_email.trim())
  ) {
    res.status(400).json({ error: "legalplace_email est requis et doit être un email valide." });
    return;
  }

  try {
    const { apiKey, apiKeyHash, apiKeyPrefix } = newKey();
    const agent = await prisma.agent.create({
      data: {
        name: name.trim(),
        legalplaceEmail: legalplace_email.trim(),
        apiKeyHash,
        apiKeyPrefix,
      },
    });

    res.status(201).json({
      ...serializeAgent(agent),
      api_key: apiKey,
      message: "Conservez cette clé API : elle ne sera plus affichée.",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/agents
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const agents = await prisma.agent.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ agents: agents.map(serializeAgent) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/agents/:agentId/rotate-key
 * Issues a new API key; the previous one stops working immediately.
 */
router.post("/:agentId/rotate-key", async (req: Request, res: Response) => {
  try {
    const { apiKey, apiKeyHash, apiKeyPrefix } = newKey();
    const agent = await prisma.agent.update({
      where: { id: req.params.agentId as string },
      data: { apiKeyHash, apiKeyPrefix, active: true },
    });
    res.json({ ...serializeAgent(agent), api_key: apiKey });
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({ error: "Agent introuvable." });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/agents/:agentId
 * Revokes an agent (its API key stops working, its orders are kept).
 */
router.delete("/:agentId", async (req: Request, res: Response) => {
  try {
    const agent = await prisma.agent.update({
      where: { id: req.params.agentId as string },
      data: { active: false },
    });
    res.json(serializeAgent(agent));
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({ error: "Agent introuvable." });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
