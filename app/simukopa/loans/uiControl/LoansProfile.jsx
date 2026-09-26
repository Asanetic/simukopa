'use client';
import { useSearchParams } from 'next/navigation';
import DynamicForm from '../../moduleControl/UiControl/DynamicForm';
import { LoansSchema } from '../LoansSchema';
import { useEntityFormController } from '../../moduleControl/dataControl/useEntityFormController';
import { mosyGetSchemaTitle } from '../../../MosyUtils/hiveUtils';
import LoansActions from '../logicControl/actionsRegistry';

// LoansProfile — pure shell. Same shape as PhonesProfile/ClientsProfile:
// resolves the id, wires up the controller, hands DynamicForm the
// eyebrow/title strings. No markup of its own.
export default function LoansProfile({ id: idProp, onDone, hiddenActions = [], presetValues, schemaOverride }) {
  const searchParams = useSearchParams();
  const schema = schemaOverride || LoansSchema;
  const id = idProp ?? searchParams.get(`${LoansSchema.entity}_dataNode`);
  const form = useEntityFormController(schema, LoansActions, {
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
