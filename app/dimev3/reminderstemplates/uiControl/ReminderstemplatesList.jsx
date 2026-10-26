'use client';
import { ReminderstemplatesSchema } from '../ReminderstemplatesSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import ReminderstemplatesActions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function ReminderstemplatesList() {
//   return <SmartGrid moduleActions={ReminderstemplatesActions} schema={ReminderstemplatesSchema} title="Reminderstemplates" />;
// }PaidInvoicesSchema.label
export default function ReminderstemplatesList({
  fixedQuery = {},
  dataOut = {},
  title = ReminderstemplatesSchema.label,
  description = `${ReminderstemplatesSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = ReminderstemplatesActions,
  schema = ReminderstemplatesSchema,
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