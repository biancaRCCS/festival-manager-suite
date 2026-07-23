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
  const staffMembers = await db.select().from(staffTable).where(eq(staffTable.clerkUserId, userId));
  if (staffMembers.length === 0) {
    // Auto-provision admin if this is the first staff member (bootstrap)
    const allStaff = await db.select().from(staffTable);
    if (allStaff.length === 0) {
      // First user becomes admin
      const auth2 = getAuth(req);
      const email = (auth2 as any)?.sessionClaims?.email ?? `admin-${userId}@festival.local`;
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
