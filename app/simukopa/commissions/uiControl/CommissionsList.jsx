'use client';
import { CommissionsSchema } from '../CommissionsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import CommissionsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function CommissionsList() {
//   return <SmartGrid moduleActions={CommissionsActions} schema={CommissionsSchema} title="Commissions" />;
// }PaidInvoicesSchema.label
export default function CommissionsList({
  fixedQuery = {},
  dataOut = {},
  title = CommissionsSchema.label,
  description = `${CommissionsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = CommissionsActions,
  schema = CommissionsSchema,
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