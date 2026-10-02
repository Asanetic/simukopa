'use client';
import { useSearchParams } from 'next/navigation';
import DynamicForm from '../../moduleControl/UiControl/DynamicForm';
import { Smarttemplatev1Schema } from '../Smarttemplatev1Schema';
import { useEntityFormController } from '../../moduleControl/dataControl/useEntityFormController';
import { mosyGetSchemaTitle } from '../../../MosyUtils/hiveUtils';
import Smarttemplatev1Actions from '../logicControl/actionsRegistry';

// Smarttemplatev1Profile — pure shell. It resolves the id, wires up the
// controller, and hands DynamicForm the two strings that make this page
// look like a Company profile: `eyebrow` and `title`. DynamicForm owns
// every pixel of how those get laid out and styled (including the
// profileActions toolbar) — this file has no markup of its own. Point
// the same pattern at a different schema and both the fields AND the
// header/button set change with zero edits here.
export default function Smarttemplatev1Profile({ id: idProp, onDone, hiddenActions = [], presetValues, schemaOverride }) {
  const searchParams = useSearchParams();
  const schema = schemaOverride || Smarttemplatev1Schema;
  const id = idProp ?? searchParams.get(`${Smarttemplatev1Schema.entity}_dataNode`);
  const form = useEntityFormController(schema, Smarttemplatev1Actions, {
    id,
    onDone,
    redirectOnDelete: './list',
    initialValues: presetValues,
  });

  return (
    <DynamicForm
      controller={form}
      eyebrow={form.isEditing ? `${schema.label}  Profile` : `${schema.label}  Directory`}
      title={form.isEditing ? mosyGetSchemaTitle(schema, form.values, '') : `New ${schema.label}`}
      hiddenActions={hiddenActions}
    />
  );
}


 