import { Router, Request, Response } from "express";
import crypto from "crypto";

const router = Router();

/**
 * Generate a 15-character alphanumeric lowercase uniqid
 * (matches LegalPlace's format)
 */
function generateUniqid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(15);
  let result = "";
  for (let i = 0; i < 15; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * POST /api/sasu/checkout
 * Generates a LegalPlace checkout URL for SASU creation.
 */
router.post("/checkout", (req: Request, res: Response) => {
  const { email, phone, company_name, activity } = req.body;

  if (!email) {
    res.status(400).json({
      success: false,
      error: "L'email est requis pour générer le lien de checkout.",
    });
    return;
  }

  const uniqid = generateUniqid();
  const encodedEmail = encodeURIComponent(email);
  const checkoutUrl = `https://www.legalplace.fr/creation/checkout/creation-sasu/packs-v16?email=${encodedEmail}&uniqid=${uniqid}&product=creation-sasu`;

  res.json({
    success: true,
    checkout_url: checkoutUrl,
    uniqid,
    email,
    message:
      "Voici le lien de checkout LegalPlace pour la création de votre SASU. Choisissez votre pack et finalisez le paiement.",
  });
});

export default router;
