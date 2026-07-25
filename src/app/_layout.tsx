import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
// Deliberately imported per weight rather than from the package barrel. The
// barrel `require`s every weight at module scope, so Metro pulls all 16 TTFs
// (5.8MB) into the bundle even though we use six. These subpaths cost 2.2MB.
import { Cinzel_400Regular } from '@expo-google-fonts/cinzel/400Regular';
import { Cinzel_500Medium } from '@expo-google-fonts/cinzel/500Medium';
import { Cinzel_600SemiBold } from '@expo-google-fonts/cinzel/600SemiBold';
import { CormorantGaramond_300Light } from '@expo-google-fonts/cormorant-garamond/300Light';
import { CormorantGaramond_300Light_Italic } from '@expo-google-fonts/cormorant-garamond/300Light_Italic';
import { CormorantGaramond_400Regular } from '@expo-google-fonts/cormorant-garamond/400Regular';

import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* Already hidden -- harmless during fast refresh. */
});

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts({
    Cinzel_400Regular,
    Cinzel_500Medium,
    Cinzel_600SemiBold,
    CormorantGaramond_300Light,
    CormorantGaramond_300Light_Italic,
    CormorantGaramond_400Regular,
  });

  useEffect(() => {
    // Hide on error too, otherwise a font failure leaves users on the splash
    // forever with no way to tell what went wrong.
    if (fontsReady || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady, fontError]);

  if (!fontsReady && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.canvas }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.canvas },
            animation: 'fade',
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
