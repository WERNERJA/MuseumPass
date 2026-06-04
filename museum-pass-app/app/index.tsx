import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../src/constants/colors';
import { RootStackParamList, TabParamList } from '../src/types';

import { NearbyScreen } from '../src/screens/NearbyScreen';
import { ExploreScreen } from '../src/screens/ExploreScreen';
import { RouteScreen } from '../src/screens/RouteScreen';
import { VisitedScreen } from '../src/screens/VisitedScreen';
import { MuseumDetailScreen } from '../src/screens/MuseumDetailScreen';

// ---------------------------------------------------------------------------
// Tab navigator
// ---------------------------------------------------------------------------

const Tab = createBottomTabNavigator<TabParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 4,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          switch (route.name) {
            case 'InDeBuurt':
              iconName = focused ? 'location' : 'location-outline';
              break;
            case 'Verkennen':
              iconName = focused ? 'search' : 'search-outline';
              break;
            case 'Route':
              iconName = focused ? 'navigate' : 'navigate-outline';
              break;
            case 'Bezocht':
              iconName = focused
                ? 'checkmark-done-circle'
                : 'checkmark-done-circle-outline';
              break;
            default:
              iconName = 'ellipse-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="InDeBuurt"
        component={NearbyScreen}
        options={{ tabBarLabel: 'In de buurt' }}
      />
      <Tab.Screen
        name="Verkennen"
        component={ExploreScreen}
        options={{ tabBarLabel: 'Verkennen' }}
      />
      <Tab.Screen
        name="Route"
        component={RouteScreen}
        options={{ tabBarLabel: 'Route' }}
      />
      <Tab.Screen
        name="Bezocht"
        component={VisitedScreen}
        options={{ tabBarLabel: 'Bezocht' }}
      />
    </Tab.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Root stack navigator
// ---------------------------------------------------------------------------

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={TabNavigator} />
          <Stack.Screen
            name="MuseumDetail"
            component={MuseumDetailScreen}
            options={{
              animation: 'slide_from_right',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
