'use client';
import { DeviceslistSchema } from '../DeviceslistSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import DeviceslistActions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function DeviceslistList() {
//   return <SmartGrid moduleActions={DeviceslistActions} schema={DeviceslistSchema} title="Deviceslist" />;
// }PaidInvoicesSchema.label
export default function DeviceslistList({
  fixedQuery = {},
  dataOut = {},
  title = DeviceslistSchema.label,
  description = `${DeviceslistSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = DeviceslistActions,
  schema = DeviceslistSchema,
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