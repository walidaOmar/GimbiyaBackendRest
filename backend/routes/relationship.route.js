import express from "express";
import {
  createRelationship,
  logInteraction,
  getMyPortfolio,
  getRegionalPortfolio,
} from "../controllers/relationship.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";
import { validateStateScope } from "../middleware/stateIsolation.js";

const router = express.Router();

router.use(verifyToken);

router.post("/", requireRole("affiliate"), createRelationship);
router.post("/:relationshipId/interactions", requireRole("affiliate"), logInteraction);
router.get("/mine", requireRole("affiliate"), getMyPortfolio);
router.get("/regional", requireRole("developer_coordinator"), validateStateScope, getRegionalPortfolio);

export default router;
