'use client';
import { SmartpaymentsSchema } from '../SmartpaymentsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import SmartpaymentsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function SmartpaymentsList() {
//   return <SmartGrid moduleActions={SmartpaymentsActions} schema={SmartpaymentsSchema} title="Smartpayments" />;
// }PaidInvoicesSchema.label
export default function SmartpaymentsList({
  fixedQuery = {},
  dataOut = {},
  title = SmartpaymentsSchema.label,
  description = `${SmartpaymentsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = SmartpaymentsActions,
  schema = SmartpaymentsSchema,
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