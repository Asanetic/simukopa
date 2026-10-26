'use client';
import { Smarttemplatev1Schema } from '../Smarttemplatev1Schema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import Smarttemplatev1Actions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function Smarttemplatev1List() {
//   return <SmartGrid moduleActions={Smarttemplatev1Actions} schema={Smarttemplatev1Schema} title="Smarttemplatev1" />;
// }PaidInvoicesSchema.label
export default function Smarttemplatev1List({
  fixedQuery = {},
  dataOut = {},
  title = Smarttemplatev1Schema.label,
  description = `${Smarttemplatev1Schema.label} list`,
  customProfilePath = './profile',
  moduleActions = Smarttemplatev1Actions,
  schema = Smarttemplatev1Schema,
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