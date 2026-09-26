'use client';
import { LoanplansSchema } from '../LoanplansSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import LoanplansActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function LoanplansList() {
//   return <SmartGrid moduleActions={LoanplansActions} schema={LoanplansSchema} title="Loanplans" />;
// }PaidInvoicesSchema.label
export default function LoanplansList({
  fixedQuery = {},
  dataOut = {},
  title = LoanplansSchema.label,
  description = `${LoanplansSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = LoanplansActions,
  schema = LoanplansSchema,
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