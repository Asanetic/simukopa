'use client';
import { LoansSchema } from '../LoansSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import LoansActions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function LoansList() {
//   return <SmartGrid moduleActions={LoansActions} schema={LoansSchema} title="Loans" />;
// }PaidInvoicesSchema.label
export default function LoansList({
  fixedQuery = {},
  dataOut = {},
  title = LoansSchema.label,
  description = `${LoansSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = LoansActions,
  schema = LoansSchema,
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