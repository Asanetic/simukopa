'use client';
import { MessagetemplatesSchema } from '../MessagetemplatesSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import MessagetemplatesActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function MessagetemplatesList() {
//   return <SmartGrid moduleActions={MessagetemplatesActions} schema={MessagetemplatesSchema} title="Messagetemplates" />;
// }PaidInvoicesSchema.label
export default function MessagetemplatesList({
  fixedQuery = {},
  dataOut = {},
  title = MessagetemplatesSchema.label,
  description = `${MessagetemplatesSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = MessagetemplatesActions,
  schema = MessagetemplatesSchema,
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