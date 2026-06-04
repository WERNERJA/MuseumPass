import { Alert } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// Catch fatal JS errors before React starts
const defaultHandler = global.ErrorUtils?.getGlobalHandler?.();
global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
  if (isFatal) {
    Alert.alert(
      'Fatal fout',
      error?.message ?? String(error),
      [{ text: 'OK' }]
    );
  }
  defaultHandler?.(error, isFatal);
});

registerRootComponent(App);
