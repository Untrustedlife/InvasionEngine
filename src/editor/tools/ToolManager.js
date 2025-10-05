/**
 * Tool Manager Class
 * Manages all drawing tools and handles tool switching
 */

import { BaseTool } from "./BaseTool.js";

export class ToolManager {
  constructor(editor) {
    this.editor = editor;
    this.tools = new Map();
    this.currentTool = null;
    this.toolOrder = [];
  }

  /**
   * Register a new tool
   * @param {string} id - Unique tool identifier
   * @param {BaseTool} tool - Tool instance
   */
  registerTool(id, tool) {
    if (!(tool instanceof BaseTool)) {
      throw new Error("Tool must extend BaseTool class");
    }

    this.tools.set(id, tool);

    //Add to order array if not already present
    if (!this.toolOrder.includes(id)) {
      this.toolOrder.push(id);
    }

    //Set as current tool if it's the first one
    if (!this.currentTool) {
      this.setCurrentTool(id);
    }
  }

  /**
   * Get a tool by ID
   * @param {string} id - Tool ID
   * @returns {BaseTool|null}
   */
  getTool(id) {
    return this.tools.get(id) || null;
  }

  /**
   * Get current active tool
   * @returns {BaseTool|null}
   */
  getCurrentTool() {
    return this.currentTool;
  }

  /**
   * Get current tool ID
   * @returns {string|null}
   */
  getCurrentToolId() {
    for (const [id, tool] of this.tools) {
      if (tool === this.currentTool) {
        return id;
      }
    }
    return null;
  }

  /**
   * Set current active tool
   * @param {string} id - Tool ID to activate
   * @returns {boolean} - True if tool was successfully set
   */
  setCurrentTool(id) {
    const tool = this.tools.get(id);
    if (!tool) {
      console.warn(`Tool with id '${id}' not found`);
      return false;
    }

    //Deactivate current tool
    if (this.currentTool) {
      this.currentTool.onDeactivate();
    }

    //Activate new tool
    this.currentTool = tool;
    this.currentTool.onActivate(this.editor);

    //Update UI
    this.updateToolUI();

    return true;
  }

  /**
   * Get all available tools
   * @returns {Array} - Array of {id, tool} objects in registration order
   */
  getAllTools() {
    return this.toolOrder.map((id) => ({
      id,
      tool: this.tools.get(id),
    }));
  }

  /**
   * Switch to next tool in order
   */
  nextTool() {
    if (this.toolOrder.length <= 1) {
      return;
    }

    const currentId = this.getCurrentToolId();
    const currentIndex = this.toolOrder.indexOf(currentId);
    const nextIndex = (currentIndex + 1) % this.toolOrder.length;

    this.setCurrentTool(this.toolOrder[nextIndex]);
  }

  /**
   * Switch to previous tool in order
   */
  previousTool() {
    if (this.toolOrder.length <= 1) {
      return;
    }

    const currentId = this.getCurrentToolId();
    const currentIndex = this.toolOrder.indexOf(currentId);
    const prevIndex =
      currentIndex === 0 ? this.toolOrder.length - 1 : currentIndex - 1;

    this.setCurrentTool(this.toolOrder[prevIndex]);
  }

  /**
   * Handle mouse down events - delegate to current tool
   * @param {number} mapX - Map X coordinate
   * @param {number} mapY - Map Y coordinate
   * @param {MouseEvent} event - Original mouse event
   */
  onMouseDown(mapX, mapY, event) {
    if (this.currentTool) {
      this.currentTool.onMouseDown(mapX, mapY, event);
    }
  }

  /**
   * Handle mouse move events - delegate to current tool
   * @param {number} mapX - Map X coordinate
   * @param {number} mapY - Map Y coordinate
   * @param {MouseEvent} event - Original mouse event
   */
  onMouseMove(mapX, mapY, event) {
    if (this.currentTool) {
      this.currentTool.onMouseMove(mapX, mapY, event);
    }
  }

  /**
   * Handle mouse up events - delegate to current tool
   * @param {number} mapX - Map X coordinate
   * @param {number} mapY - Map Y coordinate
   * @param {MouseEvent} event - Original mouse event
   */
  onMouseUp(mapX, mapY, event) {
    if (this.currentTool) {
      this.currentTool.onMouseUp(mapX, mapY, event);
    }
  }

  /**
   * Handle key down events - delegate to current tool
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {boolean} - True if event was handled
   */
  onKeyDown(event) {
    if (this.currentTool) {
      return this.currentTool.onKeyDown(event);
    }
    return false;
  }

  /**
   * Draw all tool previews
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  drawPreviews(ctx) {
    if (this.currentTool) {
      this.currentTool.drawPreview(ctx);
    }
  }

  /**
   * Update tool-related UI elements
   */
  updateToolUI() {
    if (!this.currentTool) {
      return;
    }

    //Update tool buttons
    this.updateToolButtons();

    //Update status with tool info
    if (this.editor && this.editor.status) {
      this.editor.status(`Tool: ${this.currentTool.getDisplayName()}`);
    }
  }

  /**
   * Update tool selection buttons
   */
  updateToolButtons() {
    const toolButtons =
      this.editor?.elements?.canvas?.parentElement?.querySelectorAll(
        "[data-tool-id]"
      );

    if (!toolButtons) {
      return;
    }

    const currentToolId = this.getCurrentToolId();

    toolButtons.forEach((button) => {
      const buttonToolId = button.getAttribute("data-tool-id");

      if (buttonToolId === currentToolId) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });
  }

  /**
   * Initialize tool UI - create tool selection buttons
   */
  initializeUI() {
    const canvasControls =
      this.editor.elements.canvas?.parentElement?.querySelector(
        ".canvas-controls .button-row"
      );

    if (!canvasControls) {
      console.warn("Canvas controls not found for tool UI");
      return;
    }

    //Create tool selection container
    const toolContainer = document.createElement("div");
    toolContainer.className = "tool-selection";
    toolContainer.innerHTML = '<div class="section-header">TOOLS</div>';

    //Create button container
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "tool-buttons";

    //Create buttons for each tool
    this.getAllTools().forEach(({ id, tool }) => {
      const button = document.createElement("button");
      button.className = "tool-btn";
      button.setAttribute("data-tool-id", id);
      button.textContent = tool.getDisplayName();
      button.title = tool.getDescription();

      button.addEventListener("click", () => {
        this.setCurrentTool(id);
      });

      buttonContainer.appendChild(button);
    });

    toolContainer.appendChild(buttonContainer);

    //Insert tool container after the first button row
    canvasControls.parentNode.insertBefore(
      toolContainer,
      canvasControls.nextSibling
    );

    //Update initial button states
    this.updateToolButtons();
  }

  /**
   * Clean up tool manager
   */
  destroy() {
    if (this.currentTool) {
      this.currentTool.onDeactivate();
    }
    this.tools.clear();
    this.toolOrder = [];
    this.currentTool = null;
  }
}
