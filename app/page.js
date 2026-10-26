import AuthPage from "./auth/login/page";
import mosyThemeConfigs from "./appConfigs/mosyTheme";

export async function generateMetadata() {
  const appName = mosyThemeConfigs.mosyAppName || "Mosy";

  return {
    title: `Welcome to ${appName}`,
    description: `${appName}`,
    icons: {
      icon: "/logo.png"
    },
  };
}

export default function Home() {
  return (
    <>
      <AuthPage baseRoot="auth/" />
    </>
  );
}
