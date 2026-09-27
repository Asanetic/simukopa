'use client';
import { LoanapplicationsSchema } from '../LoanapplicationsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import LoanapplicationsActions from '../logicControl/actionsRegistry';
import SmartGridPro from '../../moduleControl/UiControl/Smartgridpro';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function LoanapplicationsList() {
//   return <SmartGrid moduleActions={LoanapplicationsActions} schema={LoanapplicationsSchema} title="Loanapplications" />;
// }PaidInvoicesSchema.label
export default function LoanapplicationsList({
  fixedQuery = {},
  dataOut = {},
  title = LoanapplicationsSchema.label,
  description = `${LoanapplicationsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = LoanapplicationsActions,
  schema = LoanapplicationsSchema,
  hiddenActions=[],

}) {
  return (
    <SmartGridPro
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