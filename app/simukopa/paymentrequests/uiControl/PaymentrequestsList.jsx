'use client';
import { PaymentrequestsSchema } from '../PaymentrequestsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import PaymentrequestsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function PaymentrequestsList() {
//   return <SmartGrid moduleActions={PaymentrequestsActions} schema={PaymentrequestsSchema} title="Paymentrequests" />;
// }PaidInvoicesSchema.label
export default function PaymentrequestsList({
  fixedQuery = {},
  dataOut = {},
  title = PaymentrequestsSchema.label,
  description = `${PaymentrequestsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = PaymentrequestsActions,
  schema = PaymentrequestsSchema,
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