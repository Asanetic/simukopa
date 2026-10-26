'use client';
import { LoansMonthlyLoansSchema } from '../LoansMonthlyLoansSchema';
import ReportGrid from '../../../../reportControl/UiControl/ReportGrid';

// Thin wrapper only — same job as every module's List. All real logic lives in reportControl/.
export default function LoansMonthlyLoansList({
  schema = LoansMonthlyLoansSchema,           // swap the schema and the whole page changes
  fixedQuery = {},            // values btoa()'d like any module's fixedQuery, e.g. { event: btoa(eventId) }
  title = schema.label,
  description = schema.description,
  hiddenActions = [],
  view,                         // 'general' | 'smart' pins the face; omit for the switch
}) {
  return <ReportGrid schema={schema} title={title} description={description} fixedQuery={fixedQuery} hiddenActions={hiddenActions} view={view} />;
}
