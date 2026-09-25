import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { buildQuote, OfferSelection } from "../services/pricing.service";
import { validateSelection } from "../services/selection.validator";
import { publicPricingGrid } from "../services/pricing.service";
import { config } from "../config";

const prisma = new PrismaClient();
const router = Router();

const OFFER_VALIDITY_DAYS = 15;

type Role = "sales" | "manager";

/** Bearer SALES_API_KEY (sales) ou SALES_MANAGER_API_KEY (manager). */
export function authenticateSales(req: Request, res: Response, next: NextFunction): void {
  if (!config.SALES_API_KEY) {
    res.status(503).json({ error: "Outil sales non configuré (SALES_API_KEY manquant)." });
    return;
  }
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  let role: Role | null = null;
  if (config.SALES_MANAGER_API_KEY && token === config.SALES_MANAGER_API_KEY) role = "manager";
  else if (token === config.SALES_API_KEY) role = "sales";
  if (!role) {
    res.status(401).json({ error: "Clé sales invalide." });
    return;
  }
  res.locals.role = role;
  next();
}

function offerUrl(slug: string) {
  return `${config.APP_URL}/offre/${slug}`;
}

/** GET /api/sales/pricing — grille + marges de manœuvre, pour le formulaire. */
router.get("/pricing", (_req: Request, res: Response) => {
  res.json({ success: true, pricing: publicPricingGrid(), role: res.locals.role });
});

/**
 * POST /api/sales/quote
 * Prévisualise une offre personnalisée (prix, remises, écarts aux marges de manœuvre).
 */
router.post("/quote", (req: Request, res: Response) => {
  const selection = req.body.selection as OfferSelection;
  const errors = validateSelection(selection);
  if (errors.length > 0) {
    res.status(400).json({ success: false, error: errors.join(" ") });
    return;
  }
  const quote = buildQuote(selection);
  res.json({ success: true, quote, requires_manager_approval: quote.guardrailViolations.length > 0 });
});

/**
 * POST /api/sales/offers
 * Crée un custom checkout. Hors marges de manœuvre → en attente de validation manager
 * (sauf si l'offre est créée directement avec la clé manager).
 */
router.post("/offers", async (req: Request, res: Response) => {
  const { sales_email, sales_name, customer = {}, selection, message } = req.body as {
    sales_email?: string;
    sales_name?: string;
    customer?: { email?: string; first_name?: string; last_name?: string; phone?: string; company_name?: string; siren?: string };
    selection?: OfferSelection;
    message?: string;
  };

  if (!sales_email || !customer.email) {
    res.status(400).json({ success: false, error: "sales_email et customer.email sont requis." });
    return;
  }
  const errors = validateSelection(selection);
  if (errors.length > 0) {
    res.status(400).json({ success: false, error: errors.join(" ") });
    return;
  }

  const quote = buildQuote(selection!);
  const needsApproval = quote.guardrailViolations.length > 0 && res.locals.role !== "manager";
  const slug = crypto.randomBytes(8).toString("base64url");

  const offer = await prisma.customOffer.create({
    data: {
      slug,
      salesEmail: sales_email.trim(),
      salesName: sales_name,
      email: customer.email.trim(),
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.phone,
      companyName: customer.company_name,
      siren: customer.siren,
      message,
      selection: JSON.stringify(selection),
      quote: JSON.stringify(quote),
      status: needsApproval ? "pending_approval" : "sent",
      approvedBy: quote.guardrailViolations.length > 0 && !needsApproval ? sales_email : null,
      expiresAt: new Date(Date.now() + OFFER_VALIDITY_DAYS * 24 * 3600 * 1000),
    },
  });

  res.json({
    success: true,
    slug: offer.slug,
    status: offer.status,
    offer_url: offerUrl(offer.slug),
    expires_at: offer.expiresAt,
    quote,
    message: needsApproval
      ? "Offre hors marges de manœuvre : en attente de validation manager. Le client ne pourra pas payer avant validation."
      : "Offre prête : envoyez le lien au client.",
  });
});

/** GET /api/sales/offers?sales_email=… — dernières offres. */
router.get("/offers", async (req: Request, res: Response) => {
  const salesEmail = typeof req.query.sales_email === "string" ? req.query.sales_email : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const offers = await prisma.customOffer.findMany({
    where: { ...(salesEmail ? { salesEmail } : {}), ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({
    success: true,
    offers: offers.map((o) => {
      const quote = JSON.parse(o.quote);
      return {
        slug: o.slug,
        status: o.status,
        offer_url: offerUrl(o.slug),
        customer: o.email,
        company: o.companyName,
        sales: o.salesEmail,
        first_year_ht: quote.totals.firstYearHt,
        violations: quote.guardrailViolations,
        expires_at: o.expiresAt,
        created_at: o.createdAt,
      };
    }),
  });
});

/** POST /api/sales/offers/:slug/approve — validation manager. */
router.post("/offers/:slug/approve", async (req: Request, res: Response) => {
  if (res.locals.role !== "manager") {
    res.status(403).json({ success: false, error: "Validation réservée aux managers." });
    return;
  }
  const existing = await prisma.customOffer.findUnique({ where: { slug: String(req.params.slug) } });
  if (!existing) {
    res.status(404).json({ success: false, error: "Offre introuvable." });
    return;
  }
  const decision = req.body.decision === "reject" ? "rejected" : "sent";
  const offer = await prisma.customOffer.update({
    where: { slug: String(req.params.slug) },
    data: { status: decision, approvedBy: req.body.manager_email || "manager" },
  });
  res.json({ success: true, slug: offer.slug, status: offer.status, offer_url: offerUrl(offer.slug) });
});

export default router;
