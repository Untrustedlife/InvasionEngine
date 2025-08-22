/**
 * Map Renderer Class
 * Handles canvas rendering for the map editor
 */

import { cellFromEvent } from "./EditorUtils.js";
import { MIN_CELL_SIZE } from "./EditorConstants.js";

export class MapRenderer {
  constructor(canvasElement, mapEditor) {
    this.canvas = canvasElement;
    this.canvasContext = canvasElement.getContext("2d", { alpha: false });
    this.canvasContext.imageSmoothingEnabled = false;
    this.editor = mapEditor;
  }

  /**
   * Draw the entire map with all cells and optional grid overlay
   */
  draw() {
    this.syncCanvasSize();

    //Render all map cells with their appropriate colors
    this.drawAllMapCells();

    //Draw grid overlay if enabled and cell size is large enough
    if (this.editor.showGrid && this.editor.cellSize >= MIN_CELL_SIZE + 4) {
      this.drawGrid();
    }
  }

  /**
   * Draw all cells in the map with their tile colors
   */
  drawAllMapCells() {
    for (let mapRowIndex = 0; mapRowIndex < this.editor.height; mapRowIndex++) {
      for (
        let mapColumnIndex = 0;
        mapColumnIndex < this.editor.width;
        mapColumnIndex++
      ) {
        const tileId = this.editor.map[mapRowIndex][mapColumnIndex];
        this.canvasContext.fillStyle = this.colorFor(tileId);
        this.canvasContext.fillRect(
          mapColumnIndex * this.editor.cellSize,
          mapRowIndex * this.editor.cellSize,
          this.editor.cellSize,
          this.editor.cellSize
        );
      }
    }
  }

  /**
   * Draw a single cell at the specified map coordinates
   */
  drawCell(mapX, mapY) {
    const tileId = this.editor.map[mapY][mapX];
    this.canvasContext.fillStyle = this.colorFor(tileId);
    this.canvasContext.fillRect(
      mapX * this.editor.cellSize,
      mapY * this.editor.cellSize,
      this.editor.cellSize,
      this.editor.cellSize
    );

    //Redraw grid lines for this cell if grid is enabled
    if (this.editor.showGrid && this.editor.cellSize >= MIN_CELL_SIZE + 4) {
      this.drawCellGrid(mapX, mapY);
    }
  }

  /**
   * Draw grid lines over the entire map
   */
  drawGrid() {
    this.canvasContext.strokeStyle = "#1e263f";
    this.canvasContext.lineWidth = 1;
    this.canvasContext.beginPath();

    //Draw vertical grid lines
    for (
      let verticalLineX = 0.5;
      verticalLineX <= this.editor.width * this.editor.cellSize;
      verticalLineX += this.editor.cellSize
    ) {
      this.canvasContext.moveTo(verticalLineX, 0);
      this.canvasContext.lineTo(
        verticalLineX,
        this.editor.height * this.editor.cellSize
      );
    }

    //Draw horizontal grid lines
    for (
      let horizontalLineY = 0.5;
      horizontalLineY <= this.editor.height * this.editor.cellSize;
      horizontalLineY += this.editor.cellSize
    ) {
      this.canvasContext.moveTo(0, horizontalLineY);
      this.canvasContext.lineTo(
        this.editor.width * this.editor.cellSize,
        horizontalLineY
      );
    }

    this.canvasContext.stroke();
  }

  /**
   * Draw grid lines around a specific cell
   */
  drawCellGrid(mapX, mapY) {
    this.canvasContext.strokeStyle = "#1e263f";
    this.canvasContext.strokeRect(
      mapX * this.editor.cellSize + 0.5,
      mapY * this.editor.cellSize + 0.5,
      this.editor.cellSize - 1,
      this.editor.cellSize - 1
    );
  }

  /**
   * Get the display color for a tile ID
   */
  colorFor(tileId) {
    const tileDefinition = this.editor.tileManager.tiles.find(
      (tile) => tile.id === tileId
    );
    return tileDefinition ? tileDefinition.color : "#000000";
  }

  /**
   * Update canvas size based on current map dimensions and cell size
   */
  syncCanvasSize() {
    this.canvas.width = this.editor.width * this.editor.cellSize;
    this.canvas.height = this.editor.height * this.editor.cellSize;
    this.canvasContext.imageSmoothingEnabled = false;
  }

  /**
   * Get cell coordinates from mouse event
   */
  cellFromEvent(mouseEvent) {
    return cellFromEvent(mouseEvent, this.canvas, this.editor.cellSize);
  }
}
