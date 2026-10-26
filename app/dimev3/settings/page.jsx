import SettingsHolder from './SettingsHolder';

export const metadata = { title: 'Settings', icons: { icon: '/logo.png' } };

export default function SettingsPage() {
  return (
    <div className="main-wrapper">
      <div className="page-wrapper">
        <div className="content container-fluid p-2 m-0">
          <div className='col-md-12 row p-0 m-0  justify-content-center'>
          <SettingsHolder />
          </div>
        </div>
      </div>
    </div>
  );
}
