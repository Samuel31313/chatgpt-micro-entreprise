import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import path from "path";
import fs from "fs";
import { config } from "../config";
import { DocumentAiService } from "../services/document-ai.service";

const prisma = new PrismaClient();
const documentAi = new DocumentAiService();
const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = config.UPLOAD_DIR;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Format de fichier non supporté. Utilisez JPG, PNG, WebP ou PDF."));
    }
  },
});

/**
 * POST /api/document/upload
 * Upload and validate a document using AI
 */
router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const { session_id, document_type } = req.body;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "Aucun fichier fourni" });
        return;
      }

      if (!session_id || !document_type) {
        res.status(400).json({ error: "session_id et document_type requis" });
        return;
      }

      const validTypes = ["id_document", "domicile_proof", "non_condamnation"];
      if (!validTypes.includes(document_type)) {
        res.status(400).json({
          error: `Type de document invalide. Valeurs acceptées : ${validTypes.join(", ")}`,
        });
        return;
      }

      // Find or create dossier
      let dossier = await prisma.dossier.findUnique({
        where: { sessionId: session_id },
      });

      if (!dossier) {
        dossier = await prisma.dossier.create({
          data: { sessionId: session_id },
        });
      }

      // Validate with AI
      const validation = await documentAi.validateDocument(
        file.path,
        file.mimetype,
        document_type
      );

      // Delete previous document of same type if exists
      await prisma.document.deleteMany({
        where: { dossierId: dossier.id, type: document_type },
      });

      // Save document record
      const document = await prisma.document.create({
        data: {
          dossierId: dossier.id,
          type: document_type,
          filePath: file.path,
          mimeType: file.mimetype,
          fileName: file.originalname,
          status: validation.isValid ? "valid" : "invalid",
          validationNote: validation.issues.join("; ") || null,
        },
      });

      res.json({
        success: true,
        document_id: document.id,
        is_valid: validation.isValid,
        issues: validation.issues,
        extracted_data: validation.extracted,
        message: validation.isValid
          ? `Document "${document_type}" validé avec succès.`
          : `Document "${document_type}" invalide : ${validation.issues.join(", ")}`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/document/validate-url
 * Validate a document from a URL (for ChatGPT file uploads via URL)
 */
router.post("/validate-url", async (req: Request, res: Response) => {
  try {
    const { session_id, document_type, file_url } = req.body;

    if (!session_id || !document_type || !file_url) {
      res.status(400).json({ error: "session_id, document_type et file_url requis" });
      return;
    }

    // Download file from URL
    const axios = (await import("axios")).default;
    const response = await axios.get(file_url, { responseType: "arraybuffer" });
    const contentType = response.headers["content-type"] || "image/jpeg";

    // Save to disk
    const uploadDir = config.UPLOAD_DIR;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, response.data);

    // Find or create dossier
    let dossier = await prisma.dossier.findUnique({
      where: { sessionId: session_id },
    });

    if (!dossier) {
      dossier = await prisma.dossier.create({
        data: { sessionId: session_id },
      });
    }

    // Validate with AI
    const validation = await documentAi.validateDocument(filePath, contentType, document_type);

    // Delete previous document of same type
    await prisma.document.deleteMany({
      where: { dossierId: dossier.id, type: document_type },
    });

    // Save document record
    const document = await prisma.document.create({
      data: {
        dossierId: dossier.id,
        type: document_type,
        filePath,
        mimeType: contentType,
        fileName,
        status: validation.isValid ? "valid" : "invalid",
        validationNote: validation.issues.join("; ") || null,
      },
    });

    res.json({
      success: true,
      document_id: document.id,
      is_valid: validation.isValid,
      issues: validation.issues,
      extracted_data: validation.extracted,
      message: validation.isValid
        ? `Document "${document_type}" validé avec succès.`
        : `Document "${document_type}" invalide : ${validation.issues.join(", ")}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
