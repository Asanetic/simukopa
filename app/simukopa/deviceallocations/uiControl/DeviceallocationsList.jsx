'use client';
import { DeviceallocationsSchema } from '../DeviceallocationsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import DeviceallocationsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function DeviceallocationsList() {
//   return <SmartGrid moduleActions={DeviceallocationsActions} schema={DeviceallocationsSchema} title="Deviceallocations" />;
// }PaidInvoicesSchema.label
export default function DeviceallocationsList({
  fixedQuery = {},
  dataOut = {},
  title = DeviceallocationsSchema.label,
  description = `${DeviceallocationsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = DeviceallocationsActions,
  schema = DeviceallocationsSchema,
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