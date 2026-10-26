'use client';
import { LoansplansSchema } from '../LoansplansSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import LoansplansActions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function LoansplansList() {
//   return <SmartGrid moduleActions={LoansplansActions} schema={LoansplansSchema} title="Loansplans" />;
// }PaidInvoicesSchema.label
export default function LoansplansList({
  fixedQuery = {},
  dataOut = {},
  title = LoansplansSchema.label,
  description = `${LoansplansSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = LoansplansActions,
  schema = LoansplansSchema,
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