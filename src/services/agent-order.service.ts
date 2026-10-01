import { PrismaClient, AgentOrder } from "@prisma/client";
import { StripeService } from "./stripe.service";
import { LegalPlaceService, formatLegalPlaceError } from "./legalplace.service";

const prisma = new PrismaClient();
const stripeService = new StripeService();
const legalplace = new LegalPlaceService();

export interface MicroEntreprisePayload {
  first_name: string;
  last_name: string;
  email: string;
  activity: string;
  phone?: string;
  date_of_birth?: string;
  place_of_birth?: string;
  nationality?: string;
  address?: string;
  activity_type?: "commercial" | "artisanal" | "liberal";
  naf_code?: string;
  commercial_name?: string;
  acre?: boolean;
  versement_liberatoire?: boolean;
}

const STRING_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "activity",
  "phone",
  "date_of_birth",
  "place_of_birth",
  "nationality",
  "address",
  "activity_type",
  "naf_code",
  "commercial_name",
] as const;
const REQUIRED_FIELDS = ["first_name", "last_name", "email", "activity"] as const;
const ACTIVITY_TYPES = ["commercial", "artisanal", "liberal"];

/**
 * Validates and normalises the request body. Returns the payload or a list of errors.
 */
export function parsePayload(
  body: any
): { payload: MicroEntreprisePayload } | { errors: string[] } {
  const errors: string[] = [];
  const payload: Record<string, unknown> = {};

  if (!body || typeof body !== "object") {
    return { errors: ["Le corps de la requête doit être un objet JSON."] };
  }

  for (const field of STRING_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") {
      errors.push(`${field} doit être une chaîne de caractères.`);
      continue;
    }
    payload[field] = value.trim();
  }

  for (const field of REQUIRED_FIELDS) {
    if (!payload[field]) errors.push(`${field} est requis.`);
  }

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email as string)) {
    errors.push("email est invalide.");
  }
  if (payload.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(payload.date_of_birth as string)) {
    errors.push("date_of_birth doit être au format YYYY-MM-DD.");
  }
  if (payload.activity_type && !ACTIVITY_TYPES.includes(payload.activity_type as string)) {
    errors.push(`activity_type doit valoir ${ACTIVITY_TYPES.join(", ")}.`);
  }

  for (const field of ["acre", "versement_liberatoire"] as const) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "boolean") {
      errors.push(`${field} doit être un booléen.`);
      continue;
    }
    payload[field] = body[field];
  }

  if (errors.length > 0) return { errors };
  return { payload: payload as unknown as MicroEntreprisePayload };
}

/**
 * Marks an order as paid (idempotent). Returns true if this call did the transition.
 */
export async function markOrderPaid(orderId: string): Promise<boolean> {
  const { count } = await prisma.agentOrder.updateMany({
    where: { id: orderId, status: "pending_payment" },
    data: { status: "paid", paidAt: new Date() },
  });
  return count > 0;
}

/**
 * Creates the micro-entreprise on LegalPlace for a paid order.
 * Safe to call several times: only one caller can move the order from "paid" to "creating".
 */
export async function fulfillOrder(orderId: string): Promise<AgentOrder | null> {
  const { count } = await prisma.agentOrder.updateMany({
    where: { id: orderId, status: "paid" },
    data: { status: "creating", error: null },
  });

  if (count === 0) {
    return prisma.agentOrder.findUnique({ where: { id: orderId } });
  }

  const order = await prisma.agentOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { agent: true },
  });
  const payload = JSON.parse(order.payload) as MicroEntreprisePayload;

  try {
    // The instance is created on the LegalPlace account the agent is linked to.
    const instance = await legalplace.createMicroEntreprise(order.agent.legalplaceEmail, {
      source: "agent_api",
      agent_id: order.agentId,
      agent_order_id: order.id,
      creator: payload,
    });

    return prisma.agentOrder.update({
      where: { id: order.id },
      data: {
        status: "created",
        legalplaceUniqid: instance.uniqid,
        legalplaceUrl: instance.url,
      },
    });
  } catch (error: any) {
    const message = formatLegalPlaceError(error);
    console.error(`LegalPlace creation failed for agent order ${order.id}: ${message}`);
    return prisma.agentOrder.update({
      where: { id: order.id },
      data: { status: "failed", error: message },
    });
  }
}

/**
 * Re-checks the Stripe session of a pending order (fallback when the webhook
 * is late or not configured) and creates the micro-entreprise once paid.
 */
export async function syncOrder(order: AgentOrder): Promise<AgentOrder> {
  if (order.status === "pending_payment" && order.stripeSessionId) {
    const session = await stripeService.getSession(order.stripeSessionId);

    if (session.paymentStatus === "paid") {
      await markOrderPaid(order.id);
    } else if (session.status === "expired") {
      await prisma.agentOrder.updateMany({
        where: { id: order.id, status: "pending_payment" },
        data: { status: "expired" },
      });
    }
  }

  const current = await prisma.agentOrder.findUniqueOrThrow({ where: { id: order.id } });
  if (current.status === "paid") {
    return (await fulfillOrder(current.id)) ?? current;
  }
  return current;
}

const STATUS_MESSAGES: Record<string, string> = {
  pending_payment: "En attente du paiement de 5 € via payment_url.",
  paid: "Paiement reçu, création de la micro-entreprise en cours.",
  creating: "Création de la micro-entreprise en cours sur LegalPlace.",
  created: "Micro-entreprise créée sur votre compte LegalPlace.",
  failed: "Le paiement est validé mais la création LegalPlace a échoué. Relancez via POST /retry.",
  expired: "Le lien de paiement a expiré. Créez une nouvelle demande.",
};

export function serializeOrder(order: AgentOrder, paymentUrl?: string | null) {
  return {
    order_id: order.id,
    status: order.status,
    message: STATUS_MESSAGES[order.status] ?? order.status,
    amount: `${(order.amountCents / 100).toFixed(2)} €`,
    amount_cents: order.amountCents,
    ...(paymentUrl ? { payment_url: paymentUrl } : {}),
    paid_at: order.paidAt,
    legalplace_uniqid: order.legalplaceUniqid,
    legalplace_url: order.legalplaceUrl,
    error: order.error,
    data: JSON.parse(order.payload),
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };
}
