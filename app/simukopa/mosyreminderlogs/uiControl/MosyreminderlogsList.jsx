'use client';
import { MosyreminderlogsSchema } from '../MosyreminderlogsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import MosyreminderlogsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function MosyreminderlogsList() {
//   return <SmartGrid moduleActions={MosyreminderlogsActions} schema={MosyreminderlogsSchema} title="Mosyreminderlogs" />;
// }PaidInvoicesSchema.label
export default function MosyreminderlogsList({
  fixedQuery = {},
  dataOut = {},
  title = MosyreminderlogsSchema.label,
  description = `${MosyreminderlogsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = MosyreminderlogsActions,
  schema = MosyreminderlogsSchema,
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