import { Router, type IRouter } from "express";
import { db, festivalYearsTable, festivalSettingsTable, vendorsTable, sponsorsTable, volunteersTable, activityLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  SubmitVendorApplicationBody,
  SubmitSponsorApplicationBody,
  SubmitVolunteerApplicationBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/public/current-year", async (req, res): Promise<void> => {
  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
  if (years.length === 0) {
    res.status(404).json({ error: "No active festival year" });
    return;
  }
  res.json(years[0]);
});

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

  res.status(201).json({ message: "Application submitted successfully", id: vendor.id });
});

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
});

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
});

// Public endpoint to load form questions for the active year (no auth required)
router.get("/public/form-questions", async (req, res): Promise<void> => {
  const type = req.query.type as string | undefined;

  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
  if (years.length === 0) {
    res.json({ vendorFormQuestions: [], sponsorFormQuestions: [], volunteerFormQuestions: [] });
    return;
  }

  const settings = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, years[0].id)).limit(1);
  const s = settings[0];
  if (!s) {
    res.json({ vendorFormQuestions: [], sponsorFormQuestions: [], volunteerFormQuestions: [] });
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
    res.json({ questions: s.vendorFormQuestions, applicationDeadline: deadline, vendorTypes });
  } else if (type === "sponsor") {
    const sponsorTiers = [
      { key: "bronze",   label: "Bronze",   min: parseFloat(s.sponsorPriceBronze ?? "750"),   max: s.sponsorPriceMaxBronze   != null ? parseFloat(s.sponsorPriceMaxBronze)   : 1499,  spotLimit: s.sponsorSpotLimitBronze   ?? 10 },
      { key: "silver",   label: "Silver",   min: parseFloat(s.sponsorPriceSilver ?? "1500"),  max: s.sponsorPriceMaxSilver   != null ? parseFloat(s.sponsorPriceMaxSilver)   : 2999,  spotLimit: s.sponsorSpotLimitSilver   ?? 10 },
      { key: "gold",     label: "Gold",     min: parseFloat(s.sponsorPriceGold ?? "3000"),    max: s.sponsorPriceMaxGold     != null ? parseFloat(s.sponsorPriceMaxGold)     : 4999,  spotLimit: s.sponsorSpotLimitGold     ?? 10 },
      { key: "platinum", label: "Platinum", min: parseFloat(s.sponsorPricePlatinum ?? "5000"),max: s.sponsorPriceMaxPlatinum != null ? parseFloat(s.sponsorPriceMaxPlatinum) : 9999,  spotLimit: s.sponsorSpotLimitPlatinum ?? 5  },
      { key: "diamond",  label: "Diamond",  min: parseFloat(s.sponsorPriceDiamond ?? "10000"),max: null,                                                                               spotLimit: s.sponsorSpotLimitDiamond  ?? 3  },
    ];
    res.json({ questions: s.sponsorFormQuestions, applicationDeadline: deadline, sponsorTiers });
  } else if (type === "volunteer") {
    res.json({ questions: s.volunteerFormQuestions, applicationDeadline: deadline });
  } else {
    res.json({
      vendorFormQuestions: s.vendorFormQuestions,
      sponsorFormQuestions: s.sponsorFormQuestions,
      volunteerFormQuestions: s.volunteerFormQuestions,
      applicationDeadline: deadline,
    });
  }
});

export default router;
