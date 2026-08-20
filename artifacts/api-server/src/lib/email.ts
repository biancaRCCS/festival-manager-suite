import { Resend } from "resend";
import { logger } from "./logger";
import { db, activityLogTable } from "@workspace/db";

// ---------------------------------------------------------------------------
// Resend client
// ---------------------------------------------------------------------------
// Reads RESEND_API_KEY from the environment. Returns null when the key is
// absent so callers can skip sending gracefully (fire-and-forget, never throws).
function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const FROM = () => process.env.EMAIL_FROM ?? "Romanian Festival <festival@example.com>";

/** Returns a validated reply-to address, or undefined if the value is absent or malformed.
 *  A bad reply-to causes Resend to reject the entire send; omitting it is always safer. */
function validReplyTo(): string | undefined {
  const val = (process.env.EMAIL_REPLY_TO ?? "").trim();
  if (!val) return undefined;
  // Accepts "email@example.com" or "Name <email@example.com>"
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ||
             /^.+<[^\s@]+@[^\s@]+\.[^\s@]+>$/.test(val);
  if (!ok) {
    logger.warn({ value: val }, "EMAIL_REPLY_TO is set but not a valid email address — omitting reply-to");
    return undefined;
  }
  return val;
}

function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "";
}

// ---------------------------------------------------------------------------
// Shared send helper — fire-and-forget, never throws.
// On failure the error is written to activity_log so admins can see it.
// ---------------------------------------------------------------------------
async function send(to: string, subject: string, html: string): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) {
      logger.info({ to, subject }, "Email would be sent (no RESEND_API_KEY configured)");
      return;
    }
    const replyTo = validReplyTo();
    const { error } = await resend.emails.send({
      from: FROM(),
      to,
      ...(replyTo ? { replyTo } : {}),
      subject,
      html,
    });
    if (error) throw new Error(error.message);
    logger.info({ to, subject }, "Email sent");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, to, subject }, "Failed to send email");
    // Log to activity_log so the failure is visible in the admin UI.
    try {
      await db.insert(activityLogTable).values({
        type: "email_failure",
        message: `Failed to send "${subject}" to ${to}: ${errMsg}`,
        entityType: "email",
        entityId: 0,
      });
    } catch (logErr) {
      logger.error({ logErr }, "Failed to record email failure in activity log");
    }
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

export { VENDOR_LABELS, TIER_LABELS };

// ---------------------------------------------------------------------------
// 0a. Email status — never exposes the full API key
// ---------------------------------------------------------------------------
export function getEmailStatus(): {
  configured: boolean;
  from: string | null;
  apiKeyHint: string | null;
} {
  const key = process.env.RESEND_API_KEY ?? null;
  const from = process.env.EMAIL_FROM ?? null;
  if (!key) {
    return { configured: false, from: null, apiKeyHint: null };
  }
  // Show only the first 8 chars of the key so admins can confirm which key is loaded
  const apiKeyHint = key.length > 8 ? `${key.slice(0, 8)}…` : key;
  return { configured: true, from: from ?? "Romanian Festival <festival@example.com>", apiKeyHint };
}

// ---------------------------------------------------------------------------
// 0. Test email — throws on failure so callers can surface the error
// ---------------------------------------------------------------------------
export async function sendTestEmail(to: string): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    throw new Error("No Resend API key configured — set the RESEND_API_KEY environment variable");
  }
  const subject = "Romanian Festival — Test Email";
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Email is working ✓</h2>
      <p>This is a test message sent from the Romanian Festival admin panel to confirm that Resend email delivery is configured correctly.</p>
      <p>If you received this, email notifications are working and will be delivered when applications are submitted.</p>
      ${FOOTER}
    </div>`;
  const replyTo = validReplyTo();
  const { error } = await resend.emails.send({
    from: FROM(),
    to,
    ...(replyTo ? { replyTo } : {}),
    subject,
    html,
  });
  if (error) throw new Error(error.message);
  logger.info({ to, subject }, "Test email sent");
}

// ---------------------------------------------------------------------------
// 1a. Vendor portal invite — sign agreement & pay
// ---------------------------------------------------------------------------
export async function sendVendorPortalInviteEmail(params: {
  to: string;
  name: string;
  portalUrl: string;
  festivalName: string;
}) {
  const { to, name, portalUrl, festivalName } = params;
  const subject = `Your Vendor Application for ${festivalName} — Next Steps`;
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Congratulations, ${name}!</h2>
      <p>We are pleased to inform you that your vendor application for <strong>${festivalName}</strong> has been <strong>approved</strong>.</p>
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
// 1b. Sponsor stage-1 approval — invite to complete sponsorship details
//     Payment is NOT mentioned here; it comes only after details are approved.
// ---------------------------------------------------------------------------
export async function sendSponsorDetailsInviteEmail(params: {
  to: string;
  name: string;
  orgName: string;
  tier: string;
  portalUrl: string;
  festivalName: string;
}) {
  const { to, name, orgName, tier, portalUrl, festivalName } = params;
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const subject = `Your Sponsorship Application for ${festivalName} — Complete Your Details`;
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Congratulations, ${name}!</h2>
      <p>We are delighted to confirm that <strong>${orgName}</strong>'s application to sponsor <strong>${festivalName}</strong> has been <strong>approved</strong>.</p>
      ${field("Sponsorship Tier", tierLabel)}
      <p>The next step is to complete your sponsorship details — including your organization's booth and operational information, acknowledgements, and logo — so we can finalise your participation.</p>
      <p>
        <a href="${portalUrl}" style="display: inline-block; background: #8b1a1a; color: white; padding: 12px 24px; text-decoration: none; font-size: 16px;">
          Complete Your Sponsorship Details
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${portalUrl}">${portalUrl}</a>
      </p>
      <p>Once our team reviews your details, we will send you a separate email with instructions to complete your payment.</p>
      <p>If you have any questions, please reply to this email.</p>
      <p>We look forward to welcoming you to the festival!</p>
      ${FOOTER}
    </div>`;
  await send(to, subject, html);
}

// ---------------------------------------------------------------------------
// 1c. Sponsor details approved — payment is now due
// ---------------------------------------------------------------------------
export async function sendSponsorPaymentReadyEmail(params: {
  to: string;
  name: string;
  orgName: string;
  tier: string;
  sponsorshipAmount: number;
  paymentDeadline: string | null;
  portalUrl: string;
  festivalName: string;
}) {
  const { to, name, orgName, tier, sponsorshipAmount, paymentDeadline, portalUrl, festivalName } = params;
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const amountDisplay = `$${sponsorshipAmount.toLocaleString()}`;
  const deadlineNote = paymentDeadline
    ? `<p><strong>Payment deadline:</strong> ${new Date(paymentDeadline + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Payment received after this date may not be included in printed promotional materials.</p>`
    : "";
  const subject = `Your Sponsorship for ${festivalName} — Payment Due`;
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Details Approved — Payment Now Due</h2>
      <p>Dear ${name},</p>
      <p>We have reviewed and approved the sponsorship details for <strong>${orgName}</strong>. You are now ready to complete your payment and secure your place at <strong>${festivalName}</strong>.</p>
      ${DIVIDER}
      ${field("Organisation", orgName)}
      ${field("Sponsorship Tier", tierLabel)}
      ${field("Amount Due", amountDisplay)}
      ${DIVIDER}
      ${deadlineNote}
      <p>Please visit your portal to sign the participation agreement and complete payment:</p>
      <p>
        <a href="${portalUrl}" style="display: inline-block; background: #8b1a1a; color: white; padding: 12px 24px; text-decoration: none; font-size: 16px;">
          Go to Your Portal
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${portalUrl}">${portalUrl}</a>
      </p>
      <p>If you have any questions, please reply to this email.</p>
      <p>Thank you for supporting the Romanian community!</p>
      ${FOOTER}
    </div>`;
  await send(to, subject, html);
}

// ---------------------------------------------------------------------------
// Legacy export — kept so existing call sites don't break during migration.
// Vendor callers should migrate to sendVendorPortalInviteEmail.
// ---------------------------------------------------------------------------
export async function sendPortalInviteEmail(params: {
  to: string;
  name: string;
  type: "vendor" | "sponsor";
  portalUrl: string;
  festivalName: string;
}) {
  // This path should only be reached for vendors now; sponsor approvals use
  // sendSponsorDetailsInviteEmail. Keep vendor behaviour identical to before.
  await sendVendorPortalInviteEmail(params);
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
// 2b. Sponsor stage-2 submission notification — sent to RCCS staff
// ---------------------------------------------------------------------------
export async function sendSponsorDetailsSubmittedNotification(params: {
  notificationEmail: string;
  applicantName: string;
  orgName: string;
  tier: string;
  sponsorshipAmount: number | null;
  adminPath: string;
}): Promise<void> {
  const { notificationEmail, applicantName, orgName, tier, sponsorshipAmount, adminPath } = params;
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const amountDisplay = sponsorshipAmount != null ? `$${sponsorshipAmount.toLocaleString()}` : null;
  const adminUrl = `${getAppBaseUrl()}${adminPath}`;
  const adminLinkHtml = `<a href="${adminUrl}" style="display: inline-block; background: #1a2744; color: white; padding: 10px 20px; text-decoration: none; font-size: 14px; margin-top: 4px;">
       Review Details in Admin
     </a>
     <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">${adminUrl}</p>`;

  const subject = `Sponsor Details Submitted — ${orgName} (${applicantName})`;
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #1a2744; margin-bottom: 4px;">Sponsor Stage 2 Details Submitted</h2>
      <p style="color: #6b7280; font-size: 14px; margin-top: 0;">${orgName} has submitted their sponsorship details and is awaiting your review.</p>
      ${DIVIDER}
      ${field("Contact Name", applicantName)}
      ${field("Organisation", orgName)}
      ${field("Tier", tierLabel)}
      ${amountDisplay ? field("Sponsorship Amount", amountDisplay) : ""}
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
      ? `Someone from the Romanian Community Center of Sacramento will be in touch within one to two business days. If you have any questions in the meantime, please email us at vendors@romaniancenter.org.`
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

// ---------------------------------------------------------------------------
// 4. Contribution tax receipt — sent after Stripe confirms payment
// ---------------------------------------------------------------------------
export async function sendContributionReceipt(params: {
  to: string;
  name?: string | null;
  amount: number;
  paidAt: Date;
  notificationEmail?: string | null;
}): Promise<void> {
  const { to, name, amount, paidAt, notificationEmail } = params;
  const recipientName = name?.trim();
  const greeting = recipientName ? `Dear ${recipientName},` : "Dear Friend,";
  const amountDisplay = amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const dateDisplay = paidAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const subject = "Thank you for supporting the Romanian Community Center of Sacramento";
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Thank you for your contribution</h2>
      <p>${greeting}</p>
      <p>On behalf of the Romanian Community Center of Sacramento, thank you for your generous contribution of <strong>${amountDisplay}</strong>, received on <strong>${dateDisplay}</strong>.</p>
      <p>Since its establishment in 2001, our organization has proudly served and celebrated the Romanian community, fostering cultural enrichment and unity. Your contribution directly helps us continue this work and create meaningful connections through events like the Romanian Festival.</p>
      ${DIVIDER}
      <p>The Romanian Community Center of Sacramento is a non-profit Corporation registered with the State of California under #C2344434, with the assigned Employer Identification Number (EIN) #94-3400833. As a 501(c)(3) organization, your contribution is tax deductible. No goods or services of monetary value were provided in exchange for this contribution. Please retain this email as acknowledgement for your tax records.</p>
      <p>With sincere appreciation,<br>
      The Romanian Community Center of Sacramento Board of Directors</p>
      <p><a href="https://romaniancenter.org" style="color: #8b1a1a;">romaniancenter.org</a> · <a href="mailto:info@romaniancenter.org" style="color: #8b1a1a;">info@romaniancenter.org</a></p>
    </div>`;

  const recipients = [to];
  if (notificationEmail && notificationEmail.trim().toLowerCase() !== to.trim().toLowerCase()) {
    recipients.push(notificationEmail);
  }
  await Promise.all(recipients.map((recipient) => send(recipient, subject, html)));
}
