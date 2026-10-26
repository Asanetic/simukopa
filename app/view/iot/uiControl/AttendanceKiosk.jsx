'use client';
/**
 * AttendanceKiosk — full-screen reception kiosk: student types admission number on a keypad and taps Confirm.
 *
 * <AttendanceKiosk
 *   backgroundSrc="/campus.jpg"            // optional
 *   onSubmit={async (admissionNo) => {
 *     // call your API; return { ok: true, name: 'John Mwangi' } or { ok: false, message: 'Not found' }
 *   }}
 * />
 * Physical keyboard works too (digits, Backspace, Enter, Esc). Digits only; set `numeric={false}` to allow any character from a keyboard.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { APP_BASE_PATH } from '../../../originlmsv2/moduleControl/UiControl/FileThumb';
import { mosyGetLSData } from '../../../MosyUtils/hiveUtils';
import saAuthConfigs from '../../../auth/featureConfig/saAuthConfigs';
import { hiveRoutes } from '../../../appConfigs/hiveRoutes';

// The kiosk runs in a signed-in tab: every call carries the same Bearer token as the rest of the app.
const ENDPOINT = `${APP_BASE_PATH}/api/iot/clockin`;
const CAMPUS_KEY = 'iot_kiosk_campus'; // remembered per device
const authFetch = (init = {}) =>
  fetch(ENDPOINT, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mosyGetLSData(`${saAuthConfigs.sessionPrefix}_authToken`)}` },
  }).then((r) => r.json().catch(() => ({ ok: false, message: 'Unexpected response from the server.' })));

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const CSS = `
.ak{--navy:#0b1f3a;--blue:#0b5fff;--gold:#f2b632;--text:#10233f;--muted:#5b6d86;
  position:relative;min-height:100vh;width:100%;overflow:hidden;color:#fff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  background:linear-gradient(180deg,#cfe3f7 0%,#6f93bd 40%,#0b1f3a 100%)}
.ak *{box-sizing:border-box}
.ak-bg{position:absolute;inset:0;background-size:cover;background-position:center}
.ak-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,24,48,.92) 0%,rgba(8,24,48,.55) 38%,rgba(8,24,48,.15) 65%,rgba(8,24,48,.45) 100%)}
.ak-in{position:relative;z-index:1;min-height:100vh;display:grid;grid-template-columns:1fr minmax(380px,560px) 1fr;grid-template-rows:auto 1fr;padding:2.2vh 3vw}

.ak-head{grid-column:1/-1;display:flex;align-items:flex-start;justify-content:space-between}
.ak-brand{display:flex;align-items:center;gap:14px}
.ak-brand img{height:clamp(48px,8vh,84px);width:auto}
.ak-brand .n{font-size:clamp(24px,4vh,40px);font-weight:800;letter-spacing:.14em;line-height:1}
.ak-brand .s{font-size:clamp(11px,1.6vh,15px);letter-spacing:.55em;opacity:.85;margin-top:6px}
.ak-meta{display:flex;align-items:center;gap:22px}
.ak-loc{display:flex;align-items:center;gap:12px}
.ak-loc i{color:#4d8dff;font-size:28px}
.ak-loc b{display:block;font-size:17px}
.ak-loc span{opacity:.8;font-size:15px}
.ak-sep{width:1px;height:46px;background:rgba(255,255,255,.35)}
.ak-time{text-align:right}
.ak-time small{display:block;font-size:15px;opacity:.9}
.ak-time b{font-size:clamp(26px,4vh,38px);font-weight:800;letter-spacing:.5px}

.ak-left{align-self:center;padding-right:2vw}
.ak-left h1{margin:0;font-size:clamp(36px,6.4vh,62px);font-weight:800;line-height:1.05}
.ak-left p{margin:8px 0 0;font-size:clamp(20px,3.4vh,32px);line-height:1.3;font-weight:300}
.ak-left p b{color:var(--gold);font-weight:800}
.ak-feats{display:flex;gap:0;margin-top:clamp(40px,12vh,140px)}
.ak-feat{display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 20px;font-size:14px;text-align:center;line-height:1.25}
.ak-feat+.ak-feat{border-left:1px solid rgba(255,255,255,.3)}
.ak-feat:first-child{padding-left:0}
.ak-feat i{width:46px;height:46px;border-radius:50%;background:var(--gold);color:var(--navy);display:grid;place-items:center;font-size:20px}

.ak-mid{align-self:center;justify-self:center;width:100%}
.ak-card{background:rgba(255,255,255,.96);color:var(--text);border-radius:22px;padding:clamp(18px,3vh,32px);box-shadow:0 20px 60px rgba(4,16,36,.45);position:relative}
.ak-ch{display:flex;align-items:center;gap:18px;margin-bottom:clamp(14px,2.4vh,24px)}
.ak-ico{width:78px;height:78px;border-radius:50%;background:#e1ecfd;color:var(--blue);display:grid;place-items:center;font-size:32px;flex:none}
.ak-ch h2{margin:0;font-size:clamp(24px,3.6vh,34px);font-weight:800}
.ak-ch p{margin:4px 0 0;color:var(--muted);font-size:clamp(14px,2.2vh,19px)}
.ak-field{height:clamp(54px,8vh,72px);border:2px solid var(--blue);border-radius:12px;background:#fff;display:flex;align-items:center;padding:0 16px;gap:14px;font-size:clamp(20px,3.2vh,28px);letter-spacing:.06em}
.ak-field i{color:#8a97ab;font-size:24px;padding-right:14px;border-right:1px solid #dfe6f0}
.ak-field .ph{color:#8a97ab;letter-spacing:0;font-size:clamp(17px,2.6vh,24px)}
.ak-field .v{font-weight:700}
.ak-field .caret{width:2px;height:1.2em;background:var(--blue);margin-left:2px;animation:ak-b 1s steps(1) infinite}
@keyframes ak-b{50%{opacity:0}}
.ak-field.err{border-color:#d93a46;animation:ak-s .35s}
@keyframes ak-s{20%{transform:translateX(-8px)}60%{transform:translateX(8px)}}
.ak-msg{min-height:22px;margin:8px 2px 0;font-size:14px;font-weight:600;color:#d93a46}
.ak-pad{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px}
.ak-k{height:clamp(54px,9.4vh,84px);border:0;border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(16,35,63,.12);font-size:clamp(22px,3.8vh,34px);font-weight:800;color:var(--text);cursor:pointer;transition:transform .06s,background .1s}
.ak-k:active{transform:scale(.96);background:#e6eefb}
.ak-k.del{background:#dde7f5;font-size:26px}
.ak-k.ok{grid-column:span 1;background:var(--blue);color:#fff;font-size:clamp(20px,3.2vh,28px);display:flex;align-items:center;justify-content:center;gap:14px;box-shadow:0 6px 16px rgba(11,95,255,.35)}
.ak-k.ok .arr{width:44px;height:44px;border-radius:50%;background:#fff;color:var(--blue);display:grid;place-items:center;font-size:20px}
.ak-k.ok:disabled{opacity:.55;cursor:not-allowed}
.ak-k.zero{grid-column:span 1}
.ak-pad .bottom{display:contents}

.ak-done{position:absolute;inset:0;border-radius:22px;background:rgba(255,255,255,.98);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:24px}
.ak-done .tick{width:96px;height:96px;border-radius:50%;background:#dff3e6;color:#1a7f4b;display:grid;place-items:center;font-size:48px}
.ak-done h3{margin:6px 0 0;font-size:30px;font-weight:800;color:var(--text)}
.ak-done p{margin:0;color:var(--muted);font-size:18px}
.ak-done .t{font-weight:800;color:var(--navy)}

.ak-right{align-self:center;justify-self:end;padding-left:2vw}
.ak-steps{display:flex;flex-direction:column}
.ak-step{display:flex;align-items:center;gap:14px;max-width:190px;font-size:16px;line-height:1.25}
.ak-dot{width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.28);display:grid;place-items:center;font-weight:800;font-size:20px;flex:none;transition:background .2s}
.ak-step.on .ak-dot{background:var(--blue)}
.ak-step.done .ak-dot{background:#1fa463}
.ak-line{width:2px;height:34px;background:rgba(255,255,255,.3);margin:4px 0 4px 22px}

@media(max-width:1000px){
  .ak-in{grid-template-columns:1fr;padding:16px}
  .ak-left,.ak-right{display:none}
  .ak-meta .ak-loc{display:none}
  .ak-mid{margin-top:12px}
}
.ak-change{margin-left:8px;border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer;font:inherit;padding:0}
.ak-modal{position:fixed;inset:0;z-index:50;background:rgba(11,31,58,.78);display:flex;align-items:center;justify-content:center;padding:16px}
.ak-mbox{background:#fff;color:var(--text);border-radius:14px;padding:26px;width:min(520px,100%);max-height:86vh;overflow:auto;text-align:center}
.ak-mbox h3{margin:0 0 6px;font-size:22px}
.ak-mbox p{margin:0 0 16px;color:var(--muted)}
.ak-clist{display:grid;gap:10px}
.ak-copt{display:flex;flex-direction:column;align-items:flex-start;gap:2px;border:2px solid #dbe3ef;background:#fff;border-radius:10px;padding:14px 16px;cursor:pointer;text-align:left;font:inherit;color:var(--text)}
.ak-copt b{font-size:17px}.ak-copt span{font-size:13px;color:var(--muted)}
.ak-copt:hover,.ak-copt.on{border-color:var(--blue);background:#eef4ff}
.ak-mbtn{display:inline-block;background:var(--blue);color:#fff;border-radius:8px;padding:10px 22px;text-decoration:none;font-weight:600}
.ak-pw{width:100%;height:46px;border:2px solid #dbe3ef;border-radius:10px;padding:0 14px;font-size:16px;margin-bottom:6px}.ak-pw:focus{outline:none;border-color:var(--blue)}
.ak-mbtn{border:0;cursor:pointer}.ak-mbtn:disabled{opacity:.6}
.ak-mlink{margin-top:14px;border:0;background:none;color:var(--muted);text-decoration:underline;cursor:pointer}
`;

export default function AttendanceKiosk({
  backgroundSrc,
  maxLength = 12,
  numeric = true,
  resetMs = 4000,
  timeZone, // e.g. 'Africa/Nairobi'; default = device zone
  onSubmit,
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // { name, at }
  const [now, setNow] = useState(null);
  const timer = useRef(null);

  // college + campuses come from the signed-in token; the chosen campus is remembered on this device
  const [info, setInfo] = useState(null); // { college: { name }, campuses: [] }
  const [infoError, setInfoError] = useState('');
  const [campusId, setCampusId] = useState('');
  const [picking, setPicking] = useState(false);
  const [askPwd, setAskPwd] = useState(false); // admin password prompt before changing the campus
  const [pwd, setPwd] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  // live clock (set after mount so server/client markup match)
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let off = false;
    authFetch().then((res) => {
      if (off) return;
      if (!res?.ok) return setInfoError(res?.message || 'Could not load the kiosk details.');
      setInfo(res);
      let saved = '';
      try { saved = localStorage.getItem(CAMPUS_KEY) || ''; } catch { /* storage blocked */ }
      if (saved && res.campuses.some((c) => c.campus_id === saved)) setCampusId(saved);
      else if (res.campuses.length === 1) setCampusId(res.campuses[0].campus_id);
      else setPicking(true);
    }).catch(() => !off && setInfoError('Could not reach the server.'));
    return () => { off = true; };
  }, []);

  const campusRow = info?.campuses.find((c) => c.campus_id === campusId) || null;
  const chooseCampus = (id) => {
    setCampusId(id);
    setPicking(false);
    try { localStorage.setItem(CAMPUS_KEY, id); } catch { /* storage blocked */ }
  };
  const ready = !!campusRow && !picking && !askPwd;

  const closePwd = () => { setAskPwd(false); setPwd(''); setPwdErr(''); };
  const verifyAdmin = async (e) => {
    e.preventDefault();
    if (!pwd || pwdBusy) return;
    setPwdBusy(true);
    setPwdErr('');
    try {
      const res = await authFetch({ method: 'POST', body: JSON.stringify({ action: 'verify_admin', password: pwd }) });
      if (res?.ok) { closePwd(); setPicking(true); } else setPwdErr(res?.message || 'Incorrect password.');
    } catch { setPwdErr('Could not reach the server.'); } finally { setPwdBusy(false); }
  };

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    setDone(null);
    setValue('');
    setError('');
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const press = useCallback((ch) => {
    if (busy || done || !ready) return;
    setError('');
    setValue((v) => (v.length >= maxLength ? v : v + ch));
  }, [busy, done, maxLength, ready]);
  const back = useCallback(() => { if (!busy && !done) { setError(''); setValue((v) => v.slice(0, -1)); } }, [busy, done]);

  const confirm = useCallback(async () => {
    if (!value || busy || done || !ready) return;
    setBusy(true);
    setError('');
    try {
      const res = await (onSubmit ? onSubmit(value) : authFetch({ method: 'POST', body: JSON.stringify({ admission_no: value, campus_id: campusId }) }));
      if (res && res.ok === false) {
        setError(res.message || 'Admission number not found. Please try again.');
      } else {
        setDone({ name: res?.name || '', at: new Date(), message: res?.message || '' });
        timer.current = setTimeout(reset, resetMs);
      }
    } catch (e) {
      setError(e?.message || 'Could not record attendance. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [value, busy, done, onSubmit, reset, resetMs, ready, campusId]);

  // physical keyboard
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Escape') reset();
      else if (e.key.length === 1 && (numeric ? /\d/.test(e.key) : /[\w/-]/.test(e.key))) press(e.key.toUpperCase());
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [confirm, back, reset, press, numeric]);

  const dateStr = now ? now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone }).replace(/,? /, ', ') : '';
  const timeStr = now ? now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone }) : '';
  const step = done ? 3 : value ? 2 : 1;

  return (
    <div className="ak">
      <style>{CSS}</style>
      {backgroundSrc && <div className="ak-bg" style={{ backgroundImage: `url(${backgroundSrc})` }} />}
      <div className="ak-shade" />

      {askPwd && (
        <div className="ak-modal" role="dialog" aria-modal="true" aria-label="Admin password">
          <form className="ak-mbox" onSubmit={verifyAdmin}>
            <h3>Admin password</h3>
            <p>Enter the admin password to change this kiosk&apos;s campus.</p>
            <input type="password" className="ak-pw" autoFocus autoComplete="current-password" value={pwd} onChange={(e) => { setPwd(e.target.value); setPwdErr(''); }} placeholder="Password" />
            <div className="ak-msg" role="alert">{pwdErr}</div>
            <button type="submit" className="ak-mbtn" disabled={!pwd || pwdBusy}>{pwdBusy ? 'Checking...' : 'Continue'}</button>
            <div><button type="button" className="ak-mlink" onClick={closePwd}>Cancel</button></div>
          </form>
        </div>
      )}

      {(picking || infoError || !info) && !askPwd && (
        <div className="ak-modal" role="dialog" aria-modal="true" aria-label="Select campus">
          <div className="ak-mbox">
            {infoError ? (
              <>
                <h3>Cannot start the kiosk</h3>
                <p>{infoError}</p>
                <a className="ak-mbtn" href={hiveRoutes.auth}>Sign in</a>
              </>
            ) : !info ? (
              <p><i className="fa fa-spinner fa-spin"></i> Loading...</p>
            ) : (
              <>
                <h3>Select this kiosk&apos;s campus</h3>
                <p>Attendance will be recorded for the campus you choose.</p>
                <div className="ak-clist">
                  {info.campuses.length === 0 && <p>No active campuses found. Add one under Campuses first.</p>}
                  {info.campuses.map((c) => (
                    <button type="button" key={c.campus_id} className={`ak-copt ${c.campus_id === campusId ? 'on' : ''}`} onClick={() => chooseCampus(c.campus_id)}>
                      <b>{c.campus_name}</b>
                      <span>{[c.campus_code, c.city].filter(Boolean).join(' · ')}</span>
                    </button>
                  ))}
                </div>
                {campusRow && <button type="button" className="ak-mlink" onClick={() => setPicking(false)}>Cancel</button>}
              </>
            )}
          </div>
        </div>
      )}

      <div className="ak-in">
        <header className="ak-head">
          <div className="ak-brand">
            <div>
              <div className="n">{campusRow?.campus_name || info?.college?.name || ' '}</div>
            </div>
          </div>
          <div className="ak-meta">
            <div className="ak-loc">
              <i className="fa fa-map-marker"></i>
              <div>
                <b>{campusRow ? campusRow.campus_code || campusRow.city || 'Campus' : 'Select campus'}</b>
                <span>
                  {campusRow?.campus_code && campusRow?.city ? campusRow.city : ''}
                  {info && info.campuses.length > 1 && (
                    <button type="button" className="ak-change" onClick={() => setAskPwd(true)}>Change</button>
                  )}
                </span>
              </div>
            </div>
            <div className="ak-sep" />
            <div className="ak-time"><small>{dateStr}</small><b>{timeStr}</b></div>
          </div>
        </header>

        <section className="ak-left">
          <h1>Welcome</h1>
          <p>Please enter your<br /><b>Admission Number</b><br />to clock in</p>
          <div className="ak-feats">
            {[['fa-calendar-check-o', 'Mark\nAttendance'], ['fa-clock-o', 'Quick\n& Easy'], ['fa-shield', 'Secure\n& Reliable'], ['fa-users', 'For All\nStudents']].map(([ic, t]) => (
              <div className="ak-feat" key={ic}>
                <i className={`fa ${ic}`}></i>
                <span style={{ whiteSpace: 'pre-line' }}>{t}</span>
              </div>
            ))}
          </div>
        </section>

        <main className="ak-mid">
          <div className="ak-card">
            <div className="ak-ch">
              <div className="ak-ico"><i className="fa fa-user-circle-o"></i></div>
              <div>
                <h2>Student Attendance</h2>
                <p>Enter your admission number to clock in</p>
              </div>
            </div>

            <div className={`ak-field ${error ? 'err' : ''}`} aria-live="polite">
              <i className="fa fa-user-o"></i>
              {value ? <span className="v">{value}<span className="caret" /></span> : <span className="ph">Enter Admission Number</span>}
            </div>
            <div className="ak-msg" role="alert">{error}</div>

            <div className="ak-pad">
              {KEYS.map((k) => <button type="button" key={k} className="ak-k" onClick={() => press(k)}>{k}</button>)}
              <button type="button" className="ak-k del" onClick={back} onDoubleClick={() => setValue('')} aria-label="Backspace"><i className="fa fa-long-arrow-left"></i></button>
              <button type="button" className="ak-k zero" onClick={() => press('0')}>0</button>
              <button type="button" className="ak-k ok" onClick={confirm} disabled={!value || busy}>
                {busy ? <i className="fa fa-spinner fa-spin"></i> : <>Confirm<span className="arr"><i className="fa fa-arrow-right"></i></span></>}
              </button>
            </div>

            {done && (
              <div className="ak-done" role="status">
                <div className="tick"><i className="fa fa-check"></i></div>
                <h3>{done.name ? `Welcome, ${done.name}` : 'Attendance recorded'}</h3>
                <p>{done.message || 'Your attendance has been recorded'} · <span className="t">{done.at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone })}</span></p>
              </div>
            )}
          </div>
        </main>

        <aside className="ak-right">
          <div className="ak-steps">
            <div className={`ak-step ${step === 1 ? 'on' : 'done'}`}><span className="ak-dot">{step > 1 ? <i className="fa fa-check"></i> : 1}</span>Enter your admission number</div>
            <div className="ak-line" />
            <div className={`ak-step ${step === 2 ? 'on' : step > 2 ? 'done' : ''}`}><span className="ak-dot">{step > 2 ? <i className="fa fa-check"></i> : 2}</span>Tap Confirm</div>
            <div className="ak-line" />
            <div className={`ak-step ${step === 3 ? 'done' : ''}`}><span className="ak-dot"><i className="fa fa-check"></i></span>Your attendance will be recorded</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
