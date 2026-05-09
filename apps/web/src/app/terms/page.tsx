import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export const metadata: Metadata = {
  title: "Terms of Service — PointsGeek",
  description:
    "The terms governing your use of the PointsGeek website, browser extension, and related services.",
};

/**
 * Terms of Service for PointsGeek and the PointsGeek browser extension.
 *
 * Modeled on standard fintech-product Terms (PointsPath, Capital One,
 * Gondola). Boilerplate-style sections cover eligibility, acceptable
 * use, IP ownership, third-party-service disclaimers (this matters
 * since the whole product reads from third-party financial sites),
 * the AS-IS warranty disclaimer, and the limitation of liability and
 * indemnification clauses that downstream investors / partners
 * expect to see.
 *
 * Governing-law section uses California by default — common for
 * Delaware-incorporated US software companies. Update before public
 * launch if PointsGeek is incorporated/operated elsewhere.
 *
 * Bump EFFECTIVE_DATE whenever a substantive change ships and call
 * out the change in Section 16. Do not backdate.
 */
const EFFECTIVE_DATE = "May 9, 2026";

export default function TermsPage() {
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
          Terms of Service
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
            These Terms of Service (the &ldquo;Terms&rdquo;) form a binding
            agreement between you and PointsGeek (&ldquo;PointsGeek,&rdquo;
            &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) and
            govern your access to and use of the PointsGeek website at{" "}
            <a href="https://pointsgeek.xyz">pointsgeek.xyz</a>, the
            PointsGeek browser extension, and any related products,
            features, or services (collectively, the &ldquo;Services&rdquo;).
            By accessing or using the Services, you agree to be bound by
            these Terms and our{" "}
            <Link href="/privacy">Privacy Policy</Link>. If you do not agree,
            do not use the Services.
          </p>

          <H2>1. Eligibility</H2>
          <p>
            You must be at least 13 years old (or the equivalent minimum age
            in your jurisdiction) to use the Services. By using the Services,
            you represent that you meet these requirements and that you have
            the legal capacity to enter into these Terms. If you are using
            the Services on behalf of an organization, you represent that you
            have authority to bind that organization to these Terms, and
            references to &ldquo;you&rdquo; include both you and that
            organization.
          </p>

          <H2>2. Accounts</H2>
          <p>
            You may need to create an account to use certain features of the
            Services. You agree to provide accurate, complete, and current
            information; to maintain the security and confidentiality of your
            account credentials; and to be responsible for all activity that
            occurs under your account. You agree to notify us promptly of any
            unauthorized use of your account.
          </p>

          <H2>3. The Browser Extension</H2>
          <p>
            The PointsGeek browser extension reads loyalty and rewards
            balance information from supported financial websites at which
            you are independently logged in, and transmits that information
            to PointsGeek so it can be displayed in your dashboard. The
            extension does not access bank passwords, full payment card
            numbers, or other credentials.
          </p>
          <p>
            You acknowledge and agree that:
          </p>
          <ul>
            <li>
              You are solely responsible for your use of, and your
              relationship with, the third-party websites the extension
              interacts with, including compliance with their terms of
              service.
            </li>
            <li>
              The accuracy and availability of balance information depends on
              the third-party websites and is provided &ldquo;as is.&rdquo;
              Programs may change their websites, APIs, or terms at any time,
              which may affect the extension&rsquo;s ability to read or
              display balances.
            </li>
            <li>
              The list of supported programs and the data the extension reads
              may change over time. We may add, remove, or modify supported
              programs at our discretion.
            </li>
          </ul>

          <H2>4. Acceptable Use</H2>
          <p>You agree not to:</p>
          <ul>
            <li>
              Use the Services for any unlawful purpose or in violation of
              any applicable law, regulation, or third-party right;
            </li>
            <li>
              Interfere with, disrupt, or place an unreasonable load on the
              Services or any servers, networks, or systems used to provide
              them;
            </li>
            <li>
              Attempt to gain unauthorized access to any portion of the
              Services, other accounts, or related systems;
            </li>
            <li>
              Probe, scan, reverse-engineer, decompile, disassemble, or
              otherwise attempt to derive the source code of the Services,
              except as expressly permitted by law;
            </li>
            <li>
              Use the Services to send spam or unsolicited messages;
            </li>
            <li>
              Use any robot, scraper, data-mining tool, or similar automated
              means to access or extract data from the Services, except as
              expressly authorized by us;
            </li>
            <li>
              Misrepresent your identity or affiliation, or use another
              person&rsquo;s account or credentials without authorization;
              and
            </li>
            <li>
              Use the Services in any manner that could damage, disable,
              overburden, or impair the Services or interfere with any other
              party&rsquo;s use of the Services.
            </li>
          </ul>

          <H2>5. License to Use the Services</H2>
          <p>
            Subject to these Terms, we grant you a limited, non-exclusive,
            non-transferable, non-sublicensable, revocable license to access
            and use the Services for your personal, non-commercial use. We
            reserve all rights not expressly granted.
          </p>

          <H2>6. Intellectual Property</H2>
          <p>
            The Services, including all software, text, graphics, logos,
            designs, and other content (excluding third-party content and
            user-supplied information), are owned by PointsGeek or its
            licensors and are protected by intellectual property laws. The
            PointsGeek name, logo, and related marks are trademarks of
            PointsGeek. You may not use them without our prior written
            permission.
          </p>
          <p>
            All third-party trademarks, service marks, logos, and trade names
            referenced in the Services are the property of their respective
            owners. Their appearance in the Services does not imply any
            sponsorship, endorsement, or affiliation.
          </p>

          <H2>7. Feedback</H2>
          <p>
            If you provide us with feedback, suggestions, or ideas about the
            Services, you grant us a worldwide, perpetual, irrevocable,
            royalty-free, sublicensable, and transferable license to use,
            reproduce, modify, and incorporate that feedback for any purpose
            without obligation to you.
          </p>

          <H2>8. Third-Party Services</H2>
          <p>
            The Services may interact with, link to, or depend on third-party
            websites, applications, APIs, or services, including the
            financial websites the extension reads from, identity providers,
            email delivery services, hosting services, and others. We do not
            control these third parties and are not responsible for their
            content, availability, accuracy, terms, or privacy practices.
            Your use of any third-party service is at your own risk and
            governed by the terms and policies of that third party.
          </p>

          <H2>9. Privacy</H2>
          <p>
            Our collection and use of information about you is described in
            our <Link href="/privacy">Privacy Policy</Link>, which is
            incorporated into these Terms by reference.
          </p>

          <H2>10. Modifications to the Services and Terms</H2>
          <p>
            We may modify, suspend, or discontinue any part of the Services
            at any time, with or without notice. We may also update these
            Terms from time to time. When we make material changes, we will
            update the &ldquo;Effective&rdquo; date at the top of this page
            and may provide additional notice. Your continued use of the
            Services after any update constitutes your acceptance of the
            updated Terms.
          </p>

          <H2>11. Termination</H2>
          <p>
            You may stop using the Services at any time and may delete your
            account through the methods made available within the Services
            or as described on our website. We may suspend or terminate your
            access to the Services, with or without notice, for any reason,
            including if we believe you have violated these Terms or
            applicable law, or to protect the Services, our users, or third
            parties.
          </p>
          <p>
            Provisions that by their nature should survive termination will
            survive, including ownership provisions, warranty disclaimers,
            indemnity, and limitations of liability.
          </p>

          <H2>12. No Financial Advice</H2>
          <p>
            The Services are provided for informational and personal-finance
            convenience purposes only. Nothing in the Services constitutes
            financial, investment, tax, accounting, legal, or other
            professional advice. Loyalty program balances and related
            information are derived from third-party websites and may be
            inaccurate, out of date, or incomplete. You are solely responsible
            for verifying balances and any decisions you make based on the
            Services.
          </p>

          <H2>13. Disclaimers</H2>
          <p>
            THE SERVICES ARE PROVIDED ON AN &ldquo;AS IS&rdquo; AND
            &ldquo;AS AVAILABLE&rdquo; BASIS, WITHOUT WARRANTIES OF ANY
            KIND, EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW,
            POINTSGEEK DISCLAIMS ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES
            OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
            NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICES WILL BE
            UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF VIRUSES OR OTHER
            HARMFUL COMPONENTS, OR THAT ANY DATA OR BALANCES DISPLAYED
            THROUGH THE SERVICES WILL BE ACCURATE, COMPLETE, OR CURRENT.
          </p>

          <H2>14. Limitation of Liability</H2>
          <p>
            TO THE FULLEST EXTENT PERMITTED BY LAW, POINTSGEEK AND ITS
            OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, AND SUPPLIERS WILL NOT BE
            LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
            PUNITIVE, OR EXEMPLARY DAMAGES, OR ANY LOSS OF PROFITS, REVENUE,
            DATA, GOODWILL, OR LOYALTY-PROGRAM BALANCES OR REWARDS, WHETHER
            BASED IN CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR
            OTHERWISE, ARISING OUT OF OR RELATED TO YOUR USE OF, OR INABILITY
            TO USE, THE SERVICES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
            DAMAGES.
          </p>
          <p>
            TO THE FULLEST EXTENT PERMITTED BY LAW, POINTSGEEK&rsquo;S TOTAL
            CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS OR
            THE SERVICES WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU
            PAID TO POINTSGEEK FOR THE SERVICES IN THE TWELVE (12) MONTHS
            BEFORE THE EVENT GIVING RISE TO THE LIABILITY OR (B) ONE HUNDRED
            U.S. DOLLARS (US$100). SOME JURISDICTIONS DO NOT ALLOW THE
            EXCLUSION OR LIMITATION OF CERTAIN DAMAGES; IN THOSE
            JURISDICTIONS, OUR LIABILITY IS LIMITED TO THE GREATEST EXTENT
            PERMITTED.
          </p>

          <H2>15. Indemnification</H2>
          <p>
            You agree to indemnify, defend, and hold harmless PointsGeek and
            its officers, directors, employees, agents, and affiliates from
            and against any claims, losses, damages, liabilities, costs, and
            expenses (including reasonable attorneys&rsquo; fees) arising
            out of or related to: (i) your use of the Services; (ii) your
            violation of these Terms; (iii) your violation of any law or
            third-party right, including any third-party website&rsquo;s
            terms of service; or (iv) any content or information you submit
            through the Services.
          </p>

          <H2>16. Governing Law and Dispute Resolution</H2>
          <p>
            These Terms are governed by the laws of the State of California,
            United States, without regard to its conflict-of-laws principles.
            Subject to the following sentence, you and PointsGeek agree to
            the exclusive jurisdiction of the state and federal courts
            located in San Francisco County, California, for any dispute not
            subject to arbitration or small-claims court. To the extent
            permitted by law, any dispute arising out of or related to these
            Terms or the Services may, at the election of either party, be
            resolved by binding individual arbitration administered by a
            recognized arbitration provider; class actions and class
            arbitrations are not permitted.
          </p>

          <H2>17. Changes to These Terms</H2>
          <p>
            We may update these Terms from time to time. When we make
            material changes, we will update the &ldquo;Effective&rdquo;
            date above and may provide additional notice. Your continued use
            of the Services after the effective date of any update
            constitutes your acceptance of the updated Terms.
          </p>

          <H2>18. Miscellaneous</H2>
          <ul>
            <li>
              <strong>Entire agreement.</strong> These Terms and our Privacy
              Policy constitute the entire agreement between you and
              PointsGeek regarding the Services and supersede any prior
              agreements.
            </li>
            <li>
              <strong>Severability.</strong> If any provision of these Terms
              is held to be invalid or unenforceable, that provision will be
              limited or eliminated to the minimum extent necessary, and the
              remaining provisions will continue in full force.
            </li>
            <li>
              <strong>No waiver.</strong> Our failure to enforce any right
              or provision of these Terms is not a waiver of that right or
              provision.
            </li>
            <li>
              <strong>Assignment.</strong> You may not assign these Terms
              without our prior written consent. We may assign these Terms
              freely.
            </li>
            <li>
              <strong>Notices.</strong> We may provide notices to you by
              email, in-product notice, or by posting them on the Services.
              You may provide notices to us by emailing{" "}
              <a href="mailto:pointsgeekxyz@gmail.com">
                pointsgeekxyz@gmail.com
              </a>
              .
            </li>
          </ul>

          <H2>19. Contact Us</H2>
          <p>
            If you have questions about these Terms, please email us at{" "}
            <a href="mailto:pointsgeekxyz@gmail.com">
              pointsgeekxyz@gmail.com
            </a>
            .
          </p>
        </Prose>
      </main>
      <MarketingFooter />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Same Prose / H2 / H3 helpers as /privacy. Kept inline rather than
// extracted to a shared module because (a) only these two pages need
// them today, and (b) any future legal page would copy the pattern
// rather than diverge — duplication of ~50 lines beats coupling two
// independently-maintained legal documents through a shared
// component file. Revisit if a third long-form prose page appears.
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
