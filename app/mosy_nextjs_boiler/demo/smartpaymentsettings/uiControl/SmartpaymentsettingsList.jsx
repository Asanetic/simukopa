'use client';
import { SmartpaymentsettingsSchema } from '../SmartpaymentsettingsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import SmartpaymentsettingsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function SmartpaymentsettingsList() {
//   return <SmartGrid moduleActions={SmartpaymentsettingsActions} schema={SmartpaymentsettingsSchema} title="Smartpaymentsettings" />;
// }PaidInvoicesSchema.label
export default function SmartpaymentsettingsList({
  fixedQuery = {},
  dataOut = {},
  title = SmartpaymentsettingsSchema.label,
  description = `${SmartpaymentsettingsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = SmartpaymentsettingsActions,
  schema = SmartpaymentsettingsSchema,
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