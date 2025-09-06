/**
 * Main Map Editor Class
 * Handles editor state, initialization, and coordination between components
 */

import {
  DEFAULT_MAP_WIDTH,
  DEFAULT_MAP_HEIGHT,
  DEFAULT_CELL_SIZE,
  DEFAULT_TILES,
  MAX_TILE_ID,
} from "./EditorConstants.js";
import { createMap, safeClamp } from "./EditorUtils.js";
import { MapRenderer } from "./MapRenderer.js";
import { UndoRedoManager } from "./UndoRedoManager.js";
import { TileManager } from "./TileManager.js";
import { ExportImport } from "./ExportImport.js";
import { ZoneManager } from "./ZoneManager.js";
import { ZoneRenderer } from "./ZoneRenderer.js";

export class MapEditor {
  constructor() {
    console.log("In editor code");
    //Map state
    this.width = DEFAULT_MAP_WIDTH;
    this.height = DEFAULT_MAP_HEIGHT;
    this.cellSize = DEFAULT_CELL_SIZE;
    this.showGrid = true;
    this.activeId = 1;
    this.map = createMap(this.width, this.height, 0);

    // Editor mode state
    this.currentMode = "tile"; // 'tile' or 'zone'

    //Components
    this.renderer = null;
    this.undoManager = null;
    this.tileManager = null;
    this.exportImport = null;
    this.zoneManager = null;
    this.zoneRenderer = null;

    //Canvas interaction state
    this.painting = false;
    this.strokeChanges = null;

    //Keyboard input buffer for ID selection
    this.idBuffer = "";

    //DOM elements
    this.elements = {};

    this.initializeDOM();
    this.initializeComponents();
    this.bindEvents();
    this.render();
  }

  initializeDOM() {
    //Get all DOM elements
    this.elements = {
      canvas: document.getElementById("editor"),
      wInput: document.getElementById("w"),
      hInput: document.getElementById("h"),
      cellInput: document.getElementById("cell"),
      maxIdInput: document.getElementById("maxId"),
      activeIdInput: document.getElementById("activeId"),
      activeBadge: document.getElementById("activeBadge"),
      palListEl: document.getElementById("palList"),
      statusEl: document.getElementById("status"),
      io: document.getElementById("io"),
      gridBtn: document.getElementById("gridBtn"),
      mapNameInput: document.getElementById("mapName"),
      // Mode switching elements
      modeBtn: document.getElementById("modeBtn"),
      tilePanel: document.getElementById("tilePanel"),
      zonePanel: document.getElementById("zonePanel"),
      // Zone UI elements
      noZoneSelected: document.getElementById("noZoneSelected"),
      zoneEditor: document.getElementById("zoneEditor"),
      zoneId: document.getElementById("zoneId"),
      zoneX: document.getElementById("zoneX"),
      zoneY: document.getElementById("zoneY"),
      zoneW: document.getElementById("zoneW"),
      zoneH: document.getElementById("zoneH"),
      zoneColor: document.getElementById("zoneColor"),
      zoneCeilFront: document.getElementById("zoneCeilFront"),
      zoneCeilBack: document.getElementById("zoneCeilBack"),
      deleteZoneBtn: document.getElementById("deleteZoneBtn"),
      // Zone mini panel
      zoneMiniPanel: document.getElementById("zoneMiniPanel"),
      zoneMiniList: document.getElementById("zoneMiniList"),
      // Zone layer panel
      zoneLayerList: document.getElementById("zoneLayerList"),
      addZoneBtn: document.getElementById("addZoneBtn"),
    };

    //Set initial values
    this.elements.wInput.value = String(this.width);
    this.elements.hInput.value = String(this.height);
    this.elements.cellInput.value = String(this.cellSize);
    this.elements.maxIdInput.value = "7";
  }

  initializeComponents() {
    this.renderer = new MapRenderer(this.elements.canvas, this);
    this.undoManager = new UndoRedoManager();
    this.undoManager.setEditor(this);
    this.tileManager = new TileManager(this, DEFAULT_TILES);
    this.exportImport = new ExportImport(this);
    this.zoneManager = new ZoneManager(this);
    this.zoneRenderer = new ZoneRenderer(this.renderer.canvasContext, this);

    this.setActiveId(1);
  }

  bindEvents() {
    //Button events
    document.getElementById("genBtn").onclick = () =>
      this.tileManager.generateIds();
    document.getElementById("resetNamesBtn").onclick = () =>
      this.tileManager.autoNameTiles();
    document.getElementById("seedWolf3dBtn").onclick = () =>
      this.tileManager.seedFromUserSample();
    document.getElementById("resizeBtn").onclick = () => this.handleResize();
    document.getElementById("clearBtn").onclick = () => this.clearMap();
    document.getElementById("fillBtn").onclick = () => this.fillMap();
    document.getElementById("gridBtn").onclick = () => this.toggleGrid();
    document.getElementById("undoBtn").onclick = () => this.undoManager.undo();
    document.getElementById("redoBtn").onclick = () => this.undoManager.redo();
    document.getElementById("loadArrayBtn").onclick = () =>
      this.exportImport.loadFromText();
    document.getElementById("loadSampleBtn").onclick = () =>
      this.exportImport.loadSampleMapOnly();
    document.getElementById("exportTsBtn").onclick = () =>
      this.exportImport.exportJS();
    document.getElementById("copyTsBtn").onclick = () =>
      this.exportImport.copyJS();
    document.getElementById("downloadTsBtn").onclick = () =>
      this.exportImport.downloadJS();
    document.getElementById("downloadJsonBtn").onclick = () =>
      this.exportImport.downloadJSON();

    // Mode switching
    this.elements.modeBtn.onclick = () => this.toggleMode();

    // Zone events
    this.elements.addZoneBtn.onclick = () => this.addNewZone();
    this.elements.deleteZoneBtn.onclick = () => this.deleteSelectedZone();
    this.elements.zoneX.oninput = () => this.updateSelectedZoneFromInputs();
    this.elements.zoneY.oninput = () => this.updateSelectedZoneFromInputs();
    this.elements.zoneW.oninput = () => this.updateSelectedZoneFromInputs();
    this.elements.zoneH.oninput = () => this.updateSelectedZoneFromInputs();
    this.elements.zoneColor.oninput = () => this.updateSelectedZoneFromInputs();
    this.elements.zoneCeilFront.oninput = () =>
      this.updateSelectedZoneFromInputs();
    this.elements.zoneCeilBack.oninput = () =>
      this.updateSelectedZoneFromInputs();

    //Input events
    this.elements.activeIdInput.oninput = () => {
      this.setActiveId(
        safeClamp(this.elements.activeIdInput.value, 0, MAX_TILE_ID)
      );
    };

    this.elements.cellInput.addEventListener("input", () =>
      this.renderer.syncCanvasSize()
    );

    //Keyboard events
    document.addEventListener("keydown", (e) => this.handleKeyDown(e));

    //Canvas events
    this.bindCanvasEvents();
  }

  bindCanvasEvents() {
    const canvas = this.elements.canvas;

    canvas.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    canvas.addEventListener("mousedown", (e) => this.handleMouseDown(e));
    canvas.addEventListener("mouseup", () => this.endStroke());
    canvas.addEventListener("mouseleave", () => this.endStroke());
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  handleKeyDown(keyboardEvent) {
    if (
      keyboardEvent.ctrlKey &&
      !keyboardEvent.shiftKey &&
      keyboardEvent.key.toLowerCase() === "z"
    ) {
      keyboardEvent.preventDefault();
      this.undoManager.undo();
      return;
    }
    if (keyboardEvent.ctrlKey && keyboardEvent.key.toLowerCase() === "y") {
      keyboardEvent.preventDefault();
      this.undoManager.redo();
      return;
    }

    //Skip if typing in input fields
    if (
      document.activeElement &&
      ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
    ) {
      return;
    }

    //Letter hotkeys for special tiles
    if (keyboardEvent.key.toLowerCase() === "e") {
      this.setActiveId(-1); //infoPlayerStart
      this.status("Selected: infoPlayerStart (E)");
      return;
    }

    if (keyboardEvent.key.toLowerCase() === "x") {
      this.setActiveId(-2); //infoPlayerExit
      this.status("Selected: infoPlayerExit (X)");
      return;
    }

    //Number key input for tile ID
    if (/^[0-9]$/.test(keyboardEvent.key)) {
      this.idBuffer += keyboardEvent.key;
      if (this.idBuffer.length > 3) {
        this.idBuffer = this.idBuffer.slice(-3);
      }
      this.status(`ID input: ${this.idBuffer}`);
    }

    if (keyboardEvent.key === "Enter" && this.idBuffer) {
      const maxTileId = this.tileManager.tiles.length
        ? this.tileManager.tiles[this.tileManager.tiles.length - 1].id
        : MAX_TILE_ID;
      this.setActiveId(safeClamp(this.idBuffer, 0, maxTileId));
      this.idBuffer = "";
    }
  }

  handleMouseMove(mouseEvent) {
    const cellCoordinates = this.renderer.cellFromEvent(mouseEvent);
    const isWithinMapBounds =
      cellCoordinates.x >= 0 &&
      cellCoordinates.y >= 0 &&
      cellCoordinates.x < this.width &&
      cellCoordinates.y < this.height;

    if (isWithinMapBounds) {
      if (this.currentMode === "zone") {
        this.handleZoneMouseMove(cellCoordinates);
      } else {
        const currentTileId = this.map[cellCoordinates.y][cellCoordinates.x];
        this.status(
          `(x:${cellCoordinates.x}, y:${cellCoordinates.y}) id:${currentTileId}`
        );

        if (this.painting) {
          this.paintCell(cellCoordinates.x, cellCoordinates.y, this.activeId);
        }
      }
    }
  }

  handleMouseDown(mouseEvent) {
    mouseEvent.preventDefault();
    const cellCoordinates = this.renderer.cellFromEvent(mouseEvent);

    //Check if click is outside map bounds
    if (
      cellCoordinates.x < 0 ||
      cellCoordinates.y < 0 ||
      cellCoordinates.x >= this.width ||
      cellCoordinates.y >= this.height
    ) {
      return;
    }

    if (this.currentMode === "zone") {
      this.handleZoneMouseDown(cellCoordinates, mouseEvent);
    } else {
      if (mouseEvent.button === 2) {
        //Right-click eyedropper tool - pick tile ID from clicked cell
        const clickedTileId = this.map[cellCoordinates.y][cellCoordinates.x];
        this.setActiveId(clickedTileId);
        return;
      }

      //Left-click paint mode - start painting stroke
      this.painting = true;
      this.strokeChanges = [];
      this.paintCell(cellCoordinates.x, cellCoordinates.y, this.activeId);
    }
  }

  endStroke() {
    if (this.painting) {
      this.painting = false;
      this.undoManager.pushUndo(this.strokeChanges, this.map);
      this.strokeChanges = null;
    }

    // Handle zone operations
    if (this.currentMode === "zone" && this.zoneManager) {
      this.zoneManager.finishCreation();
      this.zoneManager.endDrag();
      this.zoneManager.endResize();
      this.updateZoneUI();
      this.updateZoneMiniPanel();
      this.render();
    }
  }

  /**
   * Handle mouse movement in zone mode
   */
  handleZoneMouseMove(cellCoordinates) {
    const mapX = cellCoordinates.x;
    const mapY = cellCoordinates.y;

    // Update cursor based on current position
    if (this.zoneRenderer) {
      const cursor = this.zoneRenderer.getCursorForPosition(mapX, mapY);
      this.elements.canvas.style.cursor = cursor;
    }

    // Handle zone operations
    if (this.zoneManager.isCreating) {
      this.zoneManager.updateCreation(mapX, mapY);
      this.render();
    } else if (this.zoneManager.isDragging) {
      this.zoneManager.updateDrag(mapX, mapY);
      this.render();
    } else if (this.zoneManager.isResizing) {
      this.zoneManager.updateResize(mapX, mapY);
      this.render();
    }

    // Update status with zone information
    const zone = this.zoneManager.getZoneAt(mapX, mapY);
    if (zone) {
      this.status(
        `Zone #${zone.id} (x:${mapX}, y:${mapY}) ${zone.w}x${zone.h}`
      );
    } else {
      this.status(`(x:${mapX}, y:${mapY}) - Zone Mode`);
    }
  }

  /**
   * Handle mouse down events in zone mode
   */
  handleZoneMouseDown(cellCoordinates, mouseEvent) {
    const mapX = cellCoordinates.x;
    const mapY = cellCoordinates.y;

    if (mouseEvent.button === 2) {
      // Right-click: Delete zone if clicked on one
      const zone = this.zoneManager.getZoneAt(mapX, mapY);
      if (zone) {
        this.zoneManager.deleteZone(zone.id);
        this.updateZoneUI();
        this.updateZoneMiniPanel();
        this.render();
        this.status(`Deleted zone #${zone.id}`);
      }
      return;
    }

    // Left-click handling
    const handle = this.zoneManager.getResizeHandle(mapX, mapY);
    if (handle) {
      // Start resizing
      this.zoneManager.startResize(handle);
      this.status(`Resizing zone #${this.zoneManager.getSelectedZone().id}`);
    } else {
      const zone = this.zoneManager.getZoneAt(mapX, mapY);
      if (zone) {
        // Select and start dragging zone
        this.zoneManager.selectZone(zone.id);
        this.zoneManager.startDrag(mapX, mapY);
        this.status(`Selected zone #${zone.id} - drag to move`);
        this.updateZoneUI();
      } else {
        // Start creating new zone
        this.zoneManager.startCreation(mapX, mapY);
        this.status("Creating zone - drag to set size");
      }
    }

    this.render();
  }

  paintCell(mapX, mapY, tileId) {
    const previousTileId = this.map[mapY][mapX];
    if (previousTileId === tileId) {
      return; //No change needed
    }

    this.map[mapY][mapX] = tileId;
    this.strokeChanges.push({
      x: mapX,
      y: mapY,
      prev: previousTileId,
      next: tileId,
    });
    this.renderer.drawCell(mapX, mapY);
  }

  setActiveId(tileId) {
    //Allow special negative tile IDs (-1, -2) or clamp positive IDs
    if (tileId === -1 || tileId === -2) {
      this.activeId = tileId;
    } else {
      this.activeId = safeClamp(tileId, 0, MAX_TILE_ID);
    }

    this.elements.activeIdInput.value = String(this.activeId);
    this.elements.activeBadge.textContent = `ID ${this.activeId}`;

    //Update badge color based on tile definition
    const activeTileDefinition = this.tileManager.tiles.find(
      (tile) => tile.id === this.activeId
    );
    this.elements.activeBadge.style.background = activeTileDefinition
      ? activeTileDefinition.color
      : "transparent";
  }

  handleResize() {
    const newMapWidth = safeClamp(this.elements.wInput.value, 1, 256);
    const newMapHeight = safeClamp(this.elements.hInput.value, 1, 256);
    const newCellSize = safeClamp(this.elements.cellInput.value, 2, 48);

    //Preserve overlapping area when resizing
    const resizedMap = createMap(newMapWidth, newMapHeight, 0);
    for (
      let rowIndex = 0;
      rowIndex < Math.min(this.height, newMapHeight);
      rowIndex++
    ) {
      for (
        let columnIndex = 0;
        columnIndex < Math.min(this.width, newMapWidth);
        columnIndex++
      ) {
        resizedMap[rowIndex][columnIndex] = this.map[rowIndex][columnIndex];
      }
    }

    this.width = newMapWidth;
    this.height = newMapHeight;
    this.cellSize = newCellSize;
    this.map = resizedMap;
    this.render();
  }

  clearMap() {
    this.undoManager.pushUndo([], this.map);
    this.fillMapWithValue(0);
    this.render();
  }

  fillMap() {
    this.undoManager.pushUndo([], this.map);
    this.fillMapWithValue(this.activeId);
    this.render();
  }

  fillMapWithValue(fillValue) {
    for (let rowIndex = 0; rowIndex < this.height; rowIndex++) {
      for (let columnIndex = 0; columnIndex < this.width; columnIndex++) {
        this.map[rowIndex][columnIndex] = fillValue;
      }
    }
  }

  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.elements.gridBtn.textContent = `Grid: ${this.showGrid ? "on" : "off"}`;
    this.render();
  }

  /**
   * Switch between tile and zone editing modes
   */
  setMode(mode) {
    if (mode === this.currentMode) {
      return;
    }

    this.currentMode = mode;

    // Update UI to reflect mode change
    this.updateModeUI();

    // Clear any active operations
    if (this.currentMode === "zone") {
      this.endStroke();
      this.zoneManager.cancelCreation();
    }

    this.render();
    this.status(`Switched to ${mode.toUpperCase()} mode`);
  }

  /**
   * Toggle between tile and zone editing modes
   */
  toggleMode() {
    const newMode = this.currentMode === "tile" ? "zone" : "tile";
    this.setMode(newMode);
  }

  /**
   * Update UI elements based on current mode
   */
  updateModeUI() {
    // Update mode button text
    this.elements.modeBtn.textContent =
      this.currentMode === "tile" ? "MODE: TILE EDIT" : "MODE: ZONE EDIT";

    // Show/hide appropriate panels
    if (this.currentMode === "zone") {
      this.elements.tilePanel.style.display = "none";
      this.elements.zonePanel.style.display = "block";
      this.elements.zoneMiniPanel.style.display = "none";
    } else {
      this.elements.tilePanel.style.display = "block";
      this.elements.zonePanel.style.display = "none";
      // Show zone mini panel if zones exist
      this.updateZoneMiniPanel();
    }

    this.updateCanvasCursor();
    this.updateZoneUI();
  }

  /**
   * Add a new zone programmatically
   */
  addNewZone() {
    if (this.zoneManager) {
      const newZone = this.zoneManager.addNewZone();
      this.status(`Created zone #${newZone.id}`);
      this.updateZoneUI();
      this.updateZoneMiniPanel();
      this.render();
    }
  }

  /**
   * Delete the currently selected zone
   */
  deleteSelectedZone() {
    if (this.zoneManager && this.zoneManager.selectedZoneId !== null) {
      const zoneId = this.zoneManager.selectedZoneId;
      this.zoneManager.deleteSelectedZone();
      this.status(`Deleted zone #${zoneId}`);
      this.updateZoneUI();
      this.render();
    }
  }

  /**
   * Update selected zone properties from UI inputs
   */
  updateSelectedZoneFromInputs() {
    const zone = this.zoneManager?.getSelectedZone();
    if (!zone) {
      return;
    }

    // Prevent recursive updates
    if (this._updatingZoneUI) {
      return;
    }

    const newProps = {
      x: safeClamp(parseInt(this.elements.zoneX.value) || 0, 0, this.width - 1),
      y: safeClamp(
        parseInt(this.elements.zoneY.value) || 0,
        0,
        this.height - 1
      ),
      w: safeClamp(parseInt(this.elements.zoneW.value) || 1, 1, this.width),
      h: safeClamp(parseInt(this.elements.zoneH.value) || 1, 1, this.height),
      color: this.elements.zoneColor.value,
      cielingColorFront: this.elements.zoneCeilFront.value,
      cielingColorBack: this.elements.zoneCeilBack.value,
      floorColorBack: this.elements.zoneFloorBack.value,
    };

    this.zoneManager.updateZone(zone.id, newProps);
    this.render();
    this.updateZoneMiniPanel();
  }

  /**
   * Update zone UI based on current selection
   */
  updateZoneUI() {
    if (this.currentMode !== "zone" || !this.zoneManager) {
      return;
    }

    // Update layer panel
    this.updateZoneLayerPanel();

    const selectedZone = this.zoneManager.getSelectedZone();

    if (selectedZone) {
      this.elements.noZoneSelected.style.display = "none";
      this.elements.zoneEditor.style.display = "block";

      // Update UI with zone properties (prevent recursive updates)
      this._updatingZoneUI = true;
      this.elements.zoneId.textContent = selectedZone.id;
      this.elements.zoneX.value = selectedZone.x;
      this.elements.zoneY.value = selectedZone.y;
      this.elements.zoneW.value = selectedZone.w;
      this.elements.zoneH.value = selectedZone.h;
      this.elements.zoneColor.value = selectedZone.color;
      this.elements.zoneCeilFront.value = selectedZone.cielingColorFront;
      this.elements.zoneCeilBack.value = selectedZone.cielingColorBack;
      this.elements.zoneFloorBack.value = selectedZone.floorColorBack;
      this._updatingZoneUI = false;
    } else {
      this.elements.noZoneSelected.style.display = "block";
      this.elements.zoneEditor.style.display = "none";
    }
  }

  /**
   * Update the zone layer panel
   */
  updateZoneLayerPanel() {
    if (!this.zoneManager || this.currentMode !== "zone") {
      return;
    }

    const zoneDisplayInfo = this.zoneManager.getZoneDisplayInfo();
    this.elements.zoneLayerList.innerHTML = "";

    if (zoneDisplayInfo.length === 0) {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "zone-empty-message";
      emptyMessage.textContent = "No zones created";
      this.elements.zoneLayerList.appendChild(emptyMessage);
      return;
    }

    zoneDisplayInfo.forEach((zoneInfo, index) => {
      const item = document.createElement("div");
      item.className = `zone-layer-item ${zoneInfo.selected ? "selected" : ""}`;
      item.dataset.zoneId = zoneInfo.id;
      item.draggable = true;

      item.innerHTML = `
        <div class="zone-layer-color" style="background-color: ${
          zoneInfo.color
        }"></div>
        <div class="zone-layer-priority">${zoneInfo.priority}</div>
        <div class="zone-layer-info">${zoneInfo.name}</div>
        <div class="zone-layer-controls">
          <button class="zone-layer-btn" data-action="up" ${
            index === 0 ? "disabled" : ""
          }>↑</button>
          <button class="zone-layer-btn" data-action="down" ${
            index === zoneDisplayInfo.length - 1 ? "disabled" : ""
          }>↓</button>
        </div>
      `;

      // Add click handler for zone selection
      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("zone-layer-btn")) {
          const action = e.target.dataset.action;
          if (action === "up") {
            this.zoneManager.moveZoneUp(zoneInfo.id);
          } else if (action === "down") {
            this.zoneManager.moveZoneDown(zoneInfo.id);
          }
          this.updateZoneUI();
          this.render();
          e.stopPropagation();
        } else {
          this.zoneManager.selectZone(zoneInfo.id);
          this.updateZoneUI();
          this.render();
        }
      });

      // Add drag and drop handlers
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", zoneInfo.id.toString());
        item.classList.add("dragging");
        this.elements.zoneLayerList.classList.add("drag-active");
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        this.elements.zoneLayerList.classList.remove("drag-active");
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        const draggedZoneId = parseInt(e.dataTransfer.getData("text/plain"));
        const targetIndex = Array.from(
          this.elements.zoneLayerList.children
        ).indexOf(item);

        if (draggedZoneId !== zoneInfo.id) {
          this.zoneManager.moveZone(draggedZoneId, targetIndex);
          this.updateZoneUI();
          this.render();
        }
      });

      this.elements.zoneLayerList.appendChild(item);
    });
  }

  /**
   * Update the zone mini panel in tile mode
   */
  updateZoneMiniPanel() {
    if (this.currentMode === "zone" || !this.zoneManager) {
      this.elements.zoneMiniPanel.style.display = "none";
      return;
    }

    const zones = this.zoneManager.zones;
    if (zones.length === 0) {
      this.elements.zoneMiniPanel.style.display = "none";
      return;
    }

    this.elements.zoneMiniPanel.style.display = "block";
    this.elements.zoneMiniList.innerHTML = "";

    zones.forEach((zone) => {
      const item = document.createElement("div");
      item.className = "zone-mini-item";
      item.textContent = `#${zone.id}`;
      item.style.backgroundColor = zone.color;
      item.title = `Zone ${zone.id}: ${zone.x},${zone.y} (${zone.w}x${zone.h})`;
      this.elements.zoneMiniList.appendChild(item);
    });
  }

  /**
   * Update canvas cursor based on current mode and mouse position
   */
  updateCanvasCursor() {
    if (this.currentMode === "zone" && this.zoneRenderer) {
      // Get current mouse position if available
      const canvas = this.elements.canvas;
      // Default cursor for zone mode
      canvas.style.cursor = "crosshair";
    } else {
      this.elements.canvas.style.cursor = "default";
    }
  }

  status(message) {
    this.elements.statusEl.textContent = message;
  }

  render() {
    this.renderer.draw();

    // Draw zone overlays
    if (this.zoneRenderer) {
      const overlayMode = this.currentMode === "zone" ? "zone" : "tile";
      this.zoneRenderer.drawZones(overlayMode);
    }

    // Update layer panel if in zone mode
    if (this.currentMode === "zone") {
      this.updateZoneLayerPanel();
    }
  }
}
//#region Start Editor
new MapEditor();
//#endregion
