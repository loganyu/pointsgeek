import { Resend } from "resend";
import { logger } from "./logger";

interface SignupAlertArgs {
  userId: string;
  email: string | null | undefined;
  firstName: string;
  lastName: string | null;
  timezone: string;
  providers: string[];
}

const alertEmail = process.env.ADMIN_SIGNUP_ALERT_EMAIL;
const resendApiKey = process.env.AUTH_RESEND_KEY;
const fromAddress = process.env.AUTH_EMAIL_FROM || "noreply@example.com";

const resendClient = resendApiKey ? new Resend(resendApiKey) : null;

export async function sendSignupAlert({
  userId,
  email,
  firstName,
  lastName,
  timezone,
  providers,
}: SignupAlertArgs): Promise<void> {
  if (!alertEmail) return;

  if (!resendClient) {
    logger.warn({
      event: "signup_alert.skipped",
      reason: "missing_resend_key",
    });
    return;
  }

  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  const providerText = providers.length ? providers.join(", ") : "unknown";
  const signedUpAt = new Date().toISOString();

  try {
    await resendClient.emails.send({
      from: fromAddress,
      to: alertEmail,
      subject: `New PointsGeek signup: ${displayName}`,
      html: `
<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827;">
    <h1 style="font-size: 18px; margin: 0 0 16px;">New PointsGeek signup</h1>
    <table cellpadding="0" cellspacing="0" style="font-size: 14px; line-height: 1.5;">
      <tr><td style="font-weight: 600; padding-right: 12px;">Name</td><td>${escapeHtml(displayName)}</td></tr>
      <tr><td style="font-weight: 600; padding-right: 12px;">Email</td><td>${escapeHtml(email ?? "unknown")}</td></tr>
      <tr><td style="font-weight: 600; padding-right: 12px;">User ID</td><td>${escapeHtml(userId)}</td></tr>
      <tr><td style="font-weight: 600; padding-right: 12px;">Provider</td><td>${escapeHtml(providerText)}</td></tr>
      <tr><td style="font-weight: 600; padding-right: 12px;">Timezone</td><td>${escapeHtml(timezone)}</td></tr>
      <tr><td style="font-weight: 600; padding-right: 12px;">Completed</td><td>${escapeHtml(signedUpAt)}</td></tr>
    </table>
  </body>
</html>`.trim(),
      text: [
        "New PointsGeek signup",
        "",
        `Name: ${displayName}`,
        `Email: ${email ?? "unknown"}`,
        `User ID: ${userId}`,
        `Provider: ${providerText}`,
        `Timezone: ${timezone}`,
        `Completed: ${signedUpAt}`,
      ].join("\n"),
    });

    logger.info({
      event: "signup_alert.sent",
      userId,
      email,
      providers,
    });
  } catch (err) {
    logger.warn({
      event: "signup_alert.failed",
      userId,
      email,
      error: String(err),
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
