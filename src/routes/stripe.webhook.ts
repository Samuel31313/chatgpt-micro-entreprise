import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { StripeService } from "../services/stripe.service";
import { markOrderPaid, fulfillOrder } from "../services/agent-order.service";

const prisma = new PrismaClient();
const stripeService = new StripeService();
const router = Router();

/**
 * POST /webhook/stripe
 * Handle Stripe webhook events (payment confirmation)
 * Note: This route must use raw body parsing (configured in index.ts)
 */
router.post("/", async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;

  if (!signature) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  try {
    const event = stripeService.verifyWebhookSignature(
      req.body as Buffer,
      signature
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const dossierId = session.metadata?.dossier_id;
      const agentOrderId = session.metadata?.agent_order_id;

      if (agentOrderId && session.payment_status === "paid") {
        await markOrderPaid(agentOrderId);
        // Don't hold the webhook response while LegalPlace answers
        fulfillOrder(agentOrderId)
          .then((order) => console.log(`Agent order ${agentOrderId} paid → ${order?.status}`))
          .catch((err) => console.error(`Agent order ${agentOrderId} fulfillment error:`, err.message));
      }

      if (dossierId) {
        await prisma.dossier.update({
          where: { id: dossierId },
          data: { stripePaymentStatus: "paid" },
        });
        console.log(`Payment confirmed for dossier ${dossierId}`);
      }
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("Stripe webhook error:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
