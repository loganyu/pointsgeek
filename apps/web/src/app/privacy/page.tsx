import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export const metadata: Metadata = {
  title: "Privacy Policy — PointsGeek",
  description:
    "How PointsGeek collects, uses, and shares information when you use our website, browser extension, and related services.",
};

/**
 * Public privacy policy for PointsGeek and the PointsGeek browser
 * extension.
 *
 * Tone and structure follow standard fintech-product privacy policies
 * (Card Pointers, PointsPath, Capital One, Gondola). Importantly:
 *
 *  - We commit to a few specific technical truths that hold regardless
 *    of future product direction (no bank passwords; no full card
 *    numbers; HTTPS-only). These are architectural and Chrome Web
 *    Store reviewers expect to see them clearly stated.
 *
 *  - For everything else, the policy uses standard "we may" language
 *    so future product/monetization choices (marketing emails,
 *    aggregated reporting, business partners, etc.) don't require a
 *    contract-breaking rewrite. Any genuinely material change still
 *    requires a Section 13 update + new effective date.
 *
 *  - Contact channels intentionally reference "the contact methods
 *    listed on our website" rather than a specific inbox so we can
 *    add or change those methods over time without rewriting the
 *    policy. The Chrome Web Store listing surfaces the developer
 *    account email as the public contact.
 *
 * Bump EFFECTIVE_DATE whenever a substantive change ships and call
 * out the change in Section 13. Do not backdate.
 */
const EFFECTIVE_DATE = "May 9, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-text-primary">
      <MarketingHeader />
      <main className="max-w-[760px] mx-auto px-12 pt-[72px] pb-24">
        <div className="pg-eyebrow mb-3">Legal</div>
        <h1
          className="text-text-primary"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 48,
            fontWeight: 500,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
          }}
        >
          Privacy policy
        </h1>
        <p
          className="text-text-tertiary"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            margin: "0 0 40px",
          }}
        >
          Effective {EFFECTIVE_DATE}
        </p>

        <Prose>
          <p>
            This Privacy Policy describes how PointsGeek
            (&ldquo;PointsGeek,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;) collects, uses, shares, and protects information
            when you use our website at{" "}
            <a href="https://pointsgeek.xyz">pointsgeek.xyz</a>, the
            PointsGeek browser extension, and any related products,
            features, or services (collectively, the &ldquo;Services&rdquo;).
            By using the Services, you agree to the practices described in
            this Policy.
          </p>
          <p>
            If you have questions about this Policy or our practices, please
            see the &ldquo;Contact Us&rdquo; section at the end.
          </p>

          <H2>1. Information We Collect</H2>

          <H3>1.1 Information you provide to us</H3>
          <p>We collect information you provide directly, including:</p>
          <ul>
            <li>
              <strong>Account information:</strong> when you create an account
              or sign in, we receive your name, email address, and (where
              provided) a profile image, either from the third-party identity
              provider you use to sign in (such as Google) or from information
              you submit directly.
            </li>
            <li>
              <strong>Communications:</strong> messages, feedback, support
              requests, or other information you send us, including any
              attachments and contact information.
            </li>
            <li>
              <strong>Preferences:</strong> settings you configure within the
              Services.
            </li>
          </ul>

          <H3>1.2 Information collected through the browser extension</H3>
          <p>
            The PointsGeek browser extension allows you to view your loyalty
            and rewards balances in a single dashboard. When you visit a
            supported financial website while signed in to that website and to
            the extension, the extension may collect:
          </p>
          <ul>
            <li>Loyalty program balances (such as points or miles)</li>
            <li>
              Loyalty program names, identifiers, and currency types (e.g.,
              &ldquo;Membership Rewards,&rdquo; &ldquo;SkyMiles&rdquo;)
            </li>
            <li>
              Credit card metadata where the site displays it, including
              issuer, product name, last four digits of a card, and card-art
              image URLs
            </li>
            <li>
              Loyalty membership numbers, used to identify and group balances
              tied to the same loyalty account across visits
            </li>
            <li>Cardholder display names where shown on the page</li>
            <li>
              Sync timestamps, the supported domain that produced a sync, and
              status information (success, failure, error codes)
            </li>
          </ul>
          <p>
            The extension transmits this information over an encrypted (HTTPS)
            connection to PointsGeek so it can be associated with your account
            and displayed on your dashboard.
          </p>

          <H3>1.3 Information collected automatically</H3>
          <p>
            When you use the Services, we and our service providers may
            automatically collect:
          </p>
          <ul>
            <li>
              <strong>Usage information:</strong> pages or screens viewed,
              features used, actions taken, time spent, and similar engagement
              data.
            </li>
            <li>
              <strong>Device and technical information:</strong> browser type
              and version, operating system, device identifiers, screen size,
              language, and time zone.
            </li>
            <li>
              <strong>Log information:</strong> IP address, access times, and
              diagnostic information about requests and errors.
            </li>
            <li>
              <strong>Cookies and similar technologies:</strong> see
              &ldquo;Cookies and Similar Technologies&rdquo; below.
            </li>
          </ul>

          <H3>1.4 Information from third parties</H3>
          <p>
            We may receive information about you from third parties, such as
            identity providers (when you sign in with Google), email delivery
            providers, hosting providers, and analytics providers, in
            connection with their respective services.
          </p>

          <H2>2. Information We Do Not Collect</H2>
          <p>
            The PointsGeek extension is designed to operate within your
            existing logged-in browser sessions. It does not:
          </p>
          <ul>
            <li>
              Read, store, or transmit your bank, airline, hotel, or other
              third-party site passwords;
            </li>
            <li>
              Read, store, or transmit authentication cookies, session tokens,
              or similar credentials from third-party sites;
            </li>
            <li>
              Read, store, or transmit full credit card numbers, CVVs, bank
              account numbers, or similar payment instrument data;
            </li>
            <li>
              Operate on websites outside the supported financial domains
              listed in the extension&rsquo;s manifest.
            </li>
          </ul>
          <p>
            We may add support for additional domains or data types over time.
            Material changes will be reflected in this Policy.
          </p>

          <H2>3. How We Use Information</H2>
          <p>We may use the information we collect to:</p>
          <ul>
            <li>Provide, operate, maintain, secure, and improve the Services;</li>
            <li>
              Authenticate users, prevent fraud, and protect the security and
              integrity of the Services and our users;
            </li>
            <li>
              Display your aggregated balances and related information on your
              dashboard;
            </li>
            <li>
              Communicate with you, including by sending sign-in codes,
              service updates, security alerts, transactional notices, and
              responses to your inquiries;
            </li>
            <li>
              Send you news, marketing, promotional materials, and other
              information about PointsGeek, our products, our affiliates, and
              third parties we believe may be of interest to you (you may opt
              out at any time as described in &ldquo;Your Choices&rdquo;);
            </li>
            <li>
              Personalize and customize the Services, including suggesting
              features, programs, partners, or content that may be relevant to
              you;
            </li>
            <li>
              Perform research, analytics, statistical analysis, and product
              development;
            </li>
            <li>
              Create aggregated, de-identified, or anonymized data that cannot
              reasonably be used to identify you, and use that data for any
              lawful purpose;
            </li>
            <li>
              Comply with legal obligations, enforce our agreements, and
              respond to lawful requests; and
            </li>
            <li>
              Carry out any other purpose described to you at the time the
              information is collected or with your consent.
            </li>
          </ul>

          <H2>4. How We Share Information</H2>
          <p>We may share information in the following circumstances:</p>

          <H3>4.1 Service providers</H3>
          <p>
            We share information with third parties that perform services on
            our behalf, such as cloud hosting, database hosting,
            authentication, email delivery, analytics, error reporting, fraud
            prevention, and customer support. These providers are required to
            handle information consistent with our instructions and applicable
            law.
          </p>

          <H3>4.2 Aggregated or de-identified information</H3>
          <p>
            We may share aggregated, de-identified, or anonymized information
            that cannot reasonably be used to identify you for any purpose,
            including for research, analytics, marketing, advertising,
            industry reporting, partnership opportunities, and commercial use.
          </p>

          <H3>4.3 Business partners</H3>
          <p>
            We may share information with business partners, affiliates, or
            other organizations to offer co-branded experiences, promotions,
            integrations, or joint products and services, consistent with
            this Policy and applicable law.
          </p>

          <H3>4.4 Legal and safety</H3>
          <p>
            We may disclose information when we believe in good faith that
            disclosure is necessary to: (i) comply with applicable law,
            regulation, legal process, or governmental request; (ii) enforce
            our terms or other agreements; (iii) detect, prevent, or address
            fraud, security, or technical issues; or (iv) protect the rights,
            property, or safety of PointsGeek, our users, or others.
          </p>

          <H3>4.5 Business transfers</H3>
          <p>
            We may transfer or disclose information in connection with a
            merger, acquisition, financing, reorganization, sale of all or a
            portion of our assets, bankruptcy, or other change-of-control
            transaction, or in contemplation of such a transaction.
          </p>

          <H3>4.6 With your direction or consent</H3>
          <p>
            We may share information with other parties when you direct us to
            or otherwise consent to the sharing.
          </p>

          <H2>5. Cookies and Similar Technologies</H2>
          <p>
            We and our service providers use cookies, local storage,
            extension storage, and similar technologies to operate and improve
            the Services, remember your preferences, keep you signed in,
            secure your session, understand how the Services are used, and
            for analytics and marketing purposes. Most browsers allow you to
            control cookies through their settings; restricting cookies may
            affect the functionality of the Services.
          </p>

          <H2>6. Your Choices</H2>
          <ul>
            <li>
              <strong>Account information:</strong> you may review and update
              certain account information through your account settings.
            </li>
            <li>
              <strong>Marketing communications:</strong> if you receive
              marketing communications from us, you may opt out by following
              the unsubscribe instructions in those communications or by
              contacting us. You may continue to receive transactional or
              service-related messages.
            </li>
            <li>
              <strong>Cookies:</strong> you may configure your browser to
              refuse or delete cookies; certain features may not function as
              intended without them.
            </li>
            <li>
              <strong>Account deletion:</strong> you may request deletion of
              your account and associated information using the methods
              described in Section 9.
            </li>
          </ul>

          <H2>7. Children</H2>
          <p>
            The Services are not directed at children under 13 (or the
            equivalent minimum age in your jurisdiction), and we do not
            knowingly collect personal information from children. If you
            believe a child has provided us with personal information, please
            contact us and we will take appropriate steps to remove it.
          </p>

          <H2>8. Security</H2>
          <p>
            We use commercially reasonable administrative, technical, and
            physical safeguards designed to protect information, including
            HTTPS encryption in transit, encryption at rest, hashed
            authentication tokens, and access controls. No method of
            transmission or storage is completely secure, and we cannot
            guarantee absolute security. You are responsible for keeping your
            account credentials confidential.
          </p>

          <H2>9. Data Retention and Deletion</H2>
          <p>
            We retain personal information for as long as necessary to provide
            the Services, fulfill the purposes described in this Policy, and
            comply with our legal obligations. Retention periods may vary
            depending on the type of information and the purpose for which it
            is processed. You may request deletion of your account and
            associated information by emailing us at{" "}
            <a href="mailto:pointsgeekxyz@gmail.com">
              pointsgeekxyz@gmail.com
            </a>{" "}
            from the email address associated with your account. We may
            retain certain information after deletion as permitted or
            required by law, including for fraud prevention, dispute
            resolution, security, and recordkeeping purposes.
          </p>

          <H2>10. Third-Party Services</H2>
          <p>
            The Services may interact with, link to, or rely on third-party
            websites, applications, or services (including the financial
            websites the extension reads from, identity providers used for
            sign-in, and other partner services). We are not responsible for
            the privacy practices of those third parties. Their use of your
            information is governed by their own privacy policies and terms.
          </p>

          <H2>11. International Users</H2>
          <p>
            PointsGeek is operated from the United States. If you access the
            Services from outside the United States, you understand that your
            information may be transferred to, stored in, and processed in
            the United States and other jurisdictions where our service
            providers operate, and that data protection laws in those
            jurisdictions may differ from those in your country.
          </p>

          <H2>12. Your Rights</H2>
          <p>
            Depending on where you live, applicable law (such as the
            California Consumer Privacy Act/CPRA, the EU General Data
            Protection Regulation, or other state and national privacy laws)
            may give you rights to access, correct, update, port, restrict,
            or delete personal information about you, to opt out of certain
            uses or disclosures, or to lodge a complaint with a data
            protection authority. To exercise any rights you may have, please
            contact us at{" "}
            <a href="mailto:pointsgeekxyz@gmail.com">
              pointsgeekxyz@gmail.com
            </a>
            . We may request information sufficient to verify your identity
            before acting on a request.
          </p>

          <H2>13. Changes to This Policy</H2>
          <p>
            We may update this Privacy Policy from time to time. When we make
            material changes, we will update the &ldquo;Effective&rdquo; date
            at the top of this page and may provide additional notice (such
            as by email or in-product announcement). Your continued use of
            the Services after any update constitutes your acceptance of the
            updated Policy.
          </p>

          <H2>14. Contact Us</H2>
          <p>
            If you have questions or concerns about this Privacy Policy or
            our practices, please email us at{" "}
            <a href="mailto:pointsgeekxyz@gmail.com">
              pointsgeekxyz@gmail.com
            </a>
            . You may also reach the developer of the PointsGeek browser
            extension through the contact information displayed on the
            extension&rsquo;s listing in your browser&rsquo;s extension store.
          </p>
          <p>
            For our terms of service, see our{" "}
            <Link href="/terms">Terms of Service</Link>.
          </p>
        </Prose>
      </main>
      <MarketingFooter />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Small typography helpers — kept inline so the policy reads as one
// continuous document at the file level. Not exported; nothing else
// in the app uses this prose-block pattern (the dashboard uses Tailwind
// utility classes directly), so a one-off scope is fine.
// ─────────────────────────────────────────────────────────────────

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="prose-pg"
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: 16,
        lineHeight: 1.7,
        color: "var(--text-secondary)",
      }}
    >
      <style>{`
        .prose-pg p { margin: 0 0 18px; }
        .prose-pg ul { margin: 0 0 22px; padding-left: 22px; }
        .prose-pg li { margin: 6px 0; }
        .prose-pg li > ul { margin: 6px 0; }
        .prose-pg strong { color: var(--text-primary); font-weight: 600; }
        .prose-pg a { color: var(--purple-deep); text-decoration: underline; text-underline-offset: 2px; }
        .prose-pg a:hover { color: var(--purple-darkest); }
        .dark .prose-pg a { color: var(--purple-tint); }
      `}</style>
      {children}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-text-primary"
      style={{
        fontFamily: "var(--font-serif)",
        fontSize: 24,
        fontWeight: 500,
        lineHeight: 1.2,
        letterSpacing: "-0.015em",
        margin: "40px 0 14px",
      }}
    >
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-text-primary"
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: 16,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        margin: "20px 0 8px",
      }}
    >
      {children}
    </h3>
  );
}
