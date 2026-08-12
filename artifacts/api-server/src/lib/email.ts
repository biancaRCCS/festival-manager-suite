import nodemailer from "nodemailer";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Transporter
// ---------------------------------------------------------------------------
// Uses explicit SMTP_HOST when set; falls back to Gmail when SMTP_USER/PASS
// are present (the project uses Gmail — smtp.gmail.com:587 with App Password).
// Returns null in development when no credentials are available, and logs
// what would have been sent so nothing is silently lost.
function getTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT ?? "587");
  const secure = process.env.SMTP_SECURE === "true"; // false for port 587 (STARTTLS)

  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

const FROM = () =>
  `Romanian Festival <${process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "festival@example.com"}>`;

function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "";
}

// Shared send helper — fire-and-forget, never throws.
async function send(to: string, subject: string, html: string): Promise<void> {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      logger.info({ to, subject }, "Email would be sent (no SMTP credentials configured)");
      return;
    }
    await transporter.sendMail({ from: FROM(), to, subject, html });
    logger.info({ to, subject }, "Email sent");
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email");
  }
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
const BASE_STYLE = `font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; color: #1a2744;`;
const LABEL_STYLE = `font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 0 0 2px 0;`;
const VALUE_STYLE = `font-size: 15px; margin: 0 0 14px 0; color: #1a2744;`;
const DIVIDER = `<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />`;
const FOOTER = `
  <p style="font-size: 13px; color: #9ca3af; margin-top: 32px;">
    Romanian Community Center of Sacramento · 2026 Romanian Festival<br>
    Vernon Street Town Square, Downtown Roseville, CA · Saturday, 26 September 2026
  </p>`;

function field(label: string, value: string | null | undefined) {
  if (!value) return "";
  return `<p style="${LABEL_STYLE}">${label}</p><p style="${VALUE_STYLE}">${value}</p>`;
}

// ---------------------------------------------------------------------------
// Vendor category / sponsor tier display labels
// ---------------------------------------------------------------------------
const VENDOR_LABELS: Record<string, string> = {
  major_food:    "Major Food Vendor",
  specialty_food: "Specialty Food & Beverage Vendor",
  retail:        "Retail, Artisan & Business Vendor",
  nonprofit:     "Verified Nonprofit Organization",
};

const TIER_LABELS: Record<string, string> = {
  bronze:   "Bronze ($750 – $1,499)",
  silver:   "Silver ($1,500 – $2,999)",
  gold:     "Gold ($3,000 – $4,999)",
  platinum: "Platinum ($5,000 – $9,999)",
  diamond:  "Diamond ($10,000 and above)",
};

// ---------------------------------------------------------------------------
// 1. Portal invite (existing)
// ---------------------------------------------------------------------------
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
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Congratulations, ${name}!</h2>
      <p>We are pleased to inform you that your ${type} application for <strong>${festivalName}</strong> has been <strong>approved</strong>.</p>
      <p>To complete your registration, please visit your private portal to:</p>
      <ol>
        <li>Review and sign the participation agreement</li>
        <li>Complete your payment online</li>
      </ol>
      <p>
        <a href="${portalUrl}" style="display: inline-block; background: #8b1a1a; color: white; padding: 12px 24px; text-decoration: none; font-size: 16px;">
          Access Your Portal
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${portalUrl}">${portalUrl}</a>
      </p>
      <p>If you have any questions, please reply to this email.</p>
      <p>We look forward to having you at the festival!</p>
      ${FOOTER}
    </div>`;
  await send(to, subject, html);
}

// ---------------------------------------------------------------------------
// 2. Staff notification — sent to the settings notification address
// ---------------------------------------------------------------------------
export async function sendNewApplicationNotification(params: {
  notificationEmail: string;
  applicationType: "vendor" | "sponsor" | "volunteer";
  applicantName: string;
  organizationOrBusiness: string | null;
  categoryOrTier: string | null;
  contactEmail: string;
  contactPhone: string | null;
  adminPath: string;          // e.g. "/vendors/42"
  extra?: string | null;      // optional extra detail line (sponsorship amount, etc.)
}): Promise<void> {
  const {
    notificationEmail, applicationType, applicantName, organizationOrBusiness,
    categoryOrTier, contactEmail, contactPhone, adminPath, extra,
  } = params;

  const typeLabel =
    applicationType === "vendor" ? "Vendor" :
    applicationType === "sponsor" ? "Sponsor" : "Volunteer";

  const orgLine = organizationOrBusiness
    ? ` — ${organizationOrBusiness}`
    : "";

  const subject = `New ${typeLabel} Application — ${applicantName}${orgLine}`;

  const adminUrl = `${getAppBaseUrl()}${adminPath}`;
  const adminLinkHtml = adminUrl
    ? `<a href="${adminUrl}" style="display: inline-block; background: #1a2744; color: white; padding: 10px 20px; text-decoration: none; font-size: 14px; margin-top: 4px;">
         Review in Admin
       </a>
       <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">${adminUrl}</p>`
    : `<p style="font-size: 13px; color: #6b7280;">Log in to the admin to review this application.</p>`;

  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #1a2744; margin-bottom: 4px;">New ${typeLabel} Application</h2>
      <p style="color: #6b7280; font-size: 14px; margin-top: 0;">Submitted just now — review and respond within 2 business days.</p>
      ${DIVIDER}
      ${field("Contact Name", applicantName)}
      ${organizationOrBusiness ? field("Organization / Business", organizationOrBusiness) : ""}
      ${categoryOrTier ? field(applicationType === "sponsor" ? "Tier" : "Category", categoryOrTier) : ""}
      ${extra ? field("Sponsorship Amount", extra) : ""}
      ${field("Email", contactEmail)}
      ${contactPhone ? field("Phone", contactPhone) : ""}
      ${DIVIDER}
      ${adminLinkHtml}
      ${FOOTER}
    </div>`;

  await send(notificationEmail, subject, html);
}

// ---------------------------------------------------------------------------
// 3. Applicant confirmation — sent to the person who applied
// ---------------------------------------------------------------------------
export async function sendApplicantConfirmation(params: {
  to: string;
  applicantName: string;
  applicationType: "vendor" | "sponsor" | "volunteer";
  organizationOrBusiness: string | null;
  categoryOrTier: string | null;
}): Promise<void> {
  const { to, applicantName, applicationType, organizationOrBusiness, categoryOrTier } = params;

  const typeLabel =
    applicationType === "vendor" ? "Vendor" :
    applicationType === "sponsor" ? "Sponsor" : "Volunteer";

  const subject = `Your ${typeLabel} Application for the 2026 Romanian Festival — Received`;

  const nextSteps =
    applicationType === "vendor"
      ? `We will review your application and be in touch at this email address once a decision has been made. If your application is approved, you will receive a link to your private portal to sign the agreement and complete payment.`
      : applicationType === "sponsor"
      ? `Someone from the Romanian Community Center of Sacramento will be in touch within one to two business days.`
      : `We will be in touch as we finalize our volunteer schedule for the festival.`;

  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #1a2744;">Application Received</h2>
      <p>Dear ${applicantName},</p>
      <p>Thank you for submitting your ${typeLabel.toLowerCase()} application for the <strong>2026 Romanian Festival</strong>. We have received it and will be in touch soon.</p>
      ${DIVIDER}
      ${field("Name", applicantName)}
      ${organizationOrBusiness ? field("Organization / Business", organizationOrBusiness) : ""}
      ${categoryOrTier ? field(applicationType === "sponsor" ? "Tier" : "Category", categoryOrTier) : ""}
      ${field("Application Type", typeLabel)}
      ${DIVIDER}
      <p>${nextSteps}</p>
      <p>If you have any questions in the meantime, please email us at
        <a href="mailto:vendors@romaniancenter.org" style="color: #8b1a1a;">vendors@romaniancenter.org</a>.
      </p>
      <p>We look forward to welcoming you to the festival!</p>
      ${FOOTER}
    </div>`;

  await send(to, subject, html);
}
