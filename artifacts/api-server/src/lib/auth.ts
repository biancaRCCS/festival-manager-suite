import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, staffTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).clerkUserId = userId;
  next();
}

export async function requireStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Check staff table for this Clerk user
  let staffMembers = await db.select().from(staffTable).where(eq(staffTable.clerkUserId, userId));

  // If not found by Clerk ID, try to link an existing email-only invitation
  if (staffMembers.length === 0) {
    const sessionEmail =
      (getAuth(req) as any)?.sessionClaims?.email ??
      (getAuth(req) as any)?.sessionClaims?.primary_email_address ??
      null;
    if (sessionEmail) {
      const { isNull, and } = await import("drizzle-orm");
      const emailMatch = await db
        .select()
        .from(staffTable)
        .where(and(eq(staffTable.email, sessionEmail), isNull(staffTable.clerkUserId)));
      if (emailMatch.length > 0) {
        // Link their Clerk ID so future lookups are instant
        const updated = await db
          .update(staffTable)
          .set({ clerkUserId: userId })
          .where(eq(staffTable.id, emailMatch[0].id!))
          .returning();
        staffMembers = updated;
      }
    }
  }

  if (staffMembers.length === 0) {
    const allStaff = await db.select().from(staffTable);

    // Bootstrap: no staff at all, or only placeholder entries generated during
    // initial auto-provision (identifiable by the admin-user_*@festival.local
    // fallback email). Promote the first real authenticated user as admin.
    const placeholderPattern = /^admin-user_.+@festival\.local$/;
    const realStaff = allStaff.filter(s => !placeholderPattern.test(s.email ?? ""));

    if (allStaff.length === 0 || realStaff.length === 0) {
      // Remove any leftover placeholder entries
      if (allStaff.length > 0) {
        const { inArray } = await import("drizzle-orm");
        const placeholderIds = allStaff.map(s => s.id).filter((id): id is number => id !== null);
        if (placeholderIds.length > 0) {
          await db.delete(staffTable).where(inArray(staffTable.id, placeholderIds));
        }
      }

      const auth2 = getAuth(req);
      const email = (auth2 as any)?.sessionClaims?.email ?? (auth2 as any)?.sessionClaims?.primary_email_address ?? `admin-${userId}@festival.local`;
      const [newStaff] = await db.insert(staffTable).values({
        clerkUserId: userId,
        email,
        name: "Admin",
        role: "admin",
      }).returning();
      (req as any).clerkUserId = userId;
      (req as any).staffMember = newStaff;
      next();
      return;
    }

    res.status(403).json({ error: "Access denied — not a registered staff member" });
    return;
  }

  (req as any).clerkUserId = userId;
  (req as any).staffMember = staffMembers[0];
  next();
}
