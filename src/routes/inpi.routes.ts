import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { InpiService } from "../services/inpi.service";

const prisma = new PrismaClient();
const inpiService = new InpiService();
const router = Router();

/**
 * POST /api/inpi/submit
 * Submit a dossier to INPI
 */
router.post("/submit", async (req: Request, res: Response) => {
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
      res.status(404).json({ error: "Dossier non trouvé" });
      return;
    }

    if (dossier.stripePaymentStatus !== "paid") {
      res.status(400).json({
        error: "Le paiement n'a pas été effectué. Veuillez d'abord payer.",
      });
      return;
    }

    if (dossier.inpiFormaliteId) {
      res.json({
        success: true,
        formalite_id: dossier.inpiFormaliteId,
        status: dossier.inpiStatus,
        message: `Le dossier a déjà été soumis (réf: ${dossier.inpiFormaliteId}). Statut actuel : ${dossier.inpiStatus}`,
      });
      return;
    }

    // Submit to INPI
    const formaliteId = await inpiService.submitFormalite(dossier);

    // Update dossier
    await prisma.dossier.update({
      where: { id: dossier.id },
      data: {
        inpiFormaliteId: formaliteId,
        inpiStatus: "submitted",
      },
    });

    res.json({
      success: true,
      formalite_id: formaliteId,
      status: "submitted",
      message:
        "Dossier soumis à l'INPI avec succès ! " +
        "Vous recevrez votre numéro SIRET sous 1 à 4 semaines. " +
        "Vous pouvez vérifier le statut à tout moment.",
    });
  } catch (error: any) {
    res.status(500).json({
      error: `Erreur lors de la soumission INPI : ${error.message}`,
    });
  }
});

/**
 * GET /api/inpi/status/:sessionId
 * Check INPI submission status
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

    if (!dossier.inpiFormaliteId) {
      res.json({
        status: "not_submitted",
        message: "Le dossier n'a pas encore été soumis à l'INPI.",
      });
      return;
    }

    // Check live status from INPI
    const inpiStatus = await inpiService.getStatus(dossier.inpiFormaliteId);

    // Update in DB
    await prisma.dossier.update({
      where: { id: dossier.id },
      data: {
        inpiStatus: inpiStatus.status,
        ...(inpiStatus.siret && { siretNumber: inpiStatus.siret }),
      },
    });

    const statusMessages: Record<string, string> = {
      submitted: "Votre dossier a été soumis et est en attente de traitement.",
      processing: "Votre dossier est en cours de traitement par l'INPI.",
      accepted: `Votre micro-entreprise est créée ! Votre SIRET est : ${inpiStatus.siret}`,
      rejected: "Votre dossier a été rejeté. Contactez l'INPI pour plus d'informations.",
      regularization: "L'INPI demande des informations complémentaires sur votre dossier.",
    };

    res.json({
      status: inpiStatus.status,
      siret: inpiStatus.siret || null,
      formalite_id: dossier.inpiFormaliteId,
      message: statusMessages[inpiStatus.status] || `Statut : ${inpiStatus.status}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
