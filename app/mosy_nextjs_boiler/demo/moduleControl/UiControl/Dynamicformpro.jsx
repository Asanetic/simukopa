'use client';
import { useMemo, useRef, useState, useEffect } from 'react';
import { FIELD_COMPONENTS, TextInput } from './FormFields';
import { FormSection, FieldGroup, formLayoutStyles } from './FormLayout';
import mosyThemeConfigs from '../../../appConfigs/mosyTheme';
import { MosyUIGuard } from '../../UiControl/MosyUiGuard';

// ════════════════════════════════════════════════════════════════
// DynamicFormPro — alternate SKIN for DynamicForm. Same props, same
// `controller` (useEntityFormController), same FormSection/FieldGroup/
// FIELD_COMPONENTS. Nothing about values, validation, submit, actions
// or role filtering changes — only markup + CSS (dfp- namespace).
// Drop-in swap: <DynamicForm .../>  ->  <DynamicFormPro .../>
//
// Layout (UI-only, all optional):
//   - every schema.sections entry renders as its own white card, its
//     label as the card heading
//   - section.placement: 'aside'  -> card goes to the right-hand column
//     (defaults to 1 field per row there unless section.columns is set)
//   - prop `description` -> muted subtitle under the title
//   - Save/Update + Clone stay at the bottom, in their own card footer
// ════════════════════════════════════════════════════════════════

const MAX_VISIBLE_ACTIONS = 4;

function btnClass(variant) {
  const v = variant || 'outline-secondary';
  if (v === 'primary' || v === 'dark') return 'dfp-btn-solid';
  if (v.includes('success')) return 'dfp-btn-success';
  if (v.includes('warning')) return 'dfp-btn-warning';
  if (v.includes('danger')) return 'dfp-btn-danger';
  if (v === 'outline-primary') return 'dfp-btn-accent';
  return '';
}

function ActionButton({ action, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`dfp-btn ${btnClass(action.variant)} ${action.colorClass || ''}`.trim()}
      onClick={onClick || action.onClick}
      disabled={disabled}
    >
      {action.icon && <i className={`fa fa-${action.icon}`}></i>}
      <span>{action.label}</span>
    </button>
  );
}

export default function DynamicFormPro({ controller, title, eyebrow, description, hiddenActions = [] }) {
  const themeVars = useMemo(
    () => ({
      '--dfp-accent': mosyThemeConfigs.btnBg,
      '--dfp-accent-contrast': mosyThemeConfigs.btnTxt,
      '--dfp-accent-dark': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 85%, #000000)`,
      '--dfp-accent-soft': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 12%, transparent)`,
      // kept so any dyn-* CSS still loaded elsewhere resolves too
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
    const close = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

  // FormSection is always asked for its 'card' variant here — this skin
  // supplies the per-section card itself, so the 'sectioned' box would
  // double up. Shallow copy only; fields read schema, never mutate it.
  const cardSchema = useMemo(
    () => (controller.schema ? { ...controller.schema, formStyle: 'card' } : controller.schema),
    [controller.schema]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    await controller.submit();
  };

  if (controller.accessDenied) {
    return (
      <MosyUIGuard
        moduleName={controller.schema?.label || controller.schema?.entity}
        reason={`You don't have the "${controller.schema?.moduleRole}" role required to view this.`}
      />
    );
  }

  if (controller.fetching) {
    return (
      <div className="dfp-scope" style={themeVars}>
        <div className="dfp-state">
          <span className="dfp-spinner" aria-hidden="true"></span> Loading...
        </div>
      </div>
    );
  }
  if (controller.fetchError) {
    return (
      <div className="dfp-scope" style={themeVars}>
        <div className="dfp-state dfp-state-error">{controller.fetchError}</div>
      </div>
    );
  }

  const { schema } = controller;
  const resolvedTitle = title || schema?.label;

  // ── actions: identical split to DynamicForm ──
  const profileActions = (controller.actions || [])
    .filter((a) => a.key !== 'save' && a.key !== 'submit')
    .filter((a) => !hiddenActions.includes(a.key));
  const cloneAction = profileActions.find((a) => a.key === 'clone') || null;
  const topActions = profileActions.filter((a) => a.key !== 'clone');
  const visibleActions = topActions.slice(0, MAX_VISIBLE_ACTIONS);
  const overflowActions = topActions.slice(MAX_VISIBLE_ACTIONS);

  const saveActionDef = schema?.profileActions?.find((a) => a.form && (a.key === 'save' || a.key === 'submit'));
  const submitAction = saveActionDef
    ? {
        key: saveActionDef.key,
        label: controller.submitting ? 'Saving...' : controller.submitLabel || saveActionDef.label,
        variant: saveActionDef.variant || 'primary',
        icon: saveActionDef.icon,
        colorClass: saveActionDef.colorClass,
      }
    : null;

  // ── sections split into main / aside columns ──
  const allSections = schema.sections || [];
  const mainSections = allSections.filter((s) => s.placement !== 'aside');
  const asideSections = allSections.filter((s) => s.placement === 'aside');
  const hasAside = asideSections.length > 0;

  const renderSectionCard = (section, isAside) => (
    <div key={section.key} className={`dfp-card ${isAside ? 'dfp-card-aside' : ''}`}>
      <FormSection
        section={isAside && !section.columns ? { ...section, columns: 1 } : section}
        schema={cardSchema}
        values={controller.values}
        errors={controller.errors}
        setValue={controller.setValue}
        isEditing={controller.isEditing}
        row={controller.record}
      />
    </div>
  );

  const flatFields = !schema.sections && !schema.fieldGroups && (
    <div className="dfp-card">
      <div className="dyn-section">
        <div className="dyn-section-panel px-0">
          <div className="row dyn-grid p-0 m-0 col-md-12">
            {schema.fields
              .filter((f) => !f.system && !FIELD_COMPONENTS[f.type]?.hiddenField)
              .map((f) => {
                if (f.computed && !controller.isEditing) return null;
                const FieldComponent = FIELD_COMPONENTS[f.type] || TextInput;
                const colSpan = f.colSpan || Math.max(1, Math.round(12 / (schema.formColumns || 3)));
                return (
                  <div key={f.key} className={`col-md-${colSpan} dyn-field`}>
                    {!FieldComponent.selfLabeled && (
                      <label className="dyn-label">
                        {f.label}
                        {f.required && <span className="dyn-required"> *</span>}
                      </label>
                    )}
                    <FieldComponent
                      field={f}
                      value={controller.values[f.key]}
                      setValue={controller.setValue}
                      readOnly={f.editable === false}
                      schema={schema}
                      row={controller.record}
                    />
                    {controller.errors[f.key] && <div className="dyn-error">{controller.errors[f.key]}</div>}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );

  const bottomTray = (cloneAction || submitAction) && (
    <div className="dfp-card dfp-footer-card">
      <div className="dfp-footer">
        {cloneAction && <ActionButton action={cloneAction} disabled={controller.submitting} />}
        {submitAction && (
          <ActionButton action={submitAction} disabled={controller.submitting} onClick={() => controller.submit()} />
        )}
      </div>
    </div>
  );

  return (
    <div className="dfp-scope  p-3 " style={themeVars}>
      {/* ── Page header: title left, actions right ── */}
      <div className="dfp-header">
        <div className="dfp-header-text">
          {eyebrow && <div className="dfp-eyebrow">{eyebrow}</div>}
          {resolvedTitle && <h1 className="dfp-title">{resolvedTitle}</h1>}
          {description && <p className="dfp-description">{description}</p>}
        </div>

        {topActions.length > 0 && (
          <div className="dfp-actions">
            {visibleActions.map((a) => (
              <ActionButton key={a.key} action={a} disabled={controller.submitting} />
            ))}
            {overflowActions.length > 0 && (
              <div className="dfp-more-wrap" ref={moreRef}>
                <button
                  type="button"
                  className="dfp-btn"
                  onClick={() => setMoreOpen((o) => !o)}
                  aria-expanded={moreOpen}
                >
                  <i className="fa fa-ellipsis-h"></i>
                  <span>More</span>
                </button>
                {moreOpen && (
                  <div className="dfp-more-panel">
                    {overflowActions.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        className={`dfp-more-item ${btnClass(a.variant)} ${a.colorClass || ''}`.trim()}
                        disabled={controller.submitting}
                        onClick={() => {
                          setMoreOpen(false);
                          a.onClick();
                        }}
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
        )}
      </div>

      {/* ── Body ── */}
      <form onSubmit={handleSubmit} className={`dfp-layout ${hasAside ? 'has-aside' : ''}`}>
        <div className="dfp-main">
          {mainSections.map((s) => renderSectionCard(s, false))}

          {schema.fieldGroups?.map((group) => (
            <div key={group.key} className="dfp-card">
              <FieldGroup group={group} values={controller.values} setValue={controller.setValue} />
            </div>
          ))}

          {flatFields}
          {bottomTray}
        </div>

        {hasAside && <aside className="dfp-aside">{asideSections.map((s) => renderSectionCard(s, true))}</aside>}
      </form>

      <style jsx global>{formLayoutStyles}</style>
    </div>
  );
}