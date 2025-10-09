/**
 * Brush Tool - Single pixel painting
 * Replicates the original painting functionality
 */

import { BaseTool } from "./BaseTool.js";

export class BrushTool extends BaseTool {
  constructor() {
    super("Brush", "crosshair");
    this.isDrawing = false;
    this.strokeChanges = [];
  }

  /**
   * Start painting on mouse down
   */
  onMouseDown(mapX, mapY, event) {
    if (event.button === 2) {
      //Right-click eyedropper tool - pick tile ID from clicked cell
      const clickedTileId = this.getTileAt(mapX, mapY);
      this.editor.setActiveId(clickedTileId);
      this.editor.status(`Picked tile ID: ${clickedTileId}`);
      return;
    }

    if (event.button === 0 && this.isInBounds(mapX, mapY)) {
      //Left-click paint mode - start painting stroke
      this.isDrawing = true;
      this.strokeChanges = [];
      this.paintCell(mapX, mapY);
    }
  }

  /**
   * Continue painting on mouse move if drawing
   */
  onMouseMove(mapX, mapY, event) {
    if (this.isDrawing && this.isInBounds(mapX, mapY)) {
      this.paintCell(mapX, mapY);
    }

    //Update status
    const currentTileId = this.getTileAt(mapX, mapY);
    this.editor.status(
      `(x:${mapX}, y:${mapY}) id:${currentTileId} | ${this.getDescription()}`
    );
  }

  /**
   * End painting on mouse up
   */
  onMouseUp(mapX, mapY, event) {
    if (this.isDrawing) {
      this.isDrawing = false;

      if (this.strokeChanges.length > 0) {
        this.applyChanges(this.strokeChanges);
      }

      this.strokeChanges = [];
    }
  }

  /**
   * Handle tool deactivation - end any active drawing
   */
  onDeactivate() {
    super.onDeactivate();

    if (this.isDrawing) {
      this.isDrawing = false;

      if (this.strokeChanges.length > 0) {
        this.applyChanges(this.strokeChanges);
      }

      this.strokeChanges = [];
    }
  }

  /**
   * Paint a single cell
   * @param {number} mapX - Map X coordinate
   * @param {number} mapY - Map Y coordinate
   */
  paintCell(mapX, mapY) {
    const previousTileId = this.getTileAt(mapX, mapY);
    const newTileId = this.editor.activeId;

    if (previousTileId === newTileId) {
      return; //No change needed
    }

    //Store change for undo system
    this.strokeChanges.push({
      x: mapX,
      y: mapY,
      prev: previousTileId,
      next: newTileId,
    });

    //Apply change immediately for visual feedback
    this.editor.map[mapY][mapX] = newTileId;
    this.editor.renderer.drawCell(mapX, mapY);
  }

  /**
   * Get tool description
   */
  getDescription() {
    return "LMB: Paint | RMB: Eyedrop | Drag to paint multiple cells";
  }
}
