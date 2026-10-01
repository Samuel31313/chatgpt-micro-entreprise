import { Router, Request, Response } from "express";
import {
  LegalPlaceService,
  formatLegalPlaceError,
} from "../services/legalplace.service";

const router = Router();
const legalplace = new LegalPlaceService();

/**
 * POST /api/micro-entreprise/checkout
 * Creates a real LegalPlace micro-entreprise instance and returns the checkout URL.
 */
router.post("/checkout", async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({
      success: false,
      error: "L'email est requis pour générer le lien de checkout.",
    });
    return;
  }

  try {
    const instance = await legalplace.createMicroEntreprise(email.trim());

    res.json({
      success: true,
      checkout_url: instance.url,
      uniqid: instance.uniqid,
      email: email.trim(),
      message:
        "Voici le lien de checkout LegalPlace pour la création de votre micro-entreprise. Choisissez votre pack et finalisez le paiement.",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: `Erreur lors de la création de l'instance micro-entreprise: ${formatLegalPlaceError(error)}`,
    });
  }
});

export default router;
