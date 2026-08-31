import { useState, useRef, useEffect, useCallback } from "react";
import { Square, Copy, Circle, Disc, RectangleHorizontal, RotateCcw, Info, Settings2, Columns2, Rows2, MousePointer2, Minus, ArrowRight, Shapes, Download } from "lucide-react";
const API_URL = "https://script.google.com/macros/s/AKfycbzjbXHe8QnQIQFUr79FKRGvPENinnVoSMhZPGqaYWEZdYve81RF0JpRs7-P3YKHvBQ/exec";
async function apiGet(action) {
  const res = await fetch(`${API_URL}?action=${action}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
async function apiPost(action, payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
const PITCH_W_M = 105;
const PITCH_H_M = 68;
const SCALE = 10;
const VB_W = PITCH_W_M * SCALE;
const VB_H = PITCH_H_M * SCALE;
const PLAYER_R = 11;
const MIN_ZONE_PX = 3 * SCALE;
const MARGIN_M = 8;
const MARGIN = MARGIN_M * SCALE;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const QUADRANT_COLOR = {
  fuerza: "#64748b",
  resistencia: "#e11d48",
  velocidad: "#2563eb",
  recuperatorio: "#10b981",
};
const QUADRANT_LABEL = {
  fuerza: "Fuerza",
  resistencia: "Resistencia",
  velocidad: "Velocidad",
  recuperatorio: "Recuperatorio",
};
const NEUTRAL_COLOR = "#38bdf8";
const COLOR_PALETTE = ["#facc15", "#ef4444", "#3b82f6", "#22c55e", "#f97316", "#a855f7", "#f8fafc", "#0f172a"];
const DOSAGE_BY_BAND = [
  { formato: "1:1-2:2", series: 2, rep: 6, dur: "30\"-1'", descansoRep: "3'", descansoSerie: "4'" },
  { formato: "3:3-4:4", series: 1, rep: 4, dur: "3'-4'", descansoRep: "2'", descansoSerie: "—" },
  { formato: "5:5-7:7", series: 1, rep: 3, dur: "5'-7'", descansoRep: "2'", descansoSerie: "—" },
  { formato: "8:8-10:10", series: 1, rep: 2, dur: "8'-10'", descansoRep: "2'", descansoSerie: "—" },
];
const TEAMS = [
  { key: "yellow", label: "Amarillo", color: "#eab308" },
  { key: "blue", label: "Azul", color: "#2563eb" },
  { key: "red", label: "Rojo", color: "#dc2626" },
];
const COMODIN_COLOR = "#f8fafc";
const TEAM_COLOR = { ...Object.fromEntries(TEAMS.map((t) => [t.key, t.color])), comodin: COMODIN_COLOR };
const ROLE_RING = { poseedor: "#22c55e", defensor: "#ef4444" };
function computeStats(zone, players, thresholds) {
  if (!zone) return null;
  const areaM2 = (zone.w / SCALE) * (zone.h / SCALE);
  const inside = players.filter(
    (p) => p.x >= zone.x && p.x <= zone.x + zone.w && p.y >= zone.y && p.y <= zone.y + zone.h
  );
  const insideByTeam = Object.fromEntries(
    [...TEAMS.map((t) => t.key), "comodin"].map((k) => [k, inside.filter((p) => p.team === k).length])
  );
  const eii = inside.length > 0 ? areaM2 / inside.length : null;
  const poseedores = inside.filter((p) => p.role === "poseedor").length;
  const defensores = inside.filter((p) => p.role === "defensor").length;
  const minSide = Math.min(zone.w / SCALE, zone.h / SCALE);
  const teamCount = Math.max(0, ...Object.values(insideByTeam));
  const playerBand = teamCount === 0 ? null : teamCount <= 2 ? 0 : teamCount <= 4 ? 1 : teamCount <= 7 ? 2 : 3;
  const eiiBand = eii === null ? null : eii < 50 ? 0 : eii < 100 ? 1 : eii < 200 ? 2 : 3;
  const outOfTable = teamCount > 10;
  const pocos = playerBand !== null && playerBand <= 1;
  const pequeno = eiiBand !== null && eiiBand <= 1;
  const quadrant =
    playerBand === null || eiiBand === null
      ? null
      : pocos && pequeno
      ? "fuerza"
      : pocos && !pequeno
      ? "resistencia"
      : !pocos && pequeno
      ? "recuperatorio"
      : "velocidad";
  const velocidadDominante = quadrant === "velocidad";
  const hsrDistOk = minSide >= thresholds.minDistHSR;
  const hsrActive = velocidadDominante && hsrDistOk;
  const sprintDistOk = minSide >= thresholds.minDistSprint;
  const sprintActive = velocidadDominante && sprintDistOk;
  const velmaxDistOk = minSide >= thresholds.minDistVelMax;
  const velmaxActive = velocidadDominante && velmaxDistOk;
  return {
    areaM2, inside, insideByTeam, eii, minSide, teamCount, poseedores, defensores,
    playerBand, eiiBand, quadrant, hsrActive, sprintActive, velmaxActive,
    caveatForma: velocidadDominante && !hsrDistOk,
    caveatSinInteraccion: inside.length === 1,
    caveatFueraDeTabla: outOfTable,
  };
}
function MarkerShape({ shape, x, y, w, h, color, onPointerDown }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const common = {
    fill: color, fillOpacity: 0.18, stroke: color, strokeWidth: 2.2, strokeDasharray: "3 5",
    onPointerDown, style: { cursor: onPointerDown ? "move" : "default" },
  };
  if (shape === "circle") return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...common} />;
  if (shape === "triangle") return <polygon points={`${cx},${y} ${x},${y + h} ${x + w},${y + h}`} {...common} />;
  if (shape === "rhombus") return <polygon points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`} {...common} />;
  return <rect x={x} y={y} width={w} height={h} {...common} />;
}
function curveControlPoint(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const offset = len * 0.28;
  return { cx: (x1 + x2) / 2 - (dy / len) * offset, cy: (y1 + y2) / 2 + (dx / len) * offset };
}
export default function EIIEditor() {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [zones, setZones] = useState([]);
  const [users, setUsers] = useState(null); 
  const [authedUser, setAuthedUser] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [setupNameDraft, setSetupNameDraft] = useState("");
  const [setupPinDraft, setSetupPinDraft] = useState("");
  const [showUserAdmin, setShowUserAdmin] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [resetPinFor, setResetPinFor] = useState(null);
  const [resetPinDraft, setResetPinDraft] = useState("");
  const [userAdminError, setUserAdminError] = useState(null);
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState(null);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState("");
  const [showNewRecoveryCode, setShowNewRecoveryCode] = useState(null); 
  const [newUserPinShown, setNewUserPinShown] = useState(null); 
  const [recoveryVerified, setRecoveryVerified] = useState(false); 
  const [recoveryNewPin, setRecoveryNewPin] = useState("");
  const [visiblePinFor, setVisiblePinFor] = useState(null);
  const [showSetupPin, setShowSetupPin] = useState(false);
  const [showLoginPin, setShowLoginPin] = useState(false);
  const [showRecoveryNewPin, setShowRecoveryNewPin] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [dimDraft, setDimDraft] = useState({ w: "", h: "" });
  const [nextZoneId, setNextZoneId] = useState(1);
  const [draftZone, setDraftZone] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [players, setPlayers] = useState([]);
  const [nextId, setNextId] = useState(1);
  const [balls, setBalls] = useState([]);
  const [nextBallId, setNextBallId] = useState(1);
  const [goalkeepers, setGoalkeepers] = useState([]);
  const [nextKeeperId, setNextKeeperId] = useState(1);
  const [miniGoals, setMiniGoals] = useState([]);
  const [nextGoalId, setNextGoalId] = useState(1);
  const [drawTool, setDrawTool] = useState(null); 
  const [lineStyle, setLineStyle] = useState("solid"); 
  const [lineCurve, setLineCurve] = useState(false);
  const [markerShape, setMarkerShape] = useState("rect"); 
  const [drawColor, setDrawColor] = useState("#facc15");
  const [lines, setLines] = useState([]);
  const [nextLineId, setNextLineId] = useState(1);
  const [lineDraft, setLineDraft] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [nextMarkerId, setNextMarkerId] = useState(1);
  const [markerDraft, setMarkerDraft] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [nextMaterialId, setNextMaterialId] = useState(1);
  const [texts, setTexts] = useState([]);
  const [nextTextId, setNextTextId] = useState(1);
  const [editingTextId, setEditingTextId] = useState(null);
  const [editTextDraft, setEditTextDraft] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("datos");
  const [thresholds, setThresholds] = useState({ minDistHSR: 15, minDistSprint: 18, minDistVelMax: 25 });
  const [pngUrl, setPngUrl] = useState(null);
  const [exportIncludeData, setExportIncludeData] = useState(false);
  const [library, setLibrary] = useState([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [renamingTaskId, setRenamingTaskId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [loadedTaskId, setLoadedTaskId] = useState(null);
  const [editingPlayerPosId, setEditingPlayerPosId] = useState(null);
  const [playerPosDraft, setPlayerPosDraft] = useState("");
  const [markerDimDraft, setMarkerDimDraft] = useState({ w: "", h: "" });
  const [saveNameDraft, setSaveNameDraft] = useState("");
  const [libFilter, setLibFilter] = useState({ demand: "all", minPlayers: "", maxPlayers: "" });
  const [libBusy, setLibBusy] = useState(false);
  const [libError, setLibError] = useState(null);
  const [activeObj, setActiveObj] = useState(null);
  const toggleActive = (kind, id) => setActiveObj((cur) => (cur && cur.kind === kind && cur.id === id ? null : { kind, id }));
  const isActive = (kind, id) => !!activeObj && activeObj.kind === kind && activeObj.id === id;
  // Vista: "full" muestra todo el campo; "half" recorta EXACTAMENTE la mitad izquierda
  // (sin invadir nada del campo contrario) y la gira 90° para que ocupe el ancho
  // horizontal completo. Portería arriba, línea de medio campo abajo.
  const [viewMode, setViewMode] = useState("full");
  const halfMode = viewMode === "half";
  const vbX = -MARGIN;
  const vbY = -MARGIN;
  const vbW = VB_W + 2 * MARGIN;
  const vbH = VB_H + 2 * MARGIN;
  // Ancho visible = altura del campo (+márgenes arriba/abajo). Alto visible = solo hasta
  // la línea de medio campo (sin margen extra hacia el campo contrario).
  const halfDispW = VB_H + 2 * MARGIN;
  const halfDispH = VB_W / 2 + MARGIN;
  const halfTransform = `matrix(0,1,-1,0,${VB_H + MARGIN},${MARGIN})`;
  const toSvgPoint = useCallback((clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    if (halfMode) {
      const sx = halfDispW / rect.width;
      const sy = halfDispH / rect.height;
      const vx = (clientX - rect.left) * sx;
      const vy = (clientY - rect.top) * sy;
      return { x: vy - MARGIN, y: VB_H + MARGIN - vx };
    }
    const sx = vbW / rect.width;
    const sy = vbH / rect.height;
    return { x: (clientX - rect.left) * sx + vbX, y: (clientY - rect.top) * sy + vbY };
  }, [halfMode, vbW, vbH, vbX, vbY, halfDispW, halfDispH]);
  useEffect(() => {
    (async () => {
      try {
        const tasks = await apiGet("getTasks");
        setLibrary(Array.isArray(tasks) ? tasks : []);
      } catch (err) {
      } finally {
        setLibraryLoaded(true);
      }
    })();
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const list = await apiGet("getUsers");
        setUsers(Array.isArray(list) ? list : []);
      } catch (err) {
        setUsers([]);
      }
      try {
        const rc = await apiGet("getRecoveryCode");
        if (rc && rc.code) setRecoveryCode(rc.code);
      } catch (err) {
      }
    })();
  }, []);
  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return;
      const p = toSvgPoint(e.clientX, e.clientY);
      const d = dragRef.current;
      if (d.type === "create") {
        const x = Math.min(d.startX, p.x);
        const y = Math.min(d.startY, p.y);
        const w = Math.abs(p.x - d.startX);
        const h = Math.abs(p.y - d.startY);
        setDraftZone({ x, y, w, h });
      } else if (d.type === "moveZone") {
        setZones((zs) =>
          zs.map((z) => (z.id === d.id ? { ...z, x: clamp(p.x - d.offX, 0, VB_W - z.w), y: clamp(p.y - d.offY, 0, VB_H - z.h) } : z))
        );
      } else if (d.type === "resize") {
        setZones((zs) =>
          zs.map((z) => {
            if (z.id !== d.id) return z;
            let { x, y, w, h } = d.orig;
            if (d.corner.includes("e")) w = clamp(p.x - x, MIN_ZONE_PX, VB_W - x);
            if (d.corner.includes("s")) h = clamp(p.y - y, MIN_ZONE_PX, VB_H - y);
            if (d.corner.includes("w")) {
              const newX = clamp(p.x, 0, d.orig.x + d.orig.w - MIN_ZONE_PX);
              w = d.orig.x + d.orig.w - newX;
              x = newX;
            }
            if (d.corner.includes("n")) {
              const newY = clamp(p.y, 0, d.orig.y + d.orig.h - MIN_ZONE_PX);
              h = d.orig.y + d.orig.h - newY;
              y = newY;
            }
            return { ...z, x, y, w, h };
          })
        );
      } else if (d.type === "movePlayer") {
        setPlayers((ps) =>
          ps.map((pl) => (pl.id === d.id ? { ...pl, x: clamp(p.x - d.offX, -MARGIN + PLAYER_R, VB_W + MARGIN - PLAYER_R), y: clamp(p.y - d.offY, -MARGIN + PLAYER_R, VB_H + MARGIN - PLAYER_R) } : pl))
        );
      } else if (d.type === "moveBall") {
        setBalls((bs) => bs.map((b) => (b.id === d.id ? { ...b, x: clamp(p.x - d.offX, -MARGIN + 8, VB_W + MARGIN - 8), y: clamp(p.y - d.offY, -MARGIN + 8, VB_H + MARGIN - 8) } : b)));
      } else if (d.type === "moveKeeper") {
        setGoalkeepers((ks) => ks.map((k) => (k.id === d.id ? { ...k, x: clamp(p.x - d.offX, -MARGIN + PLAYER_R, VB_W + MARGIN - PLAYER_R), y: clamp(p.y - d.offY, -MARGIN + PLAYER_R, VB_H + MARGIN - PLAYER_R) } : k)));
      } else if (d.type === "moveGoal") {
        setMiniGoals((gs) => gs.map((g) => (g.id === d.id ? { ...g, x: clamp(p.x - d.offX, -MARGIN + 20, VB_W + MARGIN - 20), y: clamp(p.y - d.offY, -MARGIN + 8, VB_H + MARGIN - 8) } : g)));
      } else if (d.type === "drawLine") {
        setLineDraft({ x1: d.startX, y1: d.startY, x2: p.x, y2: p.y });
      } else if (d.type === "drawMarker") {
        const x = Math.min(d.startX, p.x);
        const y = Math.min(d.startY, p.y);
        const w = Math.abs(p.x - d.startX);
        const h = Math.abs(p.y - d.startY);
        setMarkerDraft({ x, y, w, h });
      } else if (d.type === "moveLine") {
        setLines((ls) => ls.map((l) => (l.id === d.id ? { ...l, x1: l.x1 + (p.x - d.lastX), y1: l.y1 + (p.y - d.lastY), x2: l.x2 + (p.x - d.lastX), y2: l.y2 + (p.y - d.lastY) } : l)));
        dragRef.current = { ...d, lastX: p.x, lastY: p.y };
      } else if (d.type === "moveMarker") {
        setMarkers((ms) => ms.map((m) => (m.id === d.id ? { ...m, x: clamp(p.x - d.offX, -MARGIN, VB_W + MARGIN - m.w), y: clamp(p.y - d.offY, -MARGIN, VB_H + MARGIN - m.h) } : m)));
      } else if (d.type === "moveMaterial") {
        setMaterials((ms) => ms.map((m) => (m.id === d.id ? { ...m, x: clamp(p.x - d.offX, -MARGIN + 10, VB_W + MARGIN - 10), y: clamp(p.y - d.offY, -MARGIN + 10, VB_H + MARGIN - 10) } : m)));
      } else if (d.type === "moveText") {
        setTexts((ts) => ts.map((t) => (t.id === d.id ? { ...t, x: clamp(p.x - d.offX, -MARGIN, VB_W + MARGIN), y: clamp(p.y - d.offY, -MARGIN, VB_H + MARGIN) } : t)));
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d && d.type === "create") {
        setDraftZone((dz) => {
          if (dz && dz.w >= MIN_ZONE_PX && dz.h >= MIN_ZONE_PX) {
            const id = nextZoneId;
            setZones((zs) => [...zs, { id, ...dz }]);
            setSelectedZoneId(id);
            setNextZoneId((n) => n + 1);
          }
          return null;
        });
        setDrawing(false);
      }
      if (d && d.type === "drawLine") {
        setLineDraft((ld) => {
          if (ld && Math.hypot(ld.x2 - ld.x1, ld.y2 - ld.y1) >= 10) {
            const id = nextLineId;
            setLines((ls) => [...ls, { id, ...ld, style: lineStyle, arrow: drawTool === "arrow", color: drawColor, curve: lineCurve }]);
            setNextLineId((n) => n + 1);
          }
          return null;
        });
      }
      if (d && d.type === "drawMarker") {
        setMarkerDraft((md) => {
          if (md && md.w >= MIN_ZONE_PX && md.h >= MIN_ZONE_PX) {
            const id = nextMarkerId;
            setMarkers((ms) => [...ms, { id, ...md, shape: markerShape, color: drawColor }]);
            setNextMarkerId((n) => n + 1);
          }
          return null;
        });
      }
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [toSvgPoint, nextZoneId, drawTool, lineStyle, lineCurve, markerShape, drawColor, nextLineId, nextMarkerId]);
  const startCreate = (e) => {
    if (drawTool === "line" || drawTool === "arrow") {
      const p = toSvgPoint(e.clientX, e.clientY);
      dragRef.current = { type: "drawLine", startX: p.x, startY: p.y };
      setLineDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }
    if (drawTool === "marker") {
      const p = toSvgPoint(e.clientX, e.clientY);
      dragRef.current = { type: "drawMarker", startX: p.x, startY: p.y };
      setMarkerDraft({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    if (drawTool === "text") {
      const p = toSvgPoint(e.clientX, e.clientY);
      const id = nextTextId;
      setTexts((ts) => [...ts, { id, x: p.x, y: p.y, content: "Texto", color: drawColor }]);
      setNextTextId((n) => n + 1);
      setActiveObj({ kind: "text", id });
      setEditingTextId(id);
      setEditTextDraft("Texto");
      setDrawTool(null);
      return;
    }
    if (!drawing) {
      setSelectedZoneId(null);
      setActiveObj(null);
      return;
    }
    const p = toSvgPoint(e.clientX, e.clientY);
    dragRef.current = { type: "create", startX: p.x, startY: p.y };
    setDraftZone({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const addFullFieldZone = () => {
    const id = nextZoneId;
    setZones((zs) => [...zs, { id, x: 0, y: 0, w: VB_W, h: VB_H }]);
    setSelectedZoneId(id);
    setNextZoneId((n) => n + 1);
  };
  const addHalfFieldZone = () => {
    const id = nextZoneId;
    setZones((zs) => [...zs, { id, x: 0, y: 0, w: VB_W / 2, h: VB_H }]);
    setSelectedZoneId(id);
    setNextZoneId((n) => n + 1);
  };
  const startMoveZone = (zone) => (e) => {
    e.stopPropagation();
    setSelectedZoneId(zone.id);
    const p = toSvgPoint(e.clientX, e.clientY);
    dragRef.current = { type: "moveZone", id: zone.id, offX: p.x - zone.x, offY: p.y - zone.y };
  };
  const startResize = (zone, corner) => (e) => {
    e.stopPropagation();
    dragRef.current = { type: "resize", id: zone.id, corner, orig: { ...zone } };
  };
  const removeZone = (id) => {
    setZones((zs) => zs.filter((z) => z.id !== id));
    setSelectedZoneId((sel) => (sel === id ? null : sel));
  };
  const duplicateZone = () => {
    const z = zones.find((z) => z.id === selectedZoneId);
    if (!z) return;
    const id = nextZoneId;
    const nx = clamp(z.x + 20, 0, VB_W - z.w);
    const ny = clamp(z.y + 20, 0, VB_H - z.h);
    setZones((zs) => [...zs, { id, x: nx, y: ny, w: z.w, h: z.h }]);
    setSelectedZoneId(id);
    setNextZoneId((n) => n + 1);
  };
  const setZoneDimensionMeters = (axis, meters) => {
    if (!selectedZoneId || !Number.isFinite(meters) || meters <= 0) return;
    setZones((zs) =>
      zs.map((z) => {
        if (z.id !== selectedZoneId) return z;
        const px = clamp(meters * SCALE, MIN_ZONE_PX, axis === "w" ? VB_W - z.x : VB_H - z.y);
        return { ...z, [axis]: px };
      })
    );
  };
  const startMovePlayer = (id) => (e) => {
    e.stopPropagation();
    toggleActive("player", id);
    const pl = players.find((p) => p.id === id);
    const p = toSvgPoint(e.clientX, e.clientY);
    dragRef.current = { type: "movePlayer", id, offX: p.x - pl.x, offY: p.y - pl.y };
  };
  const startMoveBall = (id) => (e) => {
    e.stopPropagation();
    toggleActive("ball", id);
    const b = balls.find((x) => x.id === id);
    const p = toSvgPoint(e.clientX, e.clientY);
    dragRef.current = { type: "moveBall", id, offX: p.x - b.x, offY: p.y - b.y };
  };
  const startMoveGoal = (id) => (e) => {
    e.stopPropagation();
    toggleActive("goal", id);
    const g = miniGoals.find((x) => x.id === id);
    const p = toSvgPoint(e.clientX, e.clientY);
    dragRef.current = { type: "moveGoal", id, offX: p.x - g.x, offY: p.y - g.y };
  };
  const addPlayer = (team) => {
    const cx = zones.find((z) => z.id === selectedZoneId);
    const base = cx ? { x: cx.x + cx.w / 2, y: cx.y + cx.h / 2 } : { x: VB_W / 2, y: VB_H / 2 };
    setPlayers((ps) => [...ps, { id: nextId, team, role: "poseedor", pos: "", x: base.x + ((ps.length * 17) % 80) - 40, y: base.y + ((ps.length * 11) % 60) - 30 }]);
    setNextId((n) => n + 1);
  };
  const removePlayer = (id) => setPlayers((ps) => ps.filter((p) => p.id !== id));
  const toggleRolePlayer = (id) =>
    setPlayers((ps) => ps.map((p) => (p.id === id && p.team !== "comodin" ? { ...p, role: p.role === "poseedor" ? "defensor" : "poseedor" } : p)));
  const startEditPlayerPos = (p) => {
    setEditingPlayerPosId(p.id);
    setPlayerPosDraft(p.pos || "");
  };
  const commitPlayerPos = () => {
    setPlayers((ps) => ps.map((p) => (p.id === editingPlayerPosId ? { ...p, pos: playerPosDraft.trim().slice(0, 4).toUpperCase() } : p)));
    setEditingPlayerPosId(null);
  };
  const addBall = () => {
    setBalls((bs) => [...bs, { id: nextBallId, x: VB_W / 2, y: VB_H / 2 }]);
    setNextBallId((n) => n + 1);
  };
  const removeBall = (id) => setBalls((bs) => bs.filter((b) => b.id !== id));
  const startMoveKeeper = (id) => (e) => {
    e.stopPropagation();
    toggleActive("keeper", id);
    const k = goalkeepers.find((x) => x.id === id);
    const p = toSvgPoint(e.clientX, e.clientY);
    dragRef.current = { type: "moveKeeper", id, offX: p.x - k.x, offY: p.y - k.y };
  };
  const addGoalkeeper = () => {
    const cx = zones.find((z) => z.id === selectedZoneId);
    const base = cx ? { x: cx.x + cx.w / 2, y: cx.y + cx.h / 2 } : { x: VB_W / 2, y: VB_H / 2 };
    setGoalkeepers((ks) => [...ks, { id: nextKeeperId, x: base.x + ((ks.length * 15) % 50) - 25, y: base.y + ((ks.length * 10) % 40) - 20 }]);
    setNextKeeperId((n) => n + 1);
  };
  const removeGoalkeeper = (id) => setGoalkeepers((ks) => ks.filter((k) => k.id !== id));
  const addMiniGoal = () => {
    const cx = zones.find((z) => z.id === selectedZoneId);
    const base = cx ? { x: cx.x + cx.w / 2, y: cx.y - 20 } : { x: VB_W / 2, y: VB_H / 2 - 100 };
    setMiniGoals((gs) => [...gs, { id: nextGoalId, ...base, rotation: 0 }]);
    setNextGoalId((n) => n + 1);
  };
  const removeMiniGoal = (id) => setMiniGoals((gs) => gs.filter((g) => g.id !== id));
  const rotateMiniGoal = (id) => setMiniGoals((gs) => gs.map((g) => (g.id === id ? { ...g, rotation: ((g.rotation || 0) + 45) % 360 } : g)));
  const startMoveLine = (id) => (e) => {
    e.stopPropagation();
    toggleActive("line", id);
    const p = toSvgPoint(e.clientX, e.clientY);
    dragRef.current = { type: "moveLine", id, lastX: p.x, lastY: p.y };
  };
  const removeLine = (id) => setLines((ls) => ls.filter((l) => l.id !== id));
  const startMoveMarker = (marker) => (e) => {
    e.stopPropagation();
    toggleActive("marker", marker.id);
    const p = toSvgPoint(e.clientX, e.clientY);
    dragRef.current = { type: "moveMarker", id: marker.id, offX: p.x - marker.x, offY: p.y - marker.y };
  };
  const removeMarker = (id) => setMarkers((ms) => ms.filter((m) => m.id !== id));
  const startMoveMaterial = (id) => (e) => {
    e.stopPropagation();
    toggleActive("material", id);
    const m = materials.find((x) => x.id === id);
    const p = toSvgPoint(e.clientX, e.clientY);
    dragRef.current = { type: "moveMaterial", id, offX: p.x - m.x, offY: p.y - m.y };
  };
  const addMaterial = (type) => {
    const cx = zones.find((z) => z.id === selectedZoneId);
    const base = cx ? { x: cx.x + cx.w / 2, y: cx.y + cx.h / 2 } : { x: VB_W / 2, y: VB_H / 2 };
    setMaterials((ms) => [...ms, { id: nextMaterialId, type, x: base.x + ((ms.length * 13) % 60) - 30, y: base.y + ((ms.length * 9) % 40) - 20, rotation: 0 }]);
    setNextMaterialId((n) => n + 1);
  };
  const removeMaterial = (id) => setMaterials((ms) => ms.filter((m) => m.id !== id));
  const startMoveText = (id) => (e) => {
    e.stopPropagation();
    toggleActive("text", id);
    const t = texts.find((x) => x.id === id);
    const p = toSvgPoint(e.clientX, e.clientY);
    dragRef.current = { type: "moveText", id, offX: p.x - t.x, offY: p.y - t.y };
  };
  const removeText = (id) => setTexts((ts) => ts.filter((t) => t.id !== id));
  const startEditText = (t) => {
    setEditingTextId(t.id);
    setEditTextDraft(t.content);
  };
  const commitEditText = () => {
    setTexts((ts) => ts.map((t) => (t.id === editingTextId ? { ...t, content: editTextDraft.trim() || "Texto" } : t)));
    setEditingTextId(null);
  };
  const rotateMaterial = (id) => setMaterials((ms) => ms.map((m) => (m.id === id ? { ...m, rotation: ((m.rotation || 0) + 45) % 360 } : m)));
  const persistLibrary = async (lib) => {
    try {
      const res = await apiPost("setTasks", { tasks: lib });
      if (!res || res.error) setLibError("No se pudo guardar la biblioteca.");
    } catch (err) {
      setLibError("No se pudo guardar la biblioteca (sin conexión con el servidor).");
    }
  };
  const saveCurrentTask = async () => {
    setLibBusy(true);
    setLibError(null);
    try {
      const demands = [...new Set(zones.map((z) => computeStats(z, players, thresholds).quadrant).filter(Boolean))];
      const maxTeamPlayers = Math.max(0, ...zones.map((z) => computeStats(z, players, thresholds).teamCount || 0));
      const task = {
        id: Date.now(),
        name: saveNameDraft.trim() || `Tarea ${new Date().toLocaleDateString("es-ES")}`,
        savedAt: Date.now(),
        summary: {
          zoneCount: zones.length,
          dims: zones.map((z) => `${(z.w / SCALE).toFixed(1)}×${(z.h / SCALE).toFixed(1)}m`),
          demands,
          maxTeamPlayers,
          playerTotal: players.length,
        },
        data: { zones, players, goalkeepers, balls, miniGoals, lines, markers, materials, texts },
      };
      const newLib = [task, ...library];
      setLibrary(newLib);
      await persistLibrary(newLib);
      setLoadedTaskId(task.id);
      setShowSaveForm(false);
      setSaveNameDraft("");
    } finally {
      setLibBusy(false);
    }
  };
  const loadedTask = loadedTaskId ? library.find((t) => t.id === loadedTaskId) || null : null;
  const overwriteCurrentTask = async () => {
    if (!loadedTaskId) return;
    setLibBusy(true);
    setLibError(null);
    try {
      const demands = [...new Set(zones.map((z) => computeStats(z, players, thresholds).quadrant).filter(Boolean))];
      const maxTeamPlayers = Math.max(0, ...zones.map((z) => computeStats(z, players, thresholds).teamCount || 0));
      const newLib = library.map((t) =>
        t.id === loadedTaskId
          ? {
              ...t,
              savedAt: Date.now(),
              summary: {
                zoneCount: zones.length,
                dims: zones.map((z) => `${(z.w / SCALE).toFixed(1)}×${(z.h / SCALE).toFixed(1)}m`),
                demands,
                maxTeamPlayers,
                playerTotal: players.length,
              },
              data: { zones, players, goalkeepers, balls, miniGoals, lines, markers, materials, texts },
            }
          : t
      );
      setLibrary(newLib);
      await persistLibrary(newLib);
      setShowSaveForm(false);
    } finally {
      setLibBusy(false);
    }
  };
  const loadTask = (task) => {
    const d = task.data || {};
    setZones(d.zones || []);
    setPlayers(d.players || []);
    setBalls(d.balls || []);
    setGoalkeepers(d.goalkeepers || []);
    setMiniGoals(d.miniGoals || []);
    setLines(d.lines || []);
    setMarkers(d.markers || []);
    setMaterials(d.materials || []);
    setTexts(d.texts || []);
    setSelectedZoneId(null);
    setActiveObj(null);
    setLoadedTaskId(task.id);
    setShowLibrary(false);
  };
  const deleteTask = async (id) => {
    const newLib = library.filter((t) => t.id !== id);
    setLibrary(newLib);
    await persistLibrary(newLib);
    if (loadedTaskId === id) setLoadedTaskId(null);
  };
  const renameTask = async (id, newName) => {
    const name = newName.trim();
    if (!name) return;
    const newLib = library.map((t) => (t.id === id ? { ...t, name } : t));
    setLibrary(newLib);
    await persistLibrary(newLib);
  };
  const filteredLibrary = library.filter((t) => {
    if (libFilter.demand !== "all" && !t.summary.demands.includes(libFilter.demand)) return false;
    if (libFilter.minPlayers && t.summary.maxTeamPlayers < Number(libFilter.minPlayers)) return false;
    if (libFilter.maxPlayers && t.summary.maxTeamPlayers > Number(libFilter.maxPlayers)) return false;
    return true;
  });
  const PIN_RE = /^\d{4,8}$/;
  const persistUsers = async (list) => {
    try {
      const res = await apiPost("setUsers", { users: list });
      if (!res || res.error) setUserAdminError("No se pudo guardar la lista de usuarios.");
    } catch (err) {
      setUserAdminError("No se pudo guardar la lista de usuarios (sin conexión con el servidor).");
    }
  };
  const generateRecoveryCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; 
    let code = "";
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code.slice(0, 4) + "-" + code.slice(4);
  };
  const generateUniquePin = (currentList) => {
    let pin;
    let tries = 0;
    do {
      pin = String(Math.floor(100000 + Math.random() * 900000)); 
      tries++;
    } while (currentList.some((u) => u.pin === pin) && tries < 50);
    return pin;
  };
  const createFirstAdmin = async () => {
    if (!setupNameDraft.trim() || !PIN_RE.test(setupPinDraft)) {
      setAuthError("Nombre y PIN de 4 a 8 dígitos.");
      return;
    }
    const admin = { id: Date.now(), name: setupNameDraft.trim(), pin: setupPinDraft, isAdmin: true, createdAt: Date.now() };
    const list = [admin];
    const code = generateRecoveryCode();
    setUsers(list);
    await persistUsers(list);
    try { await apiPost("setRecoveryCode", { code }); } catch (err) {  }
    setRecoveryCode(code);
    setShowNewRecoveryCode({ code, pendingUser: admin });
    setAuthError("");
  };
  const tryLogin = () => {
    const match = (users || []).find((u) => u.pin === pinInput);
    if (match) {
      setAuthedUser(match);
      setPinInput("");
      setAuthError("");
    } else {
      setAuthError("PIN incorrecto.");
    }
  };
  const addUser = async () => {
    setUserAdminError(null);
    if (!newUserName.trim()) {
      setUserAdminError("Ponle un nombre al usuario.");
      return;
    }
    const pin = generateUniquePin(users);
    const list = [...users, { id: Date.now(), name: newUserName.trim(), pin, isAdmin: false, createdAt: Date.now() }];
    setUsers(list);
    await persistUsers(list);
    setNewUserName("");
    setNewUserPinShown({ name: list[list.length - 1].name, pin });
  };
  const resetPinAuto = async (id) => {
    setUserAdminError(null);
    const pin = generateUniquePin(users.filter((u) => u.id !== id));
    const list = users.map((u) => (u.id === id ? { ...u, pin } : u));
    setUsers(list);
    await persistUsers(list);
    const u = list.find((x) => x.id === id);
    setNewUserPinShown({ name: u.name, pin });
  };
  const changeOwnPin = async () => {
    setUserAdminError(null);
    if (!PIN_RE.test(resetPinDraft)) {
      setUserAdminError("PIN de 4 a 8 dígitos.");
      return;
    }
    if (users.some((u) => u.pin === resetPinDraft && u.id !== authedUser.id)) {
      setUserAdminError("Ese PIN ya está en uso por otro usuario. Prueba con otro.");
      return;
    }
    const list = users.map((u) => (u.id === authedUser.id ? { ...u, pin: resetPinDraft } : u));
    setUsers(list);
    await persistUsers(list);
    setAuthedUser(list.find((u) => u.id === authedUser.id));
    setResetPinFor(null);
    setResetPinDraft("");
  };
  const deleteUser = async (id) => {
    setUserAdminError(null);
    if (authedUser && authedUser.id === id) {
      setUserAdminError("No puedes eliminar tu propio usuario mientras tienes la sesión iniciada.");
      return;
    }
    const list = users.filter((u) => u.id !== id);
    setUsers(list);
    await persistUsers(list);
  };
  const regenerateRecoveryCode = async () => {
    const code = generateRecoveryCode();
    try { await apiPost("setRecoveryCode", { code }); } catch (err) {  }
    setRecoveryCode(code);
    setShowNewRecoveryCode({ code, pendingUser: null });
  };
  const verifyRecoveryCode = () => {
    setAuthError("");
    if (!recoveryCode) {
      setAuthError("No hay código de recuperación registrado en esta instalación: no se puede verificar.");
      return;
    }
    if (recoveryCodeInput.trim().toUpperCase() !== recoveryCode.toUpperCase()) {
      setAuthError("Código de recuperación incorrecto.");
      return;
    }
    setRecoveryVerified(true);
    setAuthError("");
  };
  const setNewAdminPinAfterRecovery = async () => {
    setAuthError("");
    if (!PIN_RE.test(recoveryNewPin)) {
      setAuthError("El PIN nuevo debe tener de 4 a 8 dígitos.");
      return;
    }
    const admin = users.find((u) => u.isAdmin);
    if (!admin) {
      setAuthError("No se encontró el usuario administrador.");
      return;
    }
    if (users.some((u) => u.pin === recoveryNewPin && u.id !== admin.id)) {
      setAuthError("Ese PIN ya está en uso por otro usuario. Prueba con otro.");
      return;
    }
    const list = users.map((u) => (u.id === admin.id ? { ...u, pin: recoveryNewPin } : u));
    setUsers(list);
    await persistUsers(list);
    setAuthedUser(list.find((u) => u.id === admin.id));
    setShowForgotPin(false);
    setRecoveryVerified(false);
    setRecoveryCodeInput("");
    setRecoveryNewPin("");
    setAuthError("");
  };
  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const exportPNG = (includeData) => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    setPngUrl("loading");
    const scale = 3;
    const clone = svgEl.cloneNode(true);
    clone.setAttribute("width", VB_W * scale);
    clone.setAttribute("height", VB_H * scale);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const svgString = new XMLSerializer().serializeToString(clone);
    const svgData = "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(svgString)));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = VB_W * scale;
      canvas.height = VB_H * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (includeData && selectedZone && stats) {
        const pad = 16 * scale;
        const lineH = 26 * scale;
        const lines = [
          `Área: ${stats.areaM2.toFixed(0)} m²  ·  EII: ${stats.eii !== null ? stats.eii.toFixed(1) : "—"} m²/jug`,
          `Jugadores/equipo: ${stats.teamCount || "—"}   Dentro: ${stats.inside.length}`,
          `Rol: 🟢 ${stats.poseedores} atacan · 🔴 ${stats.defensores} defienden`,
          `Demanda: ${stats.quadrant ? QUADRANT_LABEL[stats.quadrant] : "—"}`,
        ];
        const panelW = 440 * scale;
        const panelH = pad * 2 + lines.length * lineH;
        const x = canvas.width - panelW - 14 * scale;
        const y = canvas.height - panelH - 14 * scale;
        ctx.fillStyle = "rgba(15,23,42,0.9)";
        ctx.strokeStyle = stats.quadrant ? QUADRANT_COLOR[stats.quadrant] : "#475569";
        ctx.lineWidth = 2 * scale;
        roundRect(ctx, x, y, panelW, panelH, 10 * scale);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#f8fafc";
        ctx.font = `${17 * scale}px ui-monospace, monospace`;
        ctx.textBaseline = "middle";
        lines.forEach((t, i) => ctx.fillText(t, x + pad, y + pad + (i + 0.5) * lineH));
      }
      try {
        setPngUrl(canvas.toDataURL("image/png"));
      } catch (err) {
        setPngUrl("error");
      }
    };
    img.onerror = () => setPngUrl("error");
    img.src = svgData;
  };
  const reset = () => {
    setZones([]);
    setSelectedZoneId(null);
    setNextZoneId(1);
    setPlayers([]);
    setNextId(1);
    setBalls([]);
    setNextBallId(1);
    setGoalkeepers([]);
    setNextKeeperId(1);
    setMiniGoals([]);
    setNextGoalId(1);
    setLines([]);
    setNextLineId(1);
    setLineDraft(null);
    setMarkers([]);
    setNextMarkerId(1);
    setMarkerDraft(null);
    setMaterials([]);
    setNextMaterialId(1);
    setTexts([]);
    setNextTextId(1);
    setEditingTextId(null);
    setDrawTool(null);
    setActiveObj(null);
    setPngUrl(null);
    setLoadedTaskId(null);
  };
  const selectedZone = zones.find((z) => z.id === selectedZoneId) || null;
  const stats = computeStats(selectedZone, players, thresholds);
  useEffect(() => {
    if (selectedZone) {
      setDimDraft({ w: (selectedZone.w / SCALE).toFixed(1), h: (selectedZone.h / SCALE).toFixed(1) });
    }
  }, [selectedZoneId]);
  const commitDim = (axis) => {
    if (!selectedZone) return;
    const raw = Number(dimDraft[axis]);
    if (!Number.isFinite(raw) || raw <= 0) {
      setDimDraft((d) => ({ ...d, [axis]: (selectedZone[axis] / SCALE).toFixed(1) }));
      return;
    }
    const maxM = axis === "w" ? (VB_W - selectedZone.x) / SCALE : (VB_H - selectedZone.y) / SCALE;
    const clampedM = Math.min(Math.max(raw, MIN_ZONE_PX / SCALE), maxM);
    setZoneDimensionMeters(axis, clampedM);
    setDimDraft((d) => ({ ...d, [axis]: clampedM.toFixed(1) }));
  };
  const activeMarker = activeObj?.kind === "marker" ? markers.find((m) => m.id === activeObj.id) || null : null;
  useEffect(() => {
    if (activeMarker) {
      setMarkerDimDraft({ w: (activeMarker.w / SCALE).toFixed(1), h: (activeMarker.h / SCALE).toFixed(1) });
    }
  }, [activeObj?.kind, activeObj?.id]);
  const commitMarkerDim = (axis) => {
    if (!activeMarker) return;
    const raw = Number(markerDimDraft[axis]);
    if (!Number.isFinite(raw) || raw <= 0) {
      setMarkerDimDraft((d) => ({ ...d, [axis]: (activeMarker[axis] / SCALE).toFixed(1) }));
      return;
    }
    const clampedPx = Math.max(raw * SCALE, MIN_ZONE_PX);
    setMarkers((ms) => ms.map((m) => (m.id === activeMarker.id ? { ...m, [axis]: clampedPx } : m)));
    setMarkerDimDraft((d) => ({ ...d, [axis]: (clampedPx / SCALE).toFixed(1) }));
  };
  const distTag = (active, gateOk, distOk) => (active ? "Activa" : gateOk && !distOk ? "Forma" : "—");
  const variables = stats
    ? [
        { key: "dist", label: "Distancia total", tag: stats.quadrant === "resistencia" ? "Dominante" : "—" },
        { key: "acel", label: "Acel. / Decel.", tag: stats.quadrant === "fuerza" ? "Dominante" : "—" },
        { key: "hsr", label: "HSR", tag: distTag(stats.hsrActive, stats.quadrant === "velocidad", stats.hsrActive) },
        { key: "sprint", label: "Sprint", tag: distTag(stats.sprintActive, stats.quadrant === "velocidad", stats.sprintActive) },
        { key: "velmax", label: "Vel. máxima", tag: distTag(stats.velmaxActive, stats.quadrant === "velocidad", stats.velmaxActive) },
      ]
    : [];
  const iconBtn = "flex flex-col items-center justify-center gap-0.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition min-w-[56px]";
  const iconBtnOff = "bg-slate-900 border-slate-700 hover:border-slate-500 text-slate-300";
  const iconBtnOn = "bg-emerald-600 border-emerald-500 text-white";
  const gateInputStyle = { background: "#122440", border: "1px solid #1A3050", color: "#F0F4FF" };
  if (users === null) {
    return (
      <div className="h-screen w-full flex items-center justify-center text-sm" style={{ background: "#060D1A", color: "#8BA4C0" }}>
        Cargando…
      </div>
    );
  }
  if (showNewRecoveryCode) {
    return (
      <div className="h-screen w-full flex items-center justify-center p-4" style={{ background: "#060D1A" }}>
        <div className="w-full max-w-sm rounded-xl p-6" style={{ background: "#0E1E35", border: "1px solid #F5C518" }}>
          <h1 className="text-lg font-bold mb-2" style={{ color: "#F0F4FF" }}>Guarda este código</h1>
          <p className="text-xs mb-4 leading-snug" style={{ color: "#8BA4C0" }}>
            Es tu <b style={{ color: "#F0F4FF" }}>código de recuperación</b>. Solo se muestra esta vez. Si algún día olvidas tu PIN de administrador, lo necesitarás para poder restablecer el acceso — sin él, no hay forma de recuperarlo. Anótalo en un sitio seguro (no en esta pantalla, no se guarda para ti).
          </p>
          <div className="w-full mb-4 px-3 py-3 rounded-md text-center text-xl font-bold tracking-[4px]" style={{ background: "#122440", border: "1px solid #1A3050", color: "#F5C518" }}>
            {showNewRecoveryCode.code}
          </div>
          <button
            onClick={() => { if (showNewRecoveryCode.pendingUser) setAuthedUser(showNewRecoveryCode.pendingUser); setShowNewRecoveryCode(null); }}
            className="w-full py-2 rounded-md text-sm font-semibold"
            style={{ background: "#F5C518", color: "#060D1A" }}
          >
            Ya lo he guardado, continuar
          </button>
        </div>
      </div>
    );
  }
  if (!authedUser) {
    return (
      <div className="h-screen w-full flex items-center justify-center p-4" style={{ background: "#060D1A" }}>
        <div className="w-full max-w-sm rounded-xl p-6" style={{ background: "#0E1E35", border: "1px solid #1A3050" }}>
          <h1 className="text-xl font-bold mb-1" style={{ color: "#F0F4FF" }}>Pizarra Técnica</h1>
          <p className="text-xs mb-5" style={{ color: "#8BA4C0" }}>Diseñador de tareas</p>
          {users.length === 0 ? (
            <>
              <p className="text-xs mb-3" style={{ color: "#8BA4C0" }}>Primer acceso: crea tu usuario administrador.</p>
              <input
                placeholder="Tu nombre" value={setupNameDraft}
                onChange={(e) => setSetupNameDraft(e.target.value)}
                className="w-full mb-2 px-3 py-2 rounded-md text-sm outline-none"
                style={gateInputStyle}
              />
              <div className="relative mb-3">
                <input
                  placeholder="PIN (4-8 dígitos)" inputMode="numeric" type={showSetupPin ? "text" : "password"} value={setupPinDraft}
                  onChange={(e) => setSetupPinDraft(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") createFirstAdmin(); }}
                  className="w-full px-3 py-2 pr-9 rounded-md text-sm tracking-widest outline-none"
                  style={gateInputStyle}
                />
                <button type="button" onClick={() => setShowSetupPin((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#8BA4C0" }}>
                  {showSetupPin ? "🙈" : "👁"}
                </button>
              </div>
              {authError && <p className="text-xs mb-2" style={{ color: "#EF4444" }}>{authError}</p>}
              <button onClick={createFirstAdmin} className="w-full py-2 rounded-md text-sm font-semibold" style={{ background: "#F5C518", color: "#060D1A" }}>
                Crear y entrar
              </button>
            </>
          ) : (
            <>
              <div className="relative mb-3">
                <input
                  placeholder="PIN" inputMode="numeric" autoFocus type={showLoginPin ? "text" : "password"} value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") tryLogin(); }}
                  className="w-full px-3 py-2.5 pr-9 rounded-md text-lg text-center tracking-[8px] outline-none"
                  style={gateInputStyle}
                />
                <button type="button" onClick={() => setShowLoginPin((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#8BA4C0" }}>
                  {showLoginPin ? "🙈" : "👁"}
                </button>
              </div>
              {authError && <p className="text-xs mb-2" style={{ color: "#EF4444" }}>{authError}</p>}
              <button onClick={tryLogin} className="w-full py-2 rounded-md text-sm font-semibold" style={{ background: "#F5C518", color: "#060D1A" }}>
                Entrar
              </button>
              <p className="text-[10px] mt-4" style={{ color: "#4A6680" }}>¿No tienes PIN? Pídeselo a quien te dio acceso a esta pizarra.</p>
              {!showForgotPin ? (
                <button onClick={() => setShowForgotPin(true)} className="text-[10px] mt-2 underline" style={{ color: "#8BA4C0" }}>
                  ¿Eres el admin y olvidaste tu PIN?
                </button>
              ) : !recoveryVerified ? (
                <div className="mt-3 p-3 rounded-md" style={{ background: "#122440", border: "1px solid #1A3050" }}>
                  <p className="text-xs mb-2 leading-snug" style={{ color: "#F0F4FF" }}>
                    Introduce el código de recuperación que se te mostró al crear el usuario administrador. Solo te dejará elegir un PIN nuevo para el admin — nadie más se ve afectado.
                  </p>
                  <input
                    placeholder="XXXX-XXXX" value={recoveryCodeInput}
                    onChange={(e) => setRecoveryCodeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") verifyRecoveryCode(); }}
                    className="w-full mb-2 px-3 py-2 rounded-md text-sm tracking-widest uppercase outline-none"
                    style={gateInputStyle}
                  />
                  {authError && <p className="text-xs mb-2" style={{ color: "#EF4444" }}>{authError}</p>}
                  <div className="flex gap-2">
                    <button onClick={verifyRecoveryCode} className="flex-1 py-1.5 rounded-md text-xs font-semibold" style={{ background: "#F5C518", color: "#060D1A" }}>
                      Verificar código
                    </button>
                    <button onClick={() => { setShowForgotPin(false); setRecoveryCodeInput(""); setAuthError(""); }} className="flex-1 py-1.5 rounded-md text-xs" style={{ background: "#1A3050", color: "#8BA4C0" }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 p-3 rounded-md" style={{ background: "#122440", border: "1px solid #22C55E" }}>
                  <p className="text-xs mb-2 leading-snug" style={{ color: "#F0F4FF" }}>
                    Código correcto. Elige tu nuevo PIN de administrador.
                  </p>
                  <div className="relative mb-2">
                    <input
                      placeholder="Nuevo PIN (4-8 dígitos)" inputMode="numeric" autoFocus type={showRecoveryNewPin ? "text" : "password"} value={recoveryNewPin}
                      onChange={(e) => setRecoveryNewPin(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => { if (e.key === "Enter") setNewAdminPinAfterRecovery(); }}
                      className="w-full px-3 py-2 pr-9 rounded-md text-sm tracking-widest outline-none"
                      style={gateInputStyle}
                    />
                    <button type="button" onClick={() => setShowRecoveryNewPin((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#8BA4C0" }}>
                      {showRecoveryNewPin ? "🙈" : "👁"}
                    </button>
                  </div>
                  {authError && <p className="text-xs mb-2" style={{ color: "#EF4444" }}>{authError}</p>}
                  <button onClick={setNewAdminPinAfterRecovery} className="w-full py-1.5 rounded-md text-xs font-semibold" style={{ background: "#22C55E", color: "#060D1A" }}>
                    Guardar PIN y entrar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100 font-sans flex flex-col overflow-hidden">
      <style>{`
        .bg-slate-950 { background-color: #060D1A !important; }
        .bg-slate-900 { background-color: #0E1E35 !important; }
        .bg-slate-900\\/80 { background-color: rgba(14,30,53,0.92) !important; }
        .bg-slate-900\\/60 { background-color: rgba(14,30,53,0.78) !important; }
        .bg-slate-800 { background-color: #122440 !important; }
        .bg-slate-800\\/60 { background-color: rgba(18,36,64,0.6) !important; }
        .bg-slate-800\\/50 { background-color: rgba(18,36,64,0.5) !important; }
        .bg-slate-800\\/40 { background-color: rgba(18,36,64,0.4) !important; }
        .bg-slate-700 { background-color: #1A3050 !important; }
        .border-slate-700, .border-slate-800 { border-color: #1A3050 !important; }
        .border-slate-500 { border-color: #4A6680 !important; }
        .hover\\:border-slate-500:hover { border-color: #4A6680 !important; }
        .text-slate-100, .text-slate-200, .text-slate-300 { color: #F0F4FF !important; }
        .text-slate-400 { color: #8BA4C0 !important; }
        .text-slate-500, .text-slate-600 { color: #4A6680 !important; }
        .hover\\:text-slate-200:hover { color: #F0F4FF !important; }
        .text-emerald-400, .text-emerald-500 { color: #F5C518 !important; }
        .bg-emerald-600 { background-color: #F5C518 !important; }
        .hover\\:bg-emerald-500:hover { background-color: #f8d34e !important; }
        .border-emerald-400, .border-emerald-500, .border-emerald-600 { border-color: #F5C518 !important; }
        .hover\\:border-emerald-600:hover { border-color: #F5C518 !important; }
        .bg-emerald-600.text-white, .hover\\:bg-emerald-500.text-white { color: #060D1A !important; }
        .text-amber-400, .text-amber-400\\/90 { color: #F97316 !important; }
        .text-rose-300, .text-rose-400 { color: #EF4444 !important; }
        .bg-rose-700, .hover\\:bg-rose-700:hover { background-color: #EF4444 !important; }
      `}</style>
      <header className="shrink-0 px-3 py-1.5 border-b border-slate-800 flex items-center gap-3">
        <h1 className="text-base font-semibold tracking-tight text-emerald-400">Pizarra Técnica</h1>
        {loadedTask && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 truncate max-w-[160px]" title={`Editando: ${loadedTask.name}`}>
            📝 {loadedTask.name}
          </span>
        )}
        <span className="text-[10px] text-slate-500 uppercase tracking-widest hidden md:inline">Diseñador de tareas · Sub-19 · Tabla 4.2, Castellano &amp; Casamichana (2016)</span>
        <div className="ml-auto flex items-center gap-1.5">
          {authedUser?.isAdmin && (
            <button onClick={() => setShowUserAdmin(true)} className="px-2.5 py-1.5 rounded-md border text-xs font-medium bg-slate-900 border-slate-700 hover:border-emerald-600">
              Usuarios
            </button>
          )}
          <button onClick={() => setAuthedUser(null)} className="px-2.5 py-1.5 rounded-md border text-xs font-medium bg-slate-900 border-slate-700 hover:border-slate-500" title={authedUser?.name}>
            Salir
          </button>
          <button onClick={() => setShowSaveForm((v) => !v)} className={`px-2.5 py-1.5 rounded-md border text-xs font-medium ${showSaveForm ? "bg-slate-700 border-slate-500" : "bg-slate-900 border-slate-700 hover:border-emerald-600"}`}>
            Guardar
          </button>
          <button onClick={() => setShowLibrary(true)} className="px-2.5 py-1.5 rounded-md border text-xs font-medium bg-slate-900 border-slate-700 hover:border-emerald-600">
            Biblioteca {library.length > 0 && <span className="text-emerald-400">({library.length})</span>}
          </button>
          <label className="flex items-center gap-1 text-[10px] text-slate-400 select-none" title="Incluir el panel de datos de la zona seleccionada en la imagen exportada">
            <input type="checkbox" checked={exportIncludeData} onChange={(e) => setExportIncludeData(e.target.checked)} />
            +Datos
          </label>
          <button onClick={() => exportPNG(exportIncludeData)} className="p-1.5 rounded-md border bg-slate-900 border-slate-700 hover:border-emerald-600" title="Exportar como PNG">
            <Download size={15} />
          </button>
          <button onClick={() => setShowInfo((v) => !v)} className={`p-1.5 rounded-md border ${showInfo ? "bg-slate-700 border-slate-500" : "bg-slate-900 border-slate-700"}`} title="Fuentes">
            <Info size={15} />
          </button>
          <button onClick={() => setShowSettings((v) => !v)} className={`p-1.5 rounded-md border ${showSettings ? "bg-slate-700 border-slate-500" : "bg-slate-900 border-slate-700"}`} title="Ajustes">
            <Settings2 size={15} />
          </button>
        </div>
      </header>
      {showSaveForm && (
        <div className="shrink-0 px-3 py-2 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center gap-2 text-xs">
          {loadedTask && (
            <>
              <span className="text-slate-400">Editando "<b className="text-slate-200">{loadedTask.name}</b>":</span>
              <button onClick={overwriteCurrentTask} disabled={libBusy} className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50">
                {libBusy ? "Guardando…" : "Sobrescribir cambios"}
              </button>
              <span className="text-slate-600">o</span>
            </>
          )}
          <span className="text-slate-400">{loadedTask ? "Guardar como nueva:" : "Nombre de la tarea:"}</span>
          <input
            type="text" autoFocus value={saveNameDraft}
            onChange={(e) => setSaveNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveCurrentTask(); }}
            placeholder={`Tarea ${new Date().toLocaleDateString("es-ES")}`}
            className="flex-1 max-w-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
          />
          <button onClick={saveCurrentTask} disabled={libBusy} className="px-2.5 py-1 rounded-md bg-slate-700 hover:border-emerald-600 text-slate-200 font-medium disabled:opacity-50">
            {libBusy ? "Guardando…" : "Guardar como nueva"}
          </button>
          <button onClick={() => setShowSaveForm(false)} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
      )}
      {editingTextId !== null && (
        <div className="shrink-0 px-3 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center gap-2 text-xs">
          <span className="text-slate-400">Texto:</span>
          <input
            type="text" autoFocus value={editTextDraft}
            onChange={(e) => setEditTextDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitEditText(); }}
            className="flex-1 max-w-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
          />
          <button onClick={commitEditText} className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium">Aceptar</button>
          <button onClick={() => setEditingTextId(null)} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
      )}
      {editingPlayerPosId !== null && (
        <div className="shrink-0 px-3 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center gap-2 text-xs">
          <span className="text-slate-400">Posición (ej. LD, MC, DC):</span>
          <input
            type="text" autoFocus value={playerPosDraft} maxLength={4}
            onChange={(e) => setPlayerPosDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitPlayerPos(); }}
            className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 uppercase"
          />
          <button onClick={commitPlayerPos} className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium">Aceptar</button>
          <button onClick={() => setEditingPlayerPosId(null)} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
      )}
      {activeMarker && (
        <div className="shrink-0 px-3 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center gap-2 text-xs">
          <span className="text-slate-400">Marca — Ancho (m):</span>
          <input
            type="number" step="0.5" min="0.3" value={markerDimDraft.w}
            onChange={(e) => setMarkerDimDraft((d) => ({ ...d, w: e.target.value }))}
            onBlur={() => commitMarkerDim("w")}
            onKeyDown={(e) => { if (e.key === "Enter") { commitMarkerDim("w"); e.target.blur(); } }}
            className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-slate-100"
          />
          <span className="text-slate-400">Alto (m):</span>
          <input
            type="number" step="0.5" min="0.3" value={markerDimDraft.h}
            onChange={(e) => setMarkerDimDraft((d) => ({ ...d, h: e.target.value }))}
            onBlur={() => commitMarkerDim("h")}
            onKeyDown={(e) => { if (e.key === "Enter") { commitMarkerDim("h"); e.target.blur(); } }}
            className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-slate-100"
          />
        </div>
      )}
      {pngUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPngUrl(null)}>
          <div className="bg-slate-900 rounded-lg border border-slate-700 max-w-full max-h-full flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
              <span className="text-sm font-medium text-slate-200">
                {pngUrl === "loading" ? "Generando imagen…" : pngUrl === "error" ? "Error al generar" : "Vista previa PNG"}
              </span>
              <button onClick={() => setPngUrl(null)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <div className="p-3 overflow-auto flex items-center justify-center min-h-[200px]">
              {pngUrl === "loading" && <span className="text-slate-400 text-sm">Un momento…</span>}
              {pngUrl === "error" && <span className="text-rose-300 text-sm">No se pudo generar la imagen. Prueba de nuevo.</span>}
              {pngUrl !== "loading" && pngUrl !== "error" && (
                <img src={pngUrl} alt="Vista previa de la tarea" className="max-w-full max-h-[65vh] object-contain rounded" />
              )}
            </div>
            {pngUrl !== "loading" && pngUrl !== "error" && (
              <div className="px-3 py-2 border-t border-slate-800 flex items-center gap-3">
                <a
                  href={pngUrl}
                  download={`tarea-eii-${Date.now()}.png`}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
                >
                  Descargar PNG
                </a>
                <span className="text-[10px] text-slate-500">Si no descarga solo, mantén pulsado sobre la imagen y elige "Guardar imagen".</span>
              </div>
            )}
          </div>
        </div>
      )}
      {showInfo && (
        <div className="shrink-0 px-3 py-3 bg-slate-900/80 border-b border-slate-800">
          <div className="flex flex-wrap items-start gap-5">
            <div className="shrink-0">
              <div className="text-center text-[10px] text-slate-300 font-medium mb-1">Jugadores por equipo</div>
              <div className="grid border border-slate-700 rounded overflow-hidden text-[10px]" style={{ gridTemplateColumns: "62px 88px 88px" }}>
                <div className="bg-slate-800/60" />
                <div className="bg-slate-800/60 text-slate-300 text-center py-1 border-l border-slate-700 font-medium">Pocos<br />(1-4)</div>
                <div className="bg-slate-800/60 text-slate-300 text-center py-1 border-l border-slate-700 font-medium">Muchos<br />(5-10)</div>
                <div className="bg-slate-800/60 text-slate-300 text-center py-1 border-t border-slate-700 font-medium flex items-center justify-center leading-tight">&lt;100<br />m²</div>
                <div className="text-white text-center py-2.5 border-t border-l border-slate-700 font-semibold" style={{ background: QUADRANT_COLOR.fuerza }}>Fuerza</div>
                <div className="text-white text-center py-2.5 border-t border-l border-slate-700 font-semibold" style={{ background: QUADRANT_COLOR.recuperatorio }}>Recuper.</div>
                <div className="bg-slate-800/60 text-slate-300 text-center py-1 border-t border-slate-700 font-medium flex items-center justify-center leading-tight">≥100<br />m²</div>
                <div className="text-white text-center py-2.5 border-t border-l border-slate-700 font-semibold" style={{ background: QUADRANT_COLOR.resistencia }}>Resist.</div>
                <div className="text-white text-center py-2.5 border-t border-l border-slate-700 font-semibold" style={{ background: QUADRANT_COLOR.velocidad }}>Veloc.</div>
              </div>
              <div className="text-center text-[9px] text-slate-500 mt-1">↑ EII (espacio por jugador)</div>
            </div>
            <div className="flex-1 min-w-[260px] text-[11px] text-slate-400 leading-relaxed">
              <p>
                <b className="text-slate-300">"Jugadores"</b> cuenta el equipo más numeroso dentro de la zona, no el total. Ejemplo: 3 amarillos + 3 azules + 1 comodín = 7 en la zona, pero para la tabla cuenta como <b className="text-slate-300">3</b>.
              </p>
              <p className="mt-1.5">
                <b className="text-slate-300">Fuerza</b> → Acel./Decel. &nbsp;·&nbsp; <b className="text-slate-300">Resistencia</b> → Distancia total &nbsp;·&nbsp; <b className="text-slate-300">Velocidad</b> → HSR/Sprint/Vel.máx (si el espacio lo permite) &nbsp;·&nbsp; <b className="text-slate-300">Recuperatorio</b> → ninguna dominante.
              </p>
              <p className="mt-1.5 text-slate-500">Tabla 4.2, Castellano &amp; Casamichana (2016), pág. 139. El filtro de forma (lado más corto) es modificable en ⚙️.</p>
            </div>
          </div>
        </div>
      )}
      {showSettings && (
        <div className="shrink-0 px-3 py-2 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center gap-4 text-xs">
          <span className="text-slate-500">Recorrido lineal mínimo (lado corto):</span>
          <label className="flex items-center gap-1.5">HSR≥<input type="number" value={thresholds.minDistHSR} onChange={(e) => setThresholds((t) => ({ ...t, minDistHSR: Number(e.target.value) }))} className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 font-mono" /> m</label>
          <label className="flex items-center gap-1.5">Sprint≥<input type="number" value={thresholds.minDistSprint} onChange={(e) => setThresholds((t) => ({ ...t, minDistSprint: Number(e.target.value) }))} className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 font-mono" /> m</label>
          <label className="flex items-center gap-1.5">Vel.máx≥<input type="number" value={thresholds.minDistVelMax} onChange={(e) => setThresholds((t) => ({ ...t, minDistVelMax: Number(e.target.value) }))} className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 font-mono" /> m</label>
        </div>
      )}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 min-h-0 p-1.5 flex gap-1.5">
          <div className="shrink-0 w-14 flex flex-col gap-1 items-center pt-1">
            <button
              onClick={() => setDrawTool(null)}
              title="Seleccionar / mover"
              className={`w-9 h-9 rounded-md border flex items-center justify-center ${drawTool === null ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-700 text-slate-300"}`}
            >
              <MousePointer2 size={16} />
            </button>
            <button
              onClick={() => setViewMode((v) => (v === "half" ? "full" : "half"))}
              title={viewMode === "half" ? "Ver campo completo" : "Ampliar 1/2 campo (girado)"}
              className={`w-9 h-9 rounded-md border flex items-center justify-center ${viewMode === "half" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-700 text-slate-300"}`}
            >
              <Columns2 size={16} />
            </button>
            <div className="w-8 border-t border-slate-800 my-0.5" />
            <button
              onClick={() => setDrawTool("line")}
              title="Línea"
              className={`w-9 h-9 rounded-md border flex items-center justify-center ${drawTool === "line" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-700 text-slate-300"}`}
            >
              <Minus size={16} />
            </button>
            <button
              onClick={() => setDrawTool("arrow")}
              title="Flecha"
              className={`w-9 h-9 rounded-md border flex items-center justify-center ${drawTool === "arrow" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-700 text-slate-300"}`}
            >
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => setDrawTool("marker")}
              title="Marcar zona (solo visual)"
              className={`w-9 h-9 rounded-md border flex items-center justify-center ${drawTool === "marker" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-700 text-slate-300"}`}
            >
              <Shapes size={16} />
            </button>
            <button
              onClick={() => setDrawTool("text")}
              title="Añadir texto"
              className={`w-9 h-9 rounded-md border flex items-center justify-center text-sm font-bold ${drawTool === "text" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-700 text-slate-300"}`}
            >
              T
            </button>
            {(drawTool === "line" || drawTool === "arrow") && (
              <div className="flex flex-col gap-1 pt-1 border-t border-slate-800 w-full items-center">
                <button
                  onClick={() => setLineStyle("solid")}
                  title="Continua"
                  className={`w-9 h-7 rounded-md border flex items-center justify-center text-[9px] ${lineStyle === "solid" ? "bg-slate-700 border-slate-500 text-white" : "bg-slate-900 border-slate-700 text-slate-400"}`}
                >
                  ──
                </button>
                <button
                  onClick={() => setLineStyle("dashed")}
                  title="Discontinua"
                  className={`w-9 h-7 rounded-md border flex items-center justify-center text-[9px] ${lineStyle === "dashed" ? "bg-slate-700 border-slate-500 text-white" : "bg-slate-900 border-slate-700 text-slate-400"}`}
                >
                  ┄┄
                </button>
                <button
                  onClick={() => setLineCurve((c) => !c)}
                  title={lineCurve ? "Curva (toca para recta)" : "Recta (toca para curva)"}
                  className={`w-9 h-7 rounded-md border flex items-center justify-center text-[11px] ${lineCurve ? "bg-slate-700 border-slate-500 text-white" : "bg-slate-900 border-slate-700 text-slate-400"}`}
                >
                  ⌒
                </button>
              </div>
            )}
            {drawTool === "marker" && (
              <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-800 w-full">
                <button onClick={() => setMarkerShape("rect")} title="Rectángulo" className={`w-full h-7 rounded-md border flex items-center justify-center ${markerShape === "rect" ? "bg-slate-700 border-slate-500 text-white" : "bg-slate-900 border-slate-700 text-slate-400"}`}>▭</button>
                <button onClick={() => setMarkerShape("circle")} title="Círculo" className={`w-full h-7 rounded-md border flex items-center justify-center ${markerShape === "circle" ? "bg-slate-700 border-slate-500 text-white" : "bg-slate-900 border-slate-700 text-slate-400"}`}>◯</button>
                <button onClick={() => setMarkerShape("triangle")} title="Triángulo" className={`w-full h-7 rounded-md border flex items-center justify-center ${markerShape === "triangle" ? "bg-slate-700 border-slate-500 text-white" : "bg-slate-900 border-slate-700 text-slate-400"}`}>△</button>
                <button onClick={() => setMarkerShape("rhombus")} title="Rombo" className={`w-full h-7 rounded-md border flex items-center justify-center ${markerShape === "rhombus" ? "bg-slate-700 border-slate-500 text-white" : "bg-slate-900 border-slate-700 text-slate-400"}`}>◇</button>
              </div>
            )}
            {(drawTool === "line" || drawTool === "arrow" || drawTool === "marker" || drawTool === "text") && (
              <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-800 w-full">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDrawColor(c)}
                    title={c}
                    className="w-4 h-4 rounded-full mx-auto"
                    style={{ background: c, outline: drawColor === c ? "2px solid #34d399" : "1px solid #475569", outlineOffset: 2 }}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 min-h-0 rounded-lg border border-slate-800 bg-black/30 overflow-hidden">
            <svg
              ref={svgRef}
              viewBox={halfMode ? `0 0 ${halfDispW} ${halfDispH}` : `${vbX} ${vbY} ${vbW} ${vbH}`}
              preserveAspectRatio="xMidYMid meet"
              className="w-full h-full block cursor-crosshair"
              style={{ touchAction: "none" }}
              onPointerDown={startCreate}
            >
              <defs>
                {COLOR_PALETTE.map((c) => (
                  <marker key={c} id={`arrowhead-${c.replace("#", "")}`} markerWidth="9" markerHeight="9" refX="6.5" refY="3.5" orient="auto">
                    <path d="M0,0 L7,3.5 L0,7 Z" fill={c} />
                  </marker>
                ))}
              </defs>
              <g transform={halfMode ? halfTransform : undefined}>
                <rect x={-MARGIN} y={-MARGIN} width={VB_W + 2 * MARGIN} height={VB_H + 2 * MARGIN} fill="#1c2a1f" />
                <text x={-MARGIN + 6} y={-MARGIN + 16} fontSize="11" fill="#4b6350" fontFamily="ui-monospace, monospace">Espacio externo</text>
                {Array.from({ length: 10 }).map((_, i) => (
                  <rect key={i} x={(PITCH_W_M / 10) * i * SCALE} y={0} width={(PITCH_W_M / 10) * SCALE} height={VB_H} fill={i % 2 === 0 ? "#2d6a3e" : "#28623a"} />
                ))}
                <g stroke="#e8f5e9" strokeWidth={3} fill="none" opacity={0.85}>
                  <rect x={4} y={4} width={VB_W - 8} height={VB_H - 8} />
                  <line x1={VB_W / 2} y1={4} x2={VB_W / 2} y2={VB_H - 4} />
                  <circle cx={VB_W / 2} cy={VB_H / 2} r={91} />
                  <rect x={4} y={VB_H / 2 - 200} width={165} height={400} />
                  <rect x={4} y={VB_H / 2 - 92} width={55} height={184} />
                  <rect x={VB_W - 169} y={VB_H / 2 - 200} width={165} height={400} />
                  <rect x={VB_W - 59} y={VB_H / 2 - 92} width={55} height={184} />
                </g>
                {[0, VB_W].map((goalX) => {
                  const depth = 22;
                  const gw = 36.6; 
                  const dir = goalX === 0 ? -1 : 1;
                  return (
                    <g key={goalX}>
                      <rect x={goalX + (dir < 0 ? -depth : 0)} y={VB_H / 2 - gw} width={depth} height={gw * 2} fill="rgba(255,255,255,0.10)" stroke="#f8fafc" strokeWidth={2.5} />
                      {Array.from({ length: 6 }).map((_, i) => (
                        <line key={i} x1={goalX + (dir < 0 ? -depth : 0)} y1={VB_H / 2 - gw + (i * gw * 2) / 5} x2={goalX + (dir < 0 ? 0 : depth)} y2={VB_H / 2 - gw + (i * gw * 2) / 5} stroke="#f8fafc" strokeWidth={0.8} opacity={0.5} />
                      ))}
                    </g>
                  );
                })}
                {zones.map((z) => {
                  const zStats = computeStats(z, players, thresholds);
                  const color = zStats.quadrant ? QUADRANT_COLOR[zStats.quadrant] : NEUTRAL_COLOR;
                  const isSel = z.id === selectedZoneId;
                  const labelText = `${(z.w / SCALE).toFixed(1)}×${(z.h / SCALE).toFixed(1)}m · EII ${zStats.eii !== null ? zStats.eii.toFixed(0) : "–"} · ${zStats.quadrant ? QUADRANT_LABEL[zStats.quadrant] : "sin jug."}`;
                  const pillW = Math.min(labelText.length * 5.4 + 12, VB_W + 2 * MARGIN - z.x - 6);
                  const pillH = 15;
                  const pillX = z.x + 3;
                  const pillY = z.y + 3;
                  return (
                    <g key={z.id}>
                      <rect
                        x={z.x} y={z.y} width={z.w} height={z.h}
                        fill={color} fillOpacity={isSel ? 0.32 : 0.2}
                        stroke={color} strokeWidth={isSel ? 3 : 2}
                        strokeDasharray={isSel ? undefined : "5 4"}
                        onPointerDown={drawTool ? undefined : startMoveZone(z)}
                        style={{ cursor: drawTool ? "crosshair" : drawing ? "crosshair" : "move" }}
                      />
                      {isSel && !drawing && !drawTool && ["nw", "ne", "sw", "se"].map((c) => {
                        const cx = c.includes("w") ? z.x : z.x + z.w;
                        const cy = c.includes("n") ? z.y : z.y + z.h;
                        return <rect key={c} x={cx - 7} y={cy - 7} width={14} height={14} fill={color} stroke="#0f172a" strokeWidth={1.5} onPointerDown={startResize(z, c)} style={{ cursor: `${c}-resize` }} />;
                      })}
                      {/* Etiqueta discreta, siempre dentro de la zona (esquina sup. izq.), no molesta a jugadores fuera del campo */}
                      <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={3} fill="#0f172a" fillOpacity={0.68} pointerEvents="none" />
                      <text x={pillX + 4} y={pillY + pillH / 2 + 3.5} fill="#f8fafc" fontSize="9" fontFamily="ui-monospace, monospace" pointerEvents="none">
                        {labelText}
                      </text>
                      {isSel && (
                        <text x={z.x + z.w - 6} y={z.y + 13} textAnchor="end" fill="#94a3b8" fontSize="14" onPointerDown={(e) => { e.stopPropagation(); removeZone(z.id); }} style={{ cursor: "pointer" }}>✕</text>
                      )}
                    </g>
                  );
                })}
                {draftZone && draftZone.w > 0 && (
                  <g>
                    <rect x={draftZone.x} y={draftZone.y} width={draftZone.w} height={draftZone.h} fill={NEUTRAL_COLOR} fillOpacity={0.25} stroke={NEUTRAL_COLOR} strokeWidth={2} strokeDasharray="6 4" />
                    {(() => {
                      const t = `${(draftZone.w / SCALE).toFixed(1)}×${(draftZone.h / SCALE).toFixed(1)} m`;
                      const w = Math.max(t.length * 8 + 20, 90);
                      const above = draftZone.y >= 28;
                      const y = clamp(above ? draftZone.y - 26 : draftZone.y + draftZone.h + 4, -MARGIN + 2, VB_H + MARGIN - 24);
                      const x = clamp(draftZone.x, -MARGIN + 2, VB_W + MARGIN - w - 2);
                      return (
                        <>
                          <rect x={x} y={y} width={w} height={22} rx={5} fill="#0f172a" fillOpacity={0.92} stroke={NEUTRAL_COLOR} strokeWidth={1.2} />
                          <text x={x + 8} y={y + 15} fill="#f1f5f9" fontSize="12" fontFamily="ui-monospace, monospace">{t}</text>
                        </>
                      );
                    })()}
                  </g>
                )}
                {markers.map((m) => (
                  <g key={m.id}>
                    <MarkerShape shape={m.shape || "rect"} x={m.x} y={m.y} w={m.w} h={m.h} color={m.color || "#f97316"} onPointerDown={startMoveMarker(m)} />
                    {isActive("marker", m.id) && (
                      <text x={m.x + m.w - 4} y={m.y + 14} textAnchor="end" fill="#f1f5f9" fontSize="13" onPointerDown={(e) => { e.stopPropagation(); removeMarker(m.id); }} style={{ cursor: "pointer" }}>✕</text>
                    )}
                  </g>
                ))}
                {markerDraft && markerDraft.w > 0 && (
                  <MarkerShape shape={markerShape} x={markerDraft.x} y={markerDraft.y} w={markerDraft.w} h={markerDraft.h} color={drawColor} />
                )}
                {lines.map((l) => {
                  const color = l.color || "#facc15";
                  const dash = l.style === "dashed" ? "10 8" : undefined;
                  const markerEnd = l.arrow ? `url(#arrowhead-${color.replace("#", "")})` : undefined;
                  const { cx, cy } = curveControlPoint(l.x1, l.y1, l.x2, l.y2);
                  return (
                    <g key={l.id}>
                      {l.curve ? (
                        <path
                          d={`M ${l.x1} ${l.y1} Q ${cx} ${cy} ${l.x2} ${l.y2}`}
                          fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round"
                          strokeDasharray={dash} markerEnd={markerEnd}
                          onPointerDown={startMoveLine(l.id)} style={{ cursor: "move" }}
                        />
                      ) : (
                        <line
                          x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                          stroke={color} strokeWidth={3.5} strokeLinecap="round"
                          strokeDasharray={dash} markerEnd={markerEnd}
                          onPointerDown={startMoveLine(l.id)} style={{ cursor: "move" }}
                        />
                      )}
                      {isActive("line", l.id) && (
                        <>
                          <circle cx={l.curve ? cx : (l.x1 + l.x2) / 2} cy={l.curve ? cy : (l.y1 + l.y2) / 2} r={9} fill="#0f172a" fillOpacity={0.85} stroke={color} strokeWidth={1.2} onPointerDown={(e) => { e.stopPropagation(); removeLine(l.id); }} style={{ cursor: "pointer" }} />
                          <text x={l.curve ? cx : (l.x1 + l.x2) / 2} y={(l.curve ? cy : (l.y1 + l.y2) / 2) + 3.5} textAnchor="middle" fontSize="10" fill="#f1f5f9" pointerEvents="none">✕</text>
                        </>
                      )}
                    </g>
                  );
                })}
                {lineDraft && (() => {
                  const { cx, cy } = curveControlPoint(lineDraft.x1, lineDraft.y1, lineDraft.x2, lineDraft.y2);
                  const dash = lineStyle === "dashed" ? "10 8" : undefined;
                  const markerEnd = drawTool === "arrow" ? `url(#arrowhead-${drawColor.replace("#", "")})` : undefined;
                  return lineCurve ? (
                    <path d={`M ${lineDraft.x1} ${lineDraft.y1} Q ${cx} ${cy} ${lineDraft.x2} ${lineDraft.y2}`} fill="none" stroke={drawColor} strokeWidth={3.5} strokeLinecap="round" opacity={0.8} strokeDasharray={dash} markerEnd={markerEnd} />
                  ) : (
                    <line x1={lineDraft.x1} y1={lineDraft.y1} x2={lineDraft.x2} y2={lineDraft.y2} stroke={drawColor} strokeWidth={3.5} strokeLinecap="round" opacity={0.8} strokeDasharray={dash} markerEnd={markerEnd} />
                  );
                })()}
                {materials.map((m) => (
                  <g key={m.id} onPointerDown={startMoveMaterial(m.id)} style={{ cursor: "grab" }}>
                    {m.type === "cone" && (
                      <polygon points={`${m.x},${m.y - 9} ${m.x - 7},${m.y + 8} ${m.x + 7},${m.y + 8}`} fill="#f97316" stroke="#7c2d12" strokeWidth={1} />
                    )}
                    {m.type === "pole" && (
                      <>
                        <rect x={m.x - 2.5} y={m.y - 16} width={5} height={32} rx={2} fill="#ef4444" />
                        <rect x={m.x - 2.5} y={m.y - 4} width={5} height={8} fill="#f8fafc" />
                      </>
                    )}
                    {m.type === "biggoal" && (
                      <g transform={`rotate(${m.rotation || 0} ${m.x} ${m.y})`}>
                        <rect x={m.x - 35} y={m.y - 13} width={70} height={26} fill="rgba(255,255,255,0.08)" stroke="#f1f5f9" strokeWidth={2.5} />
                      </g>
                    )}
                    {isActive("material", m.id) && (
                      <>
                        <text
                          x={m.x - (m.type === "biggoal" ? 12 : 0)} y={m.y - (m.type === "biggoal" ? 22 : 18)}
                          textAnchor="middle" fontSize="12" fill="#94a3b8"
                          onPointerDown={(e) => { e.stopPropagation(); removeMaterial(m.id); }} style={{ cursor: "pointer" }}
                        >✕</text>
                        {m.type === "biggoal" && (
                          <text
                            x={m.x + 12} y={m.y - 22}
                            textAnchor="middle" fontSize="14" fill="#94a3b8"
                            onPointerDown={(e) => { e.stopPropagation(); rotateMaterial(m.id); }} style={{ cursor: "pointer" }}
                          >⟳</text>
                        )}
                      </>
                    )}
                  </g>
                ))}
                {miniGoals.map((g) => (
                  <g key={g.id} onPointerDown={startMoveGoal(g.id)} style={{ cursor: "grab" }}>
                    <g transform={`rotate(${g.rotation || 0} ${g.x} ${g.y})`}>
                      <rect x={g.x - 20} y={g.y - 8} width={40} height={16} fill="rgba(255,255,255,0.08)" stroke="#f1f5f9" strokeWidth={2} />
                    </g>
                    {isActive("goal", g.id) && (
                      <>
                        <text x={g.x - 10} y={g.y - 14} textAnchor="middle" fontSize="13" fill="#94a3b8" onPointerDown={(e) => { e.stopPropagation(); removeMiniGoal(g.id); }} style={{ cursor: "pointer" }}>✕</text>
                        <text x={g.x + 10} y={g.y - 14} textAnchor="middle" fontSize="14" fill="#94a3b8" onPointerDown={(e) => { e.stopPropagation(); rotateMiniGoal(g.id); }} style={{ cursor: "pointer" }}>⟳</text>
                      </>
                    )}
                  </g>
                ))}
                {balls.map((b) => (
                  <g key={b.id} onPointerDown={startMoveBall(b.id)} style={{ cursor: "grab" }}>
                    <circle cx={b.x} cy={b.y} r={7} fill="#f8fafc" stroke="#111827" strokeWidth={1.3} />
                    <circle cx={b.x} cy={b.y} r={2.4} fill="#111827" />
                    {isActive("ball", b.id) && (
                      <text x={b.x} y={b.y - 12} textAnchor="middle" fontSize="12" fill="#94a3b8" onPointerDown={(e) => { e.stopPropagation(); removeBall(b.id); }} style={{ cursor: "pointer" }}>✕</text>
                    )}
                  </g>
                ))}
                {players.map((p) => (
                  <g key={p.id}>
                    <circle
                      cx={p.x} cy={p.y} r={PLAYER_R + 4}
                      fill={ROLE_RING[p.role]}
                      stroke="#0f172a" strokeWidth={1}
                      onPointerDown={(e) => { e.stopPropagation(); toggleRolePlayer(p.id); }}
                      style={{ cursor: p.team === "comodin" ? "default" : "pointer" }}
                    />
                    <circle
                      cx={p.x} cy={p.y} r={PLAYER_R}
                      fill={TEAM_COLOR[p.team]} stroke="#111827" strokeWidth={1.5}
                      onPointerDown={startMovePlayer(p.id)}
                      style={{ cursor: "grab" }}
                    />
                    {p.pos && (
                      <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill={p.team === "yellow" || p.team === "comodin" ? "#111827" : "#f8fafc"} pointerEvents="none" transform={halfMode ? `rotate(-90 ${p.x} ${p.y})` : undefined}>
                        {p.pos}
                      </text>
                    )}
                    {isActive("player", p.id) && (
                      <>
                        <text x={p.x - 8} y={p.y - 20} textAnchor="middle" fontSize="12" fill="#94a3b8" onPointerDown={(e) => { e.stopPropagation(); startEditPlayerPos(p); }} style={{ cursor: "pointer" }}>✎</text>
                        <text x={p.x + 8} y={p.y - 20} textAnchor="middle" fontSize="14" fill="#94a3b8" onPointerDown={(e) => { e.stopPropagation(); removePlayer(p.id); }} style={{ cursor: "pointer" }}>✕</text>
                      </>
                    )}
                  </g>
                ))}
                {goalkeepers.map((k) => (
                  <g key={k.id}>
                    <circle
                      cx={k.x} cy={k.y} r={PLAYER_R}
                      fill="#0f172a" stroke="#f8fafc" strokeWidth={1.5}
                      onPointerDown={startMoveKeeper(k.id)}
                      style={{ cursor: "grab" }}
                    />
                    <text x={k.x} y={k.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#f8fafc" pointerEvents="none">P</text>
                    <text x={k.x} y={k.y - 20} textAnchor="middle" fontSize="14" fill="#94a3b8" onPointerDown={(e) => { e.stopPropagation(); removeGoalkeeper(k.id); }} style={{ cursor: "pointer" }}>{isActive("keeper", k.id) ? "✕" : ""}</text>
                  </g>
                ))}
                {texts.map((t) => (
                  <g key={t.id}>
                    <text
                      x={t.x} y={t.y}
                      fontSize="20" fontWeight="700" fill={t.color || "#facc15"} fontFamily="sans-serif"
                      onPointerDown={startMoveText(t.id)} style={{ cursor: "move" }}
                    >
                      {t.content}
                    </text>
                    {isActive("text", t.id) && (
                      <>
                        <text x={t.x - 14} y={t.y - 22} textAnchor="middle" fontSize="14" fill="#94a3b8" onPointerDown={(e) => { e.stopPropagation(); startEditText(t); }} style={{ cursor: "pointer" }}>✎</text>
                        <text x={t.x + 6} y={t.y - 22} textAnchor="middle" fontSize="14" fill="#94a3b8" onPointerDown={(e) => { e.stopPropagation(); removeText(t.id); }} style={{ cursor: "pointer" }}>✕</text>
                      </>
                    )}
                  </g>
                ))}
              </g>
            </svg>
          </div>
        </div>
        <aside className="w-64 shrink-0 border-l border-slate-800 flex flex-col">
          {!selectedZone ? (
            <div className="p-4 flex-1 flex items-center justify-center text-center">
              <p className="text-xs text-slate-500">Toca una zona del campo,<br />o crea una con "Manual" / "Campo completo" / "1/2 campo".</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 p-3 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Demanda</span>
                <span className="text-sm font-bold px-2.5 py-1 rounded-md text-white" style={{ background: stats.quadrant ? QUADRANT_COLOR[stats.quadrant] : "#475569" }}>
                  {stats.quadrant ? QUADRANT_LABEL[stats.quadrant] : "—"}
                </span>
              </div>
              <div className="shrink-0 flex border-b border-slate-800">
                <button
                  onClick={() => setSidebarTab("datos")}
                  className={`flex-1 text-xs font-medium py-2 ${sidebarTab === "datos" ? "text-emerald-400 border-b-2 border-emerald-400 -mb-px" : "text-slate-500"}`}
                >
                  Datos
                </button>
                <button
                  onClick={() => setSidebarTab("dosis")}
                  className={`flex-1 text-xs font-medium py-2 ${sidebarTab === "dosis" ? "text-emerald-400 border-b-2 border-emerald-400 -mb-px" : "text-slate-500"}`}
                >
                  Tiempos
                </button>
              </div>
              <div className="p-3 flex-1 min-h-0">
                {sidebarTab === "datos" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px] text-slate-400 flex flex-col gap-0.5">
                        Ancho (m)
                        <input
                          type="number" step="0.5" min="3"
                          value={dimDraft.w}
                          onChange={(e) => setDimDraft((d) => ({ ...d, w: e.target.value }))}
                          onBlur={() => commitDim("w")}
                          onKeyDown={(e) => { if (e.key === "Enter") { commitDim("w"); e.target.blur(); } }}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 font-mono text-slate-100 text-xs"
                        />
                      </label>
                      <label className="text-[10px] text-slate-400 flex flex-col gap-0.5">
                        Alto (m)
                        <input
                          type="number" step="0.5" min="3"
                          value={dimDraft.h}
                          onChange={(e) => setDimDraft((d) => ({ ...d, h: e.target.value }))}
                          onBlur={() => commitDim("h")}
                          onKeyDown={(e) => { if (e.key === "Enter") { commitDim("h"); e.target.blur(); } }}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 font-mono text-slate-100 text-xs"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-y-1.5 text-xs border-t border-slate-800 pt-2">
                      <span className="text-slate-400">Área</span>
                      <span className="text-right font-mono">{stats.areaM2.toFixed(0)} m²</span>
                      <span className="text-slate-400">EII</span>
                      <span className="text-right font-mono text-emerald-400 font-semibold">{stats.eii !== null ? `${stats.eii.toFixed(1)} m²/jug` : "—"}</span>
                      <span className="text-slate-400">Jug/equipo</span>
                      <span className="text-right font-mono">{stats.teamCount || "—"}</span>
                      <span className="text-slate-400">Dentro</span>
                      <span className="text-right font-mono text-[10px]">
                        {stats.inside.length}: {TEAMS.map((t) => (
                          <span key={t.key} style={{ color: t.color }}>●{stats.insideByTeam[t.key]} </span>
                        ))}
                        <span style={{ color: COMODIN_COLOR }}>●{stats.insideByTeam.comodin}</span>
                      </span>
                      <span className="text-slate-400">Rol</span>
                      <span className="text-right font-mono text-[10px]">
                        <span className="text-green-500">🟢{stats.poseedores}</span> · <span className="text-red-500">🔴{stats.defensores}</span>
                      </span>
                      <span className="text-slate-400">Porteros</span>
                      <span className="text-right font-mono text-[10px] text-slate-400">
                        {goalkeepers.filter((k) => selectedZone && k.x >= selectedZone.x && k.x <= selectedZone.x + selectedZone.w && k.y >= selectedZone.y && k.y <= selectedZone.y + selectedZone.h).length}
                        <span className="text-slate-600"> (no cuentan en el EII)</span>
                      </span>
                    </div>
                    {(stats.caveatSinInteraccion || stats.caveatFueraDeTabla) && (
                      <p className="text-[10px] text-amber-400/90 leading-snug border-t border-slate-800 pt-2">
                        {stats.caveatSinInteraccion && "⚠ 1 solo jugador: EII no interpretable. "}
                        {stats.caveatFueraDeTabla && "⚠ Fuera de tabla (>10/equipo)."}
                      </p>
                    )}
                    <div className="border-t border-slate-800 pt-2 space-y-1">
                      {variables.map((v) => (
                        <div key={v.key} className="flex items-center justify-between text-xs px-1.5 py-1 rounded bg-slate-800/50">
                          <span>{v.label}</span>
                          <span className="font-mono text-[11px] text-slate-300">{v.tag}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {sidebarTab === "dosis" && stats.playerBand !== null && (
                  (() => {
                    const d = DOSAGE_BY_BAND[stats.playerBand];
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                          <span className="text-slate-400">Formato</span>
                          <span className="text-right font-mono">{d.formato}</span>
                          <span className="text-slate-400">Series × Rep.</span>
                          <span className="text-right font-mono">{d.series} × {d.rep}</span>
                          <span className="text-slate-400">Duración/rep.</span>
                          <span className="text-right font-mono text-emerald-400 font-semibold">{d.dur}</span>
                          <span className="text-slate-400">Descanso/rep.</span>
                          <span className="text-right font-mono">{d.descansoRep}</span>
                          {d.descansoSerie !== "—" && (
                            <>
                              <span className="text-slate-400">Descanso/serie</span>
                              <span className="text-right font-mono">{d.descansoSerie}</span>
                            </>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug border-t border-slate-800 pt-2">
                          Para no desviarte de "{QUADRANT_LABEL[stats.quadrant] || "—"}": alargar la duración empuja hacia resistencia; acortar el descanso, también. Tabla 4.3, Castellano &amp; Casamichana (2016), pág. 143.
                        </p>
                      </div>
                    );
                  })()
                )}
                {sidebarTab === "dosis" && stats.playerBand === null && (
                  <p className="text-xs text-slate-500">Añade jugadores a la zona para calcular la dosis.</p>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      <footer className="shrink-0 border-t border-slate-800 bg-slate-950 px-2 py-1.5 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setDrawing((d) => !d)} className={`${iconBtn} ${drawing ? iconBtnOn : iconBtnOff}`}>
          <Square size={16} /> Manual
        </button>
        <button onClick={addFullFieldZone} className={`${iconBtn} ${iconBtnOff}`}>
          <Rows2 size={16} /> Campo completo
        </button>
        <button onClick={addHalfFieldZone} className={`${iconBtn} ${iconBtnOff}`}>
          <Columns2 size={16} /> 1/2 campo
        </button>
        <button onClick={duplicateZone} disabled={!selectedZone} className={`${iconBtn} ${iconBtnOff} disabled:opacity-30`}>
          <Copy size={16} /> Duplicar
        </button>
        <div className="w-px h-8 bg-slate-800 mx-0.5" />
        {TEAMS.map((t) => (
          <button key={t.key} onClick={() => addPlayer(t.key)} className={`${iconBtn} ${iconBtnOff}`}>
            <Circle size={16} fill={t.color} stroke={t.color} /> {t.label}
          </button>
        ))}
        <button onClick={() => addPlayer("comodin")} className={`${iconBtn} ${iconBtnOff}`}>
          <Circle size={16} fill={COMODIN_COLOR} stroke="#94a3b8" /> Comodín
        </button>
        <button onClick={addGoalkeeper} className={`${iconBtn} ${iconBtnOff}`} title="No cuenta como jugador en el cálculo de EII">
          <Circle size={16} fill="#0f172a" stroke="#f8fafc" /> Portero
        </button>
        <div className="w-px h-8 bg-slate-800 mx-0.5" />
        <button onClick={addBall} className={`${iconBtn} ${iconBtnOff}`}>
          <Disc size={16} /> Balón
        </button>
        <button onClick={() => addMaterial("cone")} className={`${iconBtn} ${iconBtnOff}`}>
          <span style={{ color: "#f97316", fontSize: 16, lineHeight: "16px" }}>▲</span> Cono
        </button>
        <button onClick={() => addMaterial("pole")} className={`${iconBtn} ${iconBtnOff}`}>
          <span style={{ color: "#ef4444", fontSize: 16, lineHeight: "16px" }}>┃</span> Pica
        </button>
        <button onClick={addMiniGoal} className={`${iconBtn} ${iconBtnOff}`}>
          <RectangleHorizontal size={14} /> Mini portería
        </button>
        <button onClick={() => addMaterial("biggoal")} className={`${iconBtn} ${iconBtnOff}`}>
          <RectangleHorizontal size={20} /> Portería grande
        </button>
        <button onClick={reset} className={`${iconBtn} ${iconBtnOff} ml-auto`}>
          <RotateCcw size={16} /> Reiniciar
        </button>
      </footer>
      {showLibrary && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowLibrary(false)}>
          <div className="bg-slate-900 rounded-lg border border-slate-700 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="text-sm font-semibold text-emerald-400">Biblioteca de tareas</span>
              <button onClick={() => setShowLibrary(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <div className="px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <span className="text-slate-400">Demanda</span>
                <select value={libFilter.demand} onChange={(e) => setLibFilter((f) => ({ ...f, demand: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-slate-100">
                  <option value="all">Todas</option>
                  <option value="fuerza">Fuerza</option>
                  <option value="resistencia">Resistencia</option>
                  <option value="velocidad">Velocidad</option>
                  <option value="recuperatorio">Recuperatorio</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-slate-400">Jug/equipo ≥</span>
                <input type="number" value={libFilter.minPlayers} onChange={(e) => setLibFilter((f) => ({ ...f, minPlayers: e.target.value }))} className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-slate-100" />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-slate-400">≤</span>
                <input type="number" value={libFilter.maxPlayers} onChange={(e) => setLibFilter((f) => ({ ...f, maxPlayers: e.target.value }))} className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-slate-100" />
              </label>
              {libError && <span className="text-rose-400 text-[10px] ml-auto">{libError}</span>}
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {!libraryLoaded && <p className="text-xs text-slate-500 text-center py-6">Cargando biblioteca…</p>}
              {libraryLoaded && filteredLibrary.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6">
                  {library.length === 0 ? "Todavía no has guardado ninguna tarea." : "Ninguna tarea coincide con estos filtros."}
                </p>
              )}
              {filteredLibrary.map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    {renamingTaskId === t.id ? (
                      <div className="flex items-center gap-1.5 mb-1">
                        <input
                          autoFocus value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { renameTask(t.id, renameDraft); setRenamingTaskId(null); } }}
                          className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100"
                        />
                        <button onClick={() => { renameTask(t.id, renameDraft); setRenamingTaskId(null); }} className="text-emerald-400 text-xs font-medium shrink-0">Guardar</button>
                        <button onClick={() => setRenamingTaskId(null)} className="text-slate-500 text-xs shrink-0">Cancelar</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="text-sm font-medium text-slate-100 truncate">{t.name}</div>
                        <button onClick={() => { setRenamingTaskId(t.id); setRenameDraft(t.name); }} className="text-slate-500 hover:text-slate-300 shrink-0 text-xs">✎</button>
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {new Date(t.savedAt).toLocaleDateString("es-ES")} · {t.summary.zoneCount} zona{t.summary.zoneCount !== 1 ? "s" : ""} · {t.summary.dims.join(", ") || "—"} · {t.summary.playerTotal} jugadores
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.summary.demands.length === 0 && <span className="text-[10px] text-slate-600">Sin demanda calculada</span>}
                      {t.summary.demands.map((d) => (
                        <span key={d} className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: QUADRANT_COLOR[d] }}>{QUADRANT_LABEL[d]}</span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => loadTask(t)} className="px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shrink-0">Cargar</button>
                  <button onClick={() => deleteTask(t.id)} className="px-2 py-1.5 rounded-md bg-slate-700 hover:bg-rose-700 text-slate-200 text-xs shrink-0">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {showUserAdmin && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowUserAdmin(false)}>
          <div className="bg-slate-900 rounded-lg border border-slate-700 w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="text-sm font-semibold text-emerald-400">Usuarios y PIN</span>
              <button onClick={() => setShowUserAdmin(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <div className="px-4 py-3 border-b border-slate-800 space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Añadir usuario</div>
              <p className="text-[10px] text-slate-500">El PIN lo genera la app — así nunca hay que fiarse de que no se repita ninguno.</p>
              <div className="flex gap-2">
                <input placeholder="Nombre" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addUser(); }} className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100" />
                <button onClick={addUser} className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium shrink-0">Añadir</button>
              </div>
              {userAdminError && <p className="text-xs text-rose-400">{userAdminError}</p>}
              {newUserPinShown && (
                <div className="p-2 rounded-md flex items-center justify-between gap-2" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid #22C55E" }}>
                  <span className="text-xs text-slate-200">PIN de <b>{newUserPinShown.name}</b>: <span className="font-mono tracking-widest text-emerald-400">{newUserPinShown.pin}</span> — pásaselo tú.</span>
                  <button onClick={() => setNewUserPinShown(null)} className="text-slate-400 hover:text-slate-200 shrink-0">✕</button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-slate-500 leading-snug flex-1">
                  Acceso de nivel básico: el PIN se guarda en el almacenamiento de esta app, no es cifrado ni seguridad de grado profesional — pensado para controlar quién entra casualmente, no para proteger datos sensibles.
                </p>
                <button onClick={regenerateRecoveryCode} className="px-2 py-1.5 rounded-md bg-slate-700 hover:border-emerald-600 text-slate-200 text-[10px] shrink-0 whitespace-nowrap">
                  Nuevo código recuperación
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {users.map((u) => (
                <div key={u.id} className="rounded-lg border border-slate-800 bg-slate-800/40 p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate flex items-center gap-1.5">
                        {u.name}
                        {u.isAdmin && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-semibold">ADMIN</span>}
                        {u.id === authedUser.id && <span className="text-[9px] text-slate-500">(tú)</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-2">
                        <span>Desde {new Date(u.createdAt).toLocaleDateString("es-ES")}</span>
                        <span>·</span>
                        <button
                          onClick={() => setVisiblePinFor(visiblePinFor === u.id ? null : u.id)}
                          className="font-mono tracking-widest"
                          style={{ color: visiblePinFor === u.id ? "#F5C518" : "#4A6680" }}
                        >
                          PIN: {visiblePinFor === u.id ? u.pin : "•".repeat(u.pin.length)}
                        </button>
                      </div>
                    </div>
                    {u.isAdmin ? (
                      <button onClick={() => { setResetPinFor(resetPinFor === u.id ? null : u.id); setResetPinDraft(""); }} className="px-2 py-1.5 rounded-md bg-slate-700 hover:border-emerald-600 text-slate-200 text-xs shrink-0">Cambiar mi PIN</button>
                    ) : (
                      <button onClick={() => resetPinAuto(u.id)} className="px-2 py-1.5 rounded-md bg-slate-700 hover:border-emerald-600 text-slate-200 text-xs shrink-0">Nuevo PIN</button>
                    )}
                    {!u.isAdmin && (
                      <button onClick={() => deleteUser(u.id)} className="px-2 py-1.5 rounded-md bg-slate-700 hover:bg-rose-700 text-slate-200 text-xs shrink-0">✕</button>
                    )}
                  </div>
                  {resetPinFor === u.id && u.isAdmin && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-slate-800">
                      <div className="relative flex-1">
                        <input
                          placeholder="Nuevo PIN" inputMode="numeric" autoFocus type={showChangePin ? "text" : "password"} value={resetPinDraft}
                          onChange={(e) => setResetPinDraft(e.target.value.replace(/\D/g, ""))}
                          onKeyDown={(e) => { if (e.key === "Enter") changeOwnPin(); }}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 pr-8 text-sm text-slate-100"
                        />
                        <button type="button" onClick={() => setShowChangePin((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs">
                          {showChangePin ? "🙈" : "👁"}
                        </button>
                      </div>
                      <button onClick={changeOwnPin} className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium">Guardar PIN</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
