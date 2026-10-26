'use client';
import { DevicesallocationsSchema } from '../DevicesallocationsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import DevicesallocationsActions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function DevicesallocationsList() {
//   return <SmartGrid moduleActions={DevicesallocationsActions} schema={DevicesallocationsSchema} title="Devicesallocations" />;
// }PaidInvoicesSchema.label
export default function DevicesallocationsList({
  fixedQuery = {},
  dataOut = {},
  title = DevicesallocationsSchema.label,
  description = `${DevicesallocationsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = DevicesallocationsActions,
  schema = DevicesallocationsSchema,
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