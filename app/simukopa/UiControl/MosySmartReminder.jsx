/**
 * Final FILE: send-smart-reminder.jsx
 * Auto Generated Frontend Functions
 */

import { MosyCard, closeMosyCard } from '../../components/MosyCard';
import { MosyNotify } from '../../MosyUtils/ActionModals';
import { mosyPostData } from '../../MosyUtils/hiveUtils';
import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';

const apiRoutes = getApiRoutes();

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MESSAGE_PLACEHOLDERS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'tel', label: 'Tel' },
  { key: 'email', label: 'Email' },
  { key: 'amount', label: 'Amount' }
];

function insertPlaceholderAtCursor(placeholderKey) {
  if (typeof document === 'undefined') return;

  const textarea = document.getElementById('reminder_message_input');
  if (!textarea) return;

  const token = `{${placeholderKey}}`;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;

  textarea.value = `${textarea.value.slice(0, start)}${token}${textarea.value.slice(end)}`;

  const cursorPos = start + token.length;
  textarea.focus();
  textarea.setSelectionRange(cursorPos, cursorPos);
}

function toggleDayPill(day, selectedDays) {
  if (typeof document === 'undefined') return;

  const pillBtn = document.getElementById(`reminder_day_pill_${day}`);
  if (!pillBtn) return;

  if (selectedDays.has(day)) {
    selectedDays.delete(day);
    pillBtn.classList.remove('btn-info');
    pillBtn.classList.add('btn-outline-secondary');
  } else {
    selectedDays.add(day);
    pillBtn.classList.remove('btn-outline-secondary');
    pillBtn.classList.add('btn-info');
  }
}

async function saveReminder({ profileDataNode = {}, selectedDays, reminderData = null, onSaved }) {
  const subjectInput = typeof document !== 'undefined' ? document.getElementById('reminder_subject_input') : null;
  const telInput = typeof document !== 'undefined' ? document.getElementById('reminder_tel_input') : null;
  const emailInput = typeof document !== 'undefined' ? document.getElementById('reminder_email_input') : null;
  const timeInput = typeof document !== 'undefined' ? document.getElementById('reminder_time_input') : null;
  const repeatInput = typeof document !== 'undefined' ? document.getElementById('reminder_repeat_input') : null;
  const messageInput = typeof document !== 'undefined' ? document.getElementById('reminder_message_input') : null;

  const isEditing = !!reminderData;

  const messageSubject = subjectInput?.value?.trim() || '';
  const recipientsPhone = telInput?.value?.trim() || '';
  const recipientsEmail = emailInput?.value?.trim() || '';
  const timeOfDay = timeInput?.value || '';
  const repeatType = repeatInput?.value || 'repeat';
  const messageContent = messageInput?.value?.trim() || '';
  const daysOfWeek = WEEK_DAYS.filter((day) => selectedDays.has(day)).join(',');

  if (!messageContent) {
    MosyNotify({
      message: 'Message body is required before setting a reminder.',
      icon: 'times-circle',
      iconColor: 'text-danger'
    });
    return;
  }

  if (!recipientsPhone && !recipientsEmail) {
    MosyNotify({
      message: 'Add at least one phone or email recipient.',
      icon: 'times-circle',
      iconColor: 'text-danger'
    });
    return;
  }

  if (!daysOfWeek) {
    MosyNotify({
      message: 'Select at least one day of the week.',
      icon: 'times-circle',
      iconColor: 'text-danger'
    });
    return;
  }

  if (!timeOfDay) {
    MosyNotify({
      message: 'Set a time of day for this reminder.',
      icon: 'times-circle',
      iconColor: 'text-danger'
    });
    return;
  }

  MosyNotify({ message: isEditing ? 'Updating reminder...' : 'Saving reminder...', icon: 'save', addTimer: false });

  const relatedRecordId = isEditing
    ? (reminderData?.related_record_id || '')
    : (
      profileDataNode?.related_record_id ||
      profileDataNode?.record_id ||
      profileDataNode?.contact_id ||
      profileDataNode?.activity_id ||
      profileDataNode?.client_id ||
      ''
    );

  const payload = {
    tenant_id: (isEditing ? reminderData?.tenant_id : profileDataNode?.tenant_id) || '',
    app_name: (isEditing ? reminderData?.app_name : profileDataNode?.app_name) || 'IMS',
    related_record_id: relatedRecordId,
    time_of_day: timeOfDay,
    days_of_week: daysOfWeek,
    repeat_type: repeatType,
    recipients_phone: recipientsPhone,
    recipients_email: recipientsEmail,
    subject: messageSubject,
    message: messageContent,
    variable_source: reminderData?.variable_source || '',
    status: reminderData?.status || 'Active',
    reg_date: '',
  };

  let response;
  if (isEditing) {
    payload.mosy_reminders_dataNode = btoa(String(reminderData.primkey));
    payload.mosy_reminders_mosy_action = 'update_mosy_reminders';
    response = await mosyPostData({
      url: apiRoutes.mosyreminders.base,
      method: 'PUT',
      data: payload
    });
  } else {
    payload.mosy_reminders_mosy_action = 'add_mosy_reminders';
    response = await mosyPostData({
      url: apiRoutes.mosyreminders.base,
      method: 'POST',
      data: payload
    });
  }

  if (response?.status === 'success') {
    MosyNotify({
      message: response?.message || (isEditing ? 'Reminder updated successfully' : 'Reminder saved successfully'),
      icon: 'check-circle',
      iconColor: 'text-success'
    });
    closeMosyCard('modal3');
    onSaved?.();
    return;
  }

  MosyNotify({
    message: response?.message || (isEditing ? 'Failed to update reminder' : 'Failed to save reminder'),
    icon: 'times-circle',
    iconColor: 'text-danger'
  });
}

function ReminderComposerUI({ profileDataNode = {}, uiOptions = {}, reminderData = null, onSaved } = {}) {
  const isEditing = !!reminderData;

  const selectedDays = new Set(
    isEditing
      ? String(reminderData?.days_of_week || '').split(',').map((d) => d.trim()).filter(Boolean)
      : []
  );

  const dynamicTitle = uiOptions?.modalTitle || (isEditing ? 'Edit Reminder' : 'Set Reminder');
  const defaultSubject = isEditing ? (reminderData?.subject || '') : (uiOptions?.subject || '');
  const defaultMessage = isEditing ? (reminderData?.message || '') : (uiOptions?.message || uiOptions?.body || '');
  const defaultTel = isEditing
    ? (reminderData?.recipients_phone || '')
    : (profileDataNode?.phone_number || profileDataNode?.tel || profileDataNode?.phone || '');
  const defaultEmail = isEditing
    ? (reminderData?.recipients_email || '')
    : (profileDataNode?.email_address || profileDataNode?.primary_email || profileDataNode?.email || '');
  // DB stores TIME as "HH:MM:SS" — <input type="time"> only accepts "HH:MM".
  const defaultTime = String(reminderData?.time_of_day || '').slice(0, 5);
  const defaultRepeat = reminderData?.repeat_type || 'repeat';

  return (
    <div className="col-md-12 p-0">
      <div className="bg-white rounded p-3 p-md-4">
        <div className="d-flex align-items-start justify-content-between mb-3">
          <div>
            <h5 className="mb-1 font-weight-bold text-dark col-md-12 text-left p-0 m-0">{dynamicTitle}</h5>
            <small className="text-muted">{isEditing ? 'Update this recurring reminder message' : 'Create a recurring reminder message'}</small>
          </div>
          <button
            type="button"
            className="btn btn-info btn-sm px-4"
            onClick={() => saveReminder({ profileDataNode, selectedDays, reminderData, onSaved })}
          >
            <i className={`fa ${isEditing ? 'fa-save' : 'fa-bell'} mr-1`}></i>
            {isEditing ? 'Update' : 'Set'}
          </button>
        </div>

        <div className="form-group mb-3 text-left">
          <div className="row m-0">
            <div className="col-md-6 p-1">
              <label className="font-weight-semibold text-dark mb-2">Telephone Recipients</label>
              <textarea
                id="reminder_tel_input"
                className="form-control"
                rows="2"
                placeholder="Enter phone numbers, comma separated"
                defaultValue={defaultTel}
              ></textarea>
            </div>
            <div className="col-md-6 p-1">
              <label className="font-weight-semibold text-dark mb-2">Email Recipients</label>
              <textarea
                id="reminder_email_input"
                className="form-control"
                rows="2"
                placeholder="Enter email addresses, comma separated"
                defaultValue={defaultEmail}
              ></textarea>
            </div>
          </div>
        </div>

        <div className="form-group mb-3 text-left">
          <label className="font-weight-semibold text-dark mb-2">Subject</label>
          <input
            id="reminder_subject_input"
            type="text"
            className="form-control"
            placeholder="Enter reminder subject"
            defaultValue={defaultSubject}
          />
        </div>

        <div className="form-group mb-3 text-left">
          <div className="row m-0 align-items-end">
            <div className="col-md-5 p-1">
              <label className="font-weight-semibold text-dark mb-2 d-block">Days to Send</label>
              {WEEK_DAYS.map((day) => (
                <button
                  key={day}
                  id={`reminder_day_pill_${day}`}
                  type="button"
                  className={`btn btn-sm rounded-pill mr-2 mb-2 ${selectedDays.has(day) ? 'btn-info' : 'btn-outline-secondary'}`}
                  onClick={() => toggleDayPill(day, selectedDays)}
                >
                  {day}
                </button>
              ))}
            </div>
            <div className="col-md-3 p-1">
              <label className="font-weight-semibold text-dark mb-2">Frequency</label>
              <select id="reminder_repeat_input" className="form-control" defaultValue={defaultRepeat}>
                <option value="repeat">Repeat weekly</option>
                <option value="once">Once</option>
              </select>
            </div>
            <div className="col-md-4 p-1">
              <label className="font-weight-semibold text-dark mb-2">Time</label>
              <input id="reminder_time_input" type="time" className="form-control" defaultValue={defaultTime} />
            </div>
          </div>
        </div>

        <div className="form-group mb-3 text-left">
          <label className="font-weight-semibold text-dark mb-2 d-block">Message Body</label>
          <div className="mb-2">
            {MESSAGE_PLACEHOLDERS.map((placeholder) => (
              <button
                key={placeholder.key}
                type="button"
                className="btn btn-outline-info btn-sm rounded-pill mr-2 mb-2"
                onClick={() => insertPlaceholderAtCursor(placeholder.key)}
              >
                {`{${placeholder.key}}`}
              </button>
            ))}
          </div>
          <textarea
            id="reminder_message_input"
            style={{ minHeight: '200px' }}
            className="form-control"
            rows="7"
            placeholder="Write your reminder message..."
            defaultValue={defaultMessage}
          ></textarea>
        </div>
      </div>
    </div>
  );
}

// Pass `reminderData` (a mosy_reminders row — needs at least `primkey`) to
// edit & PUT-update that reminder instead of creating a new one. Everything
// else (recipients, days, time, message) prefills from it.
export function MosySendSmartReminder({ profileDataNode = {}, uiOptions = {}, reminderData = null, onSaved } = {}) {
  MosyCard(
    reminderData ? 'Edit Reminder' : 'Smart Reminder',
    <ReminderComposerUI profileDataNode={profileDataNode} uiOptions={uiOptions} reminderData={reminderData} onSaved={onSaved} />,
    true,
    'modal3',
    'mosycard_wide'
  );
}
