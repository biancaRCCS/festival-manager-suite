import type { contributionsTable, vendorsTable } from "@workspace/db";
import { deriveSpecialAgreementSettlement } from "./specialAgreementSettlement";

type Cell = string | number | boolean | Date | null | undefined;

/** Quote every cell, preserve Unicode and line breaks, and neutralize spreadsheet formulas. */
export function serializeCsv(rows: Cell[][]): string {
  return "\uFEFF" + rows.map(row => row.map(value => {
    const text = value instanceof Date ? value.toISOString() : String(value ?? "");
    const safe = typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}

export function contributionsCsv(rows: (typeof contributionsTable.$inferSelect)[], year: number): string {
  const methods: Record<string, string> = { cash: "Cash", check: "Check", bank_transfer: "Bank transfer", other: "Other" };
  return serializeCsv([
    ["Festival Year", "ID", "Date", "Contributor", "Email", "Method", "Status", "Amount (USD)",
      "Payment Source", "Payment Reference", "Received Date", "Recorded At", "Recorded By",
      "Paid At", "Payment Failed At", "Payment Failure Reason", "Removed At", "Removed By", "Created At"],
    ...rows.map(row => [
      year, row.id, row.paidAt ?? row.createdAt, row.name, row.email,
      row.manualPaymentRecordedAt ? (methods[row.manualPaymentMethod ?? ""] ?? "Manual") : row.stripeSessionId ? "Online (Stripe)" : "",
      row.status, Number(row.amount).toFixed(2),
      row.manualPaymentRecordedAt ? "manual" : row.stripeSessionId ? "stripe" : "",
      row.manualPaymentReference, row.manualPaymentReceivedDate, row.manualPaymentRecordedAt,
      row.manualPaymentRecordedBy, row.paidAt, row.paymentFailedAt, row.paymentFailureReason,
      row.removedAt, row.removedBy, row.createdAt,
    ]),
  ]);
}

export function settlementsCsv(rows: (typeof vendorsTable.$inferSelect)[], year: number): string {
  const money = (value: number | null) => value === null ? null : value.toFixed(2);
  return serializeCsv([
    ["Festival Year", "Vendor ID", "Vendor", "Contact Name", "Email", "Phone", "Share (%)",
      "Gross (USD)", "Deductions (USD)", "Net (USD)", "Owed (USD)", "Paid (USD)",
      "Outstanding (USD)", "Settlement Status", "Application Status", "Paid Date",
      "Agreement Signed", "Agreement Signed Date", "Agreement Signed At", "Approved At",
      "Final Approved At", "Created At", "Deductions Notes", "Settlement Notes"],
    ...rows.map(row => {
      // Use the same calculation as the summary page, including rounding and unset amounts.
      const settlement = deriveSpecialAgreementSettlement(row);
      return [
        year, row.id, row.businessName, row.name, row.email, row.phone,
        Number(row.specialAgreementRevenueSharePercentage ?? 0),
        money(settlement.grossSales), money(settlement.deductions), money(settlement.netProfit),
        money(settlement.amountOwed), money(settlement.amountPaid), money(settlement.outstandingBalance),
        settlement.settlementStatus, row.status, settlement.paidDate,
        row.agreementSigned ? "Yes" : "No", row.specialAgreementSignedDate, row.specialAgreementSignedAt,
        row.approvedAt, row.finalApprovedAt, row.createdAt,
        row.specialAgreementDeductionsNotes, row.specialAgreementSettlementNotes,
      ];
    }),
  ]);
}
