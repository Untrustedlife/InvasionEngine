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

    //Components
    this.renderer = null;
    this.undoManager = null;
    this.tileManager = null;
    this.exportImport = null;

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
      const currentTileId = this.map[cellCoordinates.y][cellCoordinates.x];
      this.status(
        `(x:${cellCoordinates.x}, y:${cellCoordinates.y}) id:${currentTileId}`
      );
    }

    if (this.painting && isWithinMapBounds) {
      this.paintCell(cellCoordinates.x, cellCoordinates.y, this.activeId);
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

  endStroke() {
    if (this.painting) {
      this.painting = false;
      this.undoManager.pushUndo(this.strokeChanges, this.map);
      this.strokeChanges = null;
    }
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

  status(message) {
    this.elements.statusEl.textContent = message;
  }

  render() {
    this.renderer.draw();
  }
}
//#region Start Editor
new MapEditor();
//#endregion
