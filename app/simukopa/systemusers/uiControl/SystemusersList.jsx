'use client';
import { SystemusersSchema } from '../SystemusersSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import SystemusersActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function SystemusersList() {
//   return <SmartGrid moduleActions={SystemusersActions} schema={SystemusersSchema} title="Systemusers" />;
// }PaidInvoicesSchema.label
export default function SystemusersList({
  fixedQuery = {},
  dataOut = {},
  title = SystemusersSchema.label,
  description = `${SystemusersSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = SystemusersActions,
  schema = SystemusersSchema,
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