import express from "express";
import {
  createUniqueSurveyCode,
  createManyUniqueSurveyCodes,
  validateUniqueSurveyCode,
  deleteUniqueSurveyCode,
  validateAndSubmitUCODE,
  assignUniqueSurveyCodeToUser,
  getUserUniqueSurveyCode,
} from "../controllers/uniqueSurveyCodeController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router();

// POST /
router.post("/", protect, createUniqueSurveyCode);
// POST /bulk
router.post("/bulk", protect, createManyUniqueSurveyCodes);
// GET /validate/:kode_unik
router.get("/validate/:kode_unik", validateUniqueSurveyCode);
// DELETE /:kode_unik
router.delete("/:kode_unik", protect, deleteUniqueSurveyCode);
// GET /validate-and-submit/:kode_unik
router.get("/validate-and-submit/:kode_unik", protect, validateAndSubmitUCODE);
// POST /assign-to-user
router.post("/assign-to-user", protect, assignUniqueSurveyCodeToUser);
// GET /user
router.get("/user", protect, getUserUniqueSurveyCode);

export default router; 