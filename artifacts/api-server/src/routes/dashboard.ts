import { Router, type IRouter } from "express";
import { db, festivalYearsTable, festivalSettingsTable, vendorsTable, sponsorsTable, volunteersTable, activityLogTable } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import { GetDashboardFinancialsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function calcCountdown(eventDate: string): number {
  const event = new Date(eventDate);
  const now = new Date();
  const diff = event.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

async function getStatsForYear(yearId: number) {
  const vendors = await db.select().from(vendorsTable).where(eq(vendorsTable.yearId, yearId));
  const sponsors = await db.select().from(sponsorsTable).where(eq(sponsorsTable.yearId, yearId));
  const volunteers = await db.select().from(volunteersTable).where(eq(volunteersTable.yearId, yearId));

  const statFor = (rows: Array<{ status: string }>) => ({
    total: rows.length,
    pending: rows.filter(r => r.status === "pending").length,
    approved: rows.filter(r => r.status === "approved").length,
    rejected: rows.filter(r => r.status === "rejected").length,
    paid: rows.filter(r => r.status === "paid").length,
    finalApproved: rows.filter(r => r.status === "final_approved").length,
  });

  return { vendors, sponsors, volunteers, statFor };
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

  const vendorPriceMap: Record<string, number> = {
    food:        s ? parseFloat(s.vendorPriceFood)        : 200,
    crafts:      s ? parseFloat(s.vendorPriceCrafts)      : 150,
    merchandise: s ? parseFloat(s.vendorPriceMerchandise) : 150,
    cultural:    s ? parseFloat(s.vendorPriceCultural)    : 100,
    other:       s ? parseFloat(s.vendorPriceOther)       : 100,
  };
  const sponsorPriceMap: Record<string, number> = {
    bronze:   s ? parseFloat(s.sponsorPriceBronze)   : 250,
    silver:   s ? parseFloat(s.sponsorPriceSilver)   : 500,
    gold:     s ? parseFloat(s.sponsorPriceGold)     : 1000,
    platinum: s ? parseFloat(s.sponsorPricePlatinum) : 2000,
    diamond:  s ? parseFloat(s.sponsorPriceDiamond)  : 5000,
  };

  const paidVendors = vendors.filter(v => v.status === "paid" || v.status === "final_approved");
  const paidSponsors = sponsors.filter(sp => sp.status === "paid" || sp.status === "final_approved");
  const vendorRevenue = paidVendors.reduce((sum, v) => sum + (vendorPriceMap[v.vendorType] ?? 150), 0);
  const sponsorRevenue = paidSponsors.reduce((sum, sp) => sum + (sponsorPriceMap[sp.tier ?? "bronze"] ?? 250), 0);
  const totalRevenue = vendorRevenue + sponsorRevenue;

  const vendorStats = statFor(vendors);
  const sponsorStats = statFor(sponsors);
  const volunteerStats = statFor(volunteers);
  const pendingActions = vendorStats.pending + sponsorStats.pending + volunteerStats.pending;

  res.json({
    festivalYear: year,
    countdown: calcCountdown(year.eventDate),
    vendorStats,
    sponsorStats,
    volunteerStats,
    vendorRevenue,
    sponsorRevenue,
    totalRevenue,
    pendingActions,
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

  const vendorPriceMapF: Record<string, number> = {
    food:        sf ? parseFloat(sf.vendorPriceFood)        : 200,
    crafts:      sf ? parseFloat(sf.vendorPriceCrafts)      : 150,
    merchandise: sf ? parseFloat(sf.vendorPriceMerchandise) : 150,
    cultural:    sf ? parseFloat(sf.vendorPriceCultural)    : 100,
    other:       sf ? parseFloat(sf.vendorPriceOther)       : 100,
  };
  const sponsorPriceMapF: Record<string, number> = {
    bronze:   sf ? parseFloat(sf.sponsorPriceBronze)   : 250,
    silver:   sf ? parseFloat(sf.sponsorPriceSilver)   : 500,
    gold:     sf ? parseFloat(sf.sponsorPriceGold)     : 1000,
    platinum: sf ? parseFloat(sf.sponsorPricePlatinum) : 2000,
    diamond:  sf ? parseFloat(sf.sponsorPriceDiamond)  : 5000,
  };

  const vendors = await db.select().from(vendorsTable).where(
    and(eq(vendorsTable.yearId, yearId), sql`status IN ('paid', 'final_approved')`)
  );
  const sponsors = await db.select().from(sponsorsTable).where(
    and(eq(sponsorsTable.yearId, yearId), sql`status IN ('paid', 'final_approved')`)
  );

  const vendorRevenue = vendors.reduce((sum, v) => sum + (vendorPriceMapF[v.vendorType] ?? 150), 0);
  const sponsorRevenue = sponsors.reduce((sum, sp) => sum + (sponsorPriceMapF[sp.tier ?? "bronze"] ?? 250), 0);

  const recentPayments = [
    ...vendors.filter(v => v.paidAt).map(v => ({
      type: "vendor" as const,
      name: `${v.name} — ${v.businessName}`,
      amount: vendorPriceMapF[v.vendorType] ?? 150,
      paidAt: v.paidAt!.toISOString(),
    })),
    ...sponsors.filter(s => s.paidAt).map(s => ({
      type: "sponsor" as const,
      name: `${s.name} — ${s.orgName}`,
      amount: sponsorPriceMapF[s.tier ?? "bronze"] ?? 250,
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

router.get("/dashboard/activity", requireStaff, async (req, res): Promise<void> => {
  const items = await db.select().from(activityLogTable).orderBy(desc(activityLogTable.createdAt)).limit(20);
  res.json(items.map(i => ({
    id: i.id,
    type: i.type,
    message: i.message,
    entityType: i.entityType,
    entityId: i.entityId,
    createdAt: i.createdAt.toISOString(),
  })));
});

export default router;
