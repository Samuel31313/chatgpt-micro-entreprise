import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { StripeService } from "../services/stripe.service";
import { config } from "../config";

const prisma = new PrismaClient();
const stripeService = new StripeService();
const router = Router();

/**
 * POST /api/payment/create
 * Create a Stripe checkout session for a dossier
 */
router.post("/create", async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      res.status(400).json({ error: "session_id requis" });
      return;
    }

    const dossier = await prisma.dossier.findUnique({
      where: { sessionId: session_id },
      include: { documents: true },
    });

    if (!dossier) {
      res.status(404).json({ error: "Dossier non trouvé. Veuillez d'abord sauvegarder vos informations." });
      return;
    }

    // Check all required documents are valid
    const requiredDocs = ["id_document", "domicile_proof", "non_condamnation"];
    const missingDocs = requiredDocs.filter(
      (type) => !dossier.documents.some((d) => d.type === type && d.status === "valid")
    );

    if (missingDocs.length > 0) {
      const docNames: Record<string, string> = {
        id_document: "pièce d'identité",
        domicile_proof: "justificatif de domicile",
        non_condamnation: "attestation de non-condamnation",
      };
      res.status(400).json({
        error: `Documents manquants ou invalides : ${missingDocs.map((d) => docNames[d]).join(", ")}`,
        missing_documents: missingDocs,
      });
      return;
    }

    const customerName = `${dossier.firstName} ${dossier.lastName}`;
    const { url, sessionId } = await stripeService.createCheckoutSession(
      dossier.id,
      customerName
    );

    await prisma.dossier.update({
      where: { id: dossier.id },
      data: {
        stripeSessionId: sessionId,
        stripePaymentStatus: "pending",
        amountCents: config.STRIPE_PRICE_CENTS,
      },
    });

    res.json({
      success: true,
      payment_url: url,
      amount: `${(config.STRIPE_PRICE_CENTS / 100).toFixed(2)} €`,
      message: `Lien de paiement créé. Montant : ${(config.STRIPE_PRICE_CENTS / 100).toFixed(2)} €`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payment/status/:sessionId
 * Check payment status for a dossier
 */
router.get("/status/:sessionId", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const dossier = await prisma.dossier.findUnique({
      where: { sessionId },
    });

    if (!dossier) {
      res.status(404).json({ error: "Dossier non trouvé" });
      return;
    }

    if (!dossier.stripeSessionId) {
      res.json({ status: "no_payment", message: "Aucun paiement initié pour ce dossier." });
      return;
    }

    // Check live status from Stripe
    const paymentStatus = await stripeService.getSessionStatus(dossier.stripeSessionId);

    // Update in DB if changed
    if (paymentStatus !== dossier.stripePaymentStatus) {
      await prisma.dossier.update({
        where: { id: dossier.id },
        data: { stripePaymentStatus: paymentStatus },
      });
    }

    res.json({
      status: paymentStatus,
      amount: dossier.amountCents ? `${(dossier.amountCents / 100).toFixed(2)} €` : null,
      message:
        paymentStatus === "paid"
          ? "Paiement confirmé ! Le dossier peut être soumis à l'INPI."
          : paymentStatus === "unpaid"
          ? "Paiement en attente. L'utilisateur n'a pas encore payé."
          : "Statut du paiement inconnu.",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
