import { mosyFlexSelect, mmres, base64Encode } from '../../../apiUtils/dataControl/dataUtils';
import { generateAuthToken } from '../../authManager';

// Student portal login - authenticates against the `students` table (login_password column).
// Username may be the admission number, phone number or email. The token carries
// account_type:'student', which processAuthToken() rejects, so a student token can never call
// the staff/admin APIs; student-facing routes use processStudentAuthToken() instead.

const COLUMNS = 'student_id,full_name,admission_number,phone_number,email,status,hive_site_id,hive_site_name';
const fail = (message, status = 403) => Response.json({ status: 'error', message }, { status });

export async function POST(req) {
  try {
    let body = {};
    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      for (const [k, v] of (await req.formData()).entries()) body[k] = v;
    } else {
      body = await req.json();
    }

    if (body.auth_mosy_action !== 'auth_login') return fail(`Invalid action: ${body.auth_mosy_action}`, 400);

    const username = mmres(String(body.txt_username || '').trim());
    const password = mmres(String(body.txt_password || ''));
    if (!username || !password) return fail('Enter your admission number, phone or email and your password');

    const result = await mosyFlexSelect({
      tbl: 'students',
      colstr: base64Encode(COLUMNS),
      q: base64Encode(
        `WHERE (admission_number = '${username}' OR phone_number = '${username}' OR email = '${username}')
         AND login_password = '${password}' AND login_password <> '' LIMIT 1`
      ),
    });

    const s = result?.data?.[0];
    if (!s) return fail('Invalid login details');
    if (/inactive|suspend|expel|withdraw|drop/i.test(String(s.status || ''))) {
      return fail('This account is not active. Please contact the college office.');
    }

    // same keys the staff session uses (name / tel / email / record_id), so the shared UI keeps working
    const user = {
      record_id: s.student_id,
      student_id: s.student_id,
      name: s.full_name,
      admission_number: s.admission_number,
      tel: s.phone_number,
      email: s.email,
      user_role: 'student',
      account_type: 'student',
      hive_site_id: s.hive_site_id,
      hive_site_name: s.hive_site_name,
      userRoles: [],
    };

    return Response.json({ status: 'success', message: 'Login successful', accessToken: generateAuthToken(user), user });
  } catch (err) {
    console.error('Student login failed:', err);
    return fail(`Login error: ${err.message}`, 500);
  }
}
