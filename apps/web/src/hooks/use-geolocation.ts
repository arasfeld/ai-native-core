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

    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("granted");
      },
      () => {
        setStatus("denied");
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }, // cache for 5 min
    );
  }, []);

  return { coords, status };
}
