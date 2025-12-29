import { Request, Response, NextFunction } from "express";

const ALLOWED_ORIGINS = ["http://localhost:3000", process.env.FRONT_END_URL];

export default function allowSpecificSource(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const origin = req.headers.origin;

  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({
      success: false,
      message: "Origin not allowed",
    });
  } else {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    // Handle preflight
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    return next();
  }
}
