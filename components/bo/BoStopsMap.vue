<script setup lang="ts">
import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';

/**
 * Carte des arrêts, sur fond OpenStreetMap.
 *
 * Un arrêt placé est un point ; l'arrêt choisi est cerclé de bleu. Un clic sur la carte place
 * l'arrêt choisi : c'est l'école qui connaît ses arrêts, la carte ne devine rien.
 */
type Point = { key: string; name: string; line: string; color: string; latitude?: number | null; longitude?: number | null };
const props = defineProps<{ points: Point[]; selected?: string | null }>();
const emit = defineEmits<{ place: [latitude: number, longitude: number] }>();

/** Abidjan, faute d'arrêt placé. */
const ABIDJAN: [number, number] = [5.345, -4.024];

const element = ref<HTMLDivElement | null>(null);
let map: LeafletMap | null = null;
let layer: LayerGroup | null = null;
let L: typeof import('leaflet') | null = null;

function draw(fit = false) {
    if (!map || !layer || !L) return;
    layer.clearLayers();
    const placed = props.points.filter((p) => p.latitude != null && p.longitude != null);
    for (const point of placed) {
        const isSelected = point.key === props.selected;
        L.circleMarker([point.latitude!, point.longitude!], {
            radius: isSelected ? 9 : 7, color: isSelected ? '#0061FF' : '#FFFFFF', weight: isSelected ? 3 : 2,
            fillColor: point.color, fillOpacity: 1,
        }).bindTooltip(`${point.line} · ${point.name}`).addTo(layer);
    }
    if (fit && placed.length) {
        map.fitBounds(L.latLngBounds(placed.map((p) => [p.latitude!, p.longitude!] as [number, number])).pad(0.25), { maxZoom: 15 });
    }
}

onMounted(async () => {
    L = await import('leaflet');
    if (!element.value) return;
    map = L.map(element.value, { zoomControl: true }).setView(ABIDJAN, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; contributeurs OpenStreetMap',
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on('click', (event) => emit('place', event.latlng.lat, event.latlng.lng));
    draw(true);
    // La fenêtre s'anime à l'ouverture : la carte recalcule sa taille une fois posée.
    setTimeout(() => map?.invalidateSize(), 250);
});

watch(() => [props.points, props.selected], () => draw(false), { deep: true });

onBeforeUnmount(() => {
    map?.remove();
    map = null;
});
</script>

<template>
    <div ref="element" style="height: 460px; border-radius: 12px; border: 1px solid var(--bd); overflow: hidden; z-index: 0" />
</template>
