'use client';
import { PhonesSchema } from '../PhonesSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import PhonesActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function PhonesList() {
//   return <SmartGrid moduleActions={PhonesActions} schema={PhonesSchema} title="Phones" />;
// }PaidInvoicesSchema.label
export default function PhonesList({
  fixedQuery = {},
  dataOut = {},
  title = PhonesSchema.label,
  description = `${PhonesSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = PhonesActions,
  schema = PhonesSchema,
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