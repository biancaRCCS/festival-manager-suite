import { Router, type IRouter } from "express";
import { db, festivalYearsTable, festivalSettingsTable, vendorsTable, sponsorsTable, volunteersTable, activityLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  SubmitVendorApplicationBody,
  SubmitSponsorApplicationBody,
  SubmitVolunteerApplicationBody,
} from "@workspace/api-zod";
import {
  sendNewApplicationNotification,
  sendApplicantConfirmation,
} from "../lib/email";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
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

async function getNotificationEmail(yearId: number): Promise<string> {
  const rows = await db
    .select({ notificationEmail: festivalSettingsTable.notificationEmail })
    .from(festivalSettingsTable)
    .where(eq(festivalSettingsTable.yearId, yearId))
    .limit(1);
  return rows[0]?.notificationEmail ?? "vendors@romaniancenter.org";
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
router.get("/public/current-year", async (req, res): Promise<void> => {
  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
  if (years.length === 0) {
    res.status(404).json({ error: "No active festival year" });
    return;
  }
  res.json(years[0]);
});

// ── Vendor ────────────────────────────────────────────────────────────────
router.post("/public/apply/vendor", async (req, res): Promise<void> => {
  const parsed = SubmitVendorApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
  if (years.length === 0) {
    res.status(400).json({ error: "No active festival year" });
    return;
  }

  const { name, businessName, email, phone, vendorType, answers } = parsed.data;
  const answerData = (answers ?? {}) as Record<string, unknown>;
  const signatureName = typeof answerData.signatureName === "string" ? answerData.signatureName : null;

  const [vendor] = await db.insert(vendorsTable).values({
    yearId: years[0].id,
    name,
    businessName,
    email,
    phone: phone ?? "",
    vendorType: vendorType ?? "retail",
    status: "pending",
    applicationData: answerData,
    agreementSigned: !!signatureName,
    agreementSignedName: signatureName ?? undefined,
  }).returning();

  await db.insert(activityLogTable).values({
    type: "new_application",
    message: `New vendor application from ${name} (${businessName})`,
    entityType: "vendor",
    entityId: vendor.id,
  });

  // Respond immediately; emails fire-and-forget
  res.status(201).json({ message: "Application submitted successfully", id: vendor.id });

  const categoryLabel = VENDOR_LABELS[vendorType ?? "retail"] ?? vendorType ?? null;
  const notificationEmail = await getNotificationEmail(years[0].id);

  void Promise.all([
    sendNewApplicationNotification({
      notificationEmail,
      applicationType: "vendor",
      applicantName: name,
      organizationOrBusiness: businessName,
      categoryOrTier: categoryLabel,
      contactEmail: email,
      contactPhone: phone ?? null,
      adminPath: `/vendors/${vendor.id}`,
    }),
    sendApplicantConfirmation({
      to: email,
      applicantName: name,
      applicationType: "vendor",
      organizationOrBusiness: businessName,
      categoryOrTier: categoryLabel,
    }),
  ]);
});

// ── Sponsor ───────────────────────────────────────────────────────────────
router.post("/public/apply/sponsor", async (req, res): Promise<void> => {
  const parsed = SubmitSponsorApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
  if (years.length === 0) {
    res.status(400).json({ error: "No active festival year" });
    return;
  }

  const { name, orgName, email, phone, tier, sponsorshipAmount, answers } = parsed.data;
  const [sponsor] = await db.insert(sponsorsTable).values({
    yearId: years[0].id,
    name,
    orgName,
    email,
    phone: phone ?? "",
    tier: tier ?? "bronze",
    sponsorshipAmount: sponsorshipAmount != null ? String(sponsorshipAmount) : undefined,
    status: "pending",
    applicationData: answers as Record<string, unknown>,
  }).returning();

  await db.insert(activityLogTable).values({
    type: "new_application",
    message: `New sponsor application from ${name} (${orgName})`,
    entityType: "sponsor",
    entityId: sponsor.id,
  });

  res.status(201).json({ message: "Application submitted successfully", id: sponsor.id });

  const tierLabel = TIER_LABELS[tier ?? "bronze"] ?? tier ?? null;
  const amountExtra = sponsorshipAmount != null ? `$${Number(sponsorshipAmount).toLocaleString()}` : null;
  const notificationEmail = await getNotificationEmail(years[0].id);

  void Promise.all([
    sendNewApplicationNotification({
      notificationEmail,
      applicationType: "sponsor",
      applicantName: name,
      organizationOrBusiness: orgName,
      categoryOrTier: tierLabel,
      contactEmail: email,
      contactPhone: phone ?? null,
      adminPath: `/sponsors/${sponsor.id}`,
      extra: amountExtra,
    }),
    sendApplicantConfirmation({
      to: email,
      applicantName: name,
      applicationType: "sponsor",
      organizationOrBusiness: orgName,
      categoryOrTier: tierLabel,
    }),
  ]);
});

// ── Volunteer ─────────────────────────────────────────────────────────────
router.post("/public/apply/volunteer", async (req, res): Promise<void> => {
  const parsed = SubmitVolunteerApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
  if (years.length === 0) {
    res.status(400).json({ error: "No active festival year" });
    return;
  }

  const { name, email, phone, availability, answers } = parsed.data;
  const [volunteer] = await db.insert(volunteersTable).values({
    yearId: years[0].id,
    name,
    email,
    phone: phone ?? "",
    availability: availability ?? null,
    status: "pending",
    applicationData: answers as Record<string, unknown>,
  }).returning();

  await db.insert(activityLogTable).values({
    type: "new_application",
    message: `New volunteer application from ${name}`,
    entityType: "volunteer",
    entityId: volunteer.id,
  });

  res.status(201).json({ message: "Application submitted successfully", id: volunteer.id });

  const notificationEmail = await getNotificationEmail(years[0].id);

  void Promise.all([
    sendNewApplicationNotification({
      notificationEmail,
      applicationType: "volunteer",
      applicantName: name,
      organizationOrBusiness: null,
      categoryOrTier: availability ?? null,
      contactEmail: email,
      contactPhone: phone ?? null,
      adminPath: `/volunteers/${volunteer.id}`,
    }),
    sendApplicantConfirmation({
      to: email,
      applicantName: name,
      applicationType: "volunteer",
      organizationOrBusiness: null,
      categoryOrTier: availability ?? null,
    }),
  ]);
});

// ── Form questions ────────────────────────────────────────────────────────
router.get("/public/form-questions", async (req, res): Promise<void> => {
  const type = req.query.type as string | undefined;

  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
  if (years.length === 0) {
    res.json({ vendorFormQuestions: [], sponsorFormQuestions: [], volunteerFormQuestions: [], styleGuidelinesUrl: null });
    return;
  }

  const settings = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, years[0].id)).limit(1);
  const s = settings[0];
  if (!s) {
    res.json({ vendorFormQuestions: [], sponsorFormQuestions: [], volunteerFormQuestions: [], styleGuidelinesUrl: null });
    return;
  }

  const deadline = s.applicationDeadline ?? null;

  const vendorTypes = [
    { key: "major_food",    label: s.vendorTypeLabelMajorFood,    price: parseFloat(s.vendorPriceMajorFood),    booth: "10′ × 20′" },
    { key: "specialty_food", label: s.vendorTypeLabelSpecialtyFood, price: parseFloat(s.vendorPriceSpecialtyFood), booth: "10′ × 10′" },
    { key: "retail",        label: s.vendorTypeLabelRetail,        price: parseFloat(s.vendorPriceRetail),        booth: "10′ × 10′" },
    { key: "nonprofit",     label: s.vendorTypeLabelNonprofit,     price: parseFloat(s.vendorPriceNonprofit),     booth: "10′ × 10′" },
  ];

  if (type === "vendor") {
    res.json({ questions: s.vendorFormQuestions, applicationDeadline: deadline, vendorTypes, styleGuidelinesUrl: s.styleGuidelinesUrl ?? null });
  } else if (type === "sponsor") {
    const sponsorTiers = [
      { key: "bronze",   label: "Bronze",   min: parseFloat(s.sponsorPriceBronze ?? "750"),    max: s.sponsorPriceMaxBronze   != null ? parseFloat(s.sponsorPriceMaxBronze)   : 1499, spotLimit: s.sponsorSpotLimitBronze   ?? 10 },
      { key: "silver",   label: "Silver",   min: parseFloat(s.sponsorPriceSilver ?? "1500"),   max: s.sponsorPriceMaxSilver   != null ? parseFloat(s.sponsorPriceMaxSilver)   : 2999, spotLimit: s.sponsorSpotLimitSilver   ?? 10 },
      { key: "gold",     label: "Gold",     min: parseFloat(s.sponsorPriceGold ?? "3000"),     max: s.sponsorPriceMaxGold     != null ? parseFloat(s.sponsorPriceMaxGold)     : 4999, spotLimit: s.sponsorSpotLimitGold     ?? 10 },
      { key: "platinum", label: "Platinum", min: parseFloat(s.sponsorPricePlatinum ?? "5000"), max: s.sponsorPriceMaxPlatinum != null ? parseFloat(s.sponsorPriceMaxPlatinum) : 9999, spotLimit: s.sponsorSpotLimitPlatinum ?? 5  },
      { key: "diamond",  label: "Diamond",  min: parseFloat(s.sponsorPriceDiamond ?? "10000"), max: null,                                                                              spotLimit: s.sponsorSpotLimitDiamond  ?? 3  },
    ];
    res.json({ questions: s.sponsorFormQuestions, applicationDeadline: deadline, sponsorTiers, styleGuidelinesUrl: s.styleGuidelinesUrl ?? null });
  } else if (type === "volunteer") {
    res.json({ questions: s.volunteerFormQuestions, applicationDeadline: deadline, styleGuidelinesUrl: s.styleGuidelinesUrl ?? null });
  } else {
    res.json({
      vendorFormQuestions: s.vendorFormQuestions,
      sponsorFormQuestions: s.sponsorFormQuestions,
      volunteerFormQuestions: s.volunteerFormQuestions,
      applicationDeadline: deadline,
      styleGuidelinesUrl: s.styleGuidelinesUrl ?? null,
    });
  }
});

export default router;
