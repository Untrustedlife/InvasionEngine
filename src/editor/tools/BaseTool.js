/**
 * Base Tool Class
 * All drawing tools inherit from this class
 */

export class BaseTool {
  constructor(name, cursor = "default") {
    this.name = name;
    this.cursor = cursor;
    this.isActive = false;
    this.previewData = null;
  }

  /**
   * Called when tool becomes active
   * @param {MapEditor} editor - The map editor instance
   */
  onActivate(editor) {
    this.editor = editor;
    this.isActive = true;
    this.updateCanvasCursor();
  }

  /**
   * Called when tool becomes inactive
   */
  onDeactivate() {
    this.isActive = false;
    this.clearPreview();
    this.previewData = null;
  }

  /**
   * Handle mouse down events
   * @param {number} mapX - Map X coordinate
   * @param {number} mapY - Map Y coordinate
   * @param {MouseEvent} event - Original mouse event
   */
  onMouseDown(mapX, mapY, event) {
    //Override in subclasses
  }

  /**
   * Handle mouse move events
   * @param {number} mapX - Map X coordinate
   * @param {number} mapY - Map Y coordinate
   * @param {MouseEvent} event - Original mouse event
   */
  onMouseMove(mapX, mapY, event) {
    //Override in subclasses
  }

  /**
   * Handle mouse up events
   * @param {number} mapX - Map X coordinate
   * @param {number} mapY - Map Y coordinate
   * @param {MouseEvent} event - Original mouse event
   */
  onMouseUp(mapX, mapY, event) {
    //Override in subclasses
  }

  /**
   * Handle key down events
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {boolean} - True if event was handled
   */
  onKeyDown(event) {
    //Override in subclasses
    return false;
  }

  /**
   * Update canvas cursor
   */
  updateCanvasCursor() {
    if (this.editor && this.editor.elements.canvas) {
      this.editor.elements.canvas.style.cursor = this.cursor;
    }
  }

  /**
   * Draw preview overlay (called during render)
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  drawPreview(ctx) {
    if (!this.previewData) {
      return;
    }

    //Save current context state
    ctx.save();

    //Set preview style
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = this.getPreviewColor();

    //Draw preview based on data
    this.renderPreview(ctx, this.previewData);

    //Restore context state
    ctx.restore();
  }

  /**
   * Render the actual preview (override in subclasses)
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} previewData - Preview data
   */
  renderPreview(ctx, previewData) {
    //Override in subclasses
  }

  /**
   * Get preview color for the current active tile
   * @returns {string} - Color string
   */
  getPreviewColor() {
    if (!this.editor) {
      return "#ffffff";
    }

    const activeTileDefinition = this.editor.tileManager.tiles.find(
      (tile) => tile.id === this.editor.activeId
    );
    return activeTileDefinition ? activeTileDefinition.color : "#ffffff";
  }

  /**
   * Clear current preview
   */
  clearPreview() {
    if (this.previewData) {
      this.previewData = null;
      if (this.editor) {
        this.editor.render();
      }
    }
  }

  /**
   * Apply changes to the map and create undo point
   * @param {Array} changes - Array of {x, y, prev, next} change objects
   */
  applyChanges(changes) {
    if (!this.editor || !changes.length) {
      return;
    }

    //Apply changes to map
    changes.forEach((change) => {
      if (
        change.x >= 0 &&
        change.x < this.editor.width &&
        change.y >= 0 &&
        change.y < this.editor.height
      ) {
        this.editor.map[change.y][change.x] = change.next;
      }
    });

    //Create undo point
    this.editor.undoManager.pushUndo(changes, this.editor.map);

    //Re-render
    this.editor.render();
  }

  /**
   * Get current map tile at position
   * @param {number} mapX - Map X coordinate
   * @param {number} mapY - Map Y coordinate
   * @returns {number} - Tile ID
   */
  getTileAt(mapX, mapY) {
    if (
      !this.editor ||
      mapX < 0 ||
      mapX >= this.editor.width ||
      mapY < 0 ||
      mapY >= this.editor.height
    ) {
      return 0;
    }
    return this.editor.map[mapY][mapX];
  }

  /**
   * Check if coordinates are within map bounds
   * @param {number} mapX - Map X coordinate
   * @param {number} mapY - Map Y coordinate
   * @returns {boolean}
   */
  isInBounds(mapX, mapY) {
    return (
      mapX >= 0 &&
      mapX < this.editor.width &&
      mapY >= 0 &&
      mapY < this.editor.height
    );
  }

  /**
   * Get tool display name for UI
   * @returns {string}
   */
  getDisplayName() {
    return this.name.toUpperCase();
  }

  /**
   * Get tool description for status bar
   * @returns {string}
   */
  getDescription() {
    return `${this.getDisplayName()} Tool`;
  }
}
