'use client';
import { useMemo, useRef, useState, useEffect } from 'react';
import { FIELD_COMPONENTS, TextInput } from './FormFields';
import { FormSection, FieldGroup, formLayoutStyles } from './FormLayout';
import mosyThemeConfigs from '../../../appConfigs/mosyTheme'; // adjust the relative path to match where DynamicForm sits
import { MosyUIGuard } from '../../UiControl/MosyUiGuard';

// Past this many action buttons, the rest collapse into a "More" popover
// instead of the row growing indefinitely.
const MAX_VISIBLE_ACTIONS = 4;

// DynamicForm — markup only. Renders schema.sections / schema.fieldGroups
// using controller.values/errors/setValue. Doesn't know what entity this
// is or what Save actually calls — that's useEntityFormController's job.
//
// Visual skin is picked by schema.formStyle:
//   'card'      (default) — one white rounded card wraps every section,
//                matches the TailAdmin "Add Product" reference exactly.
//   'sectioned' — each section gets its own bordered box (legacy/Symphony
//                look) — set this per-schema to keep that look where wanted.
//
// Brand color comes from mosyThemeConfigs (--dyn-primary below), same
// pattern as TestGrid's .etc-card — one value, no derived shades to keep
// in sync.
//
// HEADER: page-level chrome (title + profileActions toolbar) lives here
// now, not in the calling page component. Pages pass plain strings —
// `title` and an optional `eyebrow` — and this file is responsible for
// how they're laid out and styled next to controller.actions
// (Back/Activate/Disable/Delete/etc, resolved from schema.profileActions).
// That keeps every profile page a thin shell: compute the record's title
// text, hand it to DynamicForm, done. Beyond MAX_VISIBLE_ACTIONS the rest
// collapse into a "More" popover so the header stays a fixed height no
// matter how many profileActions a schema defines.
//
// TOP vs BOTTOM tray: Save/Update and Clone are treated as "commit"
// actions and live in a tray under the form fields, not in the header —
// Back/Delete/Activate/etc (anything else from schema.profileActions)
// stay in the top toolbar. This mirrors the usual "review, then commit
// at the bottom" flow instead of putting Save above content the person
// hasn't seen yet.

export default function DynamicForm({ controller, title, eyebrow, hiddenActions = [] }) {  
  const themeVars = useMemo(
    () => ({
      '--dyn-primary': mosyThemeConfigs.btnBg,
      '--dyn-primary-contrast': mosyThemeConfigs.btnTxt,
      '--dyn-radius': mosyThemeConfigs.systemBorderRadius,
    }),
    []
  );

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handleOutsideClick = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [moreOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await controller.submit();
  };

  // Placed after every hook call above (Rules of Hooks) — same reasoning
  // as CompaniesGrid.jsx's identical check. Checked before fetching/
  // fetchError below: no point showing a loading spinner for data the
  // person isn't allowed to see in the first place.
  if (controller.accessDenied) {
    return (
      <MosyUIGuard
        moduleName={controller.schema?.label || controller.schema?.entity}
        reason={`You don't have the "${controller.schema?.moduleRole}" role required to view this.`}
      />
    );
  }

  if (controller.fetching) return <div className="text-center text-muted py-4">Loading...</div>;
  if (controller.fetchError) return <div className="text-danger py-4">{controller.fetchError}</div>;

  const { schema } = controller;
  const variant = schema.formStyle || 'card';

  // Fall back to the first section's label only if the caller didn't pass
  // an explicit title — keeps old schemas (no title prop wired up yet)
  // looking correct without every page needing an update at once.
  const resolvedTitle = title || (variant === 'card' && schema.sections?.length === 1 ? schema.sections[0].label : null);

  // If there's exactly one section, its label is already shown as the
  // page title above — don't render it a second time inside the section.
  const suppressFirstLabel = variant === 'card' && schema.sections?.length === 1;

  // Overflow logic (MAX_VISIBLE_ACTIONS + "More" popover) only applies to
  // the top toolbar. Save/Update and Clone are pulled out below and
  // rendered in the bottom tray instead — they never count toward
  // MAX_VISIBLE_ACTIONS or collapse into "More". editOnly and role
  // filtering are ALREADY done by useEntityFormController's own
  // `actions` computation — no need to re-derive that here.
  const profileActions = (controller.actions || [])
    .filter((a) => a.key !== 'save' && a.key !== 'submit')
    .filter((a) => !hiddenActions.includes(a.key));

  // Clone ships in the bottom tray next to Save/Update instead of the
  // top actions row, so pull it out here before computing overflow —
  // otherwise it could get pushed into the "More" popover or eat one of
  // the MAX_VISIBLE_ACTIONS slots meant for Back/Delete/Activate/etc.
  const cloneAction = profileActions.find((a) => a.key === 'clone') || null;
  const topActions = profileActions.filter((a) => a.key !== 'clone');

  const hasOverflow = topActions.length > MAX_VISIBLE_ACTIONS;
  const visibleActions = hasOverflow ? topActions.slice(0, MAX_VISIBLE_ACTIONS) : topActions;
  const overflowActions = hasOverflow ? topActions.slice(MAX_VISIBLE_ACTIONS) : [];

  // The Save/Update button itself is schema-driven too — it only exists
  // because schema.js defines a profileActions entry flagged `form: true`
  // with key 'save' (or 'submit'). Comment that entry out and the button
  // disappears, same as any other action. Must match on key as well as
  // `form` — matching on `form` alone grabs whichever entry happens to
  // be listed first (e.g. 'back'), not necessarily the actual submit
  // button. Schema controls presence and labeling only — the actual
  // submit behavior (notify sequence, URL dataNode sync) lives in
  // useEntityFormController's submit(), called via handleSubmit below.
  const saveActionDef = controller.schema?.profileActions?.find((a) => a.form && (a.key === 'save' || a.key === 'submit'));
  const submitAction = saveActionDef
    ? {
        key: saveActionDef.key,
        label: controller.submitting ? 'Saving...' : (controller.submitLabel || saveActionDef.label),
        variant: saveActionDef.variant || 'primary',
        icon: saveActionDef.icon,
        colorClass: saveActionDef.colorClass,
      }
    : null;

  const sections = (
    <>
      {schema.sections?.map((section, i) => (
        <FormSection
          key={section.key}
          section={suppressFirstLabel && i === 0 ? { ...section, label: null } : section}
          schema={schema}
          values={controller.values}
          errors={controller.errors}
          setValue={controller.setValue}
          isEditing={controller.isEditing}
          row={controller.record}
        />
      ))}

      {schema.fieldGroups?.map((group) => (
        <FieldGroup key={group.key} group={group} values={controller.values} setValue={controller.setValue} />
      ))}

      {/* Fallback: no sections/fieldGroups at all -> flat field list.
          Defaults to 3-per-row (Bootstrap's col-md-4 equivalent) unless
          the schema opts into a different column count. */}
      {!schema.sections && !schema.fieldGroups && (
        <div className="row dyn-grid">
          {schema.fields.filter((f) => !f.system && !FIELD_COMPONENTS[f.type]?.hiddenField).map((f) => {
          // {schema.fields.filter((f) => !f.system).map((f) => {
            if (f.computed && !controller.isEditing) return null;
            const FieldComponent = FIELD_COMPONENTS[f.type] || TextInput;
            const colSpan = f.colSpan || Math.max(1, Math.round(12 / (schema.formColumns || 3)));
            return (
              <div key={f.key} className={`col-md-${colSpan} dyn-field`}>
                {!FieldComponent.selfLabeled && (
                  <label className="dyn-label">{f.label}{f.required && <span className="dyn-required"> *</span>}</label>
                )}
                <FieldComponent field={f} value={controller.values[f.key]} setValue={controller.setValue} readOnly={f.editable === false} schema={schema} row={controller.record} />
                {controller.errors[f.key] && <div className="dyn-error">{controller.errors[f.key]}</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  // Bottom tray — Clone + Save/Update. Kept off the top toolbar on
  // purpose: these are the two actions that commit to a change
  // (duplicate the record, or write the current edits), so they sit
  // under the fields the person just reviewed instead of above content
  // they haven't seen yet. Rendered *inside* dyn-page-card below (for
  // the 'card' variant) so the buttons sit within the same shadowed
  // white box as the fields, instead of floating in the plain page
  // background underneath it and looking like they belong to a
  // different container.
  //
  // Extra bottom clearance (pb-5 + inline marginBottom) is deliberate,
  // not decorative: when DynamicForm renders inside a modal, the tray
  // otherwise ends up flush against the modal's bottom edge and gets
  // buried under modal chrome (rounded corner clipping, a fixed footer,
  // a close affordance, etc). The padding gives the modal's own scroll
  // container room to scroll the buttons fully into view instead of
  // stopping right at their edge. Safe to trim if a given modal wrapper
  // already reserves its own footer space.
  const bottomTray = (cloneAction || submitAction) && (
    <div
      className="dyn-bottom-tray row justify-content-end mx-0 px-0 mt-4 pt-3 pb-5 border-top"
      style={{ marginBottom: '1.5rem' }}
    >
      {cloneAction && (
        <div className="col-6 col-sm-auto mb-2 mb-sm-0 px-1">
          <button
            type="button"
            className={`dyn-btn dyn-btn-${cloneAction.variant || 'outline-secondary'} ${cloneAction.colorClass || ''} w-100`}
            onClick={cloneAction.onClick}
            disabled={controller.submitting}
          >
            {cloneAction.icon && <i className={`fa fa-${cloneAction.icon}`}></i>}
            <span>{cloneAction.label}</span>
          </button>
        </div>
      )}

      {submitAction && (
        <div className="col-6 col-sm-auto px-1">
          <button
            type="button"
            className={`dyn-btn dyn-btn-${submitAction.variant} ${submitAction.colorClass || ''} w-100`}
            onClick={() => controller.submit()}
            disabled={controller.submitting}
          >
            {submitAction.icon && <i className={`fa fa-${submitAction.icon}`}></i>}
            <span>{submitAction.label}</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="dyn-form-scope pt-3" style={themeVars}>
      {(resolvedTitle || eyebrow) && (
        <div className="dyn-page-header mb-3 border-bottom ">
          <div className="dyn-page-header-text">
            {eyebrow && <span className="dyn-eyebrow text-left">{eyebrow}</span>}
            {resolvedTitle && <h1 className="dyn-page-title text-left">{resolvedTitle}</h1>}
          </div>
        </div>
      )}

      {/* Top toolbar tray — everything from schema.profileActions EXCEPT
          Save/Update and Clone (Back/Delete/Activate/Disable/etc).
          Bootstrap col-6/col-sm-auto on each button wrapper drives the
          stacking (2-up on phones, inline from sm up) — dyn-btn itself
          carries zero layout, only color/type/spacing.

          Color: variant (outline-secondary/success/warning/danger/
          primary) picks the base dyn-btn-<variant> look. An optional
          schema.profileActions[].colorClass string gets appended after
          it — use it to nudge/override one specific button's color
          (e.g. a custom CSS class) without touching variant, which still
          controls hover/disabled states and the "More" popover's
          matching dyn-more-item-<variant> class. */}
      <div className="dyn-toolbar-tray row justify-content-end justify-content-sm-end mx-0 px-0 ">
        <div className="dyn-toolbar-actions row justify-content-lg-end justify-content-end  px-0 mx-0 w-100">
          {visibleActions.map((a) => (
            <div key={a.key} className="col-6 col-sm-auto mb-2 mb-sm-0 px-1">
              <button
                type="button"
                className={`dyn-btn dyn-btn-${a.variant || 'outline-secondary'} ${a.colorClass || ''} w-100`}
                onClick={a.onClick}
                disabled={controller.submitting}
              >
                {a.icon && <i className={`fa fa-${a.icon}`}></i>}
                <span>{a.label}</span>
              </button>
            </div>
          ))}

          {hasOverflow && (
            <div className="col-6 col-sm-auto mb-2 mb-sm-0 px-1 dyn-more-wrap" ref={moreRef}>
              <button
                type="button"
                className="dyn-btn dyn-btn-outline-secondary w-100"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
              >
                <i className="fa fa-ellipsis-h"></i>
                <span>More</span>
              </button>
              {moreOpen && (
                // Anchored right:0/left:auto so the panel hangs off the
                // right edge of the "More" button rather than the left —
                // on mobile the button usually sits at the right edge of
                // the tray, and a left-anchored panel would render
                // partially (or fully) off-screen.
                <div className="dyn-more-panel" style={{ right: 0, left: 'auto' }}>
                  {overflowActions.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      className={`dyn-more-item dyn-more-item-${a.variant || 'outline-secondary'} ${a.colorClass || ''}`}
                      onClick={() => {
                        setMoreOpen(false);
                        a.onClick();
                      }}
                      disabled={controller.submitting}
                    >
                      {a.icon && <i className={`fa fa-${a.icon}`}></i>}
                      <span>{a.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="dyn-header-divider" />

      <form onSubmit={handleSubmit}>
        {variant === 'card' ? (
          // bottomTray lives INSIDE dyn-page-card here — same shadowed
          // white box as the fields, so Save/Clone read as part of the
          // container instead of floating below it.
          <div className="dyn-page-card">
            {sections}
            {bottomTray}
          </div>
        ) : (
          <>
            {sections}
            {bottomTray}
          </>
        )}
      </form>

      <style jsx global>{formLayoutStyles}</style>
    </div>
  );
}