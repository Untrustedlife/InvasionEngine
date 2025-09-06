/**
 * Zone Renderer Class
 * Handles rendering of zone overlays on the map canvas
 */

export class ZoneRenderer {
  constructor(canvasContext, editor) {
    this.canvasContext = canvasContext;
    this.editor = editor;
  }

  /**
   * Draw all zones as overlay
   * @param {string} mode - 'tile' (barely visible) or 'zone' (full visibility)
   */
  drawZones(mode = "zone") {
    if (
      !this.editor.zoneManager ||
      this.editor.zoneManager.zones.length === 0
    ) {
      return;
    }

    // Save context state
    this.canvasContext.save();

    // Draw each zone
    this.editor.zoneManager.zones.forEach((zone) => {
      this.drawZone(zone, mode);
    });

    // Draw creation preview if active
    if (this.editor.zoneManager.isCreating && mode === "zone") {
      this.drawCreationPreview();
    }

    // Draw selection handles if in zone mode
    if (mode === "zone") {
      this.drawSelectionHandles();
    }

    // Restore context state
    this.canvasContext.restore();
  }

  /**
   * Draw a single zone
   */
  drawZone(zone, mode) {
    const cellSize = this.editor.cellSize;
    const pixelX = zone.x * cellSize;
    const pixelY = zone.y * cellSize;
    const pixelW = zone.w * cellSize;
    const pixelH = zone.h * cellSize;

    // Set transparency based on mode
    const opacity = mode === "tile" ? 0.15 : 0.3;

    // Draw zone fill
    this.canvasContext.fillStyle = this.hexToRgba(zone.color, opacity);
    this.canvasContext.fillRect(pixelX, pixelY, pixelW, pixelH);

    // Draw zone border
    const borderOpacity = mode === "tile" ? 0.25 : 0.6;
    this.canvasContext.strokeStyle = this.hexToRgba(zone.color, borderOpacity);
    this.canvasContext.lineWidth = mode === "tile" ? 1 : 2;
    this.canvasContext.strokeRect(
      pixelX + 0.5,
      pixelY + 0.5,
      pixelW - 1,
      pixelH - 1
    );

    // Draw zone ID label in zone mode
    if (mode === "zone") {
      this.drawZoneLabel(zone, pixelX, pixelY, pixelW, pixelH);
    }
  }

  /**
   * Draw zone label with ID and layer priority
   */
  drawZoneLabel(zone, pixelX, pixelY, pixelW, pixelH) {
    // Only draw label if zone is large enough
    if (pixelW < 20 || pixelH < 20) {
      return;
    }

    const centerX = pixelX + pixelW / 2;
    const centerY = pixelY + pixelH / 2;

    // Get zone priority (index in array)
    const zoneIndex = this.editor.zoneManager.getZoneIndex(zone.id);
    const priority = zoneIndex + 1; // 1-based for display

    // Draw label background
    this.canvasContext.fillStyle = "rgba(0, 0, 0, 0.7)";
    const labelText = `#${zone.id}:${priority}`;
    const textMetrics = this.canvasContext.measureText(labelText);
    const labelWidth = textMetrics.width + 8;
    const labelHeight = 16;

    this.canvasContext.fillRect(
      centerX - labelWidth / 2,
      centerY - labelHeight / 2,
      labelWidth,
      labelHeight
    );

    // Draw label text
    this.canvasContext.fillStyle = "white";
    this.canvasContext.font = "11px monospace";
    this.canvasContext.textAlign = "center";
    this.canvasContext.textBaseline = "middle";
    this.canvasContext.fillText(labelText, centerX, centerY);

    // Draw priority indicator in corner for high-priority zones
    if (priority <= 3) {
      this.drawPriorityIndicator(zone, pixelX, pixelY, priority);
    }
  }

  /**
   * Draw priority indicator for high-priority zones
   */
  drawPriorityIndicator(zone, pixelX, pixelY, priority) {
    const indicatorSize = 8;
    const colors = ["#ff0000", "#ff8800", "#ffff00"]; // Red, orange, yellow

    this.canvasContext.fillStyle = colors[priority - 1] || "#ffff00";
    this.canvasContext.fillRect(
      pixelX + 2,
      pixelY + 2,
      indicatorSize,
      indicatorSize
    );

    this.canvasContext.strokeStyle = "#000000";
    this.canvasContext.lineWidth = 1;
    this.canvasContext.strokeRect(
      pixelX + 2,
      pixelY + 2,
      indicatorSize,
      indicatorSize
    );

    // Draw priority number
    this.canvasContext.fillStyle = "#000000";
    this.canvasContext.font = "8px monospace";
    this.canvasContext.textAlign = "center";
    this.canvasContext.textBaseline = "middle";
    this.canvasContext.fillText(
      priority.toString(),
      pixelX + 2 + indicatorSize / 2,
      pixelY + 2 + indicatorSize / 2
    );
  }

  /**
   * Draw creation preview
   */
  drawCreationPreview() {
    const zoneManager = this.editor.zoneManager;
    if (!zoneManager.creationStart || !zoneManager.creationEnd) {
      return;
    }

    const cellSize = this.editor.cellSize;
    const startX = Math.min(
      zoneManager.creationStart.x,
      zoneManager.creationEnd.x
    );
    const startY = Math.min(
      zoneManager.creationStart.y,
      zoneManager.creationEnd.y
    );
    const endX = Math.max(
      zoneManager.creationStart.x,
      zoneManager.creationEnd.x
    );
    const endY = Math.max(
      zoneManager.creationStart.y,
      zoneManager.creationEnd.y
    );

    const pixelX = startX * cellSize;
    const pixelY = startY * cellSize;
    const pixelW = (endX - startX) * cellSize;
    const pixelH = (endY - startY) * cellSize;

    // Draw preview with dashed border
    this.canvasContext.strokeStyle = "rgba(255, 255, 255, 0.8)";
    this.canvasContext.lineWidth = 2;
    this.canvasContext.setLineDash([5, 5]);
    this.canvasContext.strokeRect(
      pixelX + 1,
      pixelY + 1,
      pixelW - 2,
      pixelH - 2
    );
    this.canvasContext.setLineDash([]); // Reset dash

    // Draw preview fill
    this.canvasContext.fillStyle = "rgba(255, 255, 255, 0.1)";
    this.canvasContext.fillRect(pixelX, pixelY, pixelW, pixelH);
  }

  /**
   * Draw selection handles for selected zone
   */
  drawSelectionHandles() {
    const selectedZone = this.editor.zoneManager.getSelectedZone();
    if (!selectedZone) {
      return;
    }

    const cellSize = this.editor.cellSize;
    const pixelX = selectedZone.x * cellSize;
    const pixelY = selectedZone.y * cellSize;
    const pixelW = selectedZone.w * cellSize;
    const pixelH = selectedZone.h * cellSize;

    // Handle size
    const handleSize = 8;
    const halfHandle = handleSize / 2;

    // Handle positions
    const handles = [
      { x: pixelX, y: pixelY, type: "nw" }, // Northwest
      { x: pixelX + pixelW, y: pixelY, type: "ne" }, // Northeast
      { x: pixelX, y: pixelY + pixelH, type: "sw" }, // Southwest
      { x: pixelX + pixelW, y: pixelY + pixelH, type: "se" }, // Southeast
      { x: pixelX + pixelW / 2, y: pixelY, type: "n" }, // North
      { x: pixelX + pixelW / 2, y: pixelY + pixelH, type: "s" }, // South
      { x: pixelX, y: pixelY + pixelH / 2, type: "w" }, // West
      { x: pixelX + pixelW, y: pixelY + pixelH / 2, type: "e" }, // East
    ];

    // Draw selection border
    this.canvasContext.strokeStyle = "#ffffff";
    this.canvasContext.lineWidth = 2;
    this.canvasContext.strokeRect(pixelX, pixelY, pixelW, pixelH);

    // Draw handles
    handles.forEach((handle) => {
      // Handle background
      this.canvasContext.fillStyle = "#ffffff";
      this.canvasContext.fillRect(
        handle.x - halfHandle,
        handle.y - halfHandle,
        handleSize,
        handleSize
      );

      // Handle border
      this.canvasContext.strokeStyle = "#000000";
      this.canvasContext.lineWidth = 1;
      this.canvasContext.strokeRect(
        handle.x - halfHandle,
        handle.y - halfHandle,
        handleSize,
        handleSize
      );
    });
  }

  /**
   * Get cursor style for current mouse position
   */
  getCursorForPosition(mapX, mapY) {
    if (!this.editor.zoneManager) {
      return "default";
    }

    // Check for resize handle
    const handle = this.editor.zoneManager.getResizeHandle(mapX, mapY);
    if (handle) {
      return this.getCursorForHandle(handle);
    }

    // Check if over a zone
    const zone = this.editor.zoneManager.getZoneAt(mapX, mapY);
    if (zone) {
      return "move";
    }

    return "crosshair";
  }

  /**
   * Get cursor style for resize handle
   */
  getCursorForHandle(handle) {
    switch (handle) {
      case "nw":
      case "se":
        return "nw-resize";
      case "ne":
      case "sw":
        return "ne-resize";
      case "n":
      case "s":
        return "ns-resize";
      case "e":
      case "w":
        return "ew-resize";
      default:
        return "default";
    }
  }

  /**
   * Convert hex color to rgba
   */
  hexToRgba(hex, alpha) {
    // Remove # if present
    hex = hex.replace("#", "");

    // Parse RGB values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Clear zone overlays (used before redrawing)
   */
  clear() {
    // This will be called by the main renderer before redrawing
    // The zones will be redrawn as part of the main render cycle
  }
}
