import express from "express";
import { initiatePayment, handleMonnifyWebhook } from "../controllers/payment.controller.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

router.post("/webhook", handleMonnifyWebhook);

router.use(verifyToken);
router.post("/initiate", initiatePayment);

export default router;
