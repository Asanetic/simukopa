'use client';
import { PaymentsSchema } from '../PaymentsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import PaymentsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function PaymentsList() {
//   return <SmartGrid moduleActions={PaymentsActions} schema={PaymentsSchema} title="Payments" />;
// }PaidInvoicesSchema.label
export default function PaymentsList({
  fixedQuery = {},
  dataOut = {},
  title = PaymentsSchema.label,
  description = `${PaymentsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = PaymentsActions,
  schema = PaymentsSchema,
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