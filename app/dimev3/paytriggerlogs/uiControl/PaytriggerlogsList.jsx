'use client';
import { PaytriggerlogsSchema } from '../PaytriggerlogsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import PaytriggerlogsActions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function PaytriggerlogsList() {
//   return <SmartGrid moduleActions={PaytriggerlogsActions} schema={PaytriggerlogsSchema} title="Paytriggerlogs" />;
// }PaidInvoicesSchema.label
export default function PaytriggerlogsList({
  fixedQuery = {},
  dataOut = {},
  title = PaytriggerlogsSchema.label,
  description = `${PaytriggerlogsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = PaytriggerlogsActions,
  schema = PaytriggerlogsSchema,
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