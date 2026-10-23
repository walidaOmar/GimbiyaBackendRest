import express from "express";
import { getMyWallet, getBanks, requestWithdrawal, listWithdrawals, approveWithdrawal, markWithdrawalPaid, rejectWithdrawal, platformSummary } from "../controllers/wallet.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();
router.use(verifyToken);

router.get("/", getMyWallet);
router.get("/banks", getBanks);
router.post("/withdrawals", requestWithdrawal);

const HQ = ["super_admin", "ceo"];
router.get("/admin/withdrawals", requireRole(...HQ, "auditor"), listWithdrawals);
router.get("/admin/summary", requireRole(...HQ, "auditor"), platformSummary);
router.post("/admin/withdrawals/:id/approve", requireRole(...HQ), approveWithdrawal);
router.post("/admin/withdrawals/:id/mark-paid", requireRole(...HQ), markWithdrawalPaid);
router.post("/admin/withdrawals/:id/reject", requireRole(...HQ), rejectWithdrawal);

export default router;
