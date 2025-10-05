/**
 * Rectangle Tools - Hollow and Filled rectangle drawing
 */

import { BaseTool } from "./BaseTool.js";

export class HollowRectangleTool extends BaseTool {
  constructor() {
    super("Hollow Rect", "crosshair");
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
      const width = Math.abs(mapX - this.startX) + 1;
      const height = Math.abs(mapY - this.startY) + 1;
      this.editor.status(
        `Drawing rectangle: ${width}x${height} | ${this.getDescription()}`
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
      this.drawRectangle(this.startX, this.startY, mapX, mapY);
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

    // Calculate rectangle bounds
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    // Draw hollow rectangle preview
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        // Only draw the border
        if (x === minX || x === maxX || y === minY || y === maxY) {
          if (this.isInBounds(x, y)) {
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        }
      }
    }
  }

  drawRectangle(startX, startY, endX, endY) {
    const changes = [];
    const newTileId = this.editor.activeId;

    // Calculate rectangle bounds
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    // Draw hollow rectangle
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        // Only draw the border
        if (x === minX || x === maxX || y === minY || y === maxY) {
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
        }
      }
    }

    this.applyChanges(changes);
  }

  getDescription() {
    return "LMB: Draw hollow rectangle | RMB: Eyedrop | Drag from corner to corner";
  }
}

export class FilledRectangleTool extends BaseTool {
  constructor() {
    super("Filled Rect", "crosshair");
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
      const width = Math.abs(mapX - this.startX) + 1;
      const height = Math.abs(mapY - this.startY) + 1;
      this.editor.status(
        `Drawing filled rectangle: ${width}x${height} | ${this.getDescription()}`
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
      this.drawRectangle(this.startX, this.startY, mapX, mapY);
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

    // Calculate rectangle bounds
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    // Draw filled rectangle preview
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (this.isInBounds(x, y)) {
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  drawRectangle(startX, startY, endX, endY) {
    const changes = [];
    const newTileId = this.editor.activeId;

    // Calculate rectangle bounds
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    // Draw filled rectangle
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
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
      }
    }

    this.applyChanges(changes);
  }

  getDescription() {
    return "LMB: Draw filled rectangle | RMB: Eyedrop | Drag from corner to corner";
  }
}
