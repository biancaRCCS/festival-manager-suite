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
  expect(html).toContain("Vă așteptăm cu drag la următorul eveniment!");
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
      expectSharedLayout(email.html);
    }
  });

  it("uses the same layout for the admin test email", async () => {
    await sendTestEmail("staff@example.com");

    expect(resendSendSpy).toHaveBeenCalledOnce();
    const email = resendSendSpy.mock.calls[0][0] as { subject: string; html: string };
    expect(email.subject).toBe("Romanian Festival — Test Email");
    expect(email.html).toContain("Email is working ✓");
    expectSharedLayout(email.html);
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
});