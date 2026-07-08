import { mailtrapClient, sender } from "./mailtrap.config.js";
import {
  VERIFICATION_EMAIL_TEMPLATE,
  WELCOME_EMAIL_TEMPLATE,
  PASSWORD_RESET_REQUEST_TEMPLATE,
  PASSWORD_RESET_SUCCESS_TEMPLATE,
  KYC_APPROVED_TEMPLATE,
  KYC_REJECTED_TEMPLATE,
} from "./emailTemplates.js";

// ── FROM MERN STARTER (kept, rebranded) ───────────────────────────────────────

export const sendVerificationEmail = async (email, verificationToken) => {
  try {
    await mailtrapClient.send({
      from:     sender,
      to:       [{ email }],
      subject:  "Verify your Gimbiya Mall account",
      html:     VERIFICATION_EMAIL_TEMPLATE.replace("{verificationCode}", verificationToken),
      category: "Email Verification",
    });
    console.log("[Email] Verification email sent to:", email);
  } catch (error) {
    console.error("[Email] Error sending verification email:", error.message);
    throw new Error(`Error sending verification email: ${error.message}`);
  }
};

export const sendWelcomeEmail = async (email, name) => {
  try {
    await mailtrapClient.send({
      from:     sender,
      to:       [{ email }],
      subject:  "Welcome to Gimbiya Mall!",
      html:     WELCOME_EMAIL_TEMPLATE.replace("{name}", name),
      category: "Welcome",
    });
    console.log("[Email] Welcome email sent to:", email);
  } catch (error) {
    console.error("[Email] Error sending welcome email:", error.message);
    throw new Error(`Error sending welcome email: ${error.message}`);
  }
};

export const sendPasswordResetEmail = async (email, resetURL) => {
  try {
    await mailtrapClient.send({
      from:     sender,
      to:       [{ email }],
      subject:  "Reset your Gimbiya Mall password",
      html:     PASSWORD_RESET_REQUEST_TEMPLATE.replace("{resetURL}", resetURL),
      category: "Password Reset",
    });
    console.log("[Email] Password reset email sent to:", email);
  } catch (error) {
    console.error("[Email] Error sending password reset email:", error.message);
    throw new Error(`Error sending password reset email: ${error.message}`);
  }
};

export const sendResetSuccessEmail = async (email) => {
  try {
    await mailtrapClient.send({
      from:     sender,
      to:       [{ email }],
      subject:  "Your Gimbiya Mall password has been reset",
      html:     PASSWORD_RESET_SUCCESS_TEMPLATE,
      category: "Password Reset",
    });
    console.log("[Email] Reset success email sent to:", email);
  } catch (error) {
    console.error("[Email] Error sending reset success email:", error.message);
    throw new Error(`Error sending reset success email: ${error.message}`);
  }
};

// ── GIMBIYA MALL ADDITIONS ────────────────────────────────────────────────────

export const sendKycApprovedEmail = async (email, name, role) => {
  try {
    await mailtrapClient.send({
      from:     sender,
      to:       [{ email }],
      subject:  "Your Gimbiya Mall KYC has been approved",
      html:     KYC_APPROVED_TEMPLATE
                  .replace("{name}", name)
                  .replace("{role}", role),
      category: "KYC",
    });
    console.log("[Email] KYC approved email sent to:", email);
  } catch (error) {
    console.error("[Email] Error sending KYC approved email:", error.message);
  }
};

export const sendKycRejectedEmail = async (email, name, reason) => {
  try {
    await mailtrapClient.send({
      from:     sender,
      to:       [{ email }],
      subject:  "Action required: Gimbiya Mall KYC verification",
      html:     KYC_REJECTED_TEMPLATE
                  .replace("{name}", name)
                  .replace("{reason}", reason),
      category: "KYC",
    });
    console.log("[Email] KYC rejected email sent to:", email);
  } catch (error) {
    console.error("[Email] Error sending KYC rejected email:", error.message);
  }
};
