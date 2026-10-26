'use client';
import { PaytriggersettingsSchema } from '../PaytriggersettingsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import PaytriggersettingsActions from '../logicControl/actionsRegistry';
import SmartGridClean from '../../moduleControl/UiControl/SmartGridClean';
import GridViewSwitcher from '../../moduleControl/UiControl/GridViewSwitcher';
import ExcelSheetGrid from '../../moduleControl/UiControl/SmartGridSheet';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function PaytriggersettingsList() {
//   return <SmartGrid moduleActions={PaytriggersettingsActions} schema={PaytriggersettingsSchema} title="Paytriggersettings" />;
// }PaidInvoicesSchema.label
export default function PaytriggersettingsList({
  fixedQuery = {},
  dataOut = {},
  title = PaytriggersettingsSchema.label,
  description = `${PaytriggersettingsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = PaytriggersettingsActions,
  schema = PaytriggersettingsSchema,
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