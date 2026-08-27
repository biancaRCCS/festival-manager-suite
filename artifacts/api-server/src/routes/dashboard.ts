import { Router, type IRouter } from "express";
import { db, festivalYearsTable, festivalSettingsTable, vendorsTable, sponsorsTable, volunteersTable, activityLogTable } from "@workspace/db";
import { eq, and, desc, sql, isNotNull } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import { GetDashboardFinancialsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function calcCountdown(eventDate: string | null | undefined): number | null {
  if (!eventDate) return null;
  const event = new Date(eventDate + "T12:00:00");
  if (isNaN(event.getTime())) return null;
  const now = new Date();
  const diff = event.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

async function getStatsForYear(yearId: number) {
  const vendors = await db.select().from(vendorsTable).where(eq(vendorsTable.yearId, yearId));
  const sponsors = await db.select().from(sponsorsTable).where(eq(sponsorsTable.yearId, yearId));
  const volunteers = await db.select().from(volunteersTable).where(eq(volunteersTable.yearId, yearId));

  // Buckets default to the vendor/volunteer status set. Callers with a different
  // status flow (e.g. sponsors' pay-first flow) can override any bucket with a
  // custom list of statuses that should count toward it.
  const statFor = (rows: Array<{ status: string }>, buckets?: Partial<Record<"pending" | "approved" | "rejected" | "paid" | "finalApproved", string[]>>) => {
    const b = {
      pending: buckets?.pending ?? ["pending"],
      approved: buckets?.approved ?? ["approved"],
      rejected: buckets?.rejected ?? ["rejected"],
      paid: buckets?.paid ?? ["paid"],
      finalApproved: buckets?.finalApproved ?? ["final_approved"],
    };
    const countIn = (statuses: string[]) => rows.filter(r => statuses.includes(r.status)).length;
    return {
      total: rows.length,
      pending: countIn(b.pending),
      approved: countIn(b.approved),
      rejected: countIn(b.rejected),
      paid: countIn(b.paid),
      finalApproved: countIn(b.finalApproved),
    };
  };

  return { vendors, sponsors, volunteers, statFor };
}

// Build vendor price map from settings (4 categories)
function buildVendorPriceMap(s: typeof festivalSettingsTable.$inferSelect | undefined): Record<string, number> {
  return {
    major_food:    s ? parseFloat(s.vendorPriceMajorFood)    : 2000,
    specialty_food: s ? parseFloat(s.vendorPriceSpecialtyFood) : 600,
    retail:        s ? parseFloat(s.vendorPriceRetail)       : 300,
    nonprofit:     s ? parseFloat(s.vendorPriceNonprofit)    : 150,
  };
}

// Build sponsor price map from settings — uses tier min price as the revenue estimate
// when the sponsor's actual chosen amount (sponsorshipAmount) is not yet set.
function buildSponsorPriceMap(s: typeof festivalSettingsTable.$inferSelect | undefined): Record<string, number> {
  return {
    bronze:   s ? parseFloat(s.sponsorPriceBronze)   : 750,
    silver:   s ? parseFloat(s.sponsorPriceSilver)   : 1500,
    gold:     s ? parseFloat(s.sponsorPriceGold)     : 3000,
    platinum: s ? parseFloat(s.sponsorPricePlatinum) : 5000,
    diamond:  s ? parseFloat(s.sponsorPriceDiamond)  : 10000,
  };
}

// Revenue for a paid sponsor: use sponsorshipAmount if set, else fall back to tier min
function sponsorAmount(sp: typeof sponsorsTable.$inferSelect, tierMap: Record<string, number>): number {
  if (sp.sponsorshipAmount != null) return parseFloat(sp.sponsorshipAmount);
  return tierMap[sp.tier ?? "bronze"] ?? 750;
}

router.get("/dashboard/summary", requireStaff, async (req, res): Promise<void> => {
  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
  if (years.length === 0) {
    res.status(404).json({ error: "No active festival year" });
    return;
  }
  const year = years[0];
  const { vendors, sponsors, volunteers, statFor } = await getStatsForYear(year.id);

  const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, year.id)).limit(1);
  const s = settingsRows[0];

  const vendorPriceMap  = buildVendorPriceMap(s);
  const sponsorPriceMap = buildSponsorPriceMap(s);

  const paidVendors  = vendors.filter(v => v.status === "paid" || v.status === "final_approved");
  const paidSponsors = sponsors.filter(sp => sp.paidAt != null);
  const vendorRevenue  = paidVendors.reduce((sum, v) => sum + (vendorPriceMap[v.vendorType] ?? 300), 0);
  const sponsorRevenue = paidSponsors.reduce((sum, sp) => sum + sponsorAmount(sp, sponsorPriceMap), 0);
  const totalRevenue = vendorRevenue + sponsorRevenue;

  const vendorStats    = statFor(vendors);
  // Sponsors now pay before staff review, so the bucket meanings shift:
  // "pending" (Pending Review) = paid, awaiting stage-1 review, or details submitted awaiting review;
  // "approved" (Payment Pending label in the UI) = applied but not yet paid;
  // "finalApproved" = fully confirmed sponsor.
  const sponsorStats   = statFor(sponsors, {
    pending: ["paid", "details_submitted"],
    approved: ["pending_payment"],
    rejected: ["rejected"],
    paid: ["paid", "approved", "details_submitted", "details_approved", "rejected"],
    finalApproved: ["details_approved"],
  });
  const volunteerStats = statFor(volunteers);
  const pendingActions = vendorStats.pending + sponsorStats.pending + volunteerStats.pending;

  // Category breakdown for admin visibility (counts against targets)
  const vendorCategoryStats = s ? [
    { key: "major_food",    label: s.vendorTypeLabelMajorFood,    count: vendors.filter(v => v.vendorType === "major_food").length,    target: s.vendorSpotLimitMajorFood,    booth: "10′ × 20′" },
    { key: "specialty_food", label: s.vendorTypeLabelSpecialtyFood, count: vendors.filter(v => v.vendorType === "specialty_food").length, target: s.vendorSpotLimitSpecialtyFood, booth: "10′ × 10′" },
    { key: "retail",        label: s.vendorTypeLabelRetail,        count: vendors.filter(v => v.vendorType === "retail").length,        target: s.vendorSpotLimitRetail,        booth: "10′ × 10′" },
    { key: "nonprofit",     label: s.vendorTypeLabelNonprofit,     count: vendors.filter(v => v.vendorType === "nonprofit").length,     target: s.vendorSpotLimitNonprofit,     booth: "10′ × 10′" },
  ] : [];

  const festivalDate = s?.festivalDate ?? null;

  res.json({
    festivalYear: year,
    festivalDate,
    countdown: calcCountdown(festivalDate),
    vendorStats,
    sponsorStats,
    volunteerStats,
    vendorRevenue,
    sponsorRevenue,
    totalRevenue,
    pendingActions,
    vendorCategoryStats,
  });
});

router.get("/dashboard/financials", requireStaff, async (req, res): Promise<void> => {
  const queryParsed = GetDashboardFinancialsQueryParams.safeParse(req.query);
  let yearId: number | undefined = queryParsed.success ? queryParsed.data.yearId : undefined;

  if (!yearId) {
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
    if (years.length === 0) {
      res.status(404).json({ error: "No active festival year" });
      return;
    }
    yearId = years[0].id;
  }

  const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, yearId)).limit(1);
  const sf = settingsRows[0];

  const vendorPriceMap  = buildVendorPriceMap(sf);
  const sponsorPriceMap = buildSponsorPriceMap(sf);

  const vendors = await db.select().from(vendorsTable).where(
    and(eq(vendorsTable.yearId, yearId), sql`status IN ('paid', 'final_approved')`)
  );
  const sponsors = await db.select().from(sponsorsTable).where(
    and(eq(sponsorsTable.yearId, yearId), isNotNull(sponsorsTable.paidAt))
  );

  const vendorRevenue  = vendors.reduce((sum, v) => sum + (vendorPriceMap[v.vendorType] ?? 300), 0);
  const sponsorRevenue = sponsors.reduce((sum, sp) => sum + sponsorAmount(sp, sponsorPriceMap), 0);

  const recentPayments = [
    ...vendors.filter(v => v.paidAt).map(v => ({
      type: "vendor" as const,
      name: `${v.name} — ${v.businessName}`,
      amount: vendorPriceMap[v.vendorType] ?? 300,
      paidAt: v.paidAt!.toISOString(),
    })),
    ...sponsors.filter(s => s.paidAt).map(s => ({
      type: "sponsor" as const,
      name: `${s.name} — ${s.orgName}`,
      amount: sponsorAmount(s, sponsorPriceMap),
      paidAt: s.paidAt!.toISOString(),
    })),
  ].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()).slice(0, 10);

  res.json({
    vendorRevenue,
    sponsorRevenue,
    totalRevenue: vendorRevenue + sponsorRevenue,
    vendorCount: vendors.length,
    sponsorCount: sponsors.length,
    recentPayments,
  });
});

router.get("/dashboard/email-failures", requireStaff, async (_req, res): Promise<void> => {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const rows = await db
    .select()
    .from(activityLogTable)
    .where(
      and(
        eq(activityLogTable.type, "email_failure"),
        sql`${activityLogTable.createdAt} >= ${since.toISOString()}`
      )
    )
    .orderBy(desc(activityLogTable.createdAt))
    .limit(50);

  res.json({
    count: rows.length,
    items: rows.map(r => ({
      id: r.id,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

router.get("/dashboard/activity", requireStaff, async (req, res): Promise<void> => {
  const page   = Math.max(1, parseInt((req.query.page  as string) || "1",  10) || 1);
  const limit  = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "50", 10) || 50));
  const offset = (page - 1) * limit;

  const typeFilter       = req.query.type       as string | undefined;
  const entityTypeFilter = req.query.entityType as string | undefined;

  // Build WHERE conditions dynamically
  const conditions: ReturnType<typeof eq>[] = [];
  if (typeFilter)       conditions.push(eq(activityLogTable.type,       typeFilter));
  if (entityTypeFilter) conditions.push(eq(activityLogTable.entityType, entityTypeFilter));

  const whereClause = conditions.length > 0
    ? and(...conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])
    : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(activityLogTable)
      .where(whereClause)
      .orderBy(desc(activityLogTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(activityLogTable).where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  res.json({
    items: rows.map(i => ({
      id: i.id,
      type: i.type,
      message: i.message,
      entityType: i.entityType,
      entityId: i.entityId,
      performedBy: i.performedBy ?? null,
      fieldName: i.fieldName ?? null,
      oldValue: i.oldValue ?? null,
      newValue: i.newValue ?? null,
      createdAt: i.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

router.get("/dashboard/activity/export", requireStaff, async (req, res): Promise<void> => {
  const typeFilter       = req.query.type       as string | undefined;
  const entityTypeFilter = req.query.entityType as string | undefined;

  const conditions: ReturnType<typeof eq>[] = [];
  if (typeFilter)       conditions.push(eq(activityLogTable.type,       typeFilter));
  if (entityTypeFilter) conditions.push(eq(activityLogTable.entityType, entityTypeFilter));

  const whereClause = conditions.length > 0
    ? and(...conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])
    : undefined;

  const rows = await db.select().from(activityLogTable)
    .where(whereClause)
    .orderBy(desc(activityLogTable.createdAt));

  // Build CSV with injection protection:
  // - Always quote values containing comma, double-quote, newline (\n), or carriage return (\r)
  // - Neutralize spreadsheet formula injection: prefix with a tab if value starts with =, +, -, or @
  const escape = (v: string | number | null | undefined): string => {
    let s = v == null ? "" : String(v);
    // Neutralize formula injection (Excel/Sheets treat leading =, +, -, @ as formula markers)
    if (/^[\t ]*[=+\-@]/.test(s)) {
      s = `\t${s}`;
    }
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = ["Date", "Type", "Entity Type", "Entity ID", "Message", "Field", "Old Value", "New Value", "Performed By"].join(",");
  const csvRows = rows.map(r =>
    [
      escape(r.createdAt.toISOString()),
      escape(r.type),
      escape(r.entityType),
      escape(r.entityId),
      escape(r.message),
      escape(r.fieldName),
      escape(r.oldValue),
      escape(r.newValue),
      escape(r.performedBy),
    ].join(",")
  );

  const csv = [header, ...csvRows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="activity-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

export default router;
