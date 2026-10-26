"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import gridRegistry from './gridRegistry';
import Link from "next/link";
import { Users, ArrowUp, ArrowDown, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { getGridPrefs, replayGrids, useGridPrefs } from "../../moduleControl/UiControl/SmartGridClean";
import mosyTheme from "../../../appConfigs/mosyTheme";
import "./origin-dashboard.css";

/* ════════════════════════════════════════════════════════════════
   ORIGIN DASHBOARD — the schema interpreter.
   <OriginDashboard schema={…} data={…} />
   Walks schema.layout in order and draws each block (filters / stats / chart / grid / heading).
   To add a new block kind: write a small component below and add it to BLOCKS.
   Scroll-reveal, count-up, charts and styles are unchanged from the original dashboard.
   ════════════════════════════════════════════════════════════════ */

const PRESETS = ["All Time", "Today", "Yesterday", "This Week", "This Month", "This Year"];
const SERIES_COLORS = [mosyTheme.btnBg, "#4b5563", "#9ca3af", "#d1d5db", "#6b7280", "#e5e7eb"];

// axis ticks sized to the data: ~5 intervals on a 1/2/5 step, top tick >= the highest value
const niceTicks = (max) => {
  const raw = Math.max(max, 1) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, ([1, 2, 5, 10].find((m) => m * mag >= raw) || 10) * mag);
  return Array.from({ length: Math.ceil(Math.max(max, 1) / step) + 1 }, (_, i) => i * step);
};
const compact = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : v);

/* ============================ HELPERS ============================ */

// only buttons follow mosyTheme.jsx; everything else keeps the dashboard's own glass styling
const themeVars = { "--od-btn": mosyTheme.btnBg, "--od-btn-txt": mosyTheme.btnTxt, "--od-btn-r": mosyTheme.systemBorderRadius };

const r2 = (n) => Math.round(n * 100) / 100;

// smooth curve through points (Catmull-Rom → cubic Bézier)
function smoothPath(pts) {
  let d = `M ${r2(pts[0][0])} ${r2(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C ${r2(p1[0] + (p2[0] - p0[0]) / 6)} ${r2(p1[1] + (p2[1] - p0[1]) / 6)}, ${r2(p2[0] - (p3[0] - p1[0]) / 6)} ${r2(p2[1] - (p3[1] - p1[1]) / 6)}, ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return d;
}

// fixed-height charts need the real pixel width so text stays crisp at any screen size
function useElementWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(Math.round(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// cursor spotlight: CSS vars on the element, no re-render
const spotlight = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};

/* ============================ SCROLL REVEAL ============================ */

const StageCtx = createContext({ show: false, repeat: false });
const RevealCtx = createContext({ on: true, ms: 0 }); // on = revealed, ms = delay before its sequence starts

// Wraps a block. In demo mode it stays invisible (opacity 0, still laid out) until it scrolls into
// view; then `is-in` is added, which starts its slide-in AND every effect inside it. Blocks visible
// at load reveal after `delay` ms (a staggered intro); blocks reached by scrolling start at once.
function Reveal({ as: Tag = "div", variant = "rise", delay = 0, onReveal, className = "", style, children, ...rest }) {
  const { show, repeat } = useContext(StageCtx);
  const ref = useRef(null);
  const [state, setState] = useState({ on: !show, ms: 0 });
  const cb = useRef(onReveal);
  cb.current = onReveal;

  useEffect(() => {
    if (!show) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") { setState({ on: true, ms: delay }); return undefined; }
    let first = true;
    let shown = false;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      const vh = (e.rootBounds && e.rootBounds.height) || window.innerHeight;
      // "enough" = a good slice of it is on screen (or it fills half the screen, for very tall blocks)
      const enough = e.isIntersecting && (e.intersectionRatio >= 0.22 || e.intersectionRect.height >= vh * 0.5);
      if (enough && !shown) {
        shown = true;
        setState({ on: true, ms: first ? delay : 60 });
        if (cb.current) cb.current();
        if (!repeat) io.disconnect();
      } else if (!e.isIntersecting && shown && repeat) {
        shown = false; // fully off-screen → reset, so it plays again next time
        setState({ on: false, ms: 0 });
      }
      first = false;
    }, { threshold: [0, 0.1, 0.22, 0.35, 0.5, 0.75] });
    io.observe(el);
    return () => io.disconnect();
  }, [show, repeat, delay]);

  const cls = `${className} ${show ? `od-rv od-rv-${variant}` : ""} ${show && state.on ? "is-in" : ""}`.replace(/\s+/g, " ").trim();
  return (
    <RevealCtx.Provider value={state}>
      <Tag ref={ref} className={cls} style={{ ...style, "--rd": `${state.ms / 1000}s` }} {...rest}>
        {children}
      </Tag>
    </RevealCtx.Provider>
  );
}

/* ============================ COUNT-UP ============================ */

// Animates from its current value to `value` (from 0 on first mount). Also tweens live updates.
function CountUp({ value, prefix = "", suffix = "", delay = 0, duration = 1200, animate = true }) {
  const [shown, setShown] = useState(animate ? 0 : value);
  const shownRef = useRef(animate ? 0 : value);
  const mounted = useRef(false);
  const rv = useContext(RevealCtx);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduce) {
      shownRef.current = value;
      setShown(value);
      mounted.current = true;
      return undefined;
    }
    if (!rv.on) { // block not revealed yet → hold at 0 (and reset, if it hid again)
      shownRef.current = 0;
      setShown(0);
      mounted.current = false;
      return undefined;
    }
    const from = shownRef.current;
    const wait = mounted.current ? 0 : delay + rv.ms;
    mounted.current = true;
    let raf;
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = p === 1 ? 1 : 1 - 2 ** (-10 * p); // easeOutExpo: fast start, long settle
        const v = from + (value - from) * eased;
        shownRef.current = v;
        setShown(v);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, wait);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animate, rv.on]);

  return <>{prefix}{Math.round(shown).toLocaleString("en-US")}{suffix}</>;
}

/* ============================ FILTER BAR ============================ */

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function presetRange(name) {
  if (name === "All Time") return { from: "", to: "" };
  const t = new Date();
  const from = new Date(t);
  if (name === "Yesterday") {
    from.setDate(t.getDate() - 1);
    return { from: fmt(from), to: fmt(from) };
  }
  if (name === "This Week") {
    from.setDate(t.getDate() - ((t.getDay() + 6) % 7)); // Monday
    return { from: fmt(from), to: fmt(t) };
  }
  if (name === "This Month") {
    from.setDate(1);
    return { from: fmt(from), to: fmt(t) };
  }
  if (name === "This Year") {
    from.setMonth(0, 1);
    return { from: fmt(from), to: fmt(t) };
  }
  return { from: fmt(t), to: fmt(t) };
}

// block = { date?:true|false, time?:false (hide the "Include time" checkbox), fields?:[ { key, label, type?:'select'|'text', options?:[…], optionsKey?:'counties' } ] }
// onApply receives { preset, from, to, ...one entry per field key }  ('' = not set)
function FilterBar({ block, options = {}, onApply }) {
  const useDate = block.date !== false;
  const fields = block.fields || [];
  const [preset, setPreset] = useState("All Time");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vals, setVals] = useState({});
  const [useTime, setUseTime] = useState(false); // "Include time" checkbox → date inputs become date+time inputs
  const canTime = useDate && block.time !== false;

  // inputs hold 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm'; the API gets 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm'
  const toIn = (v, end, on = useTime) => (!v ? "" : on ? (v.length > 10 ? v : `${v}T${end ? "23:59" : "00:00"}`) : v.slice(0, 10));
  const out = (v) => (v || "").replace("T", " ");
  const send = (over = {}) => onApply && onApply({ preset, ...vals, ...over, from: out(over.from ?? from), to: out(over.to ?? to) });
  const toggleTime = (on) => {
    setUseTime(on);
    setFrom((v) => toIn(v, false, on));
    setTo((v) => toIn(v, true, on));
  };

  // presets and dropdowns apply straight away; typed text / custom dates wait for Apply
  const choose = (name) => {
    const r = presetRange(name);
    const f = toIn(r.from, false);
    const t = toIn(r.to, true);
    setPreset(name);
    setFrom(f);
    setTo(t);
    send({ preset: name, from: f, to: t });
  };
  const setVal = (key, v, now) => {
    setVals((o) => ({ ...o, [key]: v }));
    if (now) send({ [key]: v });
  };
  const opts = (f) => (f.options || options[f.optionsKey] || []).map((o) => (typeof o === "object" ? o : { value: o, label: o }));
  const needsApply = useDate || fields.some((f) => f.type === "text");

  return (
    <Reveal className="od-card od-filters" variant="pop" delay={250}>
      {useDate && (
        <>
          <div className="od-presets">
            {PRESETS.map((p, i) => (
              <button key={p} type="button" onClick={() => choose(p)} style={{ "--b": i }} className={`od-chip ${preset === p ? "active" : ""}`}>
                {p}
              </button>
            ))}
          </div>
          <div className="od-divider" />
          <label className="od-field">
            <span>From</span>
            <input type={useTime ? "datetime-local" : "date"} className="od-input" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(null); }} />
          </label>
          <label className="od-field">
            <span>To</span>
            <input type={useTime ? "datetime-local" : "date"} className="od-input" value={to} onChange={(e) => { setTo(e.target.value); setPreset(null); }} />
          </label>
          {canTime && (
            <label className="od-check">
              <input type="checkbox" checked={useTime} onChange={(e) => toggleTime(e.target.checked)} /> Include time
            </label>
          )}
        </>
      )}

      {useDate && fields.length > 0 && <div className="od-divider" />}

      {fields.map((f) => (
        <label key={f.key} className="od-field">
          <span>{f.label || f.key}</span>
          {f.type === "text" ? (
            <input type="text" className="od-input" placeholder={f.placeholder || ""} value={vals[f.key] || ""}
              onChange={(e) => setVal(f.key, e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          ) : (
            <select className="od-input" value={vals[f.key] || ""} onChange={(e) => setVal(f.key, e.target.value, true)}>
              <option value="">{f.allLabel || "All"}</option>
              {opts(f).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </label>
      ))}

      {needsApply && (
        <button type="button" className="od-apply" onClick={() => send()}>Apply</button>
      )}
    </Reveal>
  );
}

/* ============================ STAT CARD ============================ */

function StatCard({ item, stat, show, index, delay }) {
  const custom = !!item.className; // a class owns the card's background + text colour (e.g. 'od-grad-ocean', 'bg-dark text-white')
  const cls = `od-card od-stat${custom ? ` od-custom ${item.className}` : ""}`;
  const pct = stat?.trend?.pct;
  const up = pct >= 0;
  const Body = (
    <>
      <span className="od-stat-top">
        <span className="od-stat-label">{item.label}</span>
        {item.href && <span className="od-stat-go"><ArrowUpRight size={16} /></span>}
      </span>
      <span className="od-stat-value">
        {item.prefix && <small className="od-cur">{item.prefix.trim()}</small>}
        {stat?.error ? "—" : <CountUp value={stat?.value || 0} animate={show} delay={350} />}
      </span>
      <span className="od-trend">
        {pct != null && (
          <span className="od-trend-pill" style={{ color: up ? "#16a34a" : "#ef4444" }}>
            {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            <CountUp value={Math.abs(pct)} suffix="%" animate={show} delay={600} duration={900} />
          </span>
        )}
        {pct != null && <span className="od-trend-note">vs last period</span>}
        {stat?.error && <span className="od-trend-alert" title={stat.error}>{stat.error}</span>}
        {stat?.alert && (
          <span className="od-trend-alert">
            <Users size={13} /> {stat.alert.text}
          </span>
        )}
      </span>
    </>
  );
  return (
    <Reveal className={`od-statwrap ${item.col || "col-12 col-sm-6 col-lg-3"}`} variant="card" delay={delay + index * 120}>
      {item.href
        ? <Link href={item.href} className={cls} onMouseMove={show ? spotlight : undefined}>{Body}</Link>
        : <div className={cls} onMouseMove={show ? spotlight : undefined}>{Body}</div>}
    </Reveal>
  );
}


/* ============================ NEEDS ATTENTION ============================ */
// block = { title?, empty?, items:[ { id, text:'{n} items low on stock', href?, tone?:'danger'|'warn'|'info' } ] }
// data[id].value is the count; rows with a count of 0 are hidden, and when nothing is left the block says all clear.
function AttentionBlock({ block, data, delay }) {
  const rows = (block.items || [])
    .map((it) => ({ it, d: data?.[it.id] }))
    .filter(({ d }) => d?.error || Number(d?.value) > 0);
  return (
    <Section title={block.title || "Needs your attention"} variant="rise" delay={delay}
      badge={rows.length ? <span className="od-attn-count">{rows.length}</span> : null}
      action={rows.length ? viewLink(block) : null}>
      {rows.length === 0 ? (
        <p className="od-attn-clear"><Check size={18} /> {block.empty || "All clear — nothing needs your attention."}</p>
      ) : (
        <ul className="od-attn-list">
          {rows.map(({ it, d }) => {
            const body = (
              <>
                <span className={`od-attn-dot od-attn-${it.tone || "warn"}`} />
                <span className="od-attn-text">
                  {d?.error ? `${it.text.replace("{n}", "?")} — ${d.error}` : it.text.replace("{n}", Number(d.value).toLocaleString("en-US"))}
                </span>
                {it.href && <span className="od-attn-go">View <ArrowRight size={13} /></span>}
              </>
            );
            return (
              <li key={it.id}>
                {it.href ? <Link href={it.href} className="od-attn-row">{body}</Link> : <div className="od-attn-row">{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/* ============================ SECTION + CHARTS ============================ */

function Section({ title, action, badge, fill = false, variant = "rise", delay = 0, onReveal, children }) {
  return (
    <Reveal as="section" variant={variant} delay={delay} onReveal={onReveal} className={`od-card od-section ${fill ? "od-fill" : ""}`.trim()}>
      <div className="od-section-head">
        <h3 className="od-section-title">{title}{badge}</h3>
        {action}
      </div>
      {children}
    </Reveal>
  );
}

const ViewLink = ({ href, children }) => (
  <Link href={href} className="od-vlink">{children} <ArrowRight size={13} /></Link>
);

function BarChart({ data, show, height = 260, focus = null }) {
  const ticks = niceTicks(Math.max(0, ...data.map((x) => x.value)));
  const top = ticks[ticks.length - 1];

  return (
    <div className="od-bars">
      <div className="od-bars-y" style={{ height }}>
        {ticks.map((t) => (
          <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>{t}</span>
        ))}
      </div>
      <div className="od-bars-main">
        <div className="od-bars-plot" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="od-bars-grid" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="od-bars-cols">
            {data.map((x, i) => (
              <div key={`${x.label}-${i}`} className="od-bars-col" style={{ "--i": i, opacity: focus == null || focus === i ? 1 : 0.35 }}>
                <span className="od-bar-value">
                  <CountUp value={x.value} animate={show} delay={700 + i * 80} duration={900} />
                </span>
                <div className={`od-bar od-bar-${x.tone}`} style={{ height: `${(x.value / top) * 100}%` }} title={`${x.label}: ${x.value}`} />
              </div>
            ))}
          </div>
        </div>
        <div className="od-bars-labels">
          {data.map((x, i) => <span key={`${x.label}-${i}`}>{x.label}</span>)}
        </div>
      </div>
    </div>
  );
}

// Interactive area chart: hover/touch moves an amber marker + tooltip along the line.
// In demo mode the marker starts at Jan and glides to the peak once the line has drawn.
function TrendChart({ labels, values, show, height = 280, yTicks = [0, 20, 40, 60, 80, 100], unit = "tickets", tickFmt = (v) => v, valueFmt = (v) => v }) {
  const [wrapRef, w] = useElementWidth();
  const rv = useContext(RevealCtx);
  const uid = useId();
  const n = values.length;
  const peak = Math.max(0, values.indexOf(Math.max(...values)));
  const start = show ? 0 : peak;

  const [pos, setPos] = useState(start); // fractional index of the marker
  const posRef = useRef(start);
  const targetRef = useRef(start);
  const easeRef = useRef(0.2);
  const rafRef = useRef(0);

  const step = useCallback(() => {
    const diff = targetRef.current - posRef.current;
    if (Math.abs(diff) < 0.004) {
      posRef.current = targetRef.current;
      setPos(posRef.current);
      rafRef.current = 0;
      return;
    }
    posRef.current += diff * easeRef.current;
    setPos(posRef.current);
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const moveTo = useCallback((i, ease = 0.2) => {
    targetRef.current = i;
    easeRef.current = ease;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(step);
  }, [step]);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }, []);

  // demo: once revealed and the line has drawn, glide the marker from Jan to the peak
  useEffect(() => {
    if (!show) return undefined;
    if (!rv.on) { posRef.current = 0; targetRef.current = 0; setPos(0); return undefined; }
    const t = setTimeout(() => moveTo(peak, 0.07), rv.ms + 2050);
    return () => clearTimeout(t);
  }, [show, rv.on, rv.ms, peak, moveTo]);

  const H = height;
  if (!w) return <div ref={wrapRef} className="od-trend-chart" style={{ height: H }} />;

  const PAD = { l: 46, r: 20, t: 58, b: 34 };
  const iw = Math.max(1, w - PAD.l - PAD.r);
  const ih = H - PAD.t - PAD.b;
  const yMax = yTicks[yTicks.length - 1];
  const x = (i) => PAD.l + (i / (n - 1)) * iw;
  const y = (v) => PAD.t + ih - (v / yMax) * ih;
  const base = PAD.t + ih;

  const pts = values.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts);
  const area = `${line} L ${r2(pts[n - 1][0])} ${base} L ${r2(pts[0][0])} ${base} Z`;

  const lo = Math.min(n - 2, Math.max(0, Math.floor(pos)));
  const f = Math.min(1, Math.max(0, pos - lo));
  const hx = pts[lo][0] + (pts[lo + 1][0] - pts[lo][0]) * f;
  const hy = pts[lo][1] + (pts[lo + 1][1] - pts[lo][1]) * f;
  const idx = Math.min(n - 1, Math.max(0, Math.round(pos)));

  const tipW = 124;
  const tipLeft = Math.min(Math.max(hx, tipW / 2 + 4), w - tipW / 2 - 4);

  const track = (clientX) => {
    const r = wrapRef.current.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - PAD.l) / iw) * (n - 1));
    moveTo(Math.min(n - 1, Math.max(0, i)), 0.25);
  };

  return (
    <div
      ref={wrapRef}
      className="od-trend-chart"
      style={{ height: H }}
      onMouseMove={(e) => track(e.clientX)}
      onMouseLeave={() => moveTo(peak, 0.12)}
      onTouchMove={(e) => track(e.touches[0].clientX)}
      onTouchEnd={() => moveTo(peak, 0.12)}
    >
      <svg width={w} height={H} role="img" aria-label="Monthly trend">
        <defs>
          <linearGradient id={`${uid}a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mosyTheme.btnBg} stopOpacity="0.14" />
            <stop offset="100%" stopColor={mosyTheme.btnBg} stopOpacity="0.02" />
          </linearGradient>
          <radialGradient id={`${uid}g`}>
            <stop offset="0%" stopColor={mosyTheme.btnBg} stopOpacity="0.3" />
            <stop offset="100%" stopColor={mosyTheme.btnBg} stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${uid}c`}><path d={area} /></clipPath>
        </defs>

        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="rgba(148,163,184,0.22)" />
            <text x={PAD.l - 12} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{tickFmt(t)}</text>
          </g>
        ))}

        <path className="od-area" d={area} fill={`url(#${uid}a)`} />
        <g className="od-area" clipPath={`url(#${uid}c)`}>
          <circle cx={hx} cy={hy} r="190" fill={`url(#${uid}g)`} />
        </g>

        <line className="od-hl" x1={hx} x2={hx} y1={hy} y2={base} stroke="#9ca3af" strokeWidth="1.5" />
        <path className="od-line" d={line} pathLength="1" fill="none" stroke={mosyTheme.btnBg} strokeWidth="2.4" strokeLinecap="round" />
        {pts.map(([px, py], i) => (
          <circle key={i} className="od-dot" style={{ "--i": i }} cx={px} cy={py} r="3.6" fill={mosyTheme.btnBg} />
        ))}
        <g className="od-hl">
          <circle cx={hx} cy={hy} r="13" fill={mosyTheme.btnBg} opacity="0.22" />
          <circle cx={hx} cy={hy} r="6.5" fill={mosyTheme.btnBg} stroke="#fff" strokeWidth="2.5" />
        </g>

        {labels.map((l, i) => (
          <text key={`${l}-${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">{l}</text>
        ))}
      </svg>

      <div className="od-tip" style={{ left: tipLeft, top: hy - 16, "--shift": `${hx - tipLeft}px` }}>
        <small>{labels[idx]}</small>
        <b>{valueFmt(values[idx])} {unit}</b>
      </div>
    </div>
  );
}

/* ============================ HORIZONTAL BARS ============================ */

function HBarChart({ data, show, prefix = "" }) {
  const max = Math.max(1, ...data.map((x) => x.value));
  return (
    <div className="od-hbars">
      {data.map((x, i) => (
        <div key={`${x.label}-${i}`} className="od-hrow" style={{ "--i": i }}>
          <span className="od-hlabel" title={x.label}>{x.label}</span>
          <div className="od-htrack"><div className={`od-hbar od-hbar-${x.tone}`} style={{ width: `${(x.value / max) * 100}%` }} /></div>
          <b className="od-hval">{prefix}<CountUp value={x.value} animate={show} delay={700 + i * 80} duration={900} /></b>
        </div>
      ))}
    </div>
  );
}

/* ============================ DONUT ============================ */

function Donut({ methods, total, show, unit = "" }) {
  const [active, setActive] = useState(null);
  const R = 74, SW = 26, CX = 120, C = 2 * Math.PI * R, GAP = 2.5;

  const fracs = methods.map((m) => (total ? m.amount / total : 0));
  const pcts = fracs.map((f) => Math.floor(f * 100 + 1e-6));
  if (total) {
    const order = fracs.map((f, i) => [f * 100 - pcts[i], i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0, rem = 100 - pcts.reduce((a, b) => a + b, 0); k < rem && k < order.length; k++) pcts[order[k][1]] += 1;
  }

  let acc = 0;
  const segs = methods.map((m, i) => {
    const frac = fracs[i];
    const len = Math.max(0, frac * C - GAP);
    const startFrac = acc;
    acc += frac;
    const ang = (startFrac + frac / 2) * Math.PI * 2 - Math.PI / 2;
    const lr = R + SW / 2 + 17;
    return { ...m, i, pct: pcts[i], len, offset: -startFrac * C, lx: CX + lr * Math.cos(ang), ly: CX + lr * Math.sin(ang) };
  });
  const act = active == null ? null : segs[active];

  return (
    <div className="od-donut">
      <svg className="od-donut-svg" viewBox="0 0 240 240" role="img" aria-label="Breakdown">
        <circle cx={CX} cy={CX} r={R} fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth={SW} />
        {segs.map((s) => (
          <circle
            key={s.key}
            className="od-seg"
            cx={CX} cy={CX} r={R}
            stroke={s.color}
            strokeWidth={active === s.i ? SW + 6 : SW}
            transform={`rotate(-90 ${CX} ${CX})`}
            style={{ "--C": C, "--i": s.i, strokeDasharray: `${s.len} ${C - s.len}`, strokeDashoffset: s.offset, opacity: active == null || active === s.i ? 1 : 0.45 }}
            onMouseEnter={() => setActive(s.i)}
            onMouseLeave={() => setActive(null)}
          />
        ))}
        {segs.map((s) => (
          <text key={`p-${s.key}`} className="od-pct" style={{ "--i": s.i }} x={s.lx} y={s.ly} textAnchor="middle" dominantBaseline="central">
            <CountUp value={s.pct} suffix="%" animate={show} delay={1000 + s.i * 150} duration={900} />
          </text>
        ))}
        <g textAnchor="middle">
          <text x={CX} y={CX - 15} fontSize="11" fontWeight="600" fill={act ? act.color : "#64748b"}>{act ? act.label : unit}</text>
          <text x={CX} y={CX + 9} fontSize="22" fontWeight="800" fill="#111827" style={{ fontVariantNumeric: "tabular-nums" }}>
            <CountUp value={act ? act.amount : total} animate={show} delay={400} duration={act ? 500 : 1300} />
          </text>
          <text x={CX} y={CX + 28} fontSize="10.5" fill="#64748b">{act ? `${act.pct}% of total` : "Total"}</text>
        </g>
      </svg>

      <div className="od-legend">
        {segs.map((s) => (
          <div
            key={s.key}
            className={`od-leg-row ${active === s.i ? "hot" : ""}`}
            style={{ "--i": s.i }}
            onMouseEnter={() => setActive(s.i)}
            onMouseLeave={() => setActive(null)}
          >
            <i className="od-leg-dot" style={{ background: s.color }} />
            <span className="od-leg-name">{s.label}</span>
            <b className="od-leg-pct">{s.pct}%</b>
            <span className="od-leg-amt">
              {unit} <CountUp value={s.amount} animate={show} delay={700 + s.i * 100} duration={1100} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ BLOCKS (the interpreter) ============================ */
// every block receives { block, data, show, delay, ctx }

function FiltersBlock({ block, ctx }) {
  return <FilterBar block={block} options={ctx.options} onApply={ctx.onApplyFilters} />;
}

function StatsBlock({ block, data, show, delay }) {
  return (
    <div className="od-grid-stats">
      {(block.items || []).map((it, i) => <StatCard key={it.id ?? i} item={it} stat={data?.[it.id]} index={i} show={show} delay={delay} />)}
    </div>
  );
}

function HeadingBlock({ block }) {
  return <div className="od-heading"><h3>{block.text}</h3>{block.sub && <p>{block.sub}</p>}</div>;
}

const viewLink = (b) => (b.href ? <ViewLink href={b.href}>View All</ViewLink> : null);

function ChartBlock({ block, data, show, delay }) {
  const d = data?.[block.id];
  const rows = d?.rows || [];
  const [pick, setPick] = useState("all");
  const prefix = block.prefix || "";
  const variant = { bar: "rise", hbar: "rise", trend: "wipe", donut: "left" }[block.type] || "rise";

  let body;
  if (d?.error) body = <p className="od-empty">{d.error}</p>;
  else if (!d) body = <p className="od-empty">The server sent no data for "{block.id}".</p>;
  else if (!rows.length) body = <p className="od-empty">No data for this period.</p>;
  else if (block.type === "donut") {
    body = <Donut unit={block.unit || ""} total={d.total} show={show}
      methods={rows.map((r, i) => ({ key: r.label, label: r.label, amount: r.value, color: SERIES_COLORS[i % SERIES_COLORS.length] }))} />;
  } else if (block.type === "trend") {
    const vals = rows.length > 1 ? rows.map((r) => r.value) : [0, ...rows.map((r) => r.value)];
    const labs = rows.length > 1 ? rows.map((r) => r.label) : ["—", ...rows.map((r) => r.label)];
    body = <TrendChart labels={labs} values={vals} show={show} unit={block.unit || ""} yTicks={niceTicks(Math.max(...vals))}
      tickFmt={prefix ? compact : (v) => v} valueFmt={(v) => `${prefix}${Number(v).toLocaleString("en-US")}`} />;
  } else {
    const bars = rows.map((r, i, a) => ({ ...r, tone: i >= a.length - 2 && a.length > 3 ? "amber" : "blue" }));
    body = block.type === "hbar"
      ? <HBarChart data={bars} show={show} prefix={prefix} />
      : <BarChart data={bars} show={show} focus={pick === "all" ? null : bars.findIndex((x) => x.label === pick)} />;
  }

  const select = block.type === "bar" && rows.length > 1 ? (
    <select className="od-select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Filter">
      <option value="all">All</option>
      {rows.map((r, i) => <option key={`${r.label}-${i}`} value={r.label}>{r.label}</option>)}
    </select>
  ) : null;

  return (
    <Section title={block.title} variant={variant} delay={delay} fill={block.type === "donut"}
      action={<div className="od-actions">{select}{viewLink(block)}</div>}>
      {body}
    </Section>
  );
}

// an existing list component (it fetches + filters its own data), named in the schema: { ref: 'salesorders' } → gridRegistry.js
function GridBlock({ block, delay }) {
  const C = gridRegistry[block.ref];
  const inner = C ? <C {...(block.props || {})} /> : <p className="od-empty">Grid "{block.id}" has no component for ref \"{block.ref}\" in gridRegistry.js.</p>;
  if (block.bare) return <Reveal variant="rise" delay={delay}>{inner}</Reveal>; // component draws its own card/header
  return (
    <Section title={block.title || ""} variant="rise" delay={delay} action={viewLink(block)}>
      {inner}
    </Section>
  );
}

// any block can be switched off with hidden:true; a filters block with no date and no fields has nothing to show
const isHidden = (b) => b.hidden === true || (b.kind === "filters" && b.date === false && !(b.fields || []).length);

const BLOCKS = { filters: FiltersBlock, stats: StatsBlock, attention: AttentionBlock, chart: ChartBlock, grid: GridBlock, heading: HeadingBlock };

/* ============================ STAGE (remounts on replay → resets everything) ============================ */

function DashboardStage({ show, schema, data, brand, userName, greeting, ctx }) {
  return (
    <div className="od-stage">
      <div>
        <div className="od-eyebrow">{brand}</div>
        <h1 className="od-title">{greeting}, {userName} <span className="od-wave">👋</span></h1>
      </div>

      <div className="od-layout">
        {(schema?.layout || []).map((block, i) => {
          if (!block || isHidden(block)) return null;
          const Block = BLOCKS[block.kind];
          return (
            <div key={block.id || i} className="od-cell" style={{ gridColumn: `span ${block.span || 12}` }}>
              {Block
                ? <Block block={block} data={data} show={show} delay={Math.min(250 + i * 150, 1600)} ctx={ctx} />
                : <p className="od-empty">Unknown block kind "{block.kind}"</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ MAIN COMPONENT ============================ */

export default function OriginDashboard({
  schema,
  data, // payload.data — { [id]: stat | chart }
  options = {}, // dropdown choices by key, e.g. { counties: ['Nairobi','Kiambu'] } (for fields using optionsKey)
  userName = "there",
  greeting = "Good Morning",
  onApplyFilters, // (filters) => void
  demo, // true/false pins animations; undefined → follow the saved setting
  revealRepeat = false,
}) {
  const prefs = useGridPrefs();
  const show = demo ?? (prefs.presentation && prefs.replay);
  const stageCtx = useMemo(() => ({ show, repeat: revealRepeat }), [show, revealRepeat]);
  const ctx = useMemo(() => ({ onApplyFilters, options }), [onApplyFilters, options]);

  // `replayTick` is stored: remember the value we loaded with so only a CHANGE after mount replays
  const [baseTick] = useState(() => getGridPrefs().replayTick);
  const replayKey = prefs.replayTick === baseTick ? 0 : prefs.replayTick;

  // press R anywhere (not while typing) to replay the entrance
  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "r" || e.key === "R") replayGrids();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  if (!schema || !data) return null;

  return (
    <div className={`od-dashboard ${show ? "od-show" : ""}`} style={themeVars}>
      <StageCtx.Provider value={stageCtx}>
        <DashboardStage key={`${show ? 1 : 0}-${replayKey}`} show={show} schema={schema} data={data}
          brand={schema.brand || ""} userName={userName} greeting={greeting} ctx={ctx} />
      </StageCtx.Provider>
    </div>
  );
}
