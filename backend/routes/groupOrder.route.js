import express from "express";
import {
  createGroupOrder,
  joinGroupOrder,
  getGroupOrderByCode,
  listOpenGroupOrders,
  getMyGroupOrders,
} from "../controllers/groupOrder.controller.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

router.get("/code/:code", getGroupOrderByCode);
router.get("/open", listOpenGroupOrders);

router.use(verifyToken);

router.post("/", createGroupOrder);
router.post("/:fulfillmentCode/join", joinGroupOrder);
router.get("/my", getMyGroupOrders);

export default router;
