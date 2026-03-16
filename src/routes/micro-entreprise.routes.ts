import { Router, Request, Response } from "express";
import axios from "axios";

const router = Router();

const LEGALPLACE_API = "https://clear-api.legalplace.fr/api/v1";

/**
 * POST /api/micro-entreprise/checkout
 * Creates a real LegalPlace micro-entreprise instance and returns the checkout URL.
 */
router.post("/checkout", async (req: Request, res: Response) => {
  const { email, phone, activity } = req.body;

  if (!email) {
    res.status(400).json({
      success: false,
      error: "L'email est requis pour générer le lien de checkout.",
    });
    return;
  }

  try {
    const { data } = await axios.post(
      `${LEGALPLACE_API}/wizard/instance/creez-votre-micro-entreprise/`,
      {
        app_type: "wizardx",
        instanceDomain: "www.legalplace.fr",
        draft: 1,
        email: email.trim(),
        metadata: {
          checkout: "packs",
          checkoutSlug: "creez-votre-micro-entreprise",
        },
        ovc: {
          o: {},
          v: {},
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "lp-referrer": "https://www.legalplace.fr/",
          "lp-origin": "https://www.legalplace.fr/projet/creez-votre-micro-entreprise",
        },
      }
    );

    if (data.status !== "SUCCESS" || !data.uniqid) {
      res.status(502).json({
        success: false,
        error: "LegalPlace n'a pas retourné d'identifiant d'instance.",
      });
      return;
    }

    const encodedEmail = encodeURIComponent(email.trim());
    const checkoutUrl = `https://www.legalplace.fr/creation/checkout/creez-votre-micro-entreprise/packs?email=${encodedEmail}&uniqid=${data.uniqid}&product=creez-votre-micro-entreprise`;

    res.json({
      success: true,
      checkout_url: checkoutUrl,
      uniqid: data.uniqid,
      email: email.trim(),
      message:
        "Voici le lien de checkout LegalPlace pour la création de votre micro-entreprise. Choisissez votre pack et finalisez le paiement.",
    });
  } catch (error: any) {
    const errMsg = error.response
      ? `LegalPlace (${error.response.status}): ${JSON.stringify(error.response.data)}`
      : error.message;
    res.status(500).json({
      success: false,
      error: `Erreur lors de la création de l'instance micro-entreprise: ${errMsg}`,
    });
  }
});

export default router;
