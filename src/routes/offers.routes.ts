import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { buildQuote, OfferSelection, publicPricingGrid } from "../services/pricing.service";
import { qualify, QualificationAnswers, salesMeetingUrl } from "../services/qualification.service";
import { createCheckoutLinks } from "../services/chargebee.service";
import { validateSelection } from "../services/selection.validator";
import { config } from "../config";

const prisma = new PrismaClient();
const router = Router();

/**
 * GET /api/offers/pricing
 * Grille tarifaire comptabilité + compte pro (HT).
 */
router.get("/pricing", (_req: Request, res: Response) => {
  res.json({ success: true, pricing: publicPricingGrid() });
});

/**
 * POST /api/offers/qualify
 * Qualifie un prospect (société existante ou non) et renvoie la marche à suivre :
 * création LegalPlace, souscription en ligne (avec devis), ou RDV sales.
 */
router.post("/qualify", async (req: Request, res: Response) => {
  const { contact = {}, answers } = req.body as {
    contact?: { email?: string; phone?: string; name?: string; company_name?: string; siren?: string };
    answers?: QualificationAnswers;
  };

  if (!answers?.company_status) {
    res.status(400).json({ success: false, error: "answers.company_status est requis." });
    return;
  }

  const result = qualify(answers);
  const summary = [
    answers.legal_form?.toUpperCase(),
    contact.company_name,
    answers.activity,
    ...result.reasons,
  ]
    .filter(Boolean)
    .join(" — ");

  if (contact.email) {
    await prisma.lead.create({
      data: {
        email: contact.email.trim(),
        phone: contact.phone,
        name: contact.name,
        companyName: contact.company_name,
        siren: contact.siren,
        legalForm: answers.legal_form,
        answers: JSON.stringify(answers),
        route: result.route,
        quote: result.quote ? JSON.stringify(result.quote) : null,
      },
    });
  }

  res.json({
    success: true,
    ...result,
    sales_meeting_url: salesMeetingUrl({ name: contact.name, email: contact.email, summary }),
  });
});

/**
 * POST /api/offers/checkout
 * Souscription en ligne au prix grille : renvoie un lien de paiement Chargebee par produit
 * (comptabilité et compte pro sont facturés sur deux sites Chargebee distincts).
 */
router.post("/checkout", async (req: Request, res: Response) => {
  const { email, first_name, last_name, phone, company_name, selection } = req.body as {
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    company_name?: string;
    selection?: OfferSelection;
  };

  if (!email) {
    res.status(400).json({ success: false, error: "L'email est requis pour générer le lien de paiement." });
    return;
  }
  const errors = validateSelection(selection);
  if (errors.length > 0) {
    res.status(400).json({ success: false, error: errors.join(" ") });
    return;
  }

  // Les remises sont réservées au custom checkout sales.
  const publicSelection: OfferSelection = { accounting: selection!.accounting, bank: selection!.bank };
  const quote = buildQuote(publicSelection);
  const links = await createCheckoutLinks(quote, {
    email: email.trim(),
    firstName: first_name,
    lastName: last_name,
    phone,
    company: company_name,
  });

  res.json({
    success: links.some((l) => l.url),
    quote,
    payment_links: links,
    sales_meeting_url: salesMeetingUrl({
      name: [first_name, last_name].filter(Boolean).join(" "),
      email,
      summary: `Souscription en ligne ${company_name || ""}`.trim(),
    }),
    message:
      "Un lien de paiement par abonnement : la comptabilité et le compte pro sont facturés séparément.",
  });
});

/**
 * POST /api/offers/sales-meeting
 * Lien de prise de RDV avec un conseiller, pré-rempli.
 */
router.post("/sales-meeting", (req: Request, res: Response) => {
  const { email, name, summary } = req.body as { email?: string; name?: string; summary?: string };
  res.json({
    success: true,
    meeting_url: salesMeetingUrl({ name, email, summary }),
    calendar: config.SALES_CALENDLY_URL,
  });
});

export default router;
