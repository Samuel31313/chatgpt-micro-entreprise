import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AgentRequest } from "../middleware/agent-auth";
import { StripeService } from "../services/stripe.service";
import {
  parsePayload,
  fulfillOrder,
  syncOrder,
  serializeOrder,
} from "../services/agent-order.service";
import { config } from "../config";

const prisma = new PrismaClient();
const stripeService = new StripeService();
const router = Router();

/**
 * GET /api/agent/me
 * Returns the authenticated agent and its linked LegalPlace account.
 */
router.get("/me", (req: AgentRequest, res: Response) => {
  const agent = req.agent!;
  res.json({
    agent_id: agent.id,
    name: agent.name,
    legalplace_email: agent.legalplaceEmail,
    price: `${(config.AGENT_PRICE_CENTS / 100).toFixed(2)} €`,
  });
});

/**
 * POST /api/agent/micro-entreprise
 * Creates a micro-entreprise order and returns a 5 € Stripe payment link.
 * The micro-entreprise is created on LegalPlace as soon as the payment is confirmed.
 */
router.post("/micro-entreprise", async (req: AgentRequest, res: Response) => {
  const agent = req.agent!;
  const parsed = parsePayload(req.body);

  if ("errors" in parsed) {
    res.status(400).json({ success: false, errors: parsed.errors });
    return;
  }

  try {
    const order = await prisma.agentOrder.create({
      data: {
        agentId: agent.id,
        payload: JSON.stringify(parsed.payload),
        amountCents: config.AGENT_PRICE_CENTS,
      },
    });

    let checkout: { url: string; sessionId: string };
    try {
      checkout = await stripeService.createAgentCheckoutSession(
        order.id,
        agent.id,
        order.amountCents,
        `Micro-entreprise de ${parsed.payload.first_name} ${parsed.payload.last_name} — agent ${agent.name}`
      );
    } catch (error) {
      // No payment link → don't keep an order that can never be paid
      await prisma.agentOrder.delete({ where: { id: order.id } });
      throw error;
    }
    const { url, sessionId } = checkout;

    const updated = await prisma.agentOrder.update({
      where: { id: order.id },
      data: { stripeSessionId: sessionId },
    });

    res.status(201).json({ success: true, ...serializeOrder(updated, url) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agent/micro-entreprise
 * Lists the agent's orders (most recent first).
 */
router.get("/micro-entreprise", async (req: AgentRequest, res: Response) => {
  try {
    const orders = await prisma.agentOrder.findMany({
      where: { agentId: req.agent!.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ success: true, orders: orders.map((o) => serializeOrder(o)) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agent/micro-entreprise/:orderId
 * Returns the order status. Checks the payment with Stripe and creates the
 * micro-entreprise if it has been paid in the meantime.
 */
router.get("/micro-entreprise/:orderId", async (req: AgentRequest, res: Response) => {
  try {
    const order = await prisma.agentOrder.findFirst({
      where: { id: req.params.orderId as string, agentId: req.agent!.id },
    });

    if (!order) {
      res.status(404).json({ success: false, error: "Commande introuvable." });
      return;
    }

    const synced = await syncOrder(order);
    res.json({ success: true, ...serializeOrder(synced) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agent/micro-entreprise/:orderId/retry
 * Retries the LegalPlace creation of a paid order that failed (no new payment).
 */
router.post("/micro-entreprise/:orderId/retry", async (req: AgentRequest, res: Response) => {
  try {
    const orderId = req.params.orderId as string;
    const { count } = await prisma.agentOrder.updateMany({
      where: { id: orderId, agentId: req.agent!.id, status: "failed" },
      data: { status: "paid" },
    });

    if (count === 0) {
      res.status(409).json({
        success: false,
        error: "Seule une commande payée en échec peut être relancée.",
      });
      return;
    }

    const order = await fulfillOrder(orderId);
    res.json({ success: true, ...serializeOrder(order!) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
