import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { resendSendSpy } = vi.hoisted(() => ({
  resendSendSpy: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: resendSendSpy };
  },
}));

import {
  sendApplicantConfirmation,
  sendContributionReceipt,
  sendSponsorDetailsInviteEmail,
  sendSponsorPaymentReceiptEmail,
  sendTestEmail,
  sendVendorCategoryAdjustedEmail,
  sendVendorPortalInviteEmail,
} from "../lib/email";

const originalResendKey = process.env.RESEND_API_KEY;
const originalBaseUrl = process.env.APP_BASE_URL;

beforeEach(() => {
  resendSendSpy.mockClear();
  process.env.RESEND_API_KEY = "re_test_email_layout";
  process.env.APP_BASE_URL = "https://festival.example.test/";
});

afterAll(() => {
  if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalResendKey;
  if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = originalBaseUrl;
});

function expectSharedLayout(html: string): void {
  expect(html).toContain("ROMANIAN COMMUNITY CENTER OF SACRAMENTO");
  expect(html).toContain("Preserving culture. Building community.");
  expect(html).toContain('src="https://festival.example.test/rccs-logo-white@96.png"');
  expect(html).toContain('alt="Romanian Community Center of Sacramento logo"');
  expect(html).toContain('src="https://festival.example.test/festival-logo-light-900.png"');
  expect(html).toContain('alt="Romanian Festival 2026"');
  expect(html).toContain("Thank you for your continued support.");
  expect(html).toContain("We look forward to celebrating with you on September 26.");
  expect(html).toContain("Ne bucurăm să vă avem alături de noi și vă așteptăm cu drag la Festivalul Românesc!");
  expect(html).toContain('href="https://romaniancenter.org"');
  expect(html).toContain('href="https://romanianfestival.org"');
}

function expectOrganizationOnlyFooter(html: string): void {
  expect(html).not.toContain("Thank you for your continued support.");
  expect(html).not.toContain("We look forward to celebrating with you on September 26.");
  expect(html).not.toContain("Ne bucurăm să vă avem alături de noi și vă așteptăm cu drag la Festivalul Românesc!");
  expect(html).toContain("<strong>Romanian Community Center of Sacramento</strong>");
  expect(html).toContain('href="https://romaniancenter.org"');
  expect(html).toContain('href="https://romanianfestival.org"');
}

describe("shared email layout", () => {
  it("wraps applicant confirmations without changing their subject or body", async () => {
    await sendApplicantConfirmation({
      to: "applicant@example.com",
      applicantName: "Ana Popescu",
      applicationType: "vendor",
      organizationOrBusiness: "Ana's Bakery",
      categoryOrTier: "Retail",
    });

    expect(resendSendSpy).toHaveBeenCalledOnce();
    const email = resendSendSpy.mock.calls[0][0] as { subject: string; html: string };
    expect(email.subject).toBe("Your Vendor Application for the 2026 Romanian Festival — Received");
    expect(email.html).toContain("Application Received");
    expect(email.html).toContain("Dear Ana Popescu,");
    expectSharedLayout(email.html);
  });

  it("uses the same layout for contribution receipts sent to the donor and staff", async () => {
    await sendContributionReceipt({
      to: "donor@example.com",
      name: "Alex Ionescu",
      amount: 125,
      paidAt: new Date("2026-08-20T12:00:00.000Z"),
      notificationEmail: "staff@example.com",
    });

    expect(resendSendSpy).toHaveBeenCalledTimes(2);
    for (const [email] of resendSendSpy.mock.calls as Array<[{ subject: string; html: string }]>) {
      expect(email.subject).toBe("Thank you for supporting the Romanian Community Center of Sacramento");
      expect(email.html).toContain("Thank you for your contribution");
      expectOrganizationOnlyFooter(email.html);
      expect(email.html).toContain("With sincere appreciation,<br>");
      expect(email.html).toContain("The Romanian Community Center of Sacramento Board of Directors");
      expect(email.html).toContain("romaniancenter.org");
      expect(email.html).toContain("info@romaniancenter.org");
    }
  });

  it("uses the same layout for the admin test email", async () => {
    await sendTestEmail("staff@example.com");

    expect(resendSendSpy).toHaveBeenCalledOnce();
    const email = resendSendSpy.mock.calls[0][0] as { subject: string; html: string };
    expect(email.subject).toBe("Romanian Festival — Test Email");
    expect(email.html).toContain("Email is working ✓");
    expectOrganizationOnlyFooter(email.html);
  });

  it("includes an approved vendor's review note under the RCCS heading", async () => {
    await sendVendorPortalInviteEmail({
      to: "vendor@example.com",
      name: "Maria Ionescu",
      portalUrl: "https://festival.example.test/portal/example-token",
      festivalName: "2026 Romanian Festival",
      reviewNote: "We saved a corner spot request for you.",
    });

    expect(resendSendSpy).toHaveBeenCalledOnce();
    const email = resendSendSpy.mock.calls[0][0] as { subject: string; html: string };
    expect(email.subject).toBe("Your Vendor Application for 2026 Romanian Festival — Next Steps");
    expect(email.html).toContain("A note from RCCS");
    expect(email.html).toContain("We saved a corner spot request for you.");
    expectSharedLayout(email.html);
  });

  it("sends unpaid vendors a category update with the amount and reason", async () => {
    await sendVendorCategoryAdjustedEmail({
      to: "vendor@example.com",
      name: "Maria Ionescu",
      vendorType: "specialty_food",
      amountDue: 1200,
      boothDimensions: "10′×20′",
      reason: "The submitted menu is a specialty food booth.",
      festivalName: "2026 Romanian Festival",
    });

    expect(resendSendSpy).toHaveBeenCalledOnce();
    const email = resendSendSpy.mock.calls[0][0] as { subject: string; html: string };
    expect(email.subject).toBe("Vendor Category Updated — 2026 Romanian Festival");
    expect(email.html).toContain("Vendor Category Updated");
    expect(email.html).toContain("Specialty Food &amp; Beverage Vendor");
    expect(email.html).toContain("$1,200.00");
    expect(email.html).toContain("The submitted menu is a specialty food booth.");
    expectSharedLayout(email.html);
  });

  it("tells sponsors payment is already received and never mentions later payment instructions (pay-first flow)", async () => {
    await sendSponsorDetailsInviteEmail({
      to: "sponsor@example.com",
      name: "Maria Ionescu",
      orgName: "Ionescu Imports",
      tier: "gold",
      portalUrl: "https://festival.example.test/portal/example-token",
      festivalName: "2026 Romanian Festival",
    });

    expect(resendSendSpy).toHaveBeenCalledOnce();
    const email = resendSendSpy.mock.calls[0][0] as { subject: string; html: string };
    expect(email.html).toContain("We've received your sponsorship payment");
    expect(email.html).toContain("final confirmation");
    // Acknowledgements and signature are collected at application time under
    // the pay-first flow, so the stage-2 details invite must not ask for them
    // or imply payment is still to come.
    expect(email.html).not.toContain("acknowledgements");
    expect(email.html).not.toContain("instructions to complete your payment");
    expectSharedLayout(email.html);
  });

  it("does not ask sponsors for acknowledgements in the payment receipt's stage-2 preview (pay-first flow)", async () => {
    await sendSponsorPaymentReceiptEmail({
      to: "sponsor@example.com",
      name: "Maria Ionescu",
      orgName: "Ionescu Imports",
      tier: "gold",
      amount: 2500,
      festivalName: "2026 Romanian Festival",
    });

    expect(resendSendSpy).toHaveBeenCalledOnce();
    const email = resendSendSpy.mock.calls[0][0] as { subject: string; html: string };
    expect(email.html).toContain("Payment Received");
    expect(email.html).not.toContain("acknowledgements");
    expectSharedLayout(email.html);
  });
});