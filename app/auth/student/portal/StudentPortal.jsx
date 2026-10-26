'use client';

import { useEffect, useState } from 'react';
import saAuthConfigs from '../../featureConfig/saAuthConfigs';
import { mosyGetLSData, dayTime } from '../../../MosyUtils/hiveUtils';
import { removeAuthSession } from '../../AuthUtils';
import { hiveRoutes } from '../../../appConfigs/hiveRoutes';

// Landing page after the student splash. Placeholder home: greets the student and guards the route
// (only a student session gets in). Build the real student features (fees, results, timetable) here.
export default function StudentPortal() {
  const { sessionPrefix } = saAuthConfigs;
  const [student, setStudent] = useState(null);

  useEffect(() => {
    const get = (k) => mosyGetLSData(`${sessionPrefix}_sa_authsess_${k}_val`);
    if (get('account_type') !== 'student') {
      window.location.href = `${hiveRoutes.auth}/student`; // not a student session -> student login
      return;
    }
    setStudent({ name: get('name'), admission: get('admission_number'), tel: get('tel') });
  }, [sessionPrefix]);

  if (!student) return null;
  return (
    <div className="container py-5" style={{ maxWidth: 720 }}>
      <div className="card p-4">
        <h3>Good {dayTime()} {String(student.name || '').split(' ')[0]}</h3>
        <p className="text-muted mb-1">Admission No: <b>{student.admission || '-'}</b></p>
        <p className="text-muted">Phone: <b>{student.tel || '-'}</b></p>
        <p>Your student portal is ready. Fees, results and timetable will show here.</p>
        <button type="button" className="btn btn-outline-secondary" onClick={() => { removeAuthSession(); window.location.href = `${hiveRoutes.auth}/student`; }}>Logout</button>
      </div>
    </div>
  );
}
