'use client';
import { RemindershistorySchema } from '../RemindershistorySchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import RemindershistoryActions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function RemindershistoryList() {
//   return <SmartGrid moduleActions={RemindershistoryActions} schema={RemindershistorySchema} title="Remindershistory" />;
// }PaidInvoicesSchema.label
export default function RemindershistoryList({
  fixedQuery = {},
  dataOut = {},
  title = RemindershistorySchema.label,
  description = `${RemindershistorySchema.label} list`,
  customProfilePath = './profile',
  moduleActions = RemindershistoryActions,
  schema = RemindershistorySchema,
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