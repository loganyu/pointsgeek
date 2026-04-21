/**
 * Per-page sync status widget.
 *
 * Rendered inside a Shadow DOM host so the bank's CSS can't mess with
 * its layout. Singleton — each content-script run drives the exported
 * `syncWidget` instance through a small state machine:
 *
 *   syncWidget.start({ label: "Chase" })   → "Syncing…" pill, bottom-right
 *   syncWidget.success("3 balances")       → green check, auto-fades ~2.5s
 *   syncWidget.fail({ code, message })     → red dot, persistent, click
 *                                             expands to detail + actions
 *
 * No persistence across navigation yet — a page reload drops the widget.
 * Phase 4 will add a "Report" button in the expanded failed state that
 * ships a redacted DOM subtree back to our API.
 */

/**
 * Web app base URL. Kept in sync with the other copies in
 * `lib/api.ts`, `lib/auth-flow.ts`, and `entrypoints/popup/App.tsx`.
 * When we move off localhost, replace all four in one pass.
 */
const WEB_BASE = "http://localhost:3000";

type WidgetState = "idle" | "syncing" | "success" | "failed";

interface WidgetContext {
  /** Display name shown next to the spinner, e.g. "Chase". */
  label: string;
}

interface FailureDetail {
  code?: string;
  message?: string;
}

class SyncWidget {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private state: WidgetState = "idle";
  private ctx: WidgetContext | null = null;
  private lastFailure: FailureDetail | null = null;
  private autoHideTimer: number | null = null;

  start(ctx: WidgetContext) {
    this.ctx = ctx;
    this.mount();
    this.state = "syncing";
    this.render();
  }

  success(summary?: string) {
    if (!this.host) this.mount();
    this.state = "success";
    this.lastFailure = null;
    this.render(summary);
    this.clearTimer();
    // 5s dwell — long enough to notice the pill land before it fades.
    this.autoHideTimer = window.setTimeout(() => this.destroy(), 5000);
  }

  fail(error: FailureDetail) {
    this.lastFailure = error;
    if (!this.host) this.mount();
    this.state = "failed";
    this.render();
    this.clearTimer();
  }

  destroy() {
    this.clearTimer();
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.state = "idle";
    this.ctx = null;
    this.lastFailure = null;
  }

  private clearTimer() {
    if (this.autoHideTimer !== null) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }

  private mount() {
    if (this.host) return;
    // Document body isn't guaranteed before DOMContentLoaded. Content
    // scripts default to `document_idle` so body should exist, but be
    // defensive — swallow the widget rather than crashing the scrape.
    if (!document.body) return;
    this.host = document.createElement("div");
    this.host.id = "pg-sync-widget-host";
    // `all: initial` scopes away any inherited host-page rules; the
    // positioning lives here (outside the shadow) because the host is
    // the stacking context anchor.
    this.host.style.cssText = [
      "all: initial",
      "position: fixed",
      "z-index: 2147483647",
      "bottom: 20px",
      "right: 20px",
    ].join("; ");
    document.body.appendChild(this.host);
    this.shadow = this.host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = WIDGET_CSS;
    this.shadow.appendChild(style);

    const container = document.createElement("div");
    container.className = "pg-widget";
    this.shadow.appendChild(container);
  }

  private render(summary?: string) {
    if (!this.shadow) return;
    const container = this.shadow.querySelector<HTMLElement>(".pg-widget");
    if (!container) return;
    container.setAttribute("data-state", this.state);
    container.textContent = ""; // clear

    if (this.state === "syncing") {
      container.appendChild(
        this.renderPill("spinner", `Syncing ${this.ctx?.label ?? ""}…`)
      );
      return;
    }

    if (this.state === "success") {
      const pill = this.renderPill("check", summary ?? "Synced", {
        url: `${WEB_BASE}/dashboard`,
        text: "View Balances here",
      });
      pill.classList.add("pg-widget__pill--success");
      container.appendChild(pill);
      return;
    }

    if (this.state === "failed") {
      // Jump straight to the detail panel on failure — don't make the
      // user click a compact pill to see what went wrong. The pill is
      // the "first popup" used by syncing/success; the panel is the
      // "second popup" with the error title + message + actions.
      container.appendChild(this.renderFailurePanel());
    }
  }

  /**
   * Inline lockup: brand tile + "PointsGeek" wordmark ("Geek" in
   * aubergine accent, matching the web app's `Wordmark` component).
   * The SVG is inlined so we don't need to declare the icon as a
   * `web_accessible_resource` just to render it inside a content script.
   */
  private renderBrand(): HTMLElement {
    const brand = document.createElement("span");
    brand.className = "pg-widget__brand";
    brand.innerHTML = `
      <span class="pg-widget__brand-icon" aria-hidden="true">${BRAND_ICON_SVG}</span>
      <span class="pg-widget__brand-text">Points<span class="pg-widget__brand-accent">Geek</span></span>
    `;
    return brand;
  }

  private renderPill(
    icon: "spinner" | "check" | "cross",
    label: string,
    link?: { url: string; text: string }
  ): HTMLElement {
    const pill = document.createElement("div");
    pill.className = "pg-widget__pill";

    // Row 1: brand lockup on the left, close button on the right.
    const header = document.createElement("div");
    header.className = "pg-widget__row pg-widget__row--header";
    header.appendChild(this.renderBrand());
    header.appendChild(this.renderCloseButton());
    pill.appendChild(header);

    // Row 2: status icon + sync label (+ optional trailing link).
    const status = document.createElement("div");
    status.className = "pg-widget__row pg-widget__row--status";

    const iconEl = document.createElement("span");
    iconEl.className = `pg-widget__icon pg-widget__icon--${icon}`;
    status.appendChild(iconEl);

    const labelEl = document.createElement("span");
    labelEl.className = "pg-widget__label";
    labelEl.textContent = label;
    if (link) {
      labelEl.appendChild(document.createTextNode(" · "));
      const linkEl = document.createElement("a");
      linkEl.href = link.url;
      linkEl.target = "_blank";
      linkEl.rel = "noreferrer";
      linkEl.className = "pg-widget__link";
      linkEl.textContent = link.text;
      labelEl.appendChild(linkEl);
    }
    status.appendChild(labelEl);

    pill.appendChild(status);

    return pill;
  }

  private renderCloseButton(): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "pg-widget__close";
    btn.type = "button";
    btn.setAttribute("aria-label", "Dismiss");
    btn.innerHTML = `<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
    btn.addEventListener("click", (e) => {
      // Stop the pill's expand/collapse click from firing when the close
      // button sits inside a clickable (failed) pill.
      e.stopPropagation();
      this.destroy();
    });
    return btn;
  }

  private renderFailurePanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "pg-widget__panel pg-widget__panel--failed";

    // Row 1: brand lockup + close × — matches the pill's header so the
    // dismiss affordance stays in the same place across states.
    const header = document.createElement("div");
    header.className = "pg-widget__row pg-widget__row--header";
    header.appendChild(this.renderBrand());
    header.appendChild(this.renderCloseButton());
    panel.appendChild(header);

    // Title row: red × icon + "{label} points sync failed". The icon
    // replaces the old red-pill status — users still get the urgent
    // red glyph, just inline with the title now that the pill is gone.
    const title = document.createElement("div");
    title.className = "pg-widget__panel-title";
    const titleIcon = document.createElement("span");
    titleIcon.className = "pg-widget__icon pg-widget__icon--cross";
    title.appendChild(titleIcon);
    const titleText = document.createElement("span");
    titleText.textContent = `${this.ctx?.label ?? "Sync"} points sync failed`;
    title.appendChild(titleText);
    panel.appendChild(title);

    // Single user-facing copy across every provider. The technical
    // `code`/`message` on `this.lastFailure` is still captured — Phase 4
    // will ship those (plus a redacted DOM subtree) in the Report payload.
    const msg = document.createElement("div");
    msg.className = "pg-widget__panel-message";
    msg.textContent = "Please report issue to help us fix this";
    panel.appendChild(msg);

    const actions = document.createElement("div");
    actions.className = "pg-widget__panel-actions";

    // Report button is a placeholder for Phase 4 — wire it up then.
    const reportBtn = document.createElement("button");
    reportBtn.className = "pg-widget__btn pg-widget__btn--primary";
    reportBtn.textContent = "Report issue";
    reportBtn.disabled = true;
    reportBtn.title = "Coming soon";
    actions.appendChild(reportBtn);

    panel.appendChild(actions);
    return panel;
  }
}

/** Inlined copy of `apps/web/public/brand/icon.svg` — keep in sync. */
const BRAND_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="pg-w-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a68ce0"/><stop offset="1" stop-color="#6b4a9e"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#pg-w-tile)"/><path d="M32 10 Q24 16 28 22" fill="none" stroke="#f0ede6" stroke-width="1.8" stroke-linecap="round" opacity="0.85"/><rect x="14" y="20" width="36" height="34" rx="4" fill="#f0ede6"/><circle cx="32" cy="26" r="2.6" fill="#6b4a9e"/><rect x="19" y="35" width="26" height="2.4" rx="1" fill="#4a2f85"/><rect x="19" y="40" width="16" height="2.4" rx="1" fill="#4a2f85" opacity="0.7"/><rect x="19" y="45" width="20" height="2.4" rx="1" fill="#4a2f85" opacity="0.55"/></svg>`;

const WIDGET_CSS = `
:host, *, *::before, *::after {
  box-sizing: border-box;
}

.pg-widget {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.35;
  color: #22201d;
}

.pg-widget__pill {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #ffffff;
  border: 1px solid #e3ded3;
  border-radius: 10px;
  padding: 12px 14px;
  min-width: 220px;
  box-shadow: 0 4px 14px rgba(34, 32, 29, 0.12);
  transition: transform 150ms ease-out, border-color 150ms ease-out;
  animation: pg-widget-enter 180ms cubic-bezier(0.2, 0, 0, 1);
}

.pg-widget__pill[role="button"] {
  cursor: pointer;
}

.pg-widget__pill[role="button"]:hover {
  transform: translateY(-1px);
}

.pg-widget__pill--success {
  border-color: #16a34a;
}

.pg-widget__pill--failed {
  border-color: #dc2626;
}

.pg-widget__row {
  display: flex;
  align-items: center;
}

.pg-widget__row--header {
  justify-content: space-between;
  gap: 10px;
}

.pg-widget__row--status {
  gap: 10px;
}

.pg-widget__brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.pg-widget__brand-icon {
  display: inline-flex;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.pg-widget__brand-icon svg {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 4px;
}

.pg-widget__brand-text {
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  color: #22201d;
}

.pg-widget__brand-accent {
  color: #6b4a9e;
}

.pg-widget__close {
  appearance: none;
  background: transparent;
  border: none;
  padding: 6px;
  margin: -6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: #a6a39f;
  cursor: pointer;
  transition: background 120ms ease-out, color 120ms ease-out;
}

.pg-widget__close:hover {
  background: #efece6;
  color: #22201d;
}

.pg-widget__panel .pg-widget__row--header {
  margin-bottom: 8px;
}

.pg-widget__panel--failed {
  border-color: #dc2626;
}

.pg-widget__icon {
  display: inline-block;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  position: relative;
}

.pg-widget__icon--spinner {
  border: 2px solid #e3ded3;
  border-top-color: #6b4a9e;
  border-radius: 50%;
  animation: pg-widget-spin 800ms linear infinite;
}

.pg-widget__icon--check {
  background: #16a34a;
  border-radius: 50%;
}

.pg-widget__icon--check::after {
  content: "";
  position: absolute;
  left: 4px;
  top: 2px;
  width: 4px;
  height: 7px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.pg-widget__icon--cross {
  background: #dc2626;
  border-radius: 50%;
  animation: pg-widget-pulse 2s infinite;
}

.pg-widget__icon--cross::before,
.pg-widget__icon--cross::after {
  content: "";
  position: absolute;
  left: 6px;
  top: 3px;
  width: 2px;
  height: 8px;
  background: #fff;
  border-radius: 1px;
}

.pg-widget__icon--cross::before { transform: rotate(45deg); }
.pg-widget__icon--cross::after  { transform: rotate(-45deg); }

.pg-widget__label {
  font-weight: 500;
}

.pg-widget__link {
  color: #6b4a9e;
  text-decoration: none;
  font-weight: 600;
  margin-left: 2px;
}

.pg-widget__link:hover {
  text-decoration: underline;
}

.pg-widget__panel {
  background: #ffffff;
  border: 1px solid #e3ded3;
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: 0 6px 18px rgba(34, 32, 29, 0.14);
  max-width: 320px;
  animation: pg-widget-enter 180ms cubic-bezier(0.2, 0, 0, 1);
}

.pg-widget__panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #22201d;
}

.pg-widget__panel-message {
  color: #5f5d5a;
  font-size: 13px;
  margin-bottom: 12px;
  word-break: break-word;
}

.pg-widget__panel-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.pg-widget__btn {
  appearance: none;
  background: transparent;
  border: 1px solid #e3ded3;
  border-radius: 6px;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: #22201d;
  transition: background 120ms ease-out, border-color 120ms ease-out;
}

.pg-widget__btn:hover:not(:disabled) {
  background: #faf7f1;
  border-color: #c9c2b3;
}

.pg-widget__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pg-widget__btn--primary {
  background: #6b4a9e;
  border-color: #6b4a9e;
  color: #ffffff;
}

.pg-widget__btn--primary:hover:not(:disabled) {
  background: #4a2f85;
  border-color: #4a2f85;
}

@keyframes pg-widget-spin {
  to { transform: rotate(360deg); }
}

@keyframes pg-widget-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
  50%      { box-shadow: 0 0 0 6px rgba(220, 38, 38, 0); }
}

@keyframes pg-widget-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

export const syncWidget = new SyncWidget();
