// src/routes/ragRoutes.ts

import { Router } from "express";
import { initializeRAG, askQuestion } from "../controllers/ragController";

const router = Router();

router.post("/initialize", initializeRAG);
router.post("/ask", askQuestion);

export default router;