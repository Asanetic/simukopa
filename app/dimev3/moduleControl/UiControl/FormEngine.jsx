'use client';
import { useState, useRef } from 'react';

export function useFormEngine(schema, initialValues = {}) {
  const buildDefaults = (source) => {
    const defaults = {};
    schema.fields.forEach((f) => { defaults[f.key] = source[f.key] ?? ''; });
    return defaults;
  };

  const initialValuesKey = JSON.stringify(initialValues);

  const [values, setValues] = useState(() => buildDefaults(initialValues));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  // Seeded with the mount-time key so the block below doesn't immediately
  // re-run what useState's lazy initializer above already did.
  const lastSeenInitialValuesRef = useRef(initialValuesKey);

  // Re-seed whenever the caller hands us a new initialValues object — e.g.
  // useEntityFormController's async getOne(id) resolving after first mount.
  // Without this, values stays frozen at whatever it was on first render.
  //
  // Deliberately NOT a useEffect: an effect fires AFTER the render where
  // `initialValues` (== controller.record) first becomes the real fetched
  // row, so `values` — and therefore the `value` prop every field sees —
  // is one render behind `record` for exactly one paint. Controlled inputs
  // don't notice, but an uncontrolled field like the rich-text editor
  // (SunEditor) only reads its content once, at mount, via defaultValue;
  // whether that first paint has the real value or not determines whether
  // the loaded content ever shows up without a manual refresh. Comparing
  // against a ref and calling setValues mid-render (React's supported
  // "adjust state during render" pattern) re-seeds synchronously, in the
  // SAME render `record` arrives in, before anything downstream mounts.
  if (lastSeenInitialValuesRef.current !== initialValuesKey) {
    lastSeenInitialValuesRef.current = initialValuesKey;
    setValues(buildDefaults(initialValues));
    setErrors({});
  }

  // schema.computeOnChange(changedKey, nextValues) -> patch|null — optional
  // escape hatch for fields that derive from other fields (e.g. an
  // "expected amount" = quantity * unit price, or a "variance" = actual -
  // expected). Called AFTER the just-typed value is applied, with the full
  // next values object, so it can read every other field as it currently
  // stands and return a patch of derived fields to merge in on top. Keep it
  // pure — no side effects, just old values in, patch out.
  const setValue = (key, value) => {
    setValues((v) => {
      const next = { ...v, [key]: value };
      if (typeof schema.computeOnChange !== 'function') return next;
      const patch = schema.computeOnChange(key, next);
      return patch ? { ...next, ...patch } : next;
    });
    if (errors[key]) setErrors((e) => ({ ...e, [key]: null }));
  };

  const validate = () => {
    const newErrors = {};
    schema.fields.forEach((f) => {
      if (f.required && !values[f.key]) newErrors[f.key] = `${f.label} is required`;
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submit = async (onSubmit) => {
    if (!validate()) return false;
    setSubmitting(true);
    try {
      // Previously: `await onSubmit(values); return true;` — this always
      // resolved to the literal boolean `true` on success, discarding
      // whatever onSubmit's own return value was. Since
      // useEntityFormController's handleSubmit calls
      // c.create()/c.update() (which resolve to { ok, message, id }),
      // that whole result — including the new record's dataNode id —
      // was being thrown away right here. Propagate it instead.
      const result = await onSubmit(values);
      return result;
    }
    finally { setSubmitting(false); }
  };

  return { values, setValue, errors, submitting, validate, submit, fields: schema.fields };
}