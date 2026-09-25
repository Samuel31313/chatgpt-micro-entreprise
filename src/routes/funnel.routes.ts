import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { buildQuote, OfferSelection, publicPricingGrid } from "../services/pricing.service";
import { qualify, QualificationAnswers, salesMeetingUrl } from "../services/qualification.service";
import { createCheckoutLinks } from "../services/chargebee.service";
import { validateSelection } from "../services/selection.validator";
import { config } from "../config";

const prisma = new PrismaClient();
const router = Router();

/**
 * Endpoints publics du funnel de souscription web (/comptabilite).
 * Pas d'authentification : limite simple par IP pour éviter l'abus.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else if (++entry.count > MAX_REQUESTS) {
    res.status(429).json({ success: false, error: "Trop de requêtes, réessayez dans une minute." });
    return;
  }
  if (hits.size > 10_000) {
    for (const [key, e] of hits) if (e.resetAt < now) hits.delete(key);
  }
  next();
}

router.use(rateLimit);

/** Les remises sont réservées au custom checkout sales. */
function publicSelection(s: OfferSelection): OfferSelection {
  return { accounting: s.accounting, bank: s.bank };
}

/** GET /api/funnel/pricing — grille tarifaire HT. */
router.get("/pricing", (_req: Request, res: Response) => {
  res.json({ success: true, pricing: publicPricingGrid() });
});

/** POST /api/funnel/quote — devis au prix grille (recalcul en direct dans le funnel). */
router.post("/quote", (req: Request, res: Response) => {
  const selection = req.body.selection as OfferSelection;
  const errors = validateSelection(selection);
  if (errors.length > 0) {
    res.status(400).json({ success: false, error: errors.join(" ") });
    return;
  }
  res.json({ success: true, quote: buildQuote(publicSelection(selection)) });
});

/**
 * POST /api/funnel/qualify
 * Oriente le visiteur : création LegalPlace, souscription en ligne (offre recommandée) ou RDV.
 */
router.post("/qualify", (req: Request, res: Response) => {
  const answers = req.body.answers as QualificationAnswers | undefined;
  if (!answers?.company_status) {
    res.status(400).json({ success: false, error: "answers.company_status est requis." });
    return;
  }
  const result = qualify(answers);
  res.json({ success: true, ...result });
});

/**
 * POST /api/funnel/checkout
 * Enregistre le lead et renvoie un lien de paiement Chargebee par abonnement.
 */
router.post("/checkout", async (req: Request, res: Response) => {
  const { contact = {}, selection, answers } = req.body as {
    contact?: { email?: string; first_name?: string; last_name?: string; phone?: string; company_name?: string; siren?: string };
    selection?: OfferSelection;
    answers?: QualificationAnswers;
  };

  if (!contact.email || !/^\S+@\S+\.\S+$/.test(contact.email)) {
    res.status(400).json({ success: false, error: "Adresse email invalide." });
    return;
  }
  const errors = validateSelection(selection);
  if (errors.length > 0) {
    res.status(400).json({ success: false, error: errors.join(" ") });
    return;
  }

  const quote = buildQuote(publicSelection(selection!));
  const email = contact.email.trim();

  try {
    await prisma.lead.create({
      data: {
        email,
        phone: contact.phone,
        name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null,
        companyName: contact.company_name,
        siren: contact.siren,
        legalForm: answers?.legal_form,
        answers: JSON.stringify(answers || {}),
        route: "self_checkout",
        quote: JSON.stringify(quote),
      },
    });
  } catch (err: any) {
    console.error(`[funnel] lead non enregistré (${email}) : ${err.message}`);
  }

  const links = await createCheckoutLinks(
    quote,
    { email, firstName: contact.first_name, lastName: contact.last_name, phone: contact.phone, company: contact.company_name },
    { redirectUrl: `${config.APP_URL}/comptabilite?paye=1` }
  );

  res.json({ success: links.some((l) => l.url), quote, payment_links: links });
});

/** POST /api/funnel/meeting — lien Calendly pré-rempli (+ lead si email fourni). */
router.post("/meeting", async (req: Request, res: Response) => {
  const { contact = {}, answers, reasons = [] } = req.body as {
    contact?: { email?: string; first_name?: string; last_name?: string; phone?: string; company_name?: string };
    answers?: QualificationAnswers;
    reasons?: string[];
  };
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  const summary = [answers?.legal_form?.toUpperCase(), contact.company_name, ...reasons].filter(Boolean).join(" — ");

  if (contact.email) {
    try {
      await prisma.lead.create({
        data: {
          email: contact.email.trim(),
          phone: contact.phone,
          name: name || null,
          companyName: contact.company_name,
          legalForm: answers?.legal_form,
          answers: JSON.stringify(answers || {}),
          route: "sales_meeting",
        },
      });
    } catch (err: any) {
      console.error(`[funnel] lead RDV non enregistré : ${err.message}`);
    }
  }

  res.json({ success: true, meeting_url: salesMeetingUrl({ name, email: contact.email, summary }) });
});

export default router;
