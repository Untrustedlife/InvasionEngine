/**
 * Undo/Redo Manager Class
 * Handles undo and redo operations for the map editor
 */

import { MAX_UNDO } from "./EditorConstants.js";

export class UndoRedoManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.editor = null;
  }

  /**
   * Set the editor reference (called after initialization)
   */
  setEditor(editor) {
    this.editor = editor;
  }

  /**
   * Push changes to the undo stack
   * @param {Array} changeList - Array of change objects with {x, y, prev, next}
   * @param {Array} currentMapState - Current map state (for full map operations)
   */
  pushUndo(changeList, currentMapState) {
    if (!changeList || !changeList.length) {
      //For full map operations, create a snapshot
      if (currentMapState && this.editor) {
        const mapSnapshot = {
          type: "full",
          width: this.editor.width,
          height: this.editor.height,
          map: currentMapState.map((row) => [...row]),
        };
        this.undoStack.push(mapSnapshot);
      }
    } else {
      //For stroke changes
      this.undoStack.push({
        type: "stroke",
        changes: [...changeList],
      });
    }

    //Limit undo stack size to prevent memory issues
    if (this.undoStack.length > MAX_UNDO) {
      this.undoStack.shift();
    }

    //Clear redo stack when new action is performed
    this.redoStack.length = 0;
  }

  /**
   * Undo the last operation
   */
  undo() {
    if (!this.undoStack.length || !this.editor) {
      return;
    }

    const undoOperation = this.undoStack.pop();

    if (undoOperation.type === "stroke") {
      //Create redo entry by reversing the change direction
      const redoChanges = undoOperation.changes.map((changeRecord) => ({
        x: changeRecord.x,
        y: changeRecord.y,
        prev: changeRecord.next,
        next: changeRecord.prev,
      }));
      this.redoStack.push({
        type: "stroke",
        changes: redoChanges,
      });

      //Apply undo changes to restore previous tile values
      for (const changeRecord of undoOperation.changes) {
        this.editor.map[changeRecord.y][changeRecord.x] = changeRecord.prev;
      }
    } else if (undoOperation.type === "full") {
      //Create redo entry with current state
      const redoSnapshot = {
        type: "full",
        width: this.editor.width,
        height: this.editor.height,
        map: this.editor.map.map((mapRow) => [...mapRow]),
      };
      this.redoStack.push(redoSnapshot);

      //Restore previous state from the undo operation
      this.editor.width = undoOperation.width;
      this.editor.height = undoOperation.height;
      this.editor.map = undoOperation.map.map((mapRow) => [...mapRow]);

      //Update UI inputs to reflect restored dimensions
      this.editor.elements.wInput.value = String(this.editor.width);
      this.editor.elements.hInput.value = String(this.editor.height);
    }

    this.editor.render();
  }

  /**
   * Redo the last undone operation
   */
  redo() {
    if (!this.redoStack.length || !this.editor) {
      return;
    }

    const redoOperation = this.redoStack.pop();

    if (redoOperation.type === "stroke") {
      //Create undo entry by reversing the change direction
      const undoChanges = redoOperation.changes.map((changeRecord) => ({
        x: changeRecord.x,
        y: changeRecord.y,
        prev: changeRecord.next,
        next: changeRecord.prev,
      }));
      this.undoStack.push({
        type: "stroke",
        changes: undoChanges,
      });

      //Apply redo changes to restore the undone changes
      for (const changeRecord of redoOperation.changes) {
        this.editor.map[changeRecord.y][changeRecord.x] = changeRecord.next;
      }
    } else if (redoOperation.type === "full") {
      //Create undo entry with current state
      const undoSnapshot = {
        type: "full",
        width: this.editor.width,
        height: this.editor.height,
        map: this.editor.map.map((mapRow) => [...mapRow]),
      };
      this.undoStack.push(undoSnapshot);

      //Restore redo state from the redo operation
      this.editor.width = redoOperation.width;
      this.editor.height = redoOperation.height;
      this.editor.map = redoOperation.map.map((mapRow) => [...mapRow]);

      //Update UI inputs to reflect restored dimensions
      this.editor.elements.wInput.value = String(this.editor.width);
      this.editor.elements.hInput.value = String(this.editor.height);
    }

    this.editor.render();
  }

  /**
   * Clear both undo and redo stacks
   */
  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
