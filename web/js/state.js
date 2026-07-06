/**
 * State Management Module
 * Manages the flowchart Abstract Syntax Tree (AST), active procedure state,
 * node selection, and undo/redo/persistence actions.
 */

// Unique ID Generator for nodes
export function generateId() {
  return 'node_' + Math.random().toString(36).substring(2, 11);
}

// Initial default state structure
const DEFAULT_STATE = {
  activeScreen: "main",
  selectedNodeId: null,
  procedures: {
    main: {
      type: "main",
      name: "main",
      parameters: [],
      notes: [],
      body: [
        { id: "start-node", type: "start" },
        { id: "end-node", type: "end" }
      ]
    }
  }
};

// Global application state
export let appState = JSON.parse(JSON.stringify(DEFAULT_STATE));

// Subscribers list for state changes
const subscribers = [];

export function subscribe(callback) {
  subscribers.push(callback);
  return () => {
    const idx = subscribers.indexOf(callback);
    if (idx !== -1) subscribers.splice(idx, 1);
  };
}

export function notify(type = "structure") {
  for (const callback of subscribers) {
    callback(appState, type);
  }
}

/**
 * Creates a template node configuration with default parameters
 */
export function createNode(type) {
  const node = {
    id: generateId(),
    type: type
  };

  switch (type) {
    case "start":
    case "end":
    case "break":
    case "continue":
      break;
    case "return":
      node.expression = "";
      break;
    case "input":
      node.variable = "x";
      break;
    case "call":
      node.procedure = "mySubroutine";
      node.arguments = "";
      break;
    case "output":
      node.expression = '"Hello World"';
      node.newline = true;
      break;
    case "assignment":
      node.variable = "x";
      node.expression = "10";
      break;
    case "if":
      node.condition = "x > 5";
      node.trueBranch = [];
      node.falseBranch = [];
      break;
    case "while":
      node.condition = "x < 10";
      node.loopBody = [];
      break;
    case "do-while":
      node.condition = "x < 10";
      node.loopBody = [];
      break;
  }
  return node;
}

/**
 * Resolves a path string inside a procedure down to the array reference.
 * Paths are represented as dot-separated keys, e.g., "body.1.trueBranch".
 */
export function getArrayAtPath(procedure, pathString) {
  if (!pathString || pathString === "") {
    return procedure.body;
  }
  const parts = pathString.split(".");
  let current = procedure;
  
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      current = current[parseInt(part, 10)];
    } else {
      current = current[part];
    }
  }
  return current;
}

/**
 * Inserts a node of a specific type into a path at a given index
 */
export function insertNode(pathString, index, type) {
  const procedure = appState.procedures[appState.activeScreen];
  if (!procedure) return;

  const targetArray = getArrayAtPath(procedure, pathString);
  if (!Array.isArray(targetArray)) return;

  const newNode = createNode(type);
  targetArray.splice(index, 0, newNode);
  
  appState.selectedNodeId = newNode.id; // Auto-select the newly added node
  notify();
}

export function findNodeById(id) {
  const procedure = appState.procedures[appState.activeScreen];
  if (!procedure) return null;

  const node = findInList(procedure.body, id);
  if (node) return node;

  if (procedure.notes) {
    const note = procedure.notes.find(n => n.id === id);
    if (note) return note;
  }
  return null;
}

function findInList(list, id) {
  if (!Array.isArray(list)) return null;

  for (const node of list) {
    if (node.id === id) return node;
    
    // Check nested structures
    if (node.trueBranch) {
      const found = findInList(node.trueBranch, id);
      if (found) return found;
    }
    if (node.falseBranch) {
      const found = findInList(node.falseBranch, id);
      if (found) return found;
    }
    if (node.loopBody) {
      const found = findInList(node.loopBody, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Updates properties of the selected node
 */
export function updateNodeProperty(id, propertyName, value) {
  const node = findNodeById(id);
  if (!node) return;

  node[propertyName] = value;
  notify("edit");
}

export function deleteNode(id) {
  const procedure = appState.procedures[appState.activeScreen];
  if (!procedure) return;

  let deleted = deleteFromList(procedure.body, id);
  if (!deleted && procedure.notes) {
    const idx = procedure.notes.findIndex(n => n.id === id);
    if (idx !== -1) {
      procedure.notes.splice(idx, 1);
      deleted = true;
    }
  }

  if (deleted) {
    if (appState.selectedNodeId === id) {
      appState.selectedNodeId = null;
    }
    notify();
  }
}

function deleteFromList(list, id) {
  if (!Array.isArray(list)) return false;

  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (node.id === id) {
      // Do not allow deleting Start, End, or Return nodes
      if (node.type === "start" || node.type === "end" || node.type === "return") {
        return false;
      }
      list.splice(i, 1);
      return true;
    }

    if (node.trueBranch && deleteFromList(node.trueBranch, id)) return true;
    if (node.falseBranch && deleteFromList(node.falseBranch, id)) return true;
    if (node.loopBody && deleteFromList(node.loopBody, id)) return true;
  }
  return false;
}

/**
 * Adds a new subroutine procedure
 */
export function addProcedure(name) {
  const normalized = name.trim();
  if (!normalized || appState.procedures[normalized]) return false;

  appState.procedures[normalized] = {
    type: "procedure",
    name: normalized,
    parameters: [],
    notes: [],
    body: [
      { id: generateId(), type: "start" },
      { id: generateId(), type: "return" }
    ]
  };

  appState.activeScreen = normalized;
  appState.selectedNodeId = null;
  notify();
  return true;
}

/**
 * Deletes a procedure by name
 */
export function deleteProcedure(name) {
  if (name === "main") return false; // Main cannot be deleted
  if (!appState.procedures[name]) return false;

  delete appState.procedures[name];
  if (appState.activeScreen === name) {
    appState.activeScreen = "main";
  }
  appState.selectedNodeId = null;
  notify();
  return true;
}

/**
 * Resets the application state to the default
 */
export function clearState() {
  appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  notify();
}

/**
 * Imports state from a JSON string
 */
export function importState(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed.procedures || !parsed.procedures.main) {
      throw new Error("Invalid format: Missing main procedure.");
    }
    appState = parsed;
    if (!appState.activeScreen || !appState.procedures[appState.activeScreen]) {
      appState.activeScreen = "main";
    }
    appState.selectedNodeId = null;
    notify();
    return true;
  } catch (error) {
    console.error("Error importing state:", error);
    alert("Failed to import: Invalid JSON configuration.");
    return false;
  }
}

export function exportState() {
  return JSON.stringify(appState, null, 2);
}

/**
 * Safely renames a procedure throughout appState
 */
export function renameProcedure(oldName, newName) {
  const normalized = newName.trim();
  if (!normalized || oldName === "main" || oldName === normalized) return false;
  if (appState.procedures[normalized]) return false; // Duplicate check

  const proc = appState.procedures[oldName];
  proc.name = normalized;
  
  appState.procedures[normalized] = proc;
  delete appState.procedures[oldName];
  
  if (appState.activeScreen === oldName) {
    appState.activeScreen = normalized;
  }
  notify("structure");
  return true;
}

/**
 * Appends a new parameter to the active procedure
 */
export function addParameter(paramName = "param") {
  const activeProc = appState.procedures[appState.activeScreen];
  if (!activeProc) return;

  if (!activeProc.parameters) {
    activeProc.parameters = [];
  }

  let name = paramName.trim();
  let baseName = name;
  let counter = 1;
  while (activeProc.parameters.includes(name)) {
    name = `${baseName}_${counter}`;
    counter++;
  }

  activeProc.parameters.push(name);
  notify("structure");
}

/**
 * Deletes a parameter by index
 */
export function deleteParameter(index) {
  const activeProc = appState.procedures[appState.activeScreen];
  if (!activeProc || !activeProc.parameters) return;

  activeProc.parameters.splice(index, 1);
  notify("structure");
}

/**
 * Renames a parameter name by index
 */
export function updateParameter(index, newName) {
  const activeProc = appState.procedures[appState.activeScreen];
  if (!activeProc || !activeProc.parameters) return;

  activeProc.parameters[index] = newName.trim();
  notify("edit");
}

/**
 * Creates and appends a floating note in the current procedure screen
 */
export function addNote(x = 100, y = 100) {
  const procedure = appState.procedures[appState.activeScreen];
  if (!procedure) return;

  if (!procedure.notes) {
    procedure.notes = [];
  }

  const newNote = {
    id: generateId(),
    type: "note",
    text: "New note...",
    x: x,
    y: y,
    w: 160,
    h: 100
  };

  procedure.notes.push(newNote);
  appState.selectedNodeId = newNote.id;
  notify("structure");
}

