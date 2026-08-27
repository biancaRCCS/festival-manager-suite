// One-time data migration for the sponsor pay-first application flow.
//
// Background: sponsors used to apply, get approved by staff, submit stage-2
// details, get details-approved, and only then pay. Now sponsors pay at the
// moment they apply, and staff review happens after payment. This script
// remaps existing sponsor rows from the old status set to the new one:
//
//   pending            -> pending_payment  (flagged: never paid, needs outreach)
//   approved           -> pending_payment  (flagged: was mid-flow, needs outreach)
//   details_submitted  -> pending_payment  (flagged: was mid-flow, needs outreach)
//   details_approved   -> pending_payment  (flagged: was one step from done, needs outreach)
//   payment_pending    -> pending_payment  (flagged: already the old "waiting on payment" state)
//   rejected           -> rejected         (terminal, no outreach needed)
//   paid               -> details_approved (already paid & confirmed under the old flow)
//   final_approved     -> details_approved (fully confirmed under the even-older flow; paidAt/
//                                            finalApprovedAt timestamps are untouched by this script)
//
// Sponsors flagged for outreach get a note prepended to reviewNote and an
// activity log entry, so staff know to reach out with a payment link
// (via the "Resend Payment Link" action) to move them through the new flow.
// No new DB columns are introduced — status, reviewNote, and the activity
// log are reused. Spot assignments (spotNumber/location) are untouched.
//
// Usage:
//   pnpm --filter @workspace/scripts run migrate-sponsor-status              # dry run (default)
//   pnpm --filter @workspace/scripts run migrate-sponsor-status -- --apply   # actually writes changes

import { db, sponsorsTable, activityLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const STATUS_MAP: Record<string, { newStatus: string; flagForOutreach: boolean }> = {
  pending:            { newStatus: "pending_payment", flagForOutreach: true },
  approved:           { newStatus: "pending_payment", flagForOutreach: true },
  details_submitted:  { newStatus: "pending_payment", flagForOutreach: true },
  details_approved:   { newStatus: "pending_payment", flagForOutreach: true },
  payment_pending:    { newStatus: "pending_payment", flagForOutreach: true },
  rejected:           { newStatus: "rejected",         flagForOutreach: false },
  paid:               { newStatus: "details_approved", flagForOutreach: false },
  final_approved:     { newStatus: "details_approved", flagForOutreach: false },
};

// Statuses that are already valid under the new flow — left untouched if encountered
// (e.g. re-running this script after it already applied, or fixture data seeded post-migration).
const ALREADY_CURRENT = new Set(["pending_payment", "paid", "approved", "rejected", "details_submitted", "details_approved"]);

const OUTREACH_NOTE_PREFIX = "[MIGRATION] Needs staff outreach";

async function main() {
  const apply = process.argv.includes("--apply");

  const sponsors = await db.select().from(sponsorsTable);
  if (sponsors.length === 0) {
    console.log("No sponsor rows found. Nothing to do.");
    return;
  }

  let toMigrate = 0;
  let toFlag = 0;
  let skippedAlreadyCurrent = 0;
  let skippedUnknown = 0;

  for (const sponsor of sponsors) {
    const mapping = STATUS_MAP[sponsor.status];

    if (!mapping) {
      if (ALREADY_CURRENT.has(sponsor.status)) {
        skippedAlreadyCurrent++;
        continue;
      }
      console.warn(`  ! Sponsor #${sponsor.id} (${sponsor.orgName}) has unrecognized status "${sponsor.status}" — skipping.`);
      skippedUnknown++;
      continue;
    }

    const oldStatus = sponsor.status;
    const newStatus = mapping.newStatus;
    const alreadyFlagged = sponsor.reviewNote?.includes(OUTREACH_NOTE_PREFIX) ?? false;
    const needsFlag = mapping.flagForOutreach && !alreadyFlagged;

    if (oldStatus === newStatus && !needsFlag) {
      skippedAlreadyCurrent++;
      continue;
    }

    toMigrate++;
    if (needsFlag) toFlag++;

    console.log(
      `${apply ? "  Migrating" : "  [dry run] Would migrate"} sponsor #${sponsor.id} (${sponsor.orgName}): ` +
      `${oldStatus} -> ${newStatus}${needsFlag ? " [flag for outreach]" : ""}`
    );

    if (!apply) continue;

    const newNote = needsFlag
      ? [
          `${OUTREACH_NOTE_PREFIX}: was "${oldStatus}" under the old flow; contact sponsor to complete payment and use "Resend Payment Link".`,
          sponsor.reviewNote,
        ].filter(Boolean).join("\n\n")
      : sponsor.reviewNote;

    await db.update(sponsorsTable)
      .set({ status: newStatus, reviewNote: newNote })
      .where(eq(sponsorsTable.id, sponsor.id));

    await db.insert(activityLogTable).values({
      type: "details_updated",
      message: `Sponsor ${sponsor.name} (${sponsor.orgName}) status migrated from "${oldStatus}" to "${newStatus}" for the pay-first flow${needsFlag ? " — flagged for staff outreach" : ""}`,
      entityType: "sponsor",
      entityId: sponsor.id,
    });
  }

  console.log("");
  console.log(`Total sponsors: ${sponsors.length}`);
  console.log(`${apply ? "Migrated" : "Would migrate"}: ${toMigrate} (${toFlag} flagged for outreach)`);
  console.log(`Already current / no-op: ${skippedAlreadyCurrent}`);
  if (skippedUnknown > 0) console.log(`Unrecognized status, skipped: ${skippedUnknown}`);
  if (!apply) console.log("\nThis was a dry run. Re-run with --apply to write changes.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
