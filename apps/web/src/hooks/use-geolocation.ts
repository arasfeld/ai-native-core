"use client";

import { useEffect, useState } from "react";

type Coords = { lat: number; lng: number } | null;
type Status = "idle" | "loading" | "granted" | "denied" | "unavailable";

export function useGeolocation() {
  const [coords, setCoords] = useState<Coords>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return;
    }

    const updateLocation = () => {
      setStatus("loading");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setStatus("granted");
        },
        (err) => {
          console.warn("Geolocation error:", err);
          setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
        },
        { 
          enableHighAccuracy: true,
          timeout: 15000, 
          maximumAge: 10 * 60 * 1000 
        },
      );
    };

    updateLocation();
  }, []);

  return { coords, status };
}
