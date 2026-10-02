import axios from "axios";
import crypto from "crypto";

const BASE_URL = process.env.MONNIFY_BASE_URL || "https://sandbox.monnify.com";
const API_KEY = process.env.MONNIFY_API_KEY;
const SECRET_KEY = process.env.MONNIFY_SECRET_KEY;
const CONTRACT_CODE = process.env.MONNIFY_CONTRACT_CODE;

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const credentials = Buffer.from(`${API_KEY}:${SECRET_KEY}`).toString("base64");
  const { data } = await axios.post(
    `${BASE_URL}/api/v1/auth/login`,
    {},
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  cachedToken = data.responseBody.accessToken;
  tokenExpiresAt = Date.now() + (data.responseBody.expiresIn - 120) * 1000;
  return cachedToken;
}

export async function initiateTransaction(payload) {
  const token = await getAccessToken();
  const { data } = await axios.post(
    `${BASE_URL}/api/v1/merchant/transactions/init-transaction`,
    { ...payload, contractCode: CONTRACT_CODE },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data.responseBody;
}

export async function verifyTransactionStatus(transactionReference) {
  const token = await getAccessToken();
  const { data } = await axios.get(`${BASE_URL}/api/v2/transactions/${transactionReference}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.responseBody;
}

export async function initiateTransfer({ amountNaira, reference, narration, bankCode, accountNumber }) {
  const token = await getAccessToken();
  const { data } = await axios.post(
    `${BASE_URL}/api/v2/disbursements/single`,
    {
      amount: amountNaira,
      reference,
      narration,
      destinationBankCode: bankCode,
      destinationAccountNumber: accountNumber,
      currency: "NGN",
      sourceAccountNumber: process.env.MONNIFY_WALLET_ACCOUNT_NUMBER,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data.responseBody;
}

export function verifyWebhookSignature(rawBodyString, signatureHeader) {
  if (!rawBodyString || !signatureHeader || !SECRET_KEY) return false;
  const computed = crypto.createHmac("sha512", SECRET_KEY).update(rawBodyString).digest("hex");
  return computed === signatureHeader;
}
