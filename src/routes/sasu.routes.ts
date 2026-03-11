import { Router, Request, Response } from "express";
import axios from "axios";

const router = Router();

const LEGALPLACE_API = "https://clear-api.legalplace.fr/api/v1";

/**
 * POST /api/sasu/checkout
 * Creates a real LegalPlace SASU instance and returns the checkout URL.
 */
router.post("/checkout", async (req: Request, res: Response) => {
  const { email, phone, company_name, activity } = req.body;

  if (!email) {
    res.status(400).json({
      success: false,
      error: "L'email est requis pour générer le lien de checkout.",
    });
    return;
  }

  try {
    // Call LegalPlace API to create a real SASU instance
    const { data } = await axios.post(
      `${LEGALPLACE_API}/wizard/instance/creation-sasu/`,
      {
        app_type: "wizardx",
        instanceDomain: "www.legalplace.fr",
        draft: 1,
        email: email.trim(),
        metadata: {
          checkout: "packs-v16",
          checkoutSlug: "creation-sasu",
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
          "lp-origin": "https://www.legalplace.fr/projet/creation-sasu-wf",
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
    const checkoutUrl = `https://www.legalplace.fr/creation/checkout/creation-sasu/packs-v16?email=${encodedEmail}&uniqid=${data.uniqid}&product=creation-sasu`;

    res.json({
      success: true,
      checkout_url: checkoutUrl,
      uniqid: data.uniqid,
      email: email.trim(),
      message:
        "Voici le lien de checkout LegalPlace pour la création de votre SASU. Choisissez votre pack et finalisez le paiement.",
    });
  } catch (error: any) {
    const errMsg = error.response
      ? `LegalPlace (${error.response.status}): ${JSON.stringify(error.response.data)}`
      : error.message;
    res.status(500).json({
      success: false,
      error: `Erreur lors de la création de l'instance SASU: ${errMsg}`,
    });
  }
});

export default router;
