/**
 * Export/Import Manager Class
 * Handles exporting and importing map data in various formats
 */

import { SAMPLE_MAP, SPECIAL_TILES } from "./EditorConstants.js";
import { createMap, constify, showToast, safeClamp } from "./EditorUtils.js";

export class ExportImport {
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * Export JavaScript code in the new map format with name, mapLayout, exitPos, and startPos
   */
  exportJS() {
    const mapDisplayName =
      this.editor.elements.mapNameInput?.value || "Untitled";

    //--- scan for special tiles ---
    let playerStartPosition = null;
    let exitPosition = null;

    for (let r = 0; r < this.editor.height; r++) {
      for (let c = 0; c < this.editor.width; c++) {
        const id = this.editor.map[r][c];
        if (id === SPECIAL_TILES.PLAYER_START) {
          playerStartPosition = { x: c + 0.5, y: r + 0.5 };
        } else if (id === SPECIAL_TILES.PLAYER_EXIT) {
          exitPosition = { x: c, y: r };
        }
      }
    }

    //(remove special tiles)
    const cleanedMap = this.editor.map.map((row) =>
      row.map((id) =>
        id === SPECIAL_TILES.PLAYER_START || id === SPECIAL_TILES.PLAYER_EXIT
          ? 0
          : id
      )
    );

    //--- sensible defaults if not found ---
    if (!playerStartPosition) {
      playerStartPosition = { x: 3.5, y: 3.5 };
    }
    if (!exitPosition) {
      exitPosition = { x: 10, y: 8 };
    }

    //--- zones ---
    const zones = this.editor.zoneManager
      ? this.editor.zoneManager.exportZones()
      : [];

    const normalizedZones = zones.map((z) => ({
      x: z.x ?? 0,
      y: z.y ?? 0,
      w: z.w ?? 0,
      h: z.h ?? 0,
      color: z.color ?? "#101b2e",
      name: z.name ?? undefined,
      cielingColorFront: z.cielingColorFront ?? undefined,
      cielingColorBack: z.cielingColorBack ?? undefined,
      ceilingHeight: z.ceilingHeight ?? undefined,
      floorColorBack: z.floorColorBack ?? undefined,
      fogColor: z.fogColor ?? undefined,
      spawnRules: Array.isArray(z.spawnRules) ? z.spawnRules : [],
      floorDepth: z.floorDepth ?? undefined,
    }));

    const payload = {
      name: mapDisplayName,
      mapLayout: cleanedMap,
      exitPos: exitPosition,
      startPos: playerStartPosition,
      ...(normalizedZones.length ? { zones: normalizedZones } : {}),
    };

    //Add global map properties conditionally (only if different from defaults)
    const defaultGlobalProps = {
      dontSpawnKey: false,
      floorColorFront: "#054213",
      cielingColorFront: "#6495ed",
      cielingColorBack: "#6495ED",
      floorColorBack: "#03210A",
    };

    const globalProps = this.editor.globalMapProperties;
    if (globalProps.dontSpawnKey !== defaultGlobalProps.dontSpawnKey) {
      payload.dontSpawnKey = globalProps.dontSpawnKey;
    }
    if (globalProps.floorColorFront !== defaultGlobalProps.floorColorFront) {
      payload.floorColorFront = globalProps.floorColorFront;
    }
    if (
      globalProps.cielingColorFront !== defaultGlobalProps.cielingColorFront
    ) {
      payload.cielingColorFront = globalProps.cielingColorFront;
    }
    if (globalProps.cielingColorBack !== defaultGlobalProps.cielingColorBack) {
      payload.cielingColorBack = globalProps.cielingColorBack;
    }
    if (globalProps.floorColorBack !== defaultGlobalProps.floorColorBack) {
      payload.floorColorBack = globalProps.floorColorBack;
    }

    const js = `${JSON.stringify(payload, null, 2)};\n`;

    this.editor.elements.io.value = js;
  }

  /**
   * Copy JavaScript to clipboard
   */
  async copyJS() {
    if (!this.editor.elements.io.value) {
      this.exportJS();
    }

    try {
      await navigator.clipboard.writeText(this.editor.elements.io.value);
      showToast("Copied");
    } catch {
      alert("Copy failed");
    }
  }

  /**
   * Download JavaScript file
   */
  downloadJS() {
    if (!this.editor.elements.io.value) {
      this.exportJS();
    }

    const blob = new Blob([this.editor.elements.io.value], {
      type: "text/javascript",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "map.js";
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Download JSON file
   */
  downloadJSON() {
    const data = {
      width: this.editor.width,
      height: this.editor.height,
      tiles: this.editor.tileManager.getSortedTiles(),
      map: this.editor.map,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "map.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Load map from text input (JSON object only)
   */
  loadFromText() {
    const text = this.editor.elements.io.value.trim();
    if (!text) {
      alert("Paste a JSON object first.");
      return;
    }

    //Try to parse as JavaScript object directly
    try {
      const obj = new Function(`return (${text})`)();

      //Check if it's the new format with mapLayout
      if (
        obj &&
        obj.mapLayout &&
        Array.isArray(obj.mapLayout) &&
        Array.isArray(obj.mapLayout[0])
      ) {
        this.applyLoadedObject(obj);
        return;
      }
    } catch (e) {
      console.warn("Object parse failed", e);
    }

    alert("Could not parse. Paste a valid JavaScript object with mapLayout.");
  }

  /**
   * Load sample map only (preserve current tiles)
   */
  loadSampleMapOnly() {
    const sample = SAMPLE_MAP;
    this.applyLoaded(sample, this.editor.tileManager.tiles);
  }

  /**
   * Apply loaded map data from new format object with mapLayout, exitPos, startPos, name
   */
  applyLoadedObject(mapDataObject) {
    if (
      !mapDataObject ||
      !mapDataObject.mapLayout ||
      !Array.isArray(mapDataObject.mapLayout) ||
      !Array.isArray(mapDataObject.mapLayout[0])
    ) {
      alert("Invalid map data - missing or invalid mapLayout");
      return;
    }

    const importedMapLayout = mapDataObject.mapLayout;

    //Update editor dimensions to match imported map
    this.editor.height = importedMapLayout.length;
    this.editor.width = importedMapLayout[0].length;

    //Create new map array and populate with imported data
    this.editor.map = createMap(this.editor.width, this.editor.height, 0);
    for (let mapRowIndex = 0; mapRowIndex < this.editor.height; mapRowIndex++) {
      for (
        let mapColumnIndex = 0;
        mapColumnIndex < this.editor.width;
        mapColumnIndex++
      ) {
        this.editor.map[mapRowIndex][mapColumnIndex] = safeClamp(
          importedMapLayout[mapRowIndex][mapColumnIndex],
          0,
          255
        );
      }
    }

    //Place player start marker if position data exists
    if (
      mapDataObject.startPos &&
      typeof mapDataObject.startPos.x === "number" &&
      typeof mapDataObject.startPos.y === "number"
    ) {
      const playerStartX = mapDataObject.startPos.x | 0;
      const playerStartY = mapDataObject.startPos.y | 0;
      if (
        playerStartX >= 0 &&
        playerStartX < this.editor.width &&
        playerStartY >= 0 &&
        playerStartY < this.editor.height
      ) {
        this.editor.map[playerStartY][playerStartX] =
          SPECIAL_TILES.PLAYER_START;
      }
    }

    //Place exit marker if position data exists
    if (
      mapDataObject.exitPos &&
      typeof mapDataObject.exitPos.x === "number" &&
      typeof mapDataObject.exitPos.y === "number"
    ) {
      const exitPositionX = mapDataObject.exitPos.x;
      const exitPositionY = mapDataObject.exitPos.y;
      if (
        exitPositionX >= 0 &&
        exitPositionX < this.editor.width &&
        exitPositionY >= 0 &&
        exitPositionY < this.editor.height
      ) {
        this.editor.map[exitPositionY][exitPositionX] =
          SPECIAL_TILES.PLAYER_EXIT;
      }
    }

    //Update UI input fields to reflect new dimensions
    this.editor.elements.wInput.value = String(this.editor.width);
    this.editor.elements.hInput.value = String(this.editor.height);

    //Update map name field if provided
    if (mapDataObject.name && this.editor.elements.mapNameInput) {
      this.editor.elements.mapNameInput.value = mapDataObject.name;
    }

    //Import tile definitions if provided
    if (mapDataObject.tiles && Array.isArray(mapDataObject.tiles)) {
      this.editor.tileManager.updateTiles(mapDataObject.tiles);
    }

    //Import zones if provided and zone manager exists
    if (
      mapDataObject.zones &&
      Array.isArray(mapDataObject.zones) &&
      this.editor.zoneManager
    ) {
      this.editor.zoneManager.importZones(mapDataObject.zones);
    }

    //Import global map properties if provided
    if (this.editor.globalMapProperties) {
      //Set defaults
      const defaultGlobalProps = {
        dontSpawnKey: false,
        floorColorFront: "#054213",
        cielingColorFront: "#6495ed",
        cielingColorBack: "#6495ED",
        floorColorBack: "#03210A",
      };

      //Update properties from imported data
      this.editor.globalMapProperties = {
        dontSpawnKey:
          mapDataObject.dontSpawnKey !== undefined
            ? mapDataObject.dontSpawnKey
            : defaultGlobalProps.dontSpawnKey,
        floorColorFront:
          mapDataObject.floorColorFront || defaultGlobalProps.floorColorFront,
        cielingColorFront:
          mapDataObject.cielingColorFront ||
          defaultGlobalProps.cielingColorFront,
        cielingColorBack:
          mapDataObject.cielingColorBack || defaultGlobalProps.cielingColorBack,
        floorColorBack:
          mapDataObject.floorColorBack || defaultGlobalProps.floorColorBack,
      };

      //Update UI elements to reflect imported values
      if (this.editor.elements.dontSpawnKey) {
        this.editor.elements.dontSpawnKey.checked =
          this.editor.globalMapProperties.dontSpawnKey;
      }
      if (this.editor.elements.floorColorFront) {
        this.editor.elements.floorColorFront.value =
          this.editor.globalMapProperties.floorColorFront;
      }
      if (this.editor.elements.cielingColorFront) {
        this.editor.elements.cielingColorFront.value =
          this.editor.globalMapProperties.cielingColorFront;
      }
      if (this.editor.elements.cielingColorBack) {
        this.editor.elements.cielingColorBack.value =
          this.editor.globalMapProperties.cielingColorBack;
      }
      if (this.editor.elements.floorColorBack) {
        this.editor.elements.floorColorBack.value =
          this.editor.globalMapProperties.floorColorBack;
      }
    }

    //Re-render the editor with imported data
    this.editor.render();
    showToast("Loaded");
  }

  /**
   * Apply loaded map data
   */
  applyLoaded(importedMapData, importedTileData) {
    if (
      !importedMapData ||
      !Array.isArray(importedMapData) ||
      !Array.isArray(importedMapData[0])
    ) {
      alert("Invalid map data");
      return;
    }

    //Update map dimensions
    this.editor.height = importedMapData.length;
    this.editor.width = importedMapData[0].length;

    //Create new map with loaded data
    this.editor.map = createMap(this.editor.width, this.editor.height, 0);
    for (let rowIndex = 0; rowIndex < this.editor.height; rowIndex++) {
      for (
        let columnIndex = 0;
        columnIndex < this.editor.width;
        columnIndex++
      ) {
        this.editor.map[rowIndex][columnIndex] = safeClamp(
          importedMapData[rowIndex][columnIndex],
          0,
          255
        );
      }
    }

    //Update UI inputs
    this.editor.elements.wInput.value = String(this.editor.width);
    this.editor.elements.hInput.value = String(this.editor.height);

    //Update tiles if provided
    if (importedTileData && Array.isArray(importedTileData)) {
      this.editor.tileManager.updateTiles(importedTileData);
    }

    //Re-render
    this.editor.render();
    showToast("Loaded");
  }
}
