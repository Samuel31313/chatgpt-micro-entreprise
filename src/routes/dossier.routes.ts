import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();
const router = Router();

/**
 * POST /api/dossier
 * Create or update a dossier. Uses sessionId to link to ChatGPT conversation.
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      session_id,
      first_name,
      last_name,
      date_of_birth,
      place_of_birth,
      nationality,
      activity_type,
      activity_desc,
      naf_code,
      enterprise_addr,
      acre_option,
      versement_lib,
    } = req.body;

    const sessionId = session_id || uuidv4();

    const dossier = await prisma.dossier.upsert({
      where: { sessionId },
      create: {
        sessionId,
        firstName: first_name,
        lastName: last_name,
        dateOfBirth: date_of_birth,
        placeOfBirth: place_of_birth,
        nationality,
        activityType: activity_type,
        activityDesc: activity_desc,
        nafCode: naf_code,
        enterpriseAddr: enterprise_addr,
        acreOption: acre_option ?? false,
        versementLib: versement_lib ?? false,
      },
      update: {
        ...(first_name !== undefined && { firstName: first_name }),
        ...(last_name !== undefined && { lastName: last_name }),
        ...(date_of_birth !== undefined && { dateOfBirth: date_of_birth }),
        ...(place_of_birth !== undefined && { placeOfBirth: place_of_birth }),
        ...(nationality !== undefined && { nationality }),
        ...(activity_type !== undefined && { activityType: activity_type }),
        ...(activity_desc !== undefined && { activityDesc: activity_desc }),
        ...(naf_code !== undefined && { nafCode: naf_code }),
        ...(enterprise_addr !== undefined && { enterpriseAddr: enterprise_addr }),
        ...(acre_option !== undefined && { acreOption: acre_option }),
        ...(versement_lib !== undefined && { versementLib: versement_lib }),
      },
    });

    res.json({
      success: true,
      dossier_id: dossier.id,
      session_id: dossier.sessionId,
      message: "Dossier sauvegardé avec succès.",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dossier/:sessionId
 * Get dossier details
 */
router.get("/:sessionId", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const dossier = await prisma.dossier.findUnique({
      where: { sessionId },
      include: { documents: true },
    });

    if (!dossier) {
      res.status(404).json({ error: "Dossier non trouvé" });
      return;
    }

    res.json({
      dossier_id: dossier.id,
      session_id: dossier.sessionId,
      identity: {
        first_name: dossier.firstName,
        last_name: dossier.lastName,
        date_of_birth: dossier.dateOfBirth,
        place_of_birth: dossier.placeOfBirth,
        nationality: dossier.nationality,
      },
      activity: {
        type: dossier.activityType,
        description: dossier.activityDesc,
        naf_code: dossier.nafCode,
        address: dossier.enterpriseAddr,
      },
      options: {
        acre: dossier.acreOption,
        versement_liberatoire: dossier.versementLib,
      },
      payment: {
        status: dossier.stripePaymentStatus,
        amount_cents: dossier.amountCents,
      },
      inpi: {
        status: dossier.inpiStatus,
        formalite_id: dossier.inpiFormaliteId,
        siret: dossier.siretNumber,
      },
      documents: dossier.documents.map((d) => ({
        type: d.type,
        status: d.status,
        validation_note: d.validationNote,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dossier/:sessionId/summary
 * Get a formatted summary for the GPT to display
 */
router.get("/:sessionId/summary", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const dossier = await prisma.dossier.findUnique({
      where: { sessionId },
      include: { documents: true },
    });

    if (!dossier) {
      res.status(404).json({ error: "Dossier non trouvé" });
      return;
    }

    const docStatus = (type: string) => {
      const doc = dossier.documents.find((d) => d.type === type);
      if (!doc) return "Non fourni";
      return doc.status === "valid" ? "Validé" : doc.status === "invalid" ? "Invalide" : "En attente";
    };

    res.json({
      summary: {
        identite: `${dossier.firstName} ${dossier.lastName}, né(e) le ${dossier.dateOfBirth} à ${dossier.placeOfBirth}, nationalité ${dossier.nationality}`,
        activite: `${dossier.activityType} — ${dossier.activityDesc} (APE: ${dossier.nafCode})`,
        adresse: dossier.enterpriseAddr,
        options: {
          acre: dossier.acreOption ? "Oui" : "Non",
          versement_liberatoire: dossier.versementLib ? "Oui" : "Non",
        },
        documents: {
          piece_identite: docStatus("id_document"),
          justificatif_domicile: docStatus("domicile_proof"),
          attestation_non_condamnation: docStatus("non_condamnation"),
        },
        paiement: dossier.stripePaymentStatus || "Non effectué",
        inpi: dossier.inpiStatus || "Non soumis",
        siret: dossier.siretNumber || null,
      },
      is_complete:
        !!dossier.firstName &&
        !!dossier.lastName &&
        !!dossier.dateOfBirth &&
        !!dossier.activityDesc &&
        !!dossier.enterpriseAddr &&
        dossier.documents.filter((d) => d.status === "valid").length >= 3,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
