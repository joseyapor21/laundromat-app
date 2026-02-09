import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import type { Location } from '../types';

interface LocationContextType {
  currentLocation: Location | null;
  availableLocations: Location[];
  isLoadingLocations: boolean;
  selectLocation: (location: Location) => Promise<void>;
  clearLocation: () => Promise<void>;
  refreshLocations: () => Promise<void>;
  setAvailableLocations: (locations: Location[]) => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [availableLocations, setAvailableLocations] = useState<Location[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);

  // Clear location state when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentLocation(null);
      setAvailableLocations([]);
      setIsLoadingLocations(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      initLocation();
    }
  }, [isAuthenticated]);

  async function initLocation() {
    try {
      // Get stored location ID from api service
      const storedLocationId = api.getLocationId();

      // Always try to fetch locations if we have a token (user is authenticated)
      if (api.getToken()) {
        try {
          const locations = await api.getLocations();
          console.log('Fetched locations:', locations.length);
          setAvailableLocations(locations);

          // If only one location, auto-select it
          if (locations.length === 1) {
            await api.setLocationId(locations[0]._id);
            setCurrentLocation(locations[0]);
          } else if (storedLocationId) {
            // Find the stored location in available locations
            const storedLocation = locations.find(loc => loc._id === storedLocationId);
            if (storedLocation) {
              setCurrentLocation(storedLocation);
            } else {
              // Stored location no longer valid, clear it
              await api.clearLocationId();
            }
          }
        } catch (error) {
          console.log('Could not fetch locations:', error);
        }
      }
    } catch (error) {
      console.log('Location init error:', error);
    } finally {
      setIsLoadingLocations(false);
    }
  }

  async function selectLocation(location: Location) {
    console.log('Selecting location:', location._id, location.name);
    await api.setLocationId(location._id);
    setCurrentLocation(location);
    console.log('Location set to:', location.name);
  }

  async function clearLocation() {
    await api.clearLocationId();
    setCurrentLocation(null);
    setAvailableLocations([]);
  }

  async function refreshLocations() {
    try {
      setIsLoadingLocations(true);
      const locations = await api.getLocations();
      setAvailableLocations(locations);
    } catch (error) {
      console.error('Failed to refresh locations:', error);
    } finally {
      setIsLoadingLocations(false);
    }
  }

  return (
    <LocationContext.Provider
      value={{
        currentLocation,
        availableLocations,
        isLoadingLocations,
        selectLocation,
        clearLocation,
        refreshLocations,
        setAvailableLocations,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}
