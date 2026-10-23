import { mailtrapClient, sender } from "./mailtrap.config.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Returns true if the email was handed to Mailtrap. Never throws: the invite link is also shown to the inviter. */
export async function sendInviteEmail({ email, name, roleLabel, nodeLabel, inviterName, inviteUrl, hours }) {
  try {
    await mailtrapClient.send({
      from: sender,
      to: [{ email }],
      subject: `You are invited to Gimbiya Mall as ${roleLabel}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
        <h2 style="color:#0D4A3A">Welcome${name ? `, ${esc(name)}` : ""}</h2>
        <p>${esc(inviterName)} invited you to join <b>Gimbiya Mall</b> as <b>${esc(roleLabel)}</b> at <b>${esc(nodeLabel)}</b>.</p>
        <p><a href="${esc(inviteUrl)}" style="background:#C8A84B;color:#050510;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Accept invitation</a></p>
        <p style="color:#666;font-size:13px">This link works once and expires in ${hours} hours. If you were not expecting it, ignore this email.</p>
      </div>`,
      category: "Invite",
    });
    return true;
  } catch (error) {
    console.error("[Email] Invite email failed:", error.message);
    return false;
  }
}
