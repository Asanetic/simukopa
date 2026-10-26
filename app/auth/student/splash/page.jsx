import mosyThemeConfigs from '../../../appConfigs/mosyTheme';
import saAuthConfigs from '../../featureConfig/saAuthConfigs';
import SplashScreen from '../../splash/uiControl/SplashScreen';

export async function generateMetadata() {
  const appName = mosyThemeConfigs.mosyAppName || 'Mosy';
  return { title: `Loading :: ${appName} Student Portal`, description: `${appName}` };
}

export default function StudentSplashPage() {
  return (
    <SplashScreen
      appLogo={mosyThemeConfigs.mosyAppLogo}
      appName={`${mosyThemeConfigs.mosyAppName} Student Portal`}
      afterSplashPage={saAuthConfigs.studentAfterSplashPage}
    />
  );
}
