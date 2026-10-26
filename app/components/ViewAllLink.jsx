import React from 'react';
import { closeMosyCard } from './MosyCard';
import { MosyNotify, closeMosyModal } from '../MosyUtils/ActionModals';
import mosyThemeConfigs from '../appConfigs/mosyTheme';

// Footer badge for related-record popups: hairline divider, then a solid
// theme-coloured pill with an arrow that nudges right on hover. No
// dependencies; colours come from mosyTheme (btnBg/btnTxt).
const css = `
.mosy-viewall{position:relative;z-index:9999;display:flex;justify-content:flex-end;margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,.08)}
.mosy-viewall a{display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border-radius:999px;font-size:.875rem;font-weight:600;line-height:1.2;color:${mosyThemeConfigs.btnTxt};background:${mosyThemeConfigs.btnBg};text-decoration:none;box-shadow:0 1px 2px rgba(0,0,0,.12),0 4px 10px -4px ${mosyThemeConfigs.btnBg};transition:filter .15s ease,gap .15s ease,transform .15s ease}
.mosy-viewall a:hover{gap:12px;filter:brightness(.92);color:${mosyThemeConfigs.btnTxt}}
.mosy-viewall a:active{transform:translateY(1px)}
.mosy-viewall a:focus-visible{outline:2px solid ${mosyThemeConfigs.btnBg};outline-offset:3px}
.mosy-viewall svg{width:14px;height:14px;flex:none}
`;

// Clicking closes every MosyCard modal first (same list EntityRowActionsMenu
// closes on "View more"), then navigates: onNavigate(href) when given
// (router.push from the registry ctx), else a normal browser navigation.
// Navigation is done in JS because closing the modal removes this <a> from the
// DOM, and a detached anchor does not follow its href.
// Always open the table view (not the spreadsheet grid).
const withTableView = (url = '') => {
  if (/[?&]setgv=/.test(url)) return url.replace(/([?&]setgv=)[^&#]*/, '$1table');
  const [base, hash] = url.split('#');
  return `${base}${base.includes('?') ? '&' : '?'}setgv=table${hash ? `#${hash}` : ''}`;
};

export default function ViewAllLink({ href: rawHref, label = 'View more', onNavigate }) {
  const href = withTableView(rawHref);
  const handleClick = (e) => {
    // Let the browser handle new-tab clicks (ctrl/cmd/shift/middle) natively.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    ['modal1', 'modal2', 'modal3', 'modal4', 'modal5', 'topmost', undefined].forEach((id) => {
      try { id ? closeMosyCard(id) : closeMosyCard(); } catch (err) { /* modal not open */ }
    });
    // Feedback while Next compiles/renders the new route; dismissed as soon as
    // the URL actually changes (App Router commits it after render), with a cap.
    const startUrl = window.location.href;
    try { MosyNotify({ message: 'Redirecting... preparing the page', icon: 'send', addTimer: false }); } catch (err) { /* notify unavailable */ }
    const startedAt = Date.now();
    const watch = setInterval(() => {
      if (window.location.href !== startUrl || Date.now() - startedAt > 30000) {
        clearInterval(watch);
        // Let the new route paint before removing the notice.
        setTimeout(() => { try { closeMosyModal(); } catch (err) { /* already closed */ } }, 150);
      }
    }, 100);
    if (onNavigate) onNavigate(href);
    else window.location.assign(href);
  };

  return (
    <div className="mosy-viewall">
      <style>{css}</style>
      <a href={href} onClick={handleClick}>
        {label}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </a>
    </div>
  );
}
