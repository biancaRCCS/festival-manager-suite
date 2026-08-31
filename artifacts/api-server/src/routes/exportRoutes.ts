import { Router, type IRouter } from "express";
import { db, vendorsTable, sponsorsTable, volunteersTable, festivalYearsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import ExcelJS from "exceljs";

const router: IRouter = Router();

router.get("/export/vendors", requireStaff, async (req, res): Promise<void> => {
  const yearId = req.query.yearId ? parseInt(String(req.query.yearId), 10) : undefined;

  const rows = yearId
    ? await db.select().from(vendorsTable).where(eq(vendorsTable.yearId, yearId)).orderBy(desc(vendorsTable.createdAt))
    : await db.select().from(vendorsTable).orderBy(desc(vendorsTable.createdAt));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Vendors");

  ws.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Name", key: "name", width: 20 },
    { header: "Business Name", key: "businessName", width: 25 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone", key: "phone", width: 15 },
    { header: "Status", key: "status", width: 15 },
    { header: "Spot Number", key: "spotNumber", width: 12 },
    { header: "Location", key: "location", width: 20 },
    { header: "Agreement Signed", key: "agreementSigned", width: 18 },
    { header: "Paid At", key: "paidAt", width: 20 },
    { header: "Final Approved At", key: "finalApprovedAt", width: 20 },
    { header: "Applied At", key: "createdAt", width: 20 },
  ];

  rows.forEach(v => ws.addRow({
    id: v.id,
    name: v.name,
    businessName: v.businessName,
    email: v.email,
    phone: v.phone,
    status: v.status,
    spotNumber: v.spotNumber ?? "",
    location: v.location ?? "",
    agreementSigned: v.agreementSigned ? "Yes" : "No",
    paidAt: v.paidAt?.toISOString() ?? "",
    finalApprovedAt: v.finalApprovedAt?.toISOString() ?? "",
    createdAt: v.createdAt.toISOString(),
  }));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="vendors.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

router.get("/export/sponsors", requireStaff, async (req, res): Promise<void> => {
  const yearId = req.query.yearId ? parseInt(String(req.query.yearId), 10) : undefined;

  const rows = yearId
    ? await db.select().from(sponsorsTable).where(eq(sponsorsTable.yearId, yearId)).orderBy(desc(sponsorsTable.createdAt))
    : await db.select().from(sponsorsTable).orderBy(desc(sponsorsTable.createdAt));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sponsors");

  ws.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Name", key: "name", width: 20 },
    { header: "Organization", key: "orgName", width: 25 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone", key: "phone", width: 15 },
    { header: "Tier", key: "tier", width: 12 },
    { header: "Contribution Type", key: "contributionType", width: 20 },
    { header: "In-kind Description", key: "inKindDescription", width: 40 },
    { header: "In-kind Valuation", key: "inKindValuation", width: 20 },
    { header: "Status", key: "status", width: 15 },
    { header: "Spot Number", key: "spotNumber", width: 12 },
    { header: "Location", key: "location", width: 20 },
    { header: "Agreement Signed", key: "agreementSigned", width: 18 },
    { header: "Paid At", key: "paidAt", width: 20 },
    { header: "Final Approved At", key: "finalApprovedAt", width: 20 },
    { header: "Applied At", key: "createdAt", width: 20 },
  ];

  rows.forEach(s => ws.addRow({
    id: s.id,
    name: s.name,
    orgName: s.orgName,
    email: s.email,
    phone: s.phone,
    tier: s.tier,
    contributionType: s.isInKind ? "In-kind (not cash)" : "Cash sponsorship",
    inKindDescription: s.inKindDescription ?? "",
    inKindValuation: s.isInKind && s.inKindValue != null ? Number(s.inKindValue) : "",
    status: s.isInKind ? `${s.status} — in-kind` : s.status,
    spotNumber: s.spotNumber ?? "",
    location: s.location ?? "",
    agreementSigned: s.agreementSigned ? "Yes" : "No",
    paidAt: s.isInKind ? "" : (s.paidAt?.toISOString() ?? ""),
    finalApprovedAt: s.finalApprovedAt?.toISOString() ?? "",
    createdAt: s.createdAt.toISOString(),
  }));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="sponsors.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

router.get("/export/volunteers", requireStaff, async (req, res): Promise<void> => {
  const yearId = req.query.yearId ? parseInt(String(req.query.yearId), 10) : undefined;

  const rows = yearId
    ? await db.select().from(volunteersTable).where(eq(volunteersTable.yearId, yearId)).orderBy(desc(volunteersTable.createdAt))
    : await db.select().from(volunteersTable).orderBy(desc(volunteersTable.createdAt));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Volunteers");

  ws.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Name", key: "name", width: 20 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone", key: "phone", width: 15 },
    { header: "Availability", key: "availability", width: 20 },
    { header: "Status", key: "status", width: 15 },
    { header: "Assigned Role", key: "assignedRole", width: 20 },
    { header: "Applied At", key: "createdAt", width: 20 },
  ];

  rows.forEach(v => ws.addRow({
    id: v.id,
    name: v.name,
    email: v.email,
    phone: v.phone,
    availability: v.availability ?? "",
    status: v.status,
    assignedRole: v.assignedRole ?? "",
    createdAt: v.createdAt.toISOString(),
  }));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="volunteers.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

export default router;
