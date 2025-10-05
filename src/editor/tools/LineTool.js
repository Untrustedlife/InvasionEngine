/**
 * Line Tool - Draws straight lines between two points
 * Uses Bresenham's line algorithm for pixel-perfect lines
 */

import { BaseTool } from "./BaseTool.js";

export class LineTool extends BaseTool {
  constructor() {
    super("Line", "crosshair");
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;
  }

  onMouseDown(mapX, mapY, event) {
    if (event.button === 2) {
      // Right-click eyedropper
      const clickedTileId = this.getTileAt(mapX, mapY);
      this.editor.setActiveId(clickedTileId);
      this.editor.status(`Picked tile ID: ${clickedTileId}`);
      return;
    }

    if (event.button === 0 && this.isInBounds(mapX, mapY)) {
      this.isDrawing = true;
      this.startX = mapX;
      this.startY = mapY;
      this.updatePreview(mapX, mapY);
    }
  }

  onMouseMove(mapX, mapY, event) {
    if (this.isDrawing) {
      this.updatePreview(mapX, mapY);
    }

    // Update status
    const currentTileId = this.getTileAt(mapX, mapY);
    if (this.isDrawing) {
      const distance = Math.sqrt(
        Math.pow(mapX - this.startX, 2) + Math.pow(mapY - this.startY, 2)
      ).toFixed(1);
      this.editor.status(
        `Drawing line: distance ${distance} | ${this.getDescription()}`
      );
    } else {
      this.editor.status(
        `(x:${mapX}, y:${mapY}) id:${currentTileId} | ${this.getDescription()}`
      );
    }
  }

  onMouseUp(mapX, mapY, event) {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.drawLine(this.startX, this.startY, mapX, mapY);
      this.clearPreview();
    }
  }

  onDeactivate() {
    super.onDeactivate();
    this.isDrawing = false;
  }

  updatePreview(endX, endY) {
    this.previewData = {
      startX: this.startX,
      startY: this.startY,
      endX,
      endY,
    };
    this.editor.render();
  }

  renderPreview(ctx, previewData) {
    const { startX, startY, endX, endY } = previewData;
    const cellSize = this.editor.cellSize;

    // Get line points using Bresenham's algorithm
    const linePoints = this.getLinePoints(startX, startY, endX, endY);

    // Draw preview line
    linePoints.forEach(({ x, y }) => {
      if (this.isInBounds(x, y)) {
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    });
  }

  drawLine(startX, startY, endX, endY) {
    const changes = [];
    const newTileId = this.editor.activeId;

    // Get line points using Bresenham's algorithm
    const linePoints = this.getLinePoints(startX, startY, endX, endY);

    // Apply changes to map
    linePoints.forEach(({ x, y }) => {
      if (this.isInBounds(x, y)) {
        const previousTileId = this.getTileAt(x, y);
        if (previousTileId !== newTileId) {
          changes.push({
            x,
            y,
            prev: previousTileId,
            next: newTileId,
          });
        }
      }
    });

    this.applyChanges(changes);
  }

  /**
   * Get line points using Bresenham's line algorithm
   * @param {number} x0 - Start X coordinate
   * @param {number} y0 - Start Y coordinate
   * @param {number} x1 - End X coordinate
   * @param {number} y1 - End Y coordinate
   * @returns {Array} - Array of {x, y} points
   */
  getLinePoints(x0, y0, x1, y1) {
    const points = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let x = x0;
    let y = y0;

    while (true) {
      points.push({ x, y });

      if (x === x1 && y === y1) {
        break;
      }

      const e2 = 2 * err;

      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }

      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    return points;
  }

  getDescription() {
    return "LMB: Draw line | RMB: Eyedrop | Drag from start to end point";
  }
}
