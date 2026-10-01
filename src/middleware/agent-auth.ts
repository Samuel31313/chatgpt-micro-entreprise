import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { PrismaClient, Agent } from "@prisma/client";
import { config } from "../config";

const prisma = new PrismaClient();

export const AGENT_KEY_PREFIX = "lpa_";

export interface AgentRequest extends Request {
  agent?: Agent;
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateAgentApiKey(): string {
  return AGENT_KEY_PREFIX + crypto.randomBytes(32).toString("hex");
}

function bearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Authenticates an agent linked to a LegalPlace account via its own API key
 * (Authorization: Bearer lpa_...). The agent is attached to req.agent.
 */
export async function authenticateAgent(
  req: AgentRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = bearerToken(req);

  if (!token) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  try {
    const agent = await prisma.agent.findUnique({
      where: { apiKeyHash: hashApiKey(token) },
    });

    if (!agent || !agent.active) {
      res.status(403).json({ error: "Invalid or revoked agent API key" });
      return;
    }

    req.agent = agent;
    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Protects admin routes (agent management) with ADMIN_API_KEY.
 */
export function authenticateAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!config.ADMIN_API_KEY) {
    res.status(503).json({ error: "ADMIN_API_KEY is not configured" });
    return;
  }

  const token = bearerToken(req);

  if (!token) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  if (!safeEqual(token, config.ADMIN_API_KEY)) {
    res.status(403).json({ error: "Invalid admin API key" });
    return;
  }

  next();
}
