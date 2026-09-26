'use client';
import { CallsSchema } from '../CallsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import CallsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function CallsList() {
//   return <SmartGrid moduleActions={CallsActions} schema={CallsSchema} title="Calls" />;
// }PaidInvoicesSchema.label
export default function CallsList({
  fixedQuery = {},
  dataOut = {},
  title = CallsSchema.label,
  description = `${CallsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = CallsActions,
  schema = CallsSchema,
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