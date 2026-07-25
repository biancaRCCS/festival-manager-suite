import nodemailer from "nodemailer";
import { logger } from "./logger";

// Use environment-provided SMTP settings or fall back to Ethereal for dev
async function getTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Dev: log email details instead of sending
  return null;
}

export async function sendPortalInviteEmail(params: {
  to: string;
  name: string;
  type: "vendor" | "sponsor";
  portalUrl: string;
  festivalName: string;
}) {
  const { to, name, type, portalUrl, festivalName } = params;

  const subject = `Your ${type === "vendor" ? "Vendor" : "Sponsor"} Application for ${festivalName} — Next Steps`;
  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #2d1b0e;">
      <h2 style="color: #8b1a1a;">Congratulations, ${name}!</h2>
      <p>We are pleased to inform you that your ${type} application for <strong>${festivalName}</strong> has been <strong>approved</strong>.</p>
      <p>To complete your registration, please visit your private portal to:</p>
      <ol>
        <li>Review and sign the participation agreement</li>
        <li>Complete your payment online</li>
      </ol>
      <p>
        <a href="${portalUrl}" style="display: inline-block; background: #8b1a1a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 16px;">
          Access Your Portal
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${portalUrl}">${portalUrl}</a>
      </p>
      <p>If you have any questions, please reply to this email.</p>
      <p>We look forward to having you at the festival!</p>
    </div>
  `;

  try {
    const transporter = await getTransporter();
    if (!transporter) {
      logger.info({ to, subject, portalUrl }, "Email would be sent (dev mode — no SMTP configured)");
      return;
    }
    await transporter.sendMail({
      from: `Romanian Festival <${process.env.SMTP_FROM ?? "festival@example.com"}>`,
      to,
      subject,
      html,
    });
    logger.info({ to, subject }, "Portal invite email sent");
  } catch (err) {
    logger.error({ err, to }, "Failed to send portal invite email");
  }
}
