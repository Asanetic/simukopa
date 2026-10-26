// Dftemplatev1Schema.js — placeholder. gen-report.js writes the real FRONTEND schema here from report.map.
import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';
import Dftemplatev1Actions from './logicControl/actionsRegistry';
const apiRoutes = getApiRoutes();

export const Dftemplatev1Schema = {
  entity: 'placeholder', label: 'Report', description: '',
  apiBase: apiRoutes.dftemplatev1?.base, moduleRole: 'view_reports', currency: 'KES',
  actionRegistry: Dftemplatev1Actions,
  groupBy: 'month', groupLabel: 'Month',
  fields: [], remarks: [], headline: '',
};
