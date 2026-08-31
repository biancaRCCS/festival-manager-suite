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
  const configured = process.env.APP_BASE_URL?.trim() || process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (!configured) return "";
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, "");
  return `https://${configured.replace(/\/+$/, "")}`;
}

function getEmailImageUrls(): { rccsLogo: string; festivalLogo: string } {
  const baseUrl = getAppBaseUrl();
  if (!baseUrl) {
    logger.warn("APP_BASE_URL and REPLIT_DOMAINS are not configured; email images may not load");
  }
  return {
    rccsLogo: `${baseUrl}/rccs-logo-white@96.png`,
    festivalLogo: `${baseUrl}/festival-logo-light-900.png`,
  };
}

/**
 * Shared RCCS email shell. Individual messages provide only their existing
 * body markup; this function owns the header, body container, and footer.
 */
function wrapEmail(bodyHtml: string): string {
  const { rccsLogo, festivalLogo } = getEmailImageUrls();
  return `
    <div style="margin: 0; padding: 0; width: 100%; background: #ffffff; color: #1a2744;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; background: #ffffff;">
        <tr>
          <td align="center" style="padding: 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; max-width: 680px; border-collapse: collapse; background: #ffffff;">
              <tr>
                <td style="background: #1a2744; padding: 14px 24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td valign="middle" width="76" style="width: 76px; padding: 0 16px 0 0;">
                        <img src="${rccsLogo}" width="64" height="56" alt="Romanian Community Center of Sacramento logo" style="display: block; width: 64px; height: 56px; object-fit: contain; border: 0;">
                      </td>
                      <td valign="middle" style="padding: 0;">
                        <div style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 22px; font-weight: 700; letter-spacing: 0.04em; color: #ffffff;">
                          ROMANIAN COMMUNITY CENTER OF SACRAMENTO
                        </div>
                        <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 14px; line-height: 20px; color: #C89A2A;">
                          Preserving culture. Building community.
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="background: #ffffff; padding: 32px 24px;">
                  ${bodyHtml}
                </td>
              </tr>
              <tr>
                <td align="center" style="background: #ffffff; padding: 12px 24px 36px; text-align: center;">
                  <img src="${festivalLogo}" width="480" alt="Romanian Festival 2026" style="display: block; width: 100%; max-width: 480px; height: auto; margin: 0 auto 24px; border: 0;">
                  <p style="font-family: Georgia, 'Times New Roman', serif; font-size: 14px; line-height: 23px; color: #1a2744; margin: 0 0 18px;">
                    Thank you for your continued support.<br>
                    We look forward to celebrating with you soon.<br>
                    Vă așteptăm cu drag la următorul eveniment!
                  </p>
                  <p style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 21px; color: #1a2744; margin: 0;">
                    <strong>Romanian Community Center of Sacramento</strong><br>
                    <a href="https://romaniancenter.org" style="color: #1a2744; text-decoration: underline;">RomanianCenter.org</a>
                    <span style="color: #9ca3af;"> | </span>
                    <a href="https://romanianfestival.org" style="color: #1a2744; text-decoration: underline;">RomanianFestival.org</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>`;
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
      html: wrapEmail(html),
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

function field(label: string, value: string | null | undefined) {
  if (!value) return "";
  return `<p style="${LABEL_STYLE}">${label}</p><p style="${VALUE_STYLE}">${value}</p>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
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

/** Confirmation used only when a staff member explicitly opts in while
 * recording an offline payment. */
export async function sendManualPaymentConfirmationEmail(params: {
  to: string; name: string; entityType: "vendor" | "sponsor" | "contribution";
  amount: number; method: string; reference?: string | null; receivedDate: string;
}) {
  const labels: Record<string, string> = { cash: "Cash", check: "Check", bank_transfer: "Bank transfer", other: "Other" };
  const kind = params.entityType === "contribution" ? "contribution" : `${params.entityType} payment`;
  const amount = params.amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const html = `<div style="${BASE_STYLE}"><h2 style="color:#8b1a1a;">Payment Received</h2>
    <p>Dear ${escapeHtml(params.name)},</p><p>We have recorded your ${kind}. Thank you for your support.</p>${DIVIDER}
    ${field("Amount", amount)}${field("Payment method", labels[params.method] ?? params.method)}
    ${field("Received date", params.receivedDate)}${params.reference ? field("Reference", escapeHtml(params.reference)) : ""}</div>`;
  await send(params.to, `Payment Received — Romanian Festival`, html);
}

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
    </div>`;
  const replyTo = validReplyTo();
  const { error } = await resend.emails.send({
    from: FROM(),
    to,
    ...(replyTo ? { replyTo } : {}),
    subject,
    html: wrapEmail(html),
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
  reviewNote?: string | null;
}) {
  const { to, name, portalUrl, festivalName, reviewNote } = params;
  const noteSection = reviewNote?.trim()
    ? `${DIVIDER}
      <h3 style="color: #1a2744; margin: 0 0 8px;">A note from RCCS</h3>
      <p>${escapeHtml(reviewNote.trim())}</p>`
    : "";
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
       ${noteSection}
      <p>If you have any questions, please reply to this email.</p>
      <p>We look forward to having you at the festival!</p>
    </div>`;
  await send(to, subject, html);
}

// ---------------------------------------------------------------------------
// 1aa. Special Agreement Vendor invitations and notifications
// ---------------------------------------------------------------------------
export async function sendSpecialAgreementPortalInviteEmail(params: {
  to: string;
  name: string;
  businessName: string;
  operationType: string;
  revenueSharePercentage: number;
  festivalName: string;
  portalUrl: string;
}) {
  const { to, name, businessName, operationType, revenueSharePercentage, festivalName, portalUrl } = params;
  const subject = `Your Special Agreement for ${festivalName}`;
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Your Special Agreement is ready</h2>
      <p>Dear ${escapeHtml(name)},</p>
      <p>RCCS has prepared a Special Agreement for <strong>${escapeHtml(businessName)}</strong> to participate in <strong>${escapeHtml(festivalName)}</strong>.</p>
      ${DIVIDER}
      ${field("Operation type", escapeHtml(operationType))}
      ${field("RCCS revenue share", `${revenueSharePercentage}% of net profit`)}
      ${DIVIDER}
      <p>Please use your private link to review the agreement, provide day-of contacts, acknowledge the event requirements, and sign it electronically.</p>
      <p><a href="${portalUrl}" style="display: inline-block; background: #8b1a1a; color: white; padding: 12px 24px; text-decoration: none; font-size: 16px;">Review &amp; Sign Agreement</a></p>
      <p style="color: #6b7280; font-size: 14px;">If the button does not work, copy and paste this link into your browser:<br><a href="${portalUrl}">${portalUrl}</a></p>
      <p>There is no booth fee or online payment required for this agreement.</p>
    </div>`;
  await send(to, subject, html);
}

export async function sendSpecialAgreementCreatedNotification(params: {
  notificationEmail: string;
  applicantName: string;
  businessName: string;
  operationType: string;
  revenueSharePercentage: number;
  adminPath: string;
}) {
  const { notificationEmail, applicantName, businessName, operationType, revenueSharePercentage, adminPath } = params;
  const baseUrl = getAppBaseUrl();
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Special Agreement Vendor created</h2>
      ${field("Contact", escapeHtml(applicantName))}
      ${field("Business / organization", escapeHtml(businessName))}
      ${field("Operation type", escapeHtml(operationType))}
      ${field("RCCS revenue share", `${revenueSharePercentage}% of net profit`)}
      <p><a href="${baseUrl}${adminPath}">Open this vendor record</a></p>
    </div>`;
  await send(notificationEmail, `Special Agreement Vendor created — ${businessName}`, html);
}

export async function sendSpecialAgreementSignedNotification(params: {
  notificationEmail: string;
  applicantName: string;
  businessName: string;
  signedName: string;
  adminPath: string;
}) {
  const { notificationEmail, applicantName, businessName, signedName, adminPath } = params;
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Special Agreement signed</h2>
      ${field("Contact", escapeHtml(applicantName))}
      ${field("Business / organization", escapeHtml(businessName))}
      ${field("Electronic signature", escapeHtml(signedName))}
      <p><a href="${getAppBaseUrl()}${adminPath}">Review the signed agreement</a></p>
    </div>`;
  await send(notificationEmail, `Special Agreement signed — ${businessName}`, html);
}

// ---------------------------------------------------------------------------
// 1b. Vendor category correction — applies only before payment
// ---------------------------------------------------------------------------
export async function sendVendorCategoryAdjustedEmail(params: {
  to: string;
  name: string;
  vendorType: string;
  amountDue: number;
  boothDimensions: string;
  reason: string;
  festivalName: string;
}) {
  const { to, name, vendorType, amountDue, boothDimensions, reason, festivalName } = params;
  const categoryLabel = VENDOR_LABELS[vendorType] ?? vendorType;
  const amountDisplay = amountDue.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const subject = `Vendor Category Updated — ${festivalName}`;
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Vendor Category Updated</h2>
      <p>Dear ${escapeHtml(name)},</p>
      <p>RCCS has updated your vendor category for <strong>${escapeHtml(festivalName)}</strong>.</p>
      ${DIVIDER}
      ${field("New category", escapeHtml(categoryLabel))}
      ${field("Booth dimensions", escapeHtml(boothDimensions))}
      ${field("New amount due", amountDisplay)}
      ${DIVIDER}
      <h3 style="color: #1a2744; margin: 0 0 8px;">Reason for this change</h3>
      <p>${escapeHtml(reason)}</p>
      <p>Please visit your private portal to review and complete the updated payment amount. If you have any questions, please reply to this email.</p>
    </div>`;
  await send(to, subject, html);
}

// ---------------------------------------------------------------------------
// 1c. Sponsor stage-1 approval — invite to complete sponsorship details.
//     Payment and acknowledgements already happened at application time
//     (pay-first flow), so this only asks for the remaining operational
//     details/logo and confirms payment has already been received.
// ---------------------------------------------------------------------------
export async function sendSponsorDetailsInviteEmail(params: {
  to: string;
  name: string;
  orgName: string;
  tier: string;
  portalUrl: string;
  festivalName: string;
  isInKind?: boolean;
  inKindDescription?: string | null;
}) {
  const { to, name, orgName, tier, portalUrl, festivalName, isInKind, inKindDescription } = params;
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const subject = `Your Sponsorship Application for ${festivalName} — Complete Your Details`;
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Congratulations, ${name}!</h2>
      <p>We are delighted to confirm that <strong>${orgName}</strong>'s application to sponsor <strong>${festivalName}</strong> has been <strong>approved</strong>.</p>
      ${field("Sponsorship Tier", tierLabel)}
      <p>${isInKind ? `We've recorded your in-kind contribution${inKindDescription ? ` (${escapeHtml(inKindDescription)})` : ""} — thank you!` : "We've received your sponsorship payment — thank you!"} The next step is to complete your remaining sponsorship details, including your organization's booth and operational information and your logo, so we can finalise your participation.</p>
      <p>
        <a href="${portalUrl}" style="display: inline-block; background: #8b1a1a; color: white; padding: 12px 24px; text-decoration: none; font-size: 16px;">
          Complete Your Sponsorship Details
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${portalUrl}">${portalUrl}</a>
      </p>
      <p>Once our team reviews your details, we will send you a final confirmation email.</p>
      <p>If you have any questions, please reply to this email.</p>
      <p>We look forward to welcoming you to the festival!</p>
    </div>`;
  await send(to, subject, html);
}

// ---------------------------------------------------------------------------
// 1c. Sponsor details approved — final confirmation. Payment already
//     happened at application time, so this must NOT mention payment.
// ---------------------------------------------------------------------------
export async function sendSponsorFinalConfirmationEmail(params: {
  to: string;
  name: string;
  orgName: string;
  tier: string;
  portalUrl: string;
  festivalName: string;
}) {
  const { to, name, orgName, tier, portalUrl, festivalName } = params;
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const subject = `You're Confirmed! ${festivalName} Sponsorship — ${orgName}`;
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Your Sponsorship Is Confirmed</h2>
      <p>Dear ${name},</p>
      <p>Great news — we have reviewed and approved the sponsorship details for <strong>${orgName}</strong>. Your participation in <strong>${festivalName}</strong> is now fully confirmed.</p>
      ${DIVIDER}
      ${field("Organisation", orgName)}
      ${field("Sponsorship Tier", tierLabel)}
      ${DIVIDER}
      <p>You can view your sponsorship details at any time using your private portal link:</p>
      <p style="color: #6b7280; font-size: 14px;">
        <a href="${portalUrl}">${portalUrl}</a>
      </p>
      <p>Our team will follow up separately with any remaining logistics (spot assignment, signage, etc.) as the event approaches.</p>
      <p>If you have any questions, please reply to this email.</p>
      <p>Thank you for supporting the Romanian community!</p>
    </div>`;
  await send(to, subject, html);
}

// ---------------------------------------------------------------------------
// 1d. Sponsor payment receipt — sent immediately after Stripe confirms
//     payment on the public pay-first application checkout.
// ---------------------------------------------------------------------------
export async function sendSponsorPaymentReceiptEmail(params: {
  to: string;
  name: string;
  orgName: string;
  tier: string;
  amount: number;
  festivalName: string;
}) {
  const { to, name, orgName, tier, amount, festivalName } = params;
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const amountDisplay = `$${amount.toLocaleString()}`;
  const subject = `Payment Received — Your Sponsorship for ${festivalName}`;
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Thank You — Payment Received</h2>
      <p>Dear ${name},</p>
      <p>We've received your sponsorship payment for <strong>${orgName}</strong>. Your application is now under review by our team.</p>
      ${DIVIDER}
      ${field("Organisation", orgName)}
      ${field("Sponsorship Tier", tierLabel)}
      ${field("Amount Paid", amountDisplay)}
      ${DIVIDER}
      <p>We'll follow up by email once your application has been reviewed — typically within one to two business days. If approved, we'll ask you to complete a short sponsorship details form (booth setup, contacts, logo, etc.).</p>
      <p>If you have any questions in the meantime, please reply to this email.</p>
      <p>Thank you for supporting the Romanian community!</p>
    </div>`;
  await send(to, subject, html);
}

// ---------------------------------------------------------------------------
// 1e. Resend the Stripe payment link to a sponsor stuck at pending_payment
// ---------------------------------------------------------------------------
export async function sendSponsorPaymentLinkEmail(params: {
  to: string;
  name: string;
  orgName: string;
  checkoutUrl: string;
  festivalName: string;
}) {
  const { to, name, orgName, checkoutUrl, festivalName } = params;
  const subject = `Complete Your Sponsorship Payment — ${festivalName}`;
  const html = `
    <div style="${BASE_STYLE}">
      <h2 style="color: #8b1a1a;">Complete Your Sponsorship Payment</h2>
      <p>Dear ${name},</p>
      <p>Your sponsorship application for <strong>${orgName}</strong> is almost complete — we just need your payment to move it forward.</p>
      <p>
        <a href="${checkoutUrl}" style="display: inline-block; background: #8b1a1a; color: white; padding: 12px 24px; text-decoration: none; font-size: 16px;">
          Complete Payment
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${checkoutUrl}">${checkoutUrl}</a>
      </p>
      <p>If you have any questions, please reply to this email.</p>
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
      ? `Your sponsorship application is under review by our team, and we will follow up by email as soon as a decision is made. If you have any questions in the meantime, please email us at vendors@romaniancenter.org.`
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
