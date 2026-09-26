'use client';
import { LoansSchema } from '../LoansSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import LoansActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
export default function LoansList({
  fixedQuery = {},
  dataOut = {},
  title = LoansSchema.label,
  description = `${LoansSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = LoansActions,
  schema = LoansSchema,
  hiddenActions = [],

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
