'use client';
import { MosyremindersSchema } from '../MosyremindersSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import MosyremindersActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function MosyremindersList() {
//   return <SmartGrid moduleActions={MosyremindersActions} schema={MosyremindersSchema} title="Mosyreminders" />;
// }PaidInvoicesSchema.label
export default function MosyremindersList({
  fixedQuery = {},
  dataOut = {},
  title = MosyremindersSchema.label,
  description = `${MosyremindersSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = MosyremindersActions,
  schema = MosyremindersSchema,
  hiddenActions=[],

}) {
  return (
    <SmartGrid
      moduleActions={moduleActions}
      schema={schema}
      title={title}
      description={description}
      customProfilePath={customProfilePath}
      fixedQuery={fixedQuery}
      dataOut={dataOut}
      hiddenActions={hiddenActions}
    />
  );
}