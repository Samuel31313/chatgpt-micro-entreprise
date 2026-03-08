import { Router, Request, Response } from "express";

const router = Router();

// Common NAF codes for micro-entrepreneurs
const NAF_CODES: Array<{ code: string; label: string; category: string }> = [
  // Informatique & Digital
  { code: "6201Z", label: "Programmation informatique", category: "liberal" },
  { code: "6202A", label: "Conseil en systèmes et logiciels informatiques", category: "liberal" },
  { code: "6202B", label: "Tierce maintenance de systèmes et d'applications informatiques", category: "liberal" },
  { code: "6209Z", label: "Autres activités informatiques", category: "liberal" },
  { code: "6311Z", label: "Traitement de données, hébergement et activités connexes", category: "liberal" },
  { code: "6312Z", label: "Portails Internet", category: "liberal" },
  // Conseil & Formation
  { code: "7022Z", label: "Conseil pour les affaires et autres conseils de gestion", category: "liberal" },
  { code: "7021Z", label: "Conseil en relations publiques et communication", category: "liberal" },
  { code: "7490B", label: "Activités spécialisées, scientifiques et techniques diverses", category: "liberal" },
  { code: "8559A", label: "Formation continue d'adultes", category: "liberal" },
  { code: "8559B", label: "Autres enseignements", category: "liberal" },
  // Création & Design
  { code: "7410Z", label: "Activités spécialisées de design", category: "liberal" },
  { code: "7420Z", label: "Activités photographiques", category: "liberal" },
  { code: "7311Z", label: "Activités des agences de publicité", category: "liberal" },
  { code: "5911A", label: "Production de films et de programmes pour la télévision", category: "liberal" },
  { code: "5911B", label: "Production de films institutionnels et publicitaires", category: "liberal" },
  { code: "7430Z", label: "Traduction et interprétation", category: "liberal" },
  // Commerce
  { code: "4791B", label: "Vente à distance sur catalogue spécialisé (e-commerce)", category: "commercial" },
  { code: "4719B", label: "Autres commerces de détail en magasin non spécialisé", category: "commercial" },
  { code: "4782Z", label: "Commerce de détail sur éventaires et marchés", category: "commercial" },
  { code: "4778C", label: "Autres commerces de détail spécialisés divers", category: "commercial" },
  // Restauration
  { code: "5610C", label: "Restauration de type rapide", category: "commercial" },
  { code: "5621Z", label: "Services des traiteurs", category: "commercial" },
  // BTP & Artisanat
  { code: "4399C", label: "Travaux de maçonnerie générale et gros œuvre de bâtiment", category: "artisanal" },
  { code: "4321A", label: "Travaux d'installation électrique dans tous locaux", category: "artisanal" },
  { code: "4322A", label: "Travaux d'installation d'eau et de gaz en tous locaux", category: "artisanal" },
  { code: "4322B", label: "Travaux d'installation d'équipements thermiques et de climatisation", category: "artisanal" },
  { code: "4332A", label: "Travaux de menuiserie bois et PVC", category: "artisanal" },
  { code: "4334Z", label: "Travaux de peinture et vitrerie", category: "artisanal" },
  { code: "4339Z", label: "Autres travaux de finition", category: "artisanal" },
  // Services à la personne
  { code: "9602A", label: "Coiffure", category: "artisanal" },
  { code: "9602B", label: "Soins de beauté", category: "artisanal" },
  { code: "9604Z", label: "Entretien corporel", category: "artisanal" },
  { code: "8690F", label: "Activités de santé humaine non classées ailleurs (ostéopathie, etc.)", category: "liberal" },
  // Transport & Livraison
  { code: "4941B", label: "Transports routiers de fret de proximité", category: "commercial" },
  { code: "5320Z", label: "Autres activités de poste et de courrier", category: "commercial" },
  // Nettoyage
  { code: "8121Z", label: "Nettoyage courant des bâtiments", category: "artisanal" },
  { code: "8122Z", label: "Autres activités de nettoyage des bâtiments et nettoyage industriel", category: "artisanal" },
  // Immobilier
  { code: "6820A", label: "Location de logements", category: "commercial" },
  // Sport & Bien-être
  { code: "8551Z", label: "Enseignement de disciplines sportives et d'activités de loisirs", category: "liberal" },
  { code: "9312Z", label: "Activités de clubs de sports", category: "liberal" },
];

/**
 * GET /api/naf/search?q=...
 * Search NAF codes by keyword
 */
router.get("/search", (req: Request, res: Response) => {
  const query = (req.query.q as string || "").toLowerCase().trim();

  if (!query || query.length < 2) {
    res.status(400).json({ error: "Paramètre 'q' requis (minimum 2 caractères)" });
    return;
  }

  const results = NAF_CODES.filter(
    (naf) =>
      naf.label.toLowerCase().includes(query) ||
      naf.code.toLowerCase().includes(query) ||
      naf.category.toLowerCase().includes(query)
  ).slice(0, 10);

  res.json({
    query,
    count: results.length,
    results: results.map((r) => ({
      code: r.code,
      label: r.label,
      category: r.category,
    })),
    message:
      results.length > 0
        ? `${results.length} code(s) APE/NAF trouvé(s) pour "${query}".`
        : `Aucun code trouvé pour "${query}". Essayez avec d'autres mots-clés.`,
  });
});

export default router;
