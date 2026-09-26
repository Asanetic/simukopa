'use client';
import { AgentsSchema } from '../AgentsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import AgentsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function AgentsList() {
//   return <SmartGrid moduleActions={AgentsActions} schema={AgentsSchema} title="Agents" />;
// }PaidInvoicesSchema.label
export default function AgentsList({
  fixedQuery = {},
  dataOut = {},
  title = AgentsSchema.label,
  description = `${AgentsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = AgentsActions,
  schema = AgentsSchema,
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