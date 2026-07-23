import { Router, type IRouter } from "express";
import { db, staffTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import { InviteStaffBody, RemoveStaffParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/staff", requireStaff, async (req, res): Promise<void> => {
  const rows = await db.select().from(staffTable).orderBy(staffTable.createdAt);
  res.json(rows.map(s => ({
    id: s.id,
    clerkUserId: s.clerkUserId ?? null,
    email: s.email,
    name: s.name,
    role: s.role,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.post("/staff", requireStaff, async (req, res): Promise<void> => {
  const currentStaff = (req as any).staffMember;
  if (currentStaff?.role !== "admin") {
    res.status(403).json({ error: "Only admins can invite staff" });
    return;
  }

  const parsed = InviteStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, name, role } = parsed.data;

  // Check if already exists
  const existing = await db.select().from(staffTable).where(eq(staffTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "A staff member with this email already exists" });
    return;
  }

  const [created] = await db.insert(staffTable).values({
    email,
    name: name ?? "",
    role: role ?? "staff",
  }).returning();

  res.status(201).json({
    id: created.id,
    clerkUserId: created.clerkUserId ?? null,
    email: created.email,
    name: created.name,
    role: created.role,
    createdAt: created.createdAt.toISOString(),
  });
});

router.delete("/staff/:id", requireStaff, async (req, res): Promise<void> => {
  const currentStaff = (req as any).staffMember;
  if (currentStaff?.role !== "admin") {
    res.status(403).json({ error: "Only admins can remove staff" });
    return;
  }

  const parsed = RemoveStaffParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  // Don't allow removing yourself
  if (currentStaff.id === parsed.data.id) {
    res.status(400).json({ error: "Cannot remove yourself" });
    return;
  }

  const [removed] = await db.delete(staffTable).where(eq(staffTable.id, parsed.data.id)).returning();
  if (!removed) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
