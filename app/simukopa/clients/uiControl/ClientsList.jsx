'use client';
import { ClientsSchema } from '../ClientsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import ClientsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function ClientsList() {
//   return <SmartGrid moduleActions={ClientsActions} schema={ClientsSchema} title="Clients" />;
// }PaidInvoicesSchema.label
export default function ClientsList({
  fixedQuery = {},
  dataOut = {},
  title = ClientsSchema.label,
  description = `${ClientsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = ClientsActions,
  schema = ClientsSchema,
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