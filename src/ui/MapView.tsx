import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { type Hex, hexEquals, hexKey, offsetToAxial } from '../engine/hex';
import type { CoverageCell, JsCell } from '../engine/coverage';
import { inBounds } from '../engine/map';
import type { Unit } from '../engine/units';
import { type LinkView, type World, activeHops, unitAt } from '../engine/world';
import { DF_COLOR, JAM_COLOR, LOS_COLOR, QUALITY_COLORS, SIDE_COLORS, TERRAIN_COLORS, dfColorOf, lighten, toCss } from './colors';
import { fitLayout, hexCorners, hexToPixel, pixelToHex } from './layout';
import { Legend } from './Legend';
import { HexTooltip } from './HexTooltip';
import { type Layers, type TerrainMode } from './layers';
import { LayersMenu } from './LayersMenu';
import type { TerrainType } from '../engine/terrain';
import type { EmitterDetection } from '../engine/detect';
import type { Track } from '../engine/mission/types';
import { MISSION_RULES } from '../engine/mission/types';

export interface CoverageView {
  origin: Hex;
  cells: Record<string, CoverageCell | JsCell>;
  colorOf: (cell: CoverageCell | JsCell) => number | null; // null leaves the hex untinted
}

interface Props {
  world: World;
  links: LinkView[]; // already filtered to visible nets
  selectedHex?: Hex;
  selectedUnitId?: string;
  selectedLinkId?: string;
  onSelectHex: (h: Hex) => void;
  onMoveTo: (h: Hex) => void;
  losA?: Hex; // line-of-sight tool endpoints
  losB?: Hex;
  losPreview: boolean; // draw a preview line from A to the hovered hex
  flash?: { hex: Hex; reason: string }; // rejected action, shown briefly on the map
  coverage?: CoverageView; // coverage tool heatmap
  alignTo?: MapAlignment; // LOS tool: rotate and zoom so A and B sit above the profile chart ends
  detections?: EmitterDetection[]; // ES detections: rings, DF bearings and fixes
  tracks?: Track[]; // mission picture: HQ's tracks built from reported bearings
  sectors?: { pos: Hex; centreDeg: number; halfWidthDeg: number; label: string }[]; // DF tasks in progress
  plans?: { from: Hex; points: Hex[] }[]; // remaining flight plan of each drone on a sortie
  trails?: { kind: 'drone' | 'ground'; points: Hex[] }[]; // where units have been, oldest first
  dimUnitIds?: Set<string>; // units drawn greyed out (mission reveal: Red never found)
  layers: Layers; // which layers to draw
  onLayersChange: (layers: Layers) => void;
}

interface Scene {
  app: Application;
  camera: Container; // all map layers; pan and zoom transform this
  terrain: Graphics;
  grid: Graphics; // hex borders, hidden when hexes are tiny on screen
  heat: Graphics; // coverage heatmap, above terrain and below links
  linkLayer: Graphics;
  highlight: Graphics;
  overlay: Graphics; // tool graphics, redrawn on hover
  units: Container;
}

// Hex fill for each terrain mode. Elevation is greyscale (dark low, light high) with water kept dark blue.
function terrainFill(terrain: TerrainType, elevationM: number, mode: TerrainMode): number {
  if (mode === 'off') return 0x1f2937;
  const t = Math.min(elevationM / 1500, 1);
  if (mode === 'elevation') {
    if (terrain === 'water') return 0x1e3a5f;
    const v = Math.round(45 + 180 * Math.sqrt(t));
    return (v << 16) | (v << 8) | v;
  }
  const base = TERRAIN_COLORS[terrain];
  return terrain === 'water' ? base : lighten(base, t * 0.35);
}

function unitLabel(u: Unit): string {
  if (u.kind === 'hq') return 'HQ';
  if (u.kind === 'relay') return 'RL';
  if (u.kind === 'civil') return 'CV';
  if (u.kind === 'jammer') return 'EW';
  if (u.kind === 'drone') return 'UA';
  return u.name.slice(-1);
}

function starPoints(x: number, y: number, outer: number, inner: number, points: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    out.push(x + rad * Math.cos(a), y + rad * Math.sin(a));
  }
  return out;
}

// Draws around (0, 0); the caller positions the Graphics and keeps it upright.
function drawUnitShape(g: Graphics, u: Unit, r: number, selected: boolean, onePx: number, dim = false) {
  const x = 0;
  const y = 0;
  const fill = dim ? 0x6b7280 : SIDE_COLORS[u.side];
  const stroke = { width: (selected ? 3 : 1.5) * onePx, color: selected ? 0xffffff : 0x111111 };
  if (u.kind === 'hq') g.rect(x - r, y - r * 0.8, 2 * r, 1.6 * r);
  else if (u.kind === 'relay') g.poly([x, y - r * 1.1, x + r * 1.1, y, x, y + r * 1.1, x - r * 1.1, y]);
  else if (u.kind === 'civil') g.poly([x, y - r * 1.1, x + r, y + r * 0.8, x - r, y + r * 0.8]);
  else if (u.kind === 'jammer') g.poly(starPoints(x, y, r * 1.25, r * 0.6, 5));
  else if (u.kind === 'drone') {
    // Quadcopter: four rotors around a body.
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.circle(x + dx * r * 0.7, y + dy * r * 0.7, r * 0.45);
    g.fill({ color: fill, alpha: 0.6 }).stroke({ ...stroke, width: stroke.width * 0.7 });
    g.circle(x, y, r * 0.6);
  }
  else g.circle(x, y, r);
  g.fill({ color: fill }).stroke(stroke);
}

// Camera over the fitted layout: screen = (x, y) + scale * rotate(rotation) * world.
// scale 1, rotation 0 shows the whole map north-up. `aligned` marks a view set by the LOS tool,
// which may rotate and zoom freely; normal views are kept covering the map.
interface View {
  scale: number;
  x: number;
  y: number;
  rotation: number;
  aligned: boolean;
}

const FIT_VIEW: View = { scale: 1, x: 0, y: 0, rotation: 0, aligned: false };
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 40; // relative to the whole map fitted to the window


const ALIGNED_ZOOM = { min: 0.2, max: 40 };
const DRAG_THRESHOLD_PX = 4;

function toScreen(v: View, p: { x: number; y: number }) {
  const c = Math.cos(v.rotation);
  const s = Math.sin(v.rotation);
  return { x: v.x + v.scale * (c * p.x - s * p.y), y: v.y + v.scale * (s * p.x + c * p.y) };
}

function toWorld(v: View, p: { x: number; y: number }) {
  const c = Math.cos(v.rotation);
  const s = Math.sin(v.rotation);
  const dx = (p.x - v.x) / v.scale;
  const dy = (p.y - v.y) / v.scale;
  return { x: c * dx + s * dy, y: -s * dx + c * dy };
}

// Keep a normal view sensible: zoom between MIN_ZOOM and MAX_ZOOM; when zoomed in the map covers the
// view (no panning past its edges), when zoomed out the whole map stays inside the view.
function clampView(v: View, w: number, h: number): View {
  if (v.aligned) return { ...v, scale: Math.min(ALIGNED_ZOOM.max, Math.max(ALIGNED_ZOOM.min, v.scale)) };
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale));
  const keep = (pos: number, extent: number) => {
    const free = extent - extent * scale; // negative when zoomed in, positive when zoomed out
    return Math.min(Math.max(free, 0), Math.max(Math.min(free, 0), pos));
  };
  return { ...v, scale, x: keep(v.x, w), y: keep(v.y, h) };
}

// LOS alignment target: put hex a above page x `leftPageX` and hex b above `rightPageX`.
export interface MapAlignment {
  a: Hex;
  b: Hex;
  leftPageX: number;
  rightPageX: number;
}

export function MapView({
  world,
  links,
  selectedHex,
  selectedUnitId,
  selectedLinkId,
  onSelectHex,
  onMoveTo,
  losA,
  losB,
  losPreview,
  flash,
  coverage,
  alignTo,
  detections,
  tracks,
  sectors,
  plans,
  trails,
  dimUnitIds,
  layers,
  onLayersChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ hex: Hex; x: number; y: number } | null>(null);
  const [view, setView] = useState<View>(FIT_VIEW);
  const [panning, setPanning] = useState(false);
  // Latest values for the pointer handlers, which are bound once.
  const propsRef = useRef({ world, onSelectHex, onMoveTo, size });
  propsRef.current = { world, onSelectHex, onMoveTo, size };
  const viewRef = useRef(view);

  const applyView = (next: View) => {
    const s = propsRef.current.size;
    const clamped = clampView(next, s.w, s.h);
    viewRef.current = clamped;
    setView(clamped);
  };

  // North-up view that fits the world's operating area to the window.
  const homeView = (): View => {
    const { world: w, size: s } = propsRef.current;
    if (s.w === 0 || s.h === 0) return FIT_VIEW;
    const layout = fitLayout(w.map, s.w, s.h);
    const { col0, row0, cols, rows } = w.home;
    const p0 = hexToPixel(layout, offsetToAxial(col0, row0));
    const p1 = hexToPixel(layout, offsetToAxial(col0 + cols - 1, row0 + rows - 1));
    const pad = layout.size * 2;
    const scale = Math.min(s.w / (p1.x - p0.x + 2 * pad), s.h / (p1.y - p0.y + 2 * pad));
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    return { scale, x: s.w / 2 - cx * scale, y: s.h / 2 - cy * scale, rotation: 0, aligned: false };
  };

  // Zoom by `factor`, keeping the point (px, py) on screen fixed.
  const zoomAt = (factor: number, px: number, py: number) => {
    const v = viewRef.current;
    const s = propsRef.current.size;
    const scale = clampView({ ...v, scale: v.scale * factor }, s.w, s.h).scale;
    const k = scale / v.scale;
    applyView({ ...v, scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
  };

  useEffect(() => {
    const host = hostRef.current!;
    let cancelled = false;
    const app = new Application();
    let canvas: HTMLCanvasElement | null = null;
    let drag: { x: number; y: number; viewX: number; viewY: number; moved: boolean; button: number } | null = null;

    const local = (e: PointerEvent | WheelEvent) => {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    // Hex under a screen point, undoing pan and zoom.
    const hexAt = (x: number, y: number) => {
      const { world: w, size: s } = propsRef.current;
      const v = viewRef.current;
      const p = toWorld(v, { x, y });
      const hex = pixelToHex(fitLayout(w.map, s.w, s.h), p.x, p.y);
      return inBounds(w.map, hex) ? hex : null;
    };

    const onDown = (e: PointerEvent) => {
      const p = local(e);
      if (e.button === 2) {
        const hex = hexAt(p.x, p.y);
        if (hex) propsRef.current.onMoveTo(hex);
        return;
      }
      // Left button selects on release unless dragged; left or middle drag pans.
      if (e.button === 0 || e.button === 1) {
        const v = viewRef.current;
        drag = { x: p.x, y: p.y, viewX: v.x, viewY: v.y, moved: false, button: e.button };
        canvas!.setPointerCapture(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (drag) {
        const dx = p.x - drag.x;
        const dy = p.y - drag.y;
        if (drag.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          if (!drag.moved) setPanning(true);
          drag.moved = true;
          applyView({ ...viewRef.current, x: drag.viewX + dx, y: drag.viewY + dy });
          setHover(null);
          return;
        }
      }
      const hex = hexAt(p.x, p.y);
      setHover(hex ? { hex, x: p.x, y: p.y } : null);
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      if (!drag.moved && drag.button === 0) {
        const p = local(e);
        const hex = hexAt(p.x, p.y);
        if (hex) propsRef.current.onSelectHex(hex);
      }
      drag = null;
      setPanning(false);
      if (canvas!.hasPointerCapture(e.pointerId)) canvas!.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    };
    const onLeave = () => setHover(null);
    const onContextMenu = (e: Event) => e.preventDefault();

    // Rendered on demand (see the last effect) rather than every frame: the terrain mesh is large.
    app.init({ resizeTo: host, background: 0x0f172a, antialias: true, autoStart: false }).then(() => {
      if (cancelled) {
        app.destroy(true);
        return;
      }
      canvas = app.canvas;
      host.appendChild(canvas);
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('contextmenu', onContextMenu);
      const camera = new Container();
      const terrain = new Graphics();
      const grid = new Graphics();
      const heat = new Graphics();
      const linkLayer = new Graphics();
      const highlight = new Graphics();
      const units = new Container();
      const overlay = new Graphics();
      camera.addChild(terrain, grid, heat, linkLayer, highlight, units, overlay);
      app.stage.addChild(camera);
      sceneRef.current = { app, camera, terrain, grid, heat, linkLayer, highlight, units, overlay };
      setReady(true);
    });

    // Pixi's resizeTo only follows window resizes; this also catches the host shrinking (e.g. a tool dock opening).
    const observer = new ResizeObserver(([entry]) => {
      sceneRef.current?.app.resize();
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(host);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (canvas) {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('contextmenu', onContextMenu);
      }
      if (sceneRef.current) {
        sceneRef.current.app.destroy(true, { children: true });
        sceneRef.current = null;
      }
    };
    // Handlers read live values through refs, so this runs once.
  }, []);

  // A new map starts fully zoomed out; a resize keeps the view inside the map.
  // A new map opens on the operating area.
  useEffect(() => applyView(homeView()), [world.map, ready, size.w > 0]);
  useEffect(() => applyView(viewRef.current), [size.w, size.h]);

  // LOS alignment: rotate so A->B runs left to right, then scale and pan so A and B sit directly above
  // the profile chart's A and B. Leaving alignment returns the map to north-up.
  const alignKey = alignTo
    ? `${alignTo.a.q},${alignTo.a.r},${alignTo.b.q},${alignTo.b.r},${alignTo.leftPageX.toFixed(1)},${alignTo.rightPageX.toFixed(1)}`
    : '';
  useEffect(() => {
    const host = hostRef.current;
    if (!ready || !host || size.w === 0 || size.h === 0) return;
    if (!alignTo) {
      if (viewRef.current.aligned) applyView(homeView());
      return;
    }
    const layout = fitLayout(world.map, size.w, size.h);
    const pa = hexToPixel(layout, alignTo.a);
    const pb = hexToPixel(layout, alignTo.b);
    const span = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    if (span === 0) return;
    const left = alignTo.leftPageX - host.getBoundingClientRect().left;
    const right = alignTo.rightPageX - host.getBoundingClientRect().left;
    const rotation = -Math.atan2(pb.y - pa.y, pb.x - pa.x);
    const scale = (right - left) / span;
    // Path runs across the middle of the map area.
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    applyView({
      rotation,
      scale,
      x: left - scale * (c * pa.x - s * pa.y),
      y: size.h / 2 - scale * (s * pa.x + c * pa.y),
      aligned: true,
    });
  }, [ready, size.w, size.h, world.map, alignKey]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    scene.camera.position.set(view.x, view.y);
    scene.camera.scale.set(view.scale);
    scene.camera.rotation = view.rotation;
    // Hex borders only help once hexes are big enough on screen to see them.
    if (size.w > 0) scene.grid.visible = layers.grid && fitLayout(world.map, size.w, size.h).size * view.scale >= 6;
  }, [ready, view, size, world.map, layers.grid]);

  // Terrain only changes with the map or the window size, so it is drawn on its own and kept between updates.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene || size.w === 0 || size.h === 0) return;
    const layout = fitLayout(world.map, size.w, size.h);
    scene.terrain.clear();
    scene.grid.clear();
    for (const tile of Object.values(world.map.tiles)) {
      const color = terrainFill(tile.terrain, tile.elevationM, layers.terrain);
      const corners = hexCorners(layout, tile.hex);
      scene.terrain.poly(corners).fill({ color });
      scene.grid.poly(corners).stroke({ width: 1, color: 0x000000, alpha: 0.15, pixelLine: true });
    }
  }, [ready, size, world.map, layers.terrain]);

  // Links, jamming and units. Line widths and icon sizes are divided by zoom so they stay the same on screen.
  const zoom = view.scale;
  const rotation = view.rotation;
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene || size.w === 0 || size.h === 0) return;
    const layout = fitLayout(world.map, size.w, size.h);
    const px = (n: number) => n / zoom;

    // Links, coloured by the quality of the route in use. A relayed link bends through the relay,
    // with its unused direct path left faint. Blocked direct paths are drawn fainter.
    scene.linkLayer.clear();
    const byId = new Map(world.units.map((u) => [u.id, u]));
    const at = (id: string) => hexToPixel(layout, byId.get(id)!.pos);
    const sorted = [...links].sort((a, b) => Number(a.link.id === selectedLinkId) - Number(b.link.id === selectedLinkId));
    for (const v of layers.links ? sorted : []) {
      const { link, budget } = v;
      const selected = link.id === selectedLinkId;
      const a = at(link.aId);
      const b = at(link.bId);
      const pts = v.route === 'relay' && v.relay ? [b, at(v.relay.relayId), a] : [a, b];
      if (v.route === 'relay') {
        scene.linkLayer.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: px(1.5), color: QUALITY_COLORS[budget.quality], alpha: 0.25 });
      }
      const polyline = () => {
        scene.linkLayer.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) scene.linkLayer.lineTo(p.x, p.y);
      };
      if (selected) {
        polyline();
        scene.linkLayer.stroke({ width: px(7), color: 0xffffff });
      }
      polyline();
      scene.linkLayer.stroke({
        width: px(selected ? 4 : 2.5),
        color: QUALITY_COLORS[v.quality],
        alpha: v.route === 'relay' || budget.path.lineOfSight || selected ? 1 : 0.6,
      });
    }

    // Jamming rays: jammer to each receiver on a route in use that it hits often enough with J/S > 0 dB.
    const rays = new Set<string>();
    for (const v of links) {
      for (const hop of activeHops(v)) {
        for (const d of [hop.forward, hop.reverse]) {
          if (d.jsDb <= 0 || d.jamFraction < 0.05) continue;
          for (const c of d.jammers) if (c.fraction > 0) rays.add(`${c.jammerId}|${d.toId}`);
        }
      }
    }
    for (const key of layers.jamming ? rays : []) {
      const [jId, rxId] = key.split('|');
      const j = at(jId);
      const rx = at(rxId);
      scene.linkLayer.moveTo(j.x, j.y).lineTo(rx.x, rx.y).stroke({ width: px(1.5), color: JAM_COLOR, alpha: 0.7 });
    }

    // Detection rings: enemy emitters the chosen side's sensors pick up, by probability of detection.
    for (const d of layers.detections ? (detections ?? []) : []) {
      const color = d.pd >= 0.9 ? 0xffffff : d.pd >= 0.5 ? 0xfacc15 : d.pd >= 0.1 ? 0xfb923c : null;
      if (color === null) continue;
      const p = at(d.emitterId);
      const ringR = Math.max(layout.size * 1.3, px(13));
      scene.linkLayer.circle(p.x, p.y, ringR).stroke({ width: px(2.5), color, alpha: 0.95 });
      scene.linkLayer.circle(p.x, p.y, ringR + px(4)).stroke({ width: px(1), color, alpha: 0.5 });
    }

    // Direction finding: each bearing as a line from its sensor, and the fix with its 2-sigma error ellipse.
    if (layers.df) {
      const pxPerKm = (layout.size * Math.sqrt(3)) / world.map.hexSizeKm;
      for (const d of detections ?? []) {
        for (const b of d.bearings) {
          const s = at(b.sensorId);
          const t = (b.bearingDeg * Math.PI) / 180;
          const len = b.rangeKm * 1.15 * pxPerKm;
          scene.linkLayer.moveTo(s.x, s.y).lineTo(s.x + Math.sin(t) * len, s.y - Math.cos(t) * len).stroke({ width: px(1.2), color: DF_COLOR, alpha: 0.6 });
        }
        if (!d.fix) continue;
        const c = hexToPixel(layout, { q: d.fix.q, r: d.fix.r });
        const { aKm, bKm, angleRad } = d.fix.ellipse;
        const pts: number[] = [];
        for (let i = 0; i < 40; i++) {
          const phi = (i / 40) * Math.PI * 2;
          const ex = 2 * aKm * pxPerKm * Math.cos(phi);
          const ey = 2 * bKm * pxPerKm * Math.sin(phi);
          pts.push(c.x + ex * Math.cos(angleRad) - ey * Math.sin(angleRad), c.y + ex * Math.sin(angleRad) + ey * Math.cos(angleRad));
        }
        scene.linkLayer.poly(pts).fill({ color: DF_COLOR, alpha: 0.12 }).stroke({ width: px(1.5), color: DF_COLOR });
        const k = px(5);
        scene.linkLayer.moveTo(c.x - k, c.y - k).lineTo(c.x + k, c.y + k).moveTo(c.x - k, c.y + k).lineTo(c.x + k, c.y - k).stroke({ width: px(2), color: DF_COLOR });
      }
    }

    // Trails: the path each unit has flown or driven, fading toward the older end, a dot per minute.
    if (layers.df && trails) {
      for (const t of trails) {
        const colour = t.kind === 'drone' ? 0x22d3ee : 0x93c5fd;
        const pts = t.points.map((p) => hexToPixel(layout, p));
        for (let i = 1; i < pts.length; i++) {
          const age = i / (pts.length - 1); // 0 oldest, 1 newest
          scene.linkLayer.moveTo(pts[i - 1].x, pts[i - 1].y).lineTo(pts[i].x, pts[i].y).stroke({ width: px(2), color: colour, alpha: 0.25 + 0.6 * age });
          scene.linkLayer.circle(pts[i - 1].x, pts[i - 1].y, px(1.8)).fill({ color: colour, alpha: 0.35 + 0.5 * age });
        }
      }
    }

    // Flight plans: remaining waypoints of a drone sortie, dashed, with a ring at each station.
    if (layers.df && plans) {
      for (const plan of plans) {
        let prev = hexToPixel(layout, plan.from);
        for (const p of plan.points) {
          const q = hexToPixel(layout, p);
          const len = Math.hypot(q.x - prev.x, q.y - prev.y);
          const ux = (q.x - prev.x) / (len || 1);
          const uy = (q.y - prev.y) / (len || 1);
          for (let d = 0; d < len; d += px(10)) {
            scene.linkLayer.moveTo(prev.x + ux * d, prev.y + uy * d).lineTo(prev.x + ux * Math.min(len, d + px(5)), prev.y + uy * Math.min(len, d + px(5)));
          }
          scene.linkLayer.stroke({ width: px(1.2), color: 0x22d3ee, alpha: 0.8 });
          scene.linkLayer.circle(q.x, q.y, px(5)).stroke({ width: px(1.5), color: 0x22d3ee });
          prev = q;
        }
      }
    }

    // DF tasks in progress: the sector each unit is listening to, until the task ends.
    if (layers.df && sectors) {
      const pxPerKm = (layout.size * Math.sqrt(3)) / world.map.hexSizeKm;
      const rad = (deg: number) => (deg * Math.PI) / 180;
      for (const sec of sectors) {
        const s = hexToPixel(layout, sec.pos);
        const len = MISSION_RULES.wedgeRangeKm * pxPerKm;
        const pts: number[] = [s.x, s.y];
        for (let i = 0; i <= 12; i++) {
          const a = rad(sec.centreDeg - sec.halfWidthDeg + (i / 12) * 2 * sec.halfWidthDeg);
          pts.push(s.x + Math.sin(a) * len, s.y - Math.cos(a) * len);
        }
        scene.linkLayer.poly(pts).fill({ color: 0x60a5fa, alpha: 0.06 });
        for (const edge of [sec.centreDeg - sec.halfWidthDeg, sec.centreDeg + sec.halfWidthDeg]) {
          const a = rad(edge);
          for (let d = 0; d < len; d += px(12)) {
            scene.linkLayer.moveTo(s.x + Math.sin(a) * d, s.y - Math.cos(a) * d).lineTo(s.x + Math.sin(a) * Math.min(len, d + px(6)), s.y - Math.cos(a) * Math.min(len, d + px(6)));
          }
        }
        scene.linkLayer.stroke({ width: px(1.2), color: 0x60a5fa, alpha: 0.8 });
      }
    }

    // Mission picture: a wedge for a lone bearing, bearing lines plus an error ellipse and label for a fix.
    if (layers.df && tracks) {
      const pxPerKm = (layout.size * Math.sqrt(3)) / world.map.hexSizeKm;
      const rad = (deg: number) => (deg * Math.PI) / 180;
      for (const t of tracks) {
        if (!t.fix) {
          for (const b of t.bearings) {
            const s = hexToPixel(layout, b.sensorPos);
            const len = MISSION_RULES.wedgeRangeKm * pxPerKm;
            const a0 = rad(b.bearingDeg - 2 * b.sigmaDeg);
            const a1 = rad(b.bearingDeg + 2 * b.sigmaDeg);
            scene.linkLayer
              .poly([s.x, s.y, s.x + Math.sin(a0) * len, s.y - Math.cos(a0) * len, s.x + Math.sin(a1) * len, s.y - Math.cos(a1) * len])
              .fill({ color: dfColorOf(t.id), alpha: 0.1 })
              .stroke({ width: px(1), color: dfColorOf(t.id), alpha: 0.6 });
          }
          continue;
        }
        const c = hexToPixel(layout, { q: t.fix.q, r: t.fix.r });
        // Moving emitter: the history of per-minute fixes as a dotted line of crosses, newest brightest.
        if (t.moving && t.fixes && t.fixes.length > 1) {
          const hist = t.fixes.map((f) => hexToPixel(layout, { q: f.fix.q, r: f.fix.r }));
          for (let i = 0; i < hist.length - 1; i++) {
            const age = (i + 1) / hist.length;
            const k = px(3);
            scene.linkLayer.moveTo(hist[i].x - k, hist[i].y - k).lineTo(hist[i].x + k, hist[i].y + k).moveTo(hist[i].x - k, hist[i].y + k).lineTo(hist[i].x + k, hist[i].y - k).stroke({ width: px(1.5), color: dfColorOf(t.id), alpha: 0.3 + 0.6 * age });
            scene.linkLayer.moveTo(hist[i].x, hist[i].y).lineTo(hist[i + 1].x, hist[i + 1].y).stroke({ width: px(1), color: dfColorOf(t.id), alpha: 0.25 + 0.5 * age });
          }
        }
        for (const b of (t.moving ? t.bearings.filter((x) => x.heardMin === t.fixes?.[t.fixes.length - 1]?.minute) : t.bearings.length <= 4 ? t.bearings : [])) {
          const s = hexToPixel(layout, b.sensorPos);
          const len = Math.hypot(c.x - s.x, c.y - s.y) * 1.1;
          scene.linkLayer.moveTo(s.x, s.y).lineTo(s.x + Math.sin(rad(b.bearingDeg)) * len, s.y - Math.cos(rad(b.bearingDeg)) * len).stroke({ width: px(1), color: dfColorOf(t.id), alpha: 0.5 });
        }
        const { aKm, bKm, angleRad } = t.fix.ellipse;
        const pts: number[] = [];
        for (let i = 0; i < 40; i++) {
          const phi = (i / 40) * Math.PI * 2;
          const ex = 2 * aKm * pxPerKm * Math.cos(phi);
          const ey = 2 * bKm * pxPerKm * Math.sin(phi);
          pts.push(c.x + ex * Math.cos(angleRad) - ey * Math.sin(angleRad), c.y + ex * Math.sin(angleRad) + ey * Math.cos(angleRad));
        }
        const good = t.fix.cepKm < MISSION_RULES.winCepKm;
        scene.linkLayer.poly(pts).fill({ color: dfColorOf(t.id), alpha: good ? 0.22 : 0.12 }).stroke({ width: px(good ? 2 : 1.5), color: dfColorOf(t.id) });
        const k = px(5);
        scene.linkLayer.moveTo(c.x - k, c.y - k).lineTo(c.x + k, c.y + k).moveTo(c.x - k, c.y + k).lineTo(c.x + k, c.y - k).stroke({ width: px(2), color: dfColorOf(t.id) });
      }
    }

    // A selected drone shows its control range around the unit flying it.
    const drone = world.units.find((u) => u.id === selectedUnitId && u.kind === 'drone');
    const parent = drone && world.units.find((u) => u.id === drone.parentId);
    if (drone && parent && drone.controlRangeKm) {
      const p = at(parent.id);
      const pxPerKm = (layout.size * Math.sqrt(3)) / world.map.hexSizeKm;
      scene.linkLayer.circle(p.x, p.y, drone.controlRangeKm * pxPerKm).stroke({ width: px(1.5), color: 0x22d3ee, alpha: 0.8 });
    }

    // Selected hex outline.
    scene.highlight.clear();
    if (selectedHex) {
      scene.highlight.poly(hexCorners(layout, selectedHex)).stroke({ width: px(2.5), color: 0xffffff });
    }

    // Units. Icons keep a readable minimum on-screen size on small hexes.
    for (const child of scene.units.removeChildren()) child.destroy();
    const r = Math.max(layout.size * 0.55, px(7));
    const textResolution = Math.min(8, zoom * (window.devicePixelRatio || 1));
    for (const u of world.units) {
      const { x, y } = hexToPixel(layout, u.pos);
      const selected = u.id === selectedUnitId || (selectedHex !== undefined && hexEquals(u.pos, selectedHex));
      const g = new Graphics();
      if (layers.jamming && u.jammer && u.jammer.mode !== 'off') {
        const halo = u.jammer.mode === 'barrage' ? 2.4 : 1.8;
        g.circle(0, 0, r * halo).fill({ color: JAM_COLOR, alpha: 0.25 }).stroke({ width: px(2), color: JAM_COLOR });
      }
      const dim = dimUnitIds?.has(u.id) ?? false;
      drawUnitShape(g, u, r, selected, px(1), dim);
      if (dim) g.alpha = 0.45;
      g.position.set(x, y);
      g.rotation = -rotation; // icons stay upright when the map is rotated
      const label = new Text({
        text: unitLabel(u),
        resolution: textResolution,
        style: { fontSize: Math.max(px(8), r * 0.85), fill: u.side === 'neutral' ? 0x111111 : 0xffffff, fontWeight: 'bold', fontFamily: 'system-ui, sans-serif' },
      });
      label.anchor.set(0.5);
      label.position.set(x, y);
      label.pivot.set(0, u.kind === 'civil' ? -r * 0.15 : 0);
      if (dim) label.alpha = 0.6;
      label.rotation = -rotation;
      scene.units.addChild(g, label);
    }
    if (layers.df && tracks) {
      for (const t of tracks.filter((x) => x.fix)) {
        const c = hexToPixel(layout, { q: t.fix!.q, r: t.fix!.r });
        const label = new Text({
          text: `${t.id} · ${t.signature} · CEP ${t.fix!.cepKm.toFixed(1)} km`,
          resolution: textResolution,
          style: { fontSize: px(11), fill: dfColorOf(t.id), fontFamily: 'system-ui, sans-serif', stroke: { color: 0x0f172a, width: px(3) }, padding: px(4) },
        });
        label.anchor.set(0.5, 1);
        // Sit just above the ellipse, whatever its orientation (half-height of the rotated 2-sigma ellipse).
        const { aKm, bKm, angleRad } = t.fix!.ellipse;
        const pxPerKm = (layout.size * Math.sqrt(3)) / world.map.hexSizeKm;
        const halfH = 2 * pxPerKm * Math.hypot(aKm * Math.sin(angleRad), bKm * Math.cos(angleRad));
        label.position.set(c.x, c.y - halfH - px(6));
        label.rotation = -rotation;
        scene.units.addChild(label);
      }
      for (const t of tracks.filter((x) => !x.fix)) {
        for (const b of t.bearings) {
          const s = hexToPixel(layout, b.sensorPos);
          const a = (b.bearingDeg * Math.PI) / 180;
          const d = Math.min(MISSION_RULES.wedgeRangeKm, 8) * ((layout.size * Math.sqrt(3)) / world.map.hexSizeKm);
          const label = new Text({
            text: `${t.id} · ${t.signature} · ±${b.sigmaDeg.toFixed(0)}°`,
            resolution: textResolution,
            style: { fontSize: px(10), fill: dfColorOf(t.id), fontFamily: 'system-ui, sans-serif', stroke: { color: 0x0f172a, width: px(3) }, padding: px(4) },
          });
          label.anchor.set(0.5);
          label.position.set(s.x + Math.sin(a) * d, s.y - Math.cos(a) * d);
          label.rotation = -rotation;
          scene.units.addChild(label);
        }
      }
    }
  }, [ready, size, world, links, selectedHex, selectedUnitId, selectedLinkId, zoom, rotation, detections, tracks, sectors, plans, trails, dimUnitIds, layers.links, layers.jamming, layers.detections, layers.df]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.units.visible = layers.units;
  }, [ready, layers.units]);

  // Coverage tool: tint each hex by received power; mark the transmitter.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene || size.w === 0 || size.h === 0) return;
    scene.heat.clear();
    if (!coverage) return;
    const layout = fitLayout(world.map, size.w, size.h);
    for (const tile of Object.values(world.map.tiles)) {
      const cell = coverage.cells[hexKey(tile.hex)];
      const color = cell ? coverage.colorOf(cell) : null; // hexes beyond the range have no cell
      if (color !== null) scene.heat.poly(hexCorners(layout, tile.hex)).fill({ color, alpha: 0.8 });
    }
    const o = hexToPixel(layout, coverage.origin);
    scene.heat.poly(hexCorners(layout, coverage.origin)).stroke({ width: 3 / zoom, color: 0xffffff });
    scene.heat.circle(o.x, o.y, layout.size * 0.25).fill({ color: 0xffffff });
  }, [ready, size, world.map, coverage, zoom]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.heat.visible = layers.coverage;
  }, [ready, layers.coverage]);

  // Line-of-sight tool and rejected-move flash.
  const hoverHex = hover?.hex;
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene || size.w === 0 || size.h === 0) return;
    scene.overlay.clear();
    const layout = fitLayout(world.map, size.w, size.h);
    const end = losB ?? (losPreview ? hoverHex : undefined);
    if (losA && end) {
      const p = hexToPixel(layout, losA);
      const q = hexToPixel(layout, end);
      scene.overlay.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 5 / zoom, color: 0x0f172a, alpha: 0.6 });
      scene.overlay.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 2.5 / zoom, color: LOS_COLOR, alpha: losB ? 1 : 0.6 });
    }
    if (flash) scene.overlay.poly(hexCorners(layout, flash.hex)).stroke({ width: 3.5 / zoom, color: 0xef4444 });
    for (const h of [losA, losB]) {
      if (h) scene.overlay.poly(hexCorners(layout, h)).stroke({ width: 3 / zoom, color: LOS_COLOR });
    }
  }, [ready, size, world.map, losA, losB, losPreview, hoverHex?.q, hoverHex?.r, flash, zoom]);

  // Draw one frame after any change (this effect runs after all the drawing effects above).
  // Requests in the same animation frame are coalesced.
  const renderQueued = useRef(false);
  useEffect(() => {
    if (!ready || renderQueued.current) return;
    renderQueued.current = true;
    requestAnimationFrame(() => {
      renderQueued.current = false;
      sceneRef.current?.app.render();
    });
  });

  return (
    <div ref={hostRef} className={`map-host ${panning ? 'panning' : ''}`}>
      {layers.legend && layers.terrain === 'colour' && <Legend />}
      {layers.legend && layers.terrain === 'elevation' && <ElevationLegend />}
      <div className="zoom-controls">
        <LayersMenu layers={layers} onChange={onLayersChange} />
        <button title="Zoom in" onClick={() => zoomAt(1.5, size.w / 2, size.h / 2)}>
          +
        </button>
        <button title="Zoom out" onClick={() => zoomAt(1 / 1.5, size.w / 2, size.h / 2)}>
          −
        </button>
        <button title="Zoom to the operating area" onClick={() => applyView(homeView())}>
          Home
        </button>
        <button title="Show the whole map" onClick={() => applyView(FIT_VIEW)}>
          Fit
        </button>
        <span className="zoom-level">
          {Math.round(view.scale * 100)}%{view.aligned && ` · ${Math.round((-view.rotation * 180) / Math.PI)}°`}
        </span>
      </div>
      {hover && !flash && !panning && (
        <HexTooltip world={world} hover={hover} hostWidth={size.w} coverage={coverage?.cells[hexKey(hover.hex)]} note={dimUnitIds && unitAt(world, hover.hex) && dimUnitIds.has(unitAt(world, hover.hex)!.id) ? 'Not found by Blue' : undefined} />
      )}
      {flash && size.w > 0 && <FlashLabel world={world} flash={flash} size={size} view={view} />}
    </div>
  );
}

// Reason for a rejected action, pinned above the offending hex.
function FlashLabel({
  world,
  flash,
  size,
  view,
}: {
  world: World;
  flash: { hex: Hex; reason: string };
  size: { w: number; h: number };
  view: View;
}) {
  const layout = fitLayout(world.map, size.w, size.h);
  const p = hexToPixel(layout, flash.hex);
  // Above the hex on screen, whatever the map rotation.
  const s = toScreen(view, p);
  const top = s.y - layout.size * 1.2 * view.scale;
  return (
    <div className="flash" style={{ left: s.x, top }}>
      {flash.reason}
    </div>
  );
}

// Legend for elevation shading.
function ElevationLegend() {
  const stops = [0, 150, 500, 1000, 1500];
  return (
    <div className="legend">
      <div className="legend-title">Elevation</div>
      {stops.map((m) => (
        <div key={m} className="legend-row elev-row">
          <span className="legend-swatch" style={{ background: toCss(terrainFill('plain', m, 'elevation')) }} />
          <span className="legend-name">{m} m</span>
        </div>
      ))}
      <div className="legend-row elev-row">
        <span className="legend-swatch" style={{ background: toCss(terrainFill('water', 0, 'elevation')) }} />
        <span className="legend-name">Water</span>
      </div>
    </div>
  );
}
