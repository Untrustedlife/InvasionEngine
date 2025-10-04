/**
 * Zone Manager Class
 * Handles creation, selection, manipulation, and deletion of rectangular zones
 */

import { safeClamp } from "./EditorUtils.js";

export class ZoneManager {
  constructor(editor) {
    this.editor = editor;
    this.zones = [];
    this.selectedZoneId = null;

    //Zone creation state
    this.isCreating = false;
    this.creationStart = null;
    this.creationEnd = null;

    //Zone manipulation state
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
    this.dragOffset = { x: 0, y: 0 };

    //Default zone properties
    this.defaultZone = {
      color: "#271810",
      cielingColorFront: "#271810",
      cielingColorBack: "#271810",
      floorColorBack: "#101b2e",
      fogColor: "#101b2e",
      floorDepth: 0,
      name: "",
      ceilingHeight: 2,
    };
  }

  /**
   * Create a new zone with the specified bounds
   */
  createZone(x, y, w, h) {
    const zone = {
      id: this.zones.length, //ID = array index
      x: Math.min(x, x + w),
      y: Math.min(y, y + h),
      w: Math.abs(w),
      h: Math.abs(h),
      ...this.defaultZone,
      spawnRules: [],
    };

    const insertIndex = this.zones.length > 0 ? 1 : 0;
    this.zones.splice(insertIndex, 0, zone);
    this.selectedZoneId = zone.id;
    this.reassignZoneIds();
    return zone;
  }

  /**
   * Create a new zone programmatically (for "Add Zone" button)
   */
  addNewZone() {
    //Create a default-sized zone in a visible area
    const defaultX = Math.floor(this.editor.width / 4);
    const defaultY = Math.floor(this.editor.height / 4);
    const defaultW = Math.floor(this.editor.width / 8);
    const defaultH = Math.floor(this.editor.height / 8);

    return this.createZone(defaultX, defaultY, defaultW, defaultH);
  }

  /**
   * Reassign zone IDs to match their array indices
   */
  reassignZoneIds() {
    this.zones.forEach((zone, index) => {
      zone.id = index;
    });

    //Update selected zone ID if needed
    if (this.selectedZoneId !== null) {
      const selectedZone = this.zones.find(
        (z, index) =>
          this.selectedZoneId === index || z === this.getSelectedZone()
      );
      if (selectedZone) {
        this.selectedZoneId = this.zones.indexOf(selectedZone);
      }
    }
  }

  /**
   * Delete a zone by ID
   */
  deleteZone(zoneId) {
    const index = this.zones.findIndex((z) => z.id === zoneId);
    if (index !== -1) {
      this.zones.splice(index, 1);
      if (this.selectedZoneId === zoneId) {
        this.selectedZoneId = null;
      }
      this.reassignZoneIds();
      return true;
    }
    return false;
  }

  /**
   * Delete the currently selected zone
   */
  deleteSelectedZone() {
    return this.deleteZone(this.selectedZoneId);
  }

  /**
   * Get zone by ID
   */
  getZone(zoneId) {
    return this.zones.find((z) => z.id === zoneId);
  }

  /**
   * Get currently selected zone
   */
  getSelectedZone() {
    return this.selectedZoneId !== null
      ? this.getZone(this.selectedZoneId)
      : null;
  }

  /**
   * Update zone properties
   */
  updateZone(zoneId, properties) {
    const zone = this.getZone(zoneId);
    if (zone) {
      Object.assign(zone, properties);
      //Clamp values to valid ranges
      zone.x = safeClamp(zone.x, 0, this.editor.width - 1);
      zone.y = safeClamp(zone.y, 0, this.editor.height - 1);
      zone.w = safeClamp(zone.w, 1, this.editor.width - zone.x);
      zone.h = safeClamp(zone.h, 1, this.editor.height - zone.y);
      return true;
    }
    return false;
  }

  /**
   * Select zone by ID
   */
  selectZone(zoneId) {
    if (this.zones.find((z) => z.id === zoneId)) {
      this.selectedZoneId = zoneId;
      return true;
    }
    return false;
  }

  /**
   * Deselect current zone
   */
  deselectZone() {
    this.selectedZoneId = null;
  }

  /**
   * Find zone at map coordinates (lower index = higher priority)
   */
  getZoneAt(mapX, mapY) {
    //Check zones in forward order (lower index wins)
    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i];
      if (
        mapX >= zone.x &&
        mapX < zone.x + zone.w &&
        mapY >= zone.y &&
        mapY < zone.y + zone.h
      ) {
        return zone;
      }
    }
    return null;
  }

  /**
   * Get resize handle at coordinates for selected zone
   */
  getResizeHandle(mapX, mapY) {
    const zone = this.getSelectedZone();
    if (!zone) {
      return null;
    }

    const tolerance = 0.3; //Handle tolerance in map units

    //Corner handles
    if (
      Math.abs(mapX - zone.x) <= tolerance &&
      Math.abs(mapY - zone.y) <= tolerance
    ) {
      return "nw";
    }
    if (
      Math.abs(mapX - (zone.x + zone.w)) <= tolerance &&
      Math.abs(mapY - zone.y) <= tolerance
    ) {
      return "ne";
    }
    if (
      Math.abs(mapX - zone.x) <= tolerance &&
      Math.abs(mapY - (zone.y + zone.h)) <= tolerance
    ) {
      return "sw";
    }
    if (
      Math.abs(mapX - (zone.x + zone.w)) <= tolerance &&
      Math.abs(mapY - (zone.y + zone.h)) <= tolerance
    ) {
      return "se";
    }

    //Edge handles
    if (mapY >= zone.y && mapY <= zone.y + zone.h) {
      if (Math.abs(mapX - zone.x) <= tolerance) {
        return "w";
      }
      if (Math.abs(mapX - (zone.x + zone.w)) <= tolerance) {
        return "e";
      }
    }
    if (mapX >= zone.x && mapX <= zone.x + zone.w) {
      if (Math.abs(mapY - zone.y) <= tolerance) {
        return "n";
      }
      if (Math.abs(mapY - (zone.y + zone.h)) <= tolerance) {
        return "s";
      }
    }

    return null;
  }

  /**
   * Start zone creation
   */
  startCreation(mapX, mapY) {
    this.isCreating = true;
    this.creationStart = { x: mapX, y: mapY };
    this.creationEnd = { x: mapX, y: mapY };
    this.deselectZone();
  }

  /**
   * Update zone creation
   */
  updateCreation(mapX, mapY) {
    if (this.isCreating) {
      this.creationEnd = { x: mapX, y: mapY };
    }
  }

  /**
   * Finish zone creation
   */
  finishCreation() {
    if (this.isCreating && this.creationStart && this.creationEnd) {
      const x = this.creationStart.x;
      const y = this.creationStart.y;
      const w = this.creationEnd.x - this.creationStart.x;
      const h = this.creationEnd.y - this.creationStart.y;

      //Only create if zone has meaningful size
      if (Math.abs(w) >= 1 && Math.abs(h) >= 1) {
        this.createZone(x, y, w, h);
      }

      this.isCreating = false;
      this.creationStart = null;
      this.creationEnd = null;
    }
  }

  /**
   * Cancel zone creation
   */
  cancelCreation() {
    this.isCreating = false;
    this.creationStart = null;
    this.creationEnd = null;
  }

  /**
   * Start zone dragging
   */
  startDrag(mapX, mapY) {
    const zone = this.getSelectedZone();
    if (zone) {
      this.isDragging = true;
      this.dragOffset = {
        x: mapX - zone.x,
        y: mapY - zone.y,
      };
    }
  }

  /**
   * Update zone drag
   */
  updateDrag(mapX, mapY) {
    if (this.isDragging) {
      const zone = this.getSelectedZone();
      if (zone) {
        this.updateZone(zone.id, {
          x: mapX - this.dragOffset.x,
          y: mapY - this.dragOffset.y,
        });
      }
    }
  }

  /**
   * End zone drag
   */
  endDrag() {
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
  }

  /**
   * Start zone resize
   */
  startResize(handle) {
    this.isResizing = true;
    this.resizeHandle = handle;
  }

  /**
   * Update zone resize
   */
  updateResize(mapX, mapY) {
    if (this.isResizing && this.resizeHandle) {
      const zone = this.getSelectedZone();
      if (!zone) {
        return;
      }

      let newProps = {};

      switch (this.resizeHandle) {
        case "nw":
          newProps = {
            x: mapX,
            y: mapY,
            w: zone.w + (zone.x - mapX),
            h: zone.h + (zone.y - mapY),
          };
          break;
        case "ne":
          newProps = {
            y: mapY,
            w: mapX - zone.x,
            h: zone.h + (zone.y - mapY),
          };
          break;
        case "sw":
          newProps = {
            x: mapX,
            w: zone.w + (zone.x - mapX),
            h: mapY - zone.y,
          };
          break;
        case "se":
          newProps = {
            w: mapX - zone.x,
            h: mapY - zone.y,
          };
          break;
        case "n":
          newProps = {
            y: mapY,
            h: zone.h + (zone.y - mapY),
          };
          break;
        case "s":
          newProps = { h: mapY - zone.y };
          break;
        case "w":
          newProps = {
            x: mapX,
            w: zone.w + (zone.x - mapX),
          };
          break;
        case "e":
          newProps = { w: mapX - zone.x };
          break;
      }

      this.updateZone(zone.id, newProps);
    }
  }

  /**
   * End zone resize
   */
  endResize() {
    this.isResizing = false;
    this.resizeHandle = null;
  }

  /**
   * Get all zones for export
   * Force dit to export a 0th zone with teh fog color because otherwise
   * theres weird rendering issues (Can remove if we switch to a scanline system for floors)
   */
  exportZones() {
    const zones = this.zones.map((zone) => {
      const exportedZone = {
        x: zone.x,
        y: zone.y,
        w: zone.w,
        h: zone.h,
        spawnRules: zone.spawnRules,
      };

      // Only include properties that differ from defaults
      exportedZone.color = zone.color;
      if (
        zone.cielingColorFront !== this.defaultZone.cielingColorFront &&
        zone.cielingColorFront
      ) {
        exportedZone.cielingColorFront = zone.cielingColorFront;
      }
      if (
        zone.cielingColorBack !== this.defaultZone.cielingColorBack &&
        zone.cielingColorBack
      ) {
        exportedZone.cielingColorBack = zone.cielingColorBack;
      }
      if (
        zone.floorColorBack !== this.defaultZone.floorColorBack &&
        zone.floorColorBack
      ) {
        exportedZone.floorColorBack = zone.floorColorBack;
      }
      if (zone.fogColor !== this.defaultZone.fogColor && zone.fogColor) {
        exportedZone.fogColor = zone.fogColor;
      }
      if (zone.floorDepth !== this.defaultZone.floorDepth && zone.floorDepth) {
        exportedZone.floorDepth = zone.floorDepth;
      }
      if (zone.name !== this.defaultZone.name && zone.name.trim() !== "") {
        exportedZone.name = zone.name;
      }
      if (
        zone.ceilingHeight !== this.defaultZone.ceilingHeight &&
        zone.ceilingHeight
      ) {
        exportedZone.ceilingHeight = zone.ceilingHeight;
      }
      return exportedZone;
    });

    if (zones.length === 0 || zones[0].color !== "#101b2e") {
      zones.unshift({
        color: "#101b2e",
        x: 0,
        y: 0,
        w: 0,
        h: 0,
      });
    }
    return zones;
  }

  /**
   * Import zones from data
   */
  importZones(zonesData) {
    this.zones = [];
    this.selectedZoneId = null;

    if (Array.isArray(zonesData)) {
      zonesData.forEach((zoneData, index) => {
        const zone = {
          id: index, //ID = array index
          x: safeClamp(zoneData.x || 0, 0, this.editor.width - 1),
          y: safeClamp(zoneData.y || 0, 0, this.editor.height - 1),
          w: safeClamp(zoneData.w || 1, 1, this.editor.width),
          h: safeClamp(zoneData.h || 1, 1, this.editor.height),
          color: zoneData.color || this.defaultZone.color,
          cielingColorFront:
            zoneData.cielingColorFront || this.defaultZone.cielingColorFront,
          cielingColorBack:
            zoneData.cielingColorBack || this.defaultZone.cielingColorBack,
          floorColorBack:
            zoneData.floorColorBack || this.defaultZone.floorColorBack,
          fogColor: zoneData.fogColor || this.defaultZone.fogColor,
          floorDepth:
            zoneData.floorDepth !== undefined
              ? zoneData.floorDepth
              : this.defaultZone.floorDepth,
          name: zoneData.name || this.defaultZone.name,
          ceilingHeight:
            zoneData.ceilingHeight || this.defaultZone.ceilingHeight,
          spawnRules: Array.isArray(zoneData.spawnRules)
            ? zoneData.spawnRules
            : [],
        };
        this.zones.push(zone);
      });
    }
  }

  /**
   * Move zone to specific index (for drag-and-drop reordering)
   */
  moveZone(zoneId, newIndex) {
    const currentIndex = this.zones.findIndex((z) => z.id === zoneId);
    if (currentIndex === -1 || newIndex < 0 || newIndex >= this.zones.length) {
      return false;
    }

    //Remove zone from current position
    const zone = this.zones.splice(currentIndex, 1)[0];

    //Insert at new position
    this.zones.splice(newIndex, 0, zone);

    //Reassign all IDs to match new indices
    this.reassignZoneIds();
    return true;
  }

  /**
   * Move zone up in priority (lower index = higher priority)
   */
  moveZoneUp(zoneId) {
    const currentIndex = this.zones.findIndex((z) => z.id === zoneId);
    if (currentIndex > 0) {
      return this.moveZone(zoneId, currentIndex - 1);
    }
    return false;
  }

  /**
   * Move zone down in priority (higher index = lower priority)
   */
  moveZoneDown(zoneId) {
    const currentIndex = this.zones.findIndex((z) => z.id === zoneId);
    if (currentIndex >= 0 && currentIndex < this.zones.length - 1) {
      return this.moveZone(zoneId, currentIndex + 1);
    }
    return false;
  }

  /**
   * Get zone index in the array (for layer display)
   */
  getZoneIndex(zoneId) {
    return this.zones.findIndex((z) => z.id === zoneId);
  }

  /**
   * Get display information for all zones (for layer panel)
   */
  getZoneDisplayInfo() {
    return this.zones.map((zone, index) => {
      // Use custom name if provided, otherwise fall back to auto-generated format
      const displayName =
        zone.name && zone.name.trim() !== ""
          ? `Zone: ${zone.name}`
          : `Zone ${zone.id} (${zone.x},${zone.y} - ${zone.w}x${zone.h})`;

      return {
        id: zone.id,
        index,
        priority: index + 1, //Display as 1-based
        name: displayName,
        color: zone.color,
        bounds: `${zone.x},${zone.y} - ${zone.w}x${zone.h}`,
        selected: zone.id === this.selectedZoneId,
      };
    });
  }

  /**
   * Clear all zones
   */
  clear() {
    this.zones = [];
    this.selectedZoneId = null;
  }
}
