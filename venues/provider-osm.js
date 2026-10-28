// The existing Leaflet map, behind the same interface as the domestic providers.
export async function createOsmProvider({ container, reducedMotion, onMove, onReady, onError }) {
  const L = window.L;
  if (!L) throw new Error('Map library unavailable');
  const map = L.map(container, { zoomControl: false, attributionControl: false,
    minZoom: 3, maxZoom: 18, worldCopyJump: true, zoomAnimation: !reducedMotion,
    fadeAnimation: !reducedMotion }).setView([33, 113], 5);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, detectRetina: false, keepBuffer: 2, crossOrigin: false,
  });
  let errors = 0, locationMarker;
  tiles.on('loading', () => { errors = 0; });
  tiles.on('tileload', () => { if (!errors) onReady(); });
  tiles.on('tileerror', () => { errors += 1; onError(); });
  tiles.addTo(map);
  const markers = L.layerGroup().addTo(map);
  map.on('moveend zoomend', onMove);
  return {
    prepare: async () => {},
    project: (point) => map.latLngToContainerPoint(point),
    getZoom: () => map.getZoom(),
    fitBounds: (points, options) => map.fitBounds(points, options),
    setMarkers(specs) {
      markers.clearLayers();
      for (const spec of specs) {
        const marker = L.marker(spec.position, {
          icon: L.divIcon({ className: spec.className, html: spec.html,
            iconSize: [spec.size, spec.size], iconAnchor: [spec.size / 2, spec.size / 2] }),
          title: spec.label, alt: spec.label, keyboard: true, riseOnHover: true,
        }).addTo(markers);
        const node = marker.getElement();
        node.dataset.markerKey = spec.key;
        if (spec.venueId) node.dataset.markerVenue = spec.venueId;
        const label = document.createElement('span');
        label.textContent = spec.label;
        marker.bindTooltip(label, { direction: 'top', offset: [0, -21], className: 'surf-tooltip', permanent: true });
        marker.on('click', spec.onActivate);
        node.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault(); event.stopPropagation();
          if (!event.repeat) spec.onActivate();
        });
      }
    },
    setUserLocation(point) {
      locationMarker?.remove();
      locationMarker = L.circleMarker(point, { radius: 8, fillColor: '#3284ee', fillOpacity: 1,
        color: '#fff', weight: 3 }).addTo(map);
    },
    zoomIn: () => map.zoomIn(),
    zoomOut: () => map.zoomOut(),
    resize: () => map.invalidateSize(),
    retry: () => tiles.redraw(),
    destroy: () => map.remove(),
  };
}
