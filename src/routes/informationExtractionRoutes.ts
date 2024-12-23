import { Router } from "express";
import { handleInformationExtraction } from "../controllers/informationExtractionController";

const router = Router();

/**
 * @route   POST /api/information-extraction
 * @desc    Extract information from response
 * @access  Public
 * @body    {
 *            question: string,
 *            response: string
 *          }
 */
router.post("/extract", handleInformationExtraction);


export default router;
