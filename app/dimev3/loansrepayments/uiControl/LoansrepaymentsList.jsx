'use client';
import { LoansrepaymentsSchema } from '../LoansrepaymentsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import LoansrepaymentsActions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function LoansrepaymentsList() {
//   return <SmartGrid moduleActions={LoansrepaymentsActions} schema={LoansrepaymentsSchema} title="Loansrepayments" />;
// }PaidInvoicesSchema.label
export default function LoansrepaymentsList({
  fixedQuery = {},
  dataOut = {},
  title = LoansrepaymentsSchema.label,
  description = `${LoansrepaymentsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = LoansrepaymentsActions,
  schema = LoansrepaymentsSchema,
  hiddenActions=[],

}) {
  return (
    <GridViewSwitcher
      table={SmartGridClean}
      sheet={ExcelSheetGrid}
      start="table"
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