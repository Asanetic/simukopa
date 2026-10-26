'use client';
import { SystemsettingsSchema } from '../SystemsettingsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import SystemsettingsActions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function SystemsettingsList() {
//   return <SmartGrid moduleActions={SystemsettingsActions} schema={SystemsettingsSchema} title="Systemsettings" />;
// }PaidInvoicesSchema.label
export default function SystemsettingsList({
  fixedQuery = {},
  dataOut = {},
  title = SystemsettingsSchema.label,
  description = `${SystemsettingsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = SystemsettingsActions,
  schema = SystemsettingsSchema,
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