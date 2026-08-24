import type { vendorsTable } from "@workspace/db";

type SpecialAgreementVendor = typeof vendorsTable.$inferSelect;

export type SpecialAgreementSettlementStatus = "awaiting_figures" | "calculated" | "paid";

export type SpecialAgreementSettlement = {
  grossSales: number | null;
  deductions: number | null;
  netProfit: number | null;
  amountOwed: number | null;
  amountPaid: number | null;
  outstandingBalance: number | null;
  paidDate: string | null;
  settlementStatus: SpecialAgreementSettlementStatus;
};

function amount(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function currency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function deriveSpecialAgreementSettlement(vendor: SpecialAgreementVendor): SpecialAgreementSettlement {
  const grossSales = amount(vendor.specialAgreementGrossSales);
  const deductions = amount(vendor.specialAgreementDeductions);
  const amountPaid = amount(vendor.specialAgreementAmountPaid);
  const paidDate = vendor.specialAgreementPaidDate ?? null;
  const percentage = amount(vendor.specialAgreementRevenueSharePercentage);

  if (grossSales === null || deductions === null || percentage === null) {
    return {
      grossSales,
      deductions,
      netProfit: null,
      amountOwed: null,
      amountPaid,
      outstandingBalance: null,
      paidDate,
      settlementStatus: "awaiting_figures",
    };
  }

  const netProfit = currency(grossSales - deductions);
  const amountOwed = currency(Math.round(netProfit * 100) * percentage / 10000);
  const outstandingBalance = amountPaid === null
    ? amountOwed
    : currency(Math.max(0, amountOwed - amountPaid));
  const settlementStatus = amountPaid !== null && paidDate !== null && amountPaid >= amountOwed
    ? "paid"
    : "calculated";

  return {
    grossSales,
    deductions,
    netProfit,
    amountOwed,
    amountPaid,
    outstandingBalance,
    paidDate,
    settlementStatus,
  };
}