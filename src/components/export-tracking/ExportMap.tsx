"use client";

import * as React from "react";
import { Map, Pin, Loader2 } from "lucide-react";

interface Geofence {
  id: string;
  name: string;
  type: "country_border" | "port_zone" | "airport_zone" | "checkpoint_buffer";
  countryCode: string;
  polygon: unknown;
  bufferMeters: number | null;
  isActive: boolean;
}

interface CoordinatePoint {
  lat: number;
  lng: number;
  recordedAt: Date | string;
}

interface ExportMapProps {
  currentPosition: { lat: number; lng: number };
  trail: CoordinatePoint[];
  geofences: Geofence[];
}

// Custom hook to load Leaflet from CDN dynamically in browser
function useLeaflet() {
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    // Check if Leaflet is already loaded in window
    if ((window as any).L) {
      setLoaded(true);
      return;
    }

    // Inject Leaflet CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);

    // Inject Leaflet JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "";
    script.onload = () => {
      setLoaded(true);
    };
    document.body.appendChild(script);

    return () => {
      // Cleanups
    };
  }, []);

  return loaded;
}

export function ExportMap({ currentPosition, trail, geofences }: ExportMapProps) {
  const isLeafletLoaded = useLeaflet();
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<any>(null);
  const layersRef = React.useRef<any[]>([]);

  // Effect to initialize and update map features
  React.useEffect(() => {
    if (!isLeafletLoaded || !mapContainerRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // 1. Initialize map if not yet initialized
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        center: [currentPosition.lat, currentPosition.lng],
        zoom: 12,
        zoomControl: true,
      });

      // Add OpenStreetMap Tile Layer (modern dark or standard look)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // 2. Clear old layers
    layersRef.current.forEach((layer) => layer.remove());
    layersRef.current = [];

    // Accumulate points to set view boundary bounds
    const fitBoundsTargets: number[][] = [];

    // 3. Draw Geofences (destination polygons)
    geofences.forEach((gf) => {
      const polygonData: any = gf.polygon;
      if (polygonData && polygonData.type === "Polygon" && Array.isArray(polygonData.coordinates)) {
        const exteriorRing = polygonData.coordinates[0];
        if (Array.isArray(exteriorRing)) {
          // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
          const leafletCoords = exteriorRing.map(([lng, lat]: [number, number]) => [lat, lng]);

          let strokeColor = "#3b82f6"; // Blue
          let fillColor = "#93c5fd"; // Soft blue
          
          switch (gf.type) {
            case "country_border":
              strokeColor = "#6366f1"; // Indigo
              fillColor = "#818cf8";
              break;
            case "port_zone":
            case "airport_zone":
              strokeColor = "#06b6d4"; // Teal/Cyan
              fillColor = "#67e8f9";
              break;
            case "checkpoint_buffer":
              strokeColor = "#f97316"; // Orange
              fillColor = "#ffedd5";
              break;
          }

          const poly = L.polygon(leafletCoords, {
            color: strokeColor,
            weight: gf.type === "country_border" ? 3 : 2,
            dashArray: gf.type === "country_border" ? "6, 6" : undefined,
            fillColor: fillColor,
            fillOpacity: gf.type === "country_border" ? 0.05 : 0.25,
          }).addTo(map);

          poly.bindPopup(`
            <div class="text-xs p-1">
              <p class="font-bold text-slate-800">${gf.name}</p>
              <p class="text-[10px] text-slate-500 capitalize mt-0.5">Type: ${gf.type.replace(/_/g, " ")}</p>
              <p class="text-[10px] text-slate-500 mt-0.5">Country: ${gf.countryCode}</p>
            </div>
          `);

          layersRef.current.push(poly);
          // Add coordinates to map fitbounds target array
          leafletCoords.forEach((coord) => fitBoundsTargets.push(coord));
        }
      }
    });

    // 4. Draw History Path (Trail)
    if (trail.length > 0) {
      // Connect all trail points + current position chronologically
      // Sort oldest to newest for the polyline trail
      const sortedTrail = [...trail].sort(
        (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
      );
      
      const pathPoints = [...sortedTrail.map((t) => [t.lat, t.lng]), [currentPosition.lat, currentPosition.lng]];

      // Polyline trail connecting events
      const polyline = L.polyline(pathPoints, {
        color: "#6366f1",
        weight: 3,
        dashArray: "3, 6",
        opacity: 0.7,
      }).addTo(map);

      layersRef.current.push(polyline);

      // Draw dot marker for each trail point
      sortedTrail.forEach((point) => {
        const timeStr = new Date(point.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const marker = L.circleMarker([point.lat, point.lng], {
          radius: 4,
          fillColor: "#6366f1",
          color: "#ffffff",
          weight: 1.5,
          fillOpacity: 0.85,
        }).addTo(map);

        marker.bindPopup(`
          <div class="text-xs font-sans">
            <p class="font-semibold text-slate-800">Trail Point</p>
            <p class="text-[10px] text-slate-500 mt-0.5">Recorded: ${timeStr}</p>
            <p class="text-[10px] text-slate-500 font-mono">Lat: ${point.lat.toFixed(5)}, Lng: ${point.lng.toFixed(5)}</p>
          </div>
        `);
        layersRef.current.push(marker);
        fitBoundsTargets.push([point.lat, point.lng]);
      });
    }

    // 5. Draw Current Position
    const currentMarker = L.circleMarker([currentPosition.lat, currentPosition.lng], {
      radius: 8,
      fillColor: "#ef4444", // vibrant red pulse
      color: "#ffffff",
      weight: 2,
      fillOpacity: 1,
    }).addTo(map);

    currentMarker.bindPopup(`
      <div class="text-xs font-sans p-0.5">
        <p class="font-bold text-slate-800">Active Tracker Location</p>
        <p class="text-[10px] text-slate-500 font-mono mt-0.5">Lat: ${currentPosition.lat.toFixed(5)}, Lng: ${currentPosition.lng.toFixed(5)}</p>
      </div>
    `);

    // A pulsing radius guide around current position
    const radarCircle = L.circle([currentPosition.lat, currentPosition.lng], {
      radius: 300, // 300 meters radius
      color: "#ef4444",
      weight: 1,
      dashArray: "2, 4",
      fillColor: "#fca5a5",
      fillOpacity: 0.1,
    }).addTo(map);

    layersRef.current.push(currentMarker);
    layersRef.current.push(radarCircle);
    fitBoundsTargets.push([currentPosition.lat, currentPosition.lng]);

    // 6. Fit map bounds to view all elements
    if (fitBoundsTargets.length > 0) {
      map.fitBounds(fitBoundsTargets, { padding: [50, 50] });
    } else {
      map.setView([currentPosition.lat, currentPosition.lng], 13);
    }
  }, [isLeafletLoaded, currentPosition, trail, geofences]);

  return (
    <div className="relative rounded-xl border border-border/80 bg-card p-4 h-[450px] flex flex-col shadow-xs overflow-hidden">
      {/* Map Header details */}
      <div className="flex items-center justify-between mb-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Map className="h-4 w-4 text-primary" />
            Live Shipment Map
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Current tracker position, geofenced boundaries, and trajectory trail
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground border border-border/80 rounded-md px-2 py-0.5 bg-muted/20">
          <Pin className="h-3 w-3 text-red-500 animate-pulse fill-red-500" />
          Real-time GPS Active
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 w-full rounded-lg bg-muted/30 relative border border-border/40 overflow-hidden">
        {!isLeafletLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 bg-background/90 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span>Loading Map assets...</span>
          </div>
        )}
        <div 
          ref={mapContainerRef} 
          className="w-full h-full z-0" 
          style={{ outline: "none" }}
        />
      </div>
    </div>
  );
}
