'use client';
import { Smarttemplatev1Schema } from '../Smarttemplatev1Schema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import Smarttemplatev1Actions from '../logicControl/actionsRegistry';

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
    <SmartGrid
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