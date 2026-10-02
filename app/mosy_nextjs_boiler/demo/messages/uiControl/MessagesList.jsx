'use client';
import { MessagesSchema } from '../MessagesSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import MessagesActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function MessagesList() {
//   return <SmartGrid moduleActions={MessagesActions} schema={MessagesSchema} title="Messages" />;
// }PaidInvoicesSchema.label
export default function MessagesList({
  fixedQuery = {},
  dataOut = {},
  title = MessagesSchema.label,
  description = `${MessagesSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = MessagesActions,
  schema = MessagesSchema,
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