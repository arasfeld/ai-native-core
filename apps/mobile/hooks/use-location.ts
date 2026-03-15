import * as Location from "expo-location";
import { useEffect, useState } from "react";

type Coords = { lat: number; lng: number } | null;

export function useLocation() {
  const [coords, setCoords] = useState<Coords>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || !active) return;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (active) {
        setCoords({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { coords };
}
