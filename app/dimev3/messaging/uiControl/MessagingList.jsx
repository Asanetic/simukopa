'use client';
import { MessagingSchema } from '../MessagingSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import MessagingActions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function MessagingList() {
//   return <SmartGrid moduleActions={MessagingActions} schema={MessagingSchema} title="Messaging" />;
// }PaidInvoicesSchema.label
export default function MessagingList({
  fixedQuery = {},
  dataOut = {},
  title = MessagingSchema.label,
  description = `${MessagingSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = MessagingActions,
  schema = MessagingSchema,
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