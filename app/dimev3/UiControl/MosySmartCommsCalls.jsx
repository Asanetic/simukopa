/**
 * Final FILE: send-smart-call.jsx
 * Auto Generated Frontend Functions
 * Mirrors send-smart-message.jsx patterns (MosyCard, mosyPostData, token-based resume/update)
 */

import { MosyCard, closeMosyCard } from '../../components/MosyCard';
import { MosyNotify } from '../../MosyUtils/ActionModals';
import { mosyPostData } from '../../MosyUtils/hiveUtils';
import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';

const apiRoutes = getApiRoutes();

// Module-level state for the call currently in flight (mirrors smartMessageDraftToken)
let activeCallToken = '';
let activeCallStartedAt = 0;
let activeCallTimerHandle = null;

const CALL_OUTCOMES = [
  { value: 'answered', label: 'Answered' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'wrong_number', label: 'Wrong Number' }
];

/* ---------------------------------------------------------- */
/* Phone number helpers (shared logic, split for wa.me vs tel:) */
/* ---------------------------------------------------------- */

function normalizeKenyanPhone(rawPhone = '') {
  let cleaned = String(rawPhone || '').trim();

  if (cleaned.startsWith('+254')) {
    cleaned = cleaned.replace(/\s+/g, '');
  } else if (cleaned.startsWith('07') || cleaned.startsWith('01')) {
    cleaned = '+254' + cleaned.substring(1);
  } else if (cleaned.startsWith('254')) {
    cleaned = '+' + cleaned.replace(/\D/g, '');
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.replace(/\s+/g, '');
  } else {
    cleaned = '+' + cleaned.replace(/\D/g, '');
  }

  return cleaned; // e.g. +2547XXXXXXXX
}

function toWhatsAppDigits(e164Phone = '') {
  return e164Phone.startsWith('+') ? e164Phone.substring(1) : e164Phone;
}

function toTelHref(e164Phone = '') {
  return `tel:${e164Phone}`;
}

function formatElapsed(seconds = 0) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/* ---------------------------------------------------------- */
/* Backend calls                                               */
/* ---------------------------------------------------------- */

async function initiateCallLog({ mode, phone, profileDataNode = {} }) {
  const response = await mosyPostData({
    url: apiRoutes.smartapi.base,
    data: {
      action: 'logUtilCall',
      payload: {
        call_stage: 'initiate',
        call_channel: mode,
        related_record_id: profileDataNode?.record_id || profileDataNode?.client_id || '',
        recipient_name:
          profileDataNode?.full_name ||
          profileDataNode?.business_name ||
          profileDataNode?.name ||
          'Client',
        recipient_phone: phone,
        request_source: 'clients_smart_call_card'
      }
    }
  });

  return response;
}

async function completeCallLog({ outcome, notes, durationSeconds }) {
  return mosyPostData({
    url: apiRoutes.smartapi.base,
    data: {
      action: 'logUtilCall',
      payload: {
        call_stage: 'complete',
        smart_calls_dataNode: activeCallToken,
        call_outcome: outcome,
        call_notes: notes,
        duration_seconds: durationSeconds
      }
    }
  });
}

async function abandonCallLog() {
  return mosyPostData({
    url: apiRoutes.smartapi.base,
    data: {
      action: 'logUtilCall',
      payload: {
        call_stage: 'abandon',
        smart_calls_dataNode: activeCallToken
      }
    }
  });
}

/* ---------------------------------------------------------- */
/* Timer control                                               */
/* ---------------------------------------------------------- */

function startCallTimer() {
  activeCallStartedAt = Date.now();
  stopCallTimer();

  activeCallTimerHandle = setInterval(() => {
    if (typeof document === 'undefined') return;
    const elapsedEl = document.getElementById('smart_call_elapsed_display');
    const durationInput = document.getElementById('smart_call_duration_input');
    const seconds = Math.floor((Date.now() - activeCallStartedAt) / 1000);

    if (elapsedEl) elapsedEl.textContent = formatElapsed(seconds);
    if (durationInput && !durationInput.dataset.userEdited) {
      durationInput.value = seconds;
    }
  }, 1000);
}

function stopCallTimer() {
  if (activeCallTimerHandle) {
    clearInterval(activeCallTimerHandle);
    activeCallTimerHandle = null;
  }
}

/* ---------------------------------------------------------- */
/* Waiting card — logged after native call is launched          */
/* ---------------------------------------------------------- */

function openCallWaitingCard({ mode, phone, profileDataNode = {} }) {
  const recipientName =
    profileDataNode?.full_name ||
    profileDataNode?.business_name ||
    profileDataNode?.name ||
    'Client';

  const channelLabel = mode === 'whatsapp' ? 'WhatsApp Call' : 'Phone Call';
  const channelIcon = mode === 'whatsapp' ? 'fa-whatsapp' : 'fa-phone';

  const handleUpdateCallLog = async () => {
    const outcome = document.getElementById('smart_call_outcome_select')?.value || 'answered';
    const notes = (document.getElementById('smart_call_notes_input')?.value || '').trim();
    const durationRaw = document.getElementById('smart_call_duration_input')?.value || '0';
    const durationSeconds = parseInt(durationRaw, 10) || 0;
  
    if (!activeCallToken) {
      MosyNotify({ message: 'No active call reference found — cannot update log.', icon: 'times-circle', iconColor: 'text-danger' });
      return;
    }
  
    MosyNotify({ message: 'Updating call log...', icon: 'refresh', addTimer: false });
  
    const response = await completeCallLog({ outcome, notes, durationSeconds });
    const result = response?.data || {};
    const wasOk = response?.status === 'success' && result?.success !== false;
  
    stopCallTimer();
  
    if (wasOk) {
      MosyNotify({ message: 'Call log updated successfully', icon: 'check-circle', iconColor: 'text-success' });
      activeCallToken = '';
      closeMosyCard('modal1');
      return;
    }
  
    MosyNotify({
      message: result?.message || response?.message || 'Failed to update call log',
      icon: 'times-circle',
      iconColor: 'text-danger'
    });
  };

  const handleDiscard = async () => {
    stopCallTimer();
    MosyNotify({ message: 'Discarding call log...', icon: 'refresh', addTimer: false });

    const response = await abandonCallLog();

    if (response?.status === 'success') {
      MosyNotify({ message: 'Call marked as not logged', icon: 'info-circle', iconColor: 'text-warning' });
    }

    activeCallToken = '';
    closeMosyCard('modal1');
  };

  MosyCard(
    '',
    <div className="col-md-12 p-0">
      <div className="bg-white rounded p-3 p-md-4">
        <div className="d-flex align-items-center justify-content-between border-bottom pb-2 mb-3">
          <div className="text-left">
            <h5 className="mb-1 font-weight-bold text-dark">
              <i className={`fa ${channelIcon} mr-2`}></i>
              {channelLabel} — {recipientName}
            </h5>
            <small className="text-muted">{phone}</small>
          </div>
          <div className="text-right">
            <div className="text-muted" style={{ fontSize: '12px' }}>Elapsed</div>
            <div id="smart_call_elapsed_display" className="font-weight-bold" style={{ fontSize: '20px' }}>
              00:00
            </div>
          </div>
        </div>

        <div className="form-group mb-3 text-left">
          <div className="row m-0">
            <div className="col-md-6 p-1">
              <label className="font-weight-semibold text-dark mb-2">Call Outcome</label>
              <select id="smart_call_outcome_select" className="form-control">
                {CALL_OUTCOMES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-6 p-1">
              <label className="font-weight-semibold text-dark mb-2">Duration (seconds)</label>
              <input
                id="smart_call_duration_input"
                type="number"
                min="0"
                className="form-control"
                defaultValue="0"
                onChange={(e) => { e.target.dataset.userEdited = 'true'; }}
              />
            </div>
          </div>
        </div>

        <div className="form-group mb-3 text-left">
          <label className="font-weight-semibold text-dark mb-2">Call Notes</label>
          <textarea
            id="smart_call_notes_input"
            style={{ minHeight: '140px' }}
            className="form-control"
            rows="5"
            placeholder="What was discussed on the call..."
          ></textarea>
        </div>

        <div className="d-flex justify-content-between align-items-center">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleDiscard}>
            Discard / No Log
          </button>
          <button type="button" className="btn btn-info btn-sm px-4" onClick={handleUpdateCallLog}>
            <i className="fa fa-check mr-1"></i>
            Update Call Log
          </button>
        </div>
      </div>
    </div>,
    true,
    'modal1',
    'mosycard_medium'
  );

  startCallTimer();
}

/* ---------------------------------------------------------- */
/* Launch handlers                                              */
/* ---------------------------------------------------------- */

async function launchCall({ mode, profileDataNode = {} }) {
    const rawPhone =
      profileDataNode?.phone_number ||
      profileDataNode?.tel ||
      profileDataNode?.phone ||
      '';
  
    if (!rawPhone) {
      MosyNotify({ message: 'No phone number found for this contact.', icon: 'times-circle', iconColor: 'text-danger' });
      return;
    }
  
    const e164Phone = normalizeKenyanPhone(rawPhone);
  
    MosyNotify({ message: 'Starting call...', icon: 'phone', addTimer: false });
  
    const initResponse = await initiateCallLog({ mode, phone: e164Phone, profileDataNode });
  
    // response.data is the FULL logUtilCall return object: { success, status, message, data: { record_id, insert } }
    const initResult = initResponse?.data || {};
    const wasInitOk = initResponse?.status === 'success' && initResult?.success !== false;
  
    if (!wasInitOk) {
      MosyNotify({
        message: initResult?.message || initResponse?.message || 'Failed to start call log',
        icon: 'times-circle',
        iconColor: 'text-danger'
      });
      return;
    }
  
    const recordId = initResult?.data?.record_id || '';
  
    if (!recordId) {
      MosyNotify({ message: 'Call started but no reference was returned — log update may fail.', icon: 'exclamation-triangle', iconColor: 'text-warning' });
    }
  
    activeCallToken = recordId ? btoa(String(recordId)) : '';
  
    if (mode === 'whatsapp') {
      const waDigits = toWhatsAppDigits(e164Phone);
      const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
      const baseUrl = isMobile ? 'https://api.whatsapp.com/send' : 'https://web.whatsapp.com/send';
      window.open(`${baseUrl}?phone=${waDigits}`, 'whatsapp_call_popup', 'width=920,height=600');
    } else {
      window.location.href = toTelHref(e164Phone);
    }
  
    openCallWaitingCard({ mode, phone: e164Phone, profileDataNode });
  }


/* ---------------------------------------------------------- */
/* Channel picker                                               */
/* ---------------------------------------------------------- */

function CallChannelPicker({ profileDataNode = {}, uiOptions = {} }) {
  const recipientName =
    profileDataNode?.full_name ||
    profileDataNode?.business_name ||
    profileDataNode?.name ||
    'Client';

  const dynamicTitle = uiOptions?.modalTitle || 'Place a Call';

  return (
    <div className="col-md-12 p-0">
      <style>{`
        .elforge_call_icon_btn_v1 {
          width: 100%;
          border-radius: 14px;
          padding: 22px 16px;
          border: 1px solid rgba(0,0,0,0.06);
          background: #fff;
          box-shadow: 0 2px 10px rgba(0,0,0,0.06);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .elforge_call_icon_btn_v1:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.12);
        }
        .elforge_call_icon_circle {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          color: #fff;
        }
        .elforge_call_icon_circle.whatsapp {
          background: linear-gradient(135deg, #25D366, #128C7E);
        }
        .elforge_call_icon_circle.phone {
          background: linear-gradient(135deg, #2196F3, #1565C0);
        }
      `}</style>

      <div className="bg-white rounded p-3 p-md-4">
        <div className="mb-3 border-bottom pb-2 text-left">
          <h5 className="mb-1 font-weight-bold text-dark">{dynamicTitle}</h5>
          <small className="text-muted">Calling {recipientName}</small>
        </div>

        <div className="row justify-content-center col-md-12 m-0 p-0">
          <div className="col-md-6 p-2">
            <button
              type="button"
              className="elforge_call_icon_btn_v1"
              onClick={() => launchCall({ mode: 'whatsapp', profileDataNode })}
            >
              <div className="elforge_call_icon_circle whatsapp">
                <i className="fa fa-whatsapp"></i>
              </div>
              <span className="font-weight-semibold text-dark">WhatsApp Call</span>
            </button>
          </div>
          <div className="col-md-6 p-2">
            <button
              type="button"
              className="elforge_call_icon_btn_v1"
              onClick={() => launchCall({ mode: 'phone', profileDataNode })}
            >
              <div className="elforge_call_icon_circle phone">
                <i className="fa fa-phone"></i>
              </div>
              <span className="font-weight-semibold text-dark">Phone Call</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MosyCommsSmartCall({ profileDataNode = {}, uiOptions = {} } = {}) {
  MosyCard(
    'Smart Call',
    <CallChannelPicker profileDataNode={profileDataNode} uiOptions={uiOptions} />,
    true,
    'modal3',
    'mosycard_wide'
  );
}