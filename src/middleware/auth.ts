import { Request, Response, NextFunction } from "express";
import { config } from "../config";

/**
 * Middleware to authenticate GPT Actions requests.
 * The GPT sends the API key via Bearer token in the Authorization header.
 */
export function authenticateGPT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  if (token !== config.GPT_API_KEY) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}
