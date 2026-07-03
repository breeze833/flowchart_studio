/**
 * App Module - Main Application Coordinator
 * Handles event delegation, zoom and pan, toolbar actions, modals, and synchronizing state to UI.
 */

import {
  appState,
  subscribe,
  insertNode,
  deleteNode,
  updateNodeProperty,
  addProcedure,
  deleteProcedure,
  clearState,
  importState,
  exportState,
  findNodeById,
  renameProcedure,
  addParameter,
  deleteParameter,
  updateParameter,
  addNote
} from './state.js';

import {
  calculateSequenceLayout,
  arrangeSequence,
  renderSequenceSVG,
  renderNotesSVG
} from './layout.js';

import { JSExpressionEvaluator } from './evaluator.js';
import { FlowchartInterpreter } from './interpreter.js';

// DOM References
const svg = document.getElementById("flowchart-svg");
const contentGroup = document.getElementById("flowchart-content");
const tabsContainer = document.getElementById("procedure-tabs");
const addProcBtn = document.getElementById("add-proc-btn");
const importBtn = document.getElementById("import-btn");
const exportBtn = document.getElementById("export-btn");
const exportPdfBtn = document.getElementById("export-pdf-btn");
const exportSvgBtn = document.getElementById("export-svg-btn");
const clearBtn = document.getElementById("clear-btn");
const fileInput = document.getElementById("file-input");
const inspectorContent = document.getElementById("inspector-content");
const contextMenu = document.getElementById("context-menu");

// Zoom / Pan Controls
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomFitBtn = document.getElementById("zoom-fit-btn");
const zoomIndicator = document.getElementById("zoom-indicator");

// Helper to escape HTML inside inspector inputs
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Modal References
const modalContainer = document.getElementById("modal-container");
const modalCloseBtn = document.getElementById("modal-close-btn");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const newProcedureForm = document.getElementById("new-procedure-form");
const procedureNameInput = document.getElementById("procedure-name-input");

// Zoom / Pan State
let zoom = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

// Note Drag / Resize State
let activeDraggingNoteId = null;
let activeResizingNoteId = null;
let initialMouseX = 0;
let initialMouseY = 0;
let initialNoteX = 0;
let initialNoteY = 0;
let initialNoteW = 0;
let initialNoteH = 0;

// Context Menu Insertion State
let activePath = "";
let activeIndex = 0;

// Execution Runner State
const evaluator = new JSExpressionEvaluator();
let interpreter = null;
let generator = null;
let autoRunTimer = null;
let currentHighlightedNodeId = null;
let isStepMode = false;
let isWaitingForInput = false;
let lastLineEndedWithNewline = true;

// DOM References for Sidebar Tabs and Panes
const sidebarTabProperties = document.getElementById("sidebar-tab-properties");
const sidebarTabTerminal = document.getElementById("sidebar-tab-terminal");
const propertiesPane = document.getElementById("properties-pane");
const terminalPane = document.getElementById("terminal-pane");
const consoleOutput = document.getElementById("console-output");

/* --- Flowchart Execution Controller --- */

function switchSidebarPane(activePaneName) {
  if (activePaneName === "properties") {
    sidebarTabProperties.classList.add("active");
    sidebarTabTerminal.classList.remove("active");
    propertiesPane.classList.add("active");
    terminalPane.classList.remove("active");
  } else if (activePaneName === "terminal") {
    sidebarTabProperties.classList.remove("active");
    sidebarTabTerminal.classList.add("active");
    propertiesPane.classList.remove("active");
    terminalPane.classList.add("active");
  }
}

function logToConsole(text, type = "system", newline = true) {
  // Replace tabs with 8 spaces
  let formattedText = String(text).replace(/\t/g, "        ");
  
  // Split by newlines to respect \n
  const parts = formattedText.split("\n");
  
  for (let i = 0; i < parts.length; i++) {
    const isLastPart = (i === parts.length - 1);
    const partText = parts[i];
    
    // For intermediate parts, they must end with a newline.
    // For the last part, it respects the passed 'newline' argument.
    const partNewline = isLastPart ? newline : true;
    
    if (!lastLineEndedWithNewline && 
        consoleOutput.lastChild && 
        consoleOutput.lastChild.nodeType === Node.ELEMENT_NODE &&
        consoleOutput.lastChild.classList.contains(`${type}-line`)) {
      consoleOutput.lastChild.textContent += partText;
    } else {
      const line = document.createElement("div");
      line.className = `console-line ${type}-line`;
      line.textContent = partText;
      consoleOutput.appendChild(line);
    }
    
    lastLineEndedWithNewline = partNewline;
  }
  
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function clearHighlight() {
  if (currentHighlightedNodeId) {
    const el = document.querySelector(`.node-group[data-id="${currentHighlightedNodeId}"]`);
    if (el) {
      el.classList.remove("executing");
      el.classList.remove("executing-error");
    }
    currentHighlightedNodeId = null;
  }
}

function highlightNode(nodeId) {
  clearHighlight();
  currentHighlightedNodeId = nodeId;
  const el = document.querySelector(`.node-group[data-id="${nodeId}"]`);
  if (el) {
    el.classList.add("executing");
  }
}

function highlightErrorNode(nodeId) {
  clearHighlight();
  currentHighlightedNodeId = nodeId;
  const el = document.querySelector(`.node-group[data-id="${nodeId}"]`);
  if (el) {
    el.classList.add("executing-error");
  }
}

function updateControls() {
  const runBtn = document.getElementById("run-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const stepBtn = document.getElementById("step-btn");
  const stopBtn = document.getElementById("stop-btn");
  const isInputWaiting = isWaitingForInput;

  const prevHTML = runBtn.innerHTML;

  if (!interpreter || !interpreter.isRunning) {
    runBtn.disabled = false;
    runBtn.innerHTML = '<i data-lucide="play"></i> Run';
    pauseBtn.disabled = true;
    stepBtn.disabled = false;
    stopBtn.disabled = true;
  } else if (isInputWaiting) {
    runBtn.disabled = true;
    pauseBtn.disabled = true;
    stepBtn.disabled = true;
    stopBtn.disabled = false;
  } else if (isStepMode) {
    runBtn.disabled = false;
    runBtn.innerHTML = '<i data-lucide="play"></i> Resume';
    pauseBtn.disabled = true;
    stepBtn.disabled = false;
    stopBtn.disabled = false;
  } else {
    runBtn.disabled = true;
    pauseBtn.disabled = false;
    stepBtn.disabled = true;
    stopBtn.disabled = false;
  }

  if (runBtn.innerHTML !== prevHTML && window.lucide) {
    window.lucide.createIcons({ node: runBtn });
  }
}

function pauseAutoRunTimer() {
  if (autoRunTimer) {
    clearTimeout(autoRunTimer);
    autoRunTimer = null;
  }
}

function stopExecution() {
  pauseAutoRunTimer();
  if (interpreter) {
    interpreter.isRunning = false;
  }
  interpreter = null;
  generator = null;
  clearHighlight();
  isWaitingForInput = false;

  // Disable any active inline inputs
  document.querySelectorAll(".inline-console-input").forEach(input => {
    input.disabled = true;
    input.placeholder = "Execution stopped";
  });

  updateControls();
}

function pauseExecution() {
  pauseAutoRunTimer();
  isStepMode = true;
  logToConsole("Execution paused.", "system");
  updateControls();
}

function startExecution() {
  if (!interpreter || !interpreter.isRunning) {
    interpreter = new FlowchartInterpreter(appState.procedures, evaluator);
    generator = interpreter.start();
    lastLineEndedWithNewline = true;
    logToConsole("Program execution started.", "system");

    switchSidebarPane("terminal");
  }

  isStepMode = false;
  runStep();
}

function scheduleNextStep() {
  if (isStepMode) {
    updateControls();
    return;
  }

  const speedSlider = document.getElementById("speed-slider");
  const delay = parseInt(speedSlider.value, 10);

  pauseAutoRunTimer();
  autoRunTimer = setTimeout(() => {
    runStep();
  }, delay);

  updateControls();
}

async function runStep(inputValue = undefined) {
  if (!interpreter || !interpreter.isRunning) return;

  try {
    let result;
    if (inputValue !== undefined) {
      result = generator.next(inputValue);
    } else {
      result = generator.next();
    }

    if (result.done) {
      logToConsole("Program execution finished.", "system");
      stopExecution();
      return;
    }

    const action = result.value;
    if (!action) {
      scheduleNextStep();
      return;
    }

    // Sync screen if step is in a different subroutine
    const frame = interpreter.getCurrentFrame();
    if (frame && frame.procedureName !== appState.activeScreen) {
      appState.activeScreen = frame.procedureName;
      render(appState, "structure");
    }

    switch (action.type) {
      case "HIGHLIGHT":
        highlightNode(action.nodeId);
        scheduleNextStep();
        break;

      case "OUTPUT":
        let outText;
        if (typeof action.value === "object" && action.value !== null) {
          outText = JSON.stringify(action.value);
        } else {
          outText = String(action.value !== undefined ? action.value : "");
        }
        logToConsole(outText, "output", action.newline !== false);
        scheduleNextStep();
        break;

      case "INPUT":
        highlightNode(action.nodeId);
        pauseAutoRunTimer();
        showTerminalInput(action.variable);
        break;

      case "END":
        logToConsole("Program terminated at End block.", "system");
        stopExecution();
        break;

      case "ERROR":
        highlightErrorNode(action.nodeId);
        logToConsole(`Runtime Error: ${action.error}`, "error");
        stopExecution();
        break;

      default:
        scheduleNextStep();
    }
  } catch (err) {
    logToConsole(`Execution terminated due to unexpected error: ${err.message}`, "error");
    stopExecution();
  }
}

function showTerminalInput(varName) {
  switchSidebarPane("terminal");
  isWaitingForInput = true;

  // Create inline input container line
  const inputPromptLine = document.createElement("div");
  inputPromptLine.className = "console-line input-prompt-line";

  const promptSpan = document.createElement("span");
  promptSpan.className = "inline-prompt";
  promptSpan.textContent = `${varName} = `;

  const inlineInput = document.createElement("input");
  inlineInput.type = "text";
  inlineInput.className = "inline-console-input";
  inlineInput.autocomplete = "off";

  inputPromptLine.appendChild(promptSpan);
  inputPromptLine.appendChild(inlineInput);

  consoleOutput.appendChild(inputPromptLine);
  
  // Smooth scroll to bottom
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
  
  // Focus the input
  inlineInput.focus();

  inlineInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const val = inlineInput.value;
      
      // Replace input element with static value text
      const valSpan = document.createElement("span");
      valSpan.className = "inline-value";
      valSpan.textContent = val;
      
      inputPromptLine.removeChild(inlineInput);
      inputPromptLine.appendChild(valSpan);
      
      isWaitingForInput = false;
      
      // Resume interpreter step
      runStep(val);
    }
  });

  updateControls();
}

/**
 * Initialize Event Listeners
 */
function init() {
  // 1. Zoom and Pan Handlers
  svg.addEventListener("wheel", handleWheel, { passive: false });
  svg.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
  window.addEventListener("resize", handleResize);

  // 2. Zoom Button Handlers
  zoomInBtn.addEventListener("click", () => triggerZoom(1.2));
  zoomOutBtn.addEventListener("click", () => triggerZoom(1 / 1.2));
  zoomFitBtn.addEventListener("click", zoomToFit);

  // 3. Tab Switching Delegation
  tabsContainer.addEventListener("click", handleTabClick);

  // 4. Global SVG Click Delegation (Nodes and Hitzones)
  svg.addEventListener("click", handleSvgClick);

  // 5. Context Menu Action Handlers
  contextMenu.addEventListener("click", handleContextMenuClick);
  document.addEventListener("click", handleDocumentClick);

  // 6. Modal Procedure Handlers
  addProcBtn.addEventListener("click", showModal);
  modalCloseBtn.addEventListener("click", hideModal);
  modalCancelBtn.addEventListener("click", hideModal);
  newProcedureForm.addEventListener("submit", handleNewProcedure);

  // 7. File Operations and Note Button
  const addNoteBtn = document.getElementById("add-note-btn");
  if (addNoteBtn) {
    addNoteBtn.addEventListener("click", () => {
      // Place the note near viewport top-left
      addNote(60, 60);
    });
  }
  exportBtn.addEventListener("click", handleExport);
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", handleExportPDF);
  }
  if (exportSvgBtn) {
    exportSvgBtn.addEventListener("click", handleExportSVG);
  }
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleImport);
  clearBtn.addEventListener("click", handleClear);

  // Dropdown Toggling Behavior
  const fileDropdownBtn = document.getElementById("file-dropdown-btn");
  const fileDropdown = fileDropdownBtn ? fileDropdownBtn.closest(".dropdown") : null;
  if (fileDropdownBtn && fileDropdown) {
    fileDropdownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileDropdown.classList.toggle("open");
    });

    // Close dropdown on clicking outside
    document.addEventListener("click", (e) => {
      if (!fileDropdown.contains(e.target)) {
        fileDropdown.classList.remove("open");
      }
    });

    // Close dropdown when selecting any menu item
    const dropdownMenu = document.getElementById("file-dropdown-menu");
    if (dropdownMenu) {
      dropdownMenu.addEventListener("click", () => {
        fileDropdown.classList.remove("open");
      });
    }
  }

  // 8. Sidebar Tab Event Listeners
  sidebarTabProperties.addEventListener("click", () => {
    switchSidebarPane("properties");
  });
  sidebarTabTerminal.addEventListener("click", () => {
    switchSidebarPane("terminal");
  });
  
  document.getElementById("run-btn").addEventListener("click", startExecution);
  
  document.getElementById("pause-btn").addEventListener("click", pauseExecution);
  
  document.getElementById("step-btn").addEventListener("click", () => {
    isStepMode = true;
    if (!interpreter || !interpreter.isRunning) {
      interpreter = new FlowchartInterpreter(appState.procedures, evaluator);
      generator = interpreter.start();
      logToConsole("Program execution started (stepping).", "system");
      switchSidebarPane("terminal");
    }
    runStep();
  });
  
  document.getElementById("stop-btn").addEventListener("click", () => {
    logToConsole("Program execution stopped.", "system");
    stopExecution();
  });
  
  document.getElementById("clear-console-btn").addEventListener("click", () => {
    consoleOutput.innerHTML = '<div class="console-line system-line">Flowchart Studio Terminal. Press "Run" to execute diagram.</div>';
    lastLineEndedWithNewline = true;
  });
  
  const speedSlider = document.getElementById("speed-slider");
  const speedVal = document.querySelector(".speed-val");
  speedSlider.addEventListener("input", () => {
    speedVal.textContent = `${speedSlider.value}ms`;
  });
  


  // 9. Sidebar Legend Toggle Event Listener
  const legendPanel = document.getElementById("sidebar-legend-panel");
  const toggleLegendBtn = document.getElementById("toggle-legend-btn");
  if (legendPanel && toggleLegendBtn) {
    toggleLegendBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent bubbling
      legendPanel.classList.toggle("collapsed");
    });
  }

  // 10. Sidebar Resize Drag Listener
  const resizer = document.getElementById("sidebar-resizer");
  let isResizing = false;

  if (resizer) {
    resizer.addEventListener("mousedown", (e) => {
      isResizing = true;
      document.body.classList.add("is-resizing");
      resizer.classList.add("is-resizing");
      e.preventDefault(); // Disable text selection during drag
    });

    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      
      const minW = 260;
      const maxW = Math.min(600, window.innerWidth * 0.5);
      const newWidth = Math.max(minW, Math.min(maxW, e.clientX));
      
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
      
      // Update SVG viewBox dynamically so layout updates size seamlessly
      updateViewBox();
    });

    window.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        document.body.classList.remove("is-resizing");
        resizer.classList.remove("is-resizing");
      }
    });
  }

  // Initialize Lucide Icons
  lucide.createIcons();

  // Draw initial flowchart
  render(appState, "structure");
  setTimeout(zoomToFit, 100);
}

/**
 * Rendering Cycles
 */

// Full update cycle: redraws tabs, layout, SVG, and properties inspector
function render(state, changeType = "structure") {
  renderTabs();
  
  if (changeType === "structure") {
    refreshSVGOnly();
    renderInspector();
  } else if (changeType === "edit") {
    refreshSVGOnly();
  }
}

// Lightweight update cycle: updates only SVG canvas positioning and content
function refreshSVGOnly() {
  const activeProc = appState.procedures[appState.activeScreen];
  if (!activeProc) return;

  // Calculate layout coordinates bottom-up and top-down
  const rootLayout = calculateSequenceLayout(activeProc.body, "body");
  arrangeSequence(rootLayout, 0, 0);

  // Render SVG elements
  const svgMarkup = renderSequenceSVG(rootLayout, appState.selectedNodeId);
  const notesMarkup = renderNotesSVG(activeProc.notes || [], appState.selectedNodeId);
  contentGroup.innerHTML = svgMarkup + notesMarkup;

  // Sync SVG Viewbox bounds
  updateViewBox();

  // Re-apply execution highlight if interpreter is running
  if (interpreter && interpreter.isRunning && currentHighlightedNodeId) {
    const el = document.querySelector(`.node-group[data-id="${currentHighlightedNodeId}"]`);
    if (el) {
      el.classList.add("executing");
    }
  }
}

/**
 * Zoom and Pan Methods
 */
function updateViewBox() {
  const rect = svg.getBoundingClientRect();
  const w = rect.width || 800;
  const h = rect.height || 600;

  const viewBoxW = w / zoom;
  const viewBoxH = h / zoom;

  svg.setAttribute("viewBox", `${panX} ${panY} ${viewBoxW} ${viewBoxH}`);
  zoomIndicator.innerText = `${Math.round(zoom * 100)}%`;
}

function handleWheel(e) {
  e.preventDefault();
  const rect = svg.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const zoomFactor = 1.15;
  const zoomOld = zoom;

  if (e.deltaY < 0) {
    zoom = Math.min(zoom * zoomFactor, 4.0);
  } else {
    zoom = Math.max(zoom / zoomFactor, 0.25);
  }

  panX = panX + mx * (1 / zoomOld - 1 / zoom);
  panY = panY + my * (1 / zoomOld - 1 / zoom);

  updateViewBox();
}

function handleMouseDown(e) {
  // 1. Check if clicked a note drag handle
  const dragHandle = e.target.closest(".note-drag-handle");
  if (dragHandle) {
    e.stopPropagation();
    const noteGroup = dragHandle.closest(".note-group");
    const id = noteGroup.dataset.id;
    const note = findNodeById(id);
    if (note) {
      activeDraggingNoteId = id;
      initialMouseX = e.clientX;
      initialMouseY = e.clientY;
      initialNoteX = note.x;
      initialNoteY = note.y;
      appState.selectedNodeId = id;
      render(appState, "structure"); // select and show in inspector
    }
    return;
  }

  // 2. Check if clicked a note resize handle
  const resizeHandle = e.target.closest(".note-resize-handle");
  if (resizeHandle) {
    e.stopPropagation();
    const noteGroup = resizeHandle.closest(".note-group");
    const id = noteGroup.dataset.id;
    const note = findNodeById(id);
    if (note) {
      activeResizingNoteId = id;
      initialMouseX = e.clientX;
      initialMouseY = e.clientY;
      initialNoteW = note.w;
      initialNoteH = note.h;
      appState.selectedNodeId = id;
      render(appState, "structure");
    }
    return;
  }

  // 3. Check if clicked a note body itself (to select it)
  const noteGroup = e.target.closest(".note-group[data-type='note']");
  if (noteGroup) {
    e.stopPropagation();
    const id = noteGroup.dataset.id;
    if (appState.selectedNodeId !== id) {
      appState.selectedNodeId = id;
      render(appState, "structure");
    }
    return;
  }

  // 4. Default canvas panning check
  if (e.target.closest("button") || e.target.closest(".node-group") || e.target.closest(".hitzone")) {
    return;
  }
  isPanning = true;
  startX = e.clientX;
  startY = e.clientY;
  svg.style.cursor = "grabbing";
}

function handleMouseMove(e) {
  if (activeDraggingNoteId) {
    const dx = (e.clientX - initialMouseX) / zoom;
    const dy = (e.clientY - initialMouseY) / zoom;
    const note = findNodeById(activeDraggingNoteId);
    if (note) {
      note.x = initialNoteX + dx;
      note.y = initialNoteY + dy;
      refreshSVGOnly();
    }
    return;
  }

  if (activeResizingNoteId) {
    const dx = (e.clientX - initialMouseX) / zoom;
    const dy = (e.clientY - initialMouseY) / zoom;
    const note = findNodeById(activeResizingNoteId);
    if (note) {
      note.w = Math.max(120, initialNoteW + dx);
      note.h = Math.max(60, initialNoteH + dy);
      refreshSVGOnly();
    }
    return;
  }

  if (!isPanning) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  panX -= dx / zoom;
  panY -= dy / zoom;

  startX = e.clientX;
  startY = e.clientY;

  updateViewBox();
}

function handleMouseUp() {
  if (activeDraggingNoteId || activeResizingNoteId) {
    activeDraggingNoteId = null;
    activeResizingNoteId = null;
  }
  if (isPanning) {
    isPanning = false;
    svg.style.cursor = "grab";
  }
}

function handleResize() {
  updateViewBox();
}

function triggerZoom(factor) {
  const rect = svg.getBoundingClientRect();
  const mx = rect.width / 2;
  const my = rect.height / 2;

  const zoomOld = zoom;
  zoom = Math.max(0.25, Math.min(zoom * factor, 4.0));

  panX = panX + mx * (1 / zoomOld - 1 / zoom);
  panY = panY + my * (1 / zoomOld - 1 / zoom);

  updateViewBox();
}

function zoomToFit() {
  const activeProc = appState.procedures[appState.activeScreen];
  if (!activeProc) return;

  const rootLayout = calculateSequenceLayout(activeProc.body, "body");
  const rect = svg.getBoundingClientRect();
  const w = rect.width || 800;
  const h = rect.height || 600;

  // Find optimal scale to fit diagram with padding
  const padding = 80;
  const scaleX = (w - padding) / rootLayout.w;
  const scaleY = (h - padding) / rootLayout.h;
  
  zoom = Math.max(0.4, Math.min(scaleX, scaleY, 1.25));

  // Center horizontally around the sequence's main flowline anchor
  panX = rootLayout.xAnchor - (w / 2) / zoom;
  panY = -30; // 30px padding from top

  updateViewBox();
}

/**
 * Tab Navigation Methods
 */
function renderTabs() {
  tabsContainer.innerHTML = "";
  for (const name in appState.procedures) {
    const isActive = name === appState.activeScreen;
    const isMain = name === "main";

    const tabEl = document.createElement("div");
    tabEl.className = `tab ${isActive ? 'active' : ''}`;
    tabEl.dataset.name = name;

    const icon = isMain ? "play" : "code";
    
    tabEl.innerHTML = `
      <i data-lucide="${icon}"></i>
      <span>${name}</span>
      ${!isMain ? `
        <button class="delete-tab-btn" data-name="${name}" title="Delete subroutine">
          <i data-lucide="x"></i>
        </button>
      ` : ""}
    `;

    tabsContainer.appendChild(tabEl);
  }
  lucide.createIcons({ node: tabsContainer });
}

function handleTabClick(e) {
  const deleteBtn = e.target.closest(".delete-tab-btn");
  if (deleteBtn) {
    e.stopPropagation();
    const name = deleteBtn.dataset.name;
    if (confirm(`Are you sure you want to delete the procedure "${name}"?`)) {
      deleteProcedure(name);
      zoomToFit();
    }
    return;
  }

  const tab = e.target.closest(".tab");
  if (tab) {
    const name = tab.dataset.name;
    if (appState.activeScreen !== name) {
      appState.activeScreen = name;
      appState.selectedNodeId = null;
      render(appState, "structure");
      zoomToFit();
    }
  }
}

/**
 * Click Delegation & Insertion Trigger
 */
function handleSvgClick(e) {
  // 1. Click Hitzone
  const hitzone = e.target.closest(".hitzone");
  if (hitzone) {
    e.stopPropagation();
    const path = hitzone.dataset.path;
    const idx = hitzone.dataset.index;
    
    // Position menu at click position
    activePath = path;
    activeIndex = parseInt(idx, 10);

    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.display = "block";
    return;
  }

  // 2. Click Node Block
  const nodeGroup = e.target.closest(".node-group");
  if (nodeGroup) {
    e.stopPropagation();
    const id = nodeGroup.dataset.id;
    if (appState.selectedNodeId !== id) {
      appState.selectedNodeId = id;
      render(appState, "structure");
    }
    hideContextMenu();
    return;
  }

  // 3. Click Canvas Background
  appState.selectedNodeId = null;
  hideContextMenu();
  render(appState, "structure");
}

function handleContextMenuClick(e) {
  const btn = e.target.closest(".menu-item");
  if (!btn) return;

  const type = btn.dataset.type;
  insertNode(activePath, activeIndex, type);
  hideContextMenu();
}

function handleDocumentClick(e) {
  if (!contextMenu.contains(e.target)) {
    hideContextMenu();
  }
}

function hideContextMenu() {
  contextMenu.style.display = "none";
}

/**
 * Sidebar Inspector Rendering
 */
function renderInspector() {
  if (!appState.selectedNodeId) {
    inspectorContent.innerHTML = `
      <div class="empty-state">
        <i data-lucide="mouse-pointer" class="empty-icon"></i>
        <p>Select a block in the flowchart to inspect and edit its properties.</p>
      </div>
    `;
    lucide.createIcons({ node: inspectorContent });
    return;
  }

  const node = findNodeById(appState.selectedNodeId);
  if (!node) {
    appState.selectedNodeId = null;
    renderInspector();
    return;
  }

  let fieldsHtml = "";
  let title = "";
  let description = "";

  switch (node.type) {
    case "start": {
      title = "Start Block";
      description = "Marks the starting point of execution. You can manage the procedure name and parameters here.";
      const activeProc = appState.procedures[appState.activeScreen];
      const params = activeProc ? (activeProc.parameters || []) : [];

      let paramsListHtml = "";
      if (params.length === 0) {
        paramsListHtml = `
          <div class="empty-params" style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; font-style: italic;">
            No parameters defined.
          </div>
        `;
      } else {
        paramsListHtml = params.map((param, idx) => `
          <div class="param-row" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
            <input type="text" class="form-control inspect-param-input" data-index="${idx}" value="${escapeHtml(param)}" placeholder="Parameter name">
            <button class="btn btn-danger btn-icon-only delete-param-btn" data-index="${idx}" title="Delete Parameter" style="padding: 6px;">
              <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            </button>
          </div>
        `).join("");
      }

      fieldsHtml = `
        <div class="form-group">
          <label for="inspect-proc-name">Procedure Name</label>
          <input type="text" id="inspect-proc-name" class="form-control" value="${escapeHtml(activeProc.name)}" style="margin-bottom: 16px;" ${activeProc.name === 'main' ? 'disabled' : ''}>
          
          <label>Parameters</label>
          <div class="params-list" id="params-list">
            ${paramsListHtml}
          </div>
          <button id="add-param-btn" class="btn btn-secondary" style="width: 100%; margin-top: 8px; justify-content: center;">
            <i data-lucide="plus" style="width: 14px; height: 14px;"></i> Add Parameter
          </button>
        </div>
      `;
      break;
    }
    case "end":
      title = "End Block";
      description = "Marks the end of execution for the main program.";
      break;
    case "return":
      title = "Return Block";
      description = "Terminates this subroutine and returns a value or expression to the caller.";
      fieldsHtml = `
        <div class="form-group">
          <label for="inspect-expression">Return Value / Expression</label>
          <input type="text" id="inspect-expression" class="form-control" placeholder="e.g., total, 0, or x + y" value="${escapeHtml(node.expression || '')}">
          <small class="form-help">Enter the value or expression to return (optional).</small>
        </div>
      `;
      break;
    case "input":
      title = "Input Block";
      description = "Prompts the user to enter a value, then assigns it to a variable.";
      fieldsHtml = `
        <div class="form-group">
          <label for="inspect-variable">Variable Name</label>
          <input type="text" id="inspect-variable" class="form-control" placeholder="e.g., age" value="${escapeHtml(node.variable || '')}">
          <small class="form-help">Enter the variable to store the user's input.</small>
        </div>
      `;
      break;
    case "output":
      title = "Output Block";
      description = "Evaluates an expression and prints the result to the output screen.";
      fieldsHtml = `
        <div class="form-group">
          <label for="inspect-expression">Expression / Message</label>
          <input type="text" id="inspect-expression" class="form-control" placeholder="e.g., &quot;Hello &quot; &amp; name" value="${escapeHtml(node.expression || '')}">
          <small class="form-help">Variables or strings wrapped in quotes (e.g., "Hello").</small>
        </div>
        <div class="form-group" style="display: flex; align-items: center; gap: 8px; margin-top: 12px; cursor: pointer; user-select: none;">
          <input type="checkbox" id="inspect-newline" style="width: 16px; height: 16px; accent-color: #38bdf8; cursor: pointer;" ${node.newline !== false ? 'checked' : ''}>
          <label for="inspect-newline" style="margin-bottom: 0; cursor: pointer; color: var(--text-main); font-size: 0.85rem;">New Line</label>
        </div>
      `;
      break;
    case "assignment":
      title = "Assignment Block";
      description = "Computes an expression value and stores it in a variable.";
      fieldsHtml = `
        <div class="form-group">
          <label for="inspect-variable">Variable</label>
          <input type="text" id="inspect-variable" class="form-control" placeholder="e.g., total" value="${escapeHtml(node.variable || '')}">
        </div>
        <div class="form-group">
          <label for="inspect-expression">Value / Expression</label>
          <input type="text" id="inspect-expression" class="form-control" placeholder="e.g., total + price" value="${escapeHtml(node.expression || '')}">
        </div>
      `;
      break;
    case "call": {
      title = "Call Block";
      description = "Invokes a subroutine procedure and passes arguments.";
      const subroutines = Object.keys(appState.procedures).filter(name => name !== "main");
      const optionsHtml = subroutines.map(name => `<option value="${name}" ${node.procedure === name ? 'selected' : ''}>${name}</option>`).join("");
      const isCustomName = node.procedure && !subroutines.includes(node.procedure);

      const customName = node.procedure || "";
      const showAddBtn = isCustomName && customName.trim() !== "" && !appState.procedures[customName.trim()];

      fieldsHtml = `
        <div class="form-group">
          <label for="inspect-procedure">Procedure Name</label>
          <select id="inspect-procedure" class="form-control" style="margin-bottom: 8px;">
            <option value="" ${!node.procedure ? 'selected' : ''}>-- Select Procedure --</option>
            ${optionsHtml}
            <option value="__custom__" ${isCustomName ? 'selected' : ''}>[ Custom Name ]</option>
          </select>
          <div id="custom-proc-input-container" style="${isCustomName ? '' : 'display: none;'}">
            <input type="text" id="inspect-procedure-text" class="form-control" placeholder="e.g., calculateTax" value="${escapeHtml(customName)}">
            ${showAddBtn ? `
              <button type="button" id="add-custom-proc-btn" class="btn btn-secondary" style="width: 100%; margin-top: 8px; justify-content: center; gap: 6px;">
                <i data-lucide="plus-circle" style="width: 14px; height: 14px;"></i> Create Subroutine "${escapeHtml(customName)}"
              </button>
            ` : ''}
          </div>
        </div>
        <div class="form-group">
          <label for="inspect-arguments">Arguments</label>
          <input type="text" id="inspect-arguments" class="form-control" placeholder="e.g., score, 10" value="${escapeHtml(node.arguments || '')}">
          <small class="form-help">Separate multiple arguments with commas.</small>
        </div>
      `;
      break;
    }
    case "if":
      title = "If-Else Decision";
      description = "Evaluates a condition. If true, takes the left path; if false, takes the right path.";
      fieldsHtml = `
        <div class="form-group">
          <label for="inspect-condition">Condition Statement</label>
          <input type="text" id="inspect-condition" class="form-control" placeholder="e.g., x &gt;= 10" value="${escapeHtml(node.condition || '')}">
          <small class="form-help">Must evaluate to a boolean (e.g., count &lt; limit).</small>
        </div>
      `;
      break;
    case "while":
      title = "While Loop";
      description = "Loops execution of body blocks as long as the condition evaluates to true.";
      fieldsHtml = `
        <div class="form-group">
          <label for="inspect-condition">Loop Condition</label>
          <input type="text" id="inspect-condition" class="form-control" placeholder="e.g., x &lt; 5" value="${escapeHtml(node.condition || '')}">
        </div>
      `;
      break;
    case "do-while":
      title = "Do-While Loop";
      description = "Executes loop body first, then repeats as long as the condition evaluates to true.";
      fieldsHtml = `
        <div class="form-group">
          <label for="inspect-condition">Loop Condition</label>
          <input type="text" id="inspect-condition" class="form-control" placeholder="e.g., flag == true" value="${escapeHtml(node.condition || '')}">
        </div>
      `;
      break;
    case "note":
      title = "Note Block";
      description = "A free-floating canvas note. Drag it by its header and resize it from the bottom-right grip.";
      fieldsHtml = `
        <div class="form-group">
          <label for="inspect-note-text">Note Content</label>
          <textarea id="inspect-note-text" class="form-control" rows="6" placeholder="Write your note here...">${escapeHtml(node.text || '')}</textarea>
        </div>
      `;
      break;
  }

  const isTerminal = node.type === "start" || node.type === "end" || node.type === "return";

  inspectorContent.innerHTML = `
    <div class="node-info-card">
      <div class="node-info-title">
        <i data-lucide="help-circle" class="header-icon"></i>
        <span>${title}</span>
      </div>
      <div class="node-info-desc">${description}</div>
    </div>
    <div class="node-properties-form">
      ${fieldsHtml}
    </div>
    ${!isTerminal ? `
      <div class="node-danger-zone">
        <button id="inspect-delete-btn" class="btn btn-danger" style="width: 100%;">
          <i data-lucide="trash-2"></i> Delete Block
        </button>
      </div>
    ` : ""}
  `;

  lucide.createIcons({ node: inspectorContent });

  // Attach direct input event listeners (triggers real-time layout changes without re-creating inputs)
  const varInput = document.getElementById("inspect-variable");
  const exprInput = document.getElementById("inspect-expression");
  const condInput = document.getElementById("inspect-condition");
  const deleteBtn = document.getElementById("inspect-delete-btn");

  if (varInput) {
    varInput.addEventListener("input", (e) => {
      updateNodeProperty(node.id, "variable", e.target.value);
    });
  }
  if (exprInput) {
    exprInput.addEventListener("input", (e) => {
      updateNodeProperty(node.id, "expression", e.target.value);
    });
  }
  const newlineInput = document.getElementById("inspect-newline");
  if (newlineInput) {
    newlineInput.addEventListener("change", (e) => {
      updateNodeProperty(node.id, "newline", e.target.checked);
    });
  }
  if (condInput) {
    condInput.addEventListener("input", (e) => {
      updateNodeProperty(node.id, "condition", e.target.value);
    });
  }
  const procSelect = document.getElementById("inspect-procedure");
  const procTextInput = document.getElementById("inspect-procedure-text");
  const argsInput = document.getElementById("inspect-arguments");

  if (procSelect) {
    procSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      const container = document.getElementById("custom-proc-input-container");
      if (val === "__custom__") {
        container.style.display = "block";
        procTextInput.focus();
      } else {
        container.style.display = "none";
        updateNodeProperty(node.id, "procedure", val);
      }
    });
  }
  if (procTextInput) {
    procTextInput.addEventListener("input", (e) => {
      const rawVal = e.target.value;
      updateNodeProperty(node.id, "procedure", rawVal);

      const val = rawVal.trim();
      let addBtn = document.getElementById("add-custom-proc-btn");
      const exists = appState.procedures[val] || val === "";

      if (exists) {
        if (addBtn) addBtn.remove();
      } else {
        if (!addBtn) {
          addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.id = "add-custom-proc-btn";
          addBtn.className = "btn btn-secondary";
          addBtn.style.width = "100%";
          addBtn.style.marginTop = "8px";
          addBtn.style.justifyContent = "center";
          addBtn.style.gap = "6px";
          procTextInput.parentNode.appendChild(addBtn);

          addBtn.addEventListener("click", () => {
            handleAddCustomProc(procTextInput.value.trim());
          });
        }
        addBtn.innerHTML = `<i data-lucide="plus-circle" style="width: 14px; height: 14px;"></i> Create Subroutine "${escapeHtml(val)}"`;
        lucide.createIcons({ node: addBtn });
      }
    });
  }
  if (argsInput) {
    argsInput.addEventListener("input", (e) => {
      updateNodeProperty(node.id, "arguments", e.target.value);
    });
  }

  // Hook up initial create subroutine button if rendered statically
  const addBtnInit = document.getElementById("add-custom-proc-btn");
  if (addBtnInit) {
    addBtnInit.addEventListener("click", () => {
      handleAddCustomProc(procTextInput.value.trim());
    });
  }

  function handleAddCustomProc(procName) {
    const name = procName.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      alert("Must be a valid identifier starting with a letter.");
      return;
    }

    const currentScreen = appState.activeScreen;
    const nodeId = node.id;

    if (addProcedure(name)) {
      appState.activeScreen = currentScreen;
      appState.selectedNodeId = nodeId;
      render(appState, "structure"); // trigger full redraw to update dropdown/tabs
    } else {
      alert("Failed to create subroutine.");
    }
  }

  // Start node parameter and naming bindings
  const procNameInput = document.getElementById("inspect-proc-name");
  const addParamBtn = document.getElementById("add-param-btn");
  const paramInputs = document.querySelectorAll(".inspect-param-input");
  const deleteParamBtns = document.querySelectorAll(".delete-param-btn");

  if (procNameInput) {
    procNameInput.addEventListener("change", (e) => {
      const oldName = appState.activeScreen;
      const newName = e.target.value.trim();
      if (newName === "") return;
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(newName)) {
        alert("Must be a valid identifier starting with a letter.");
        procNameInput.value = oldName;
        return;
      }
      if (!renameProcedure(oldName, newName)) {
        alert("Procedure name already exists or is invalid.");
        procNameInput.value = oldName;
      }
    });
  }

  if (addParamBtn) {
    addParamBtn.addEventListener("click", () => {
      addParameter("param");
    });
  }

  paramInputs.forEach(input => {
    input.addEventListener("input", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      updateParameter(idx, e.target.value);
    });
  });

  deleteParamBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      deleteParameter(idx);
    });
  });

  const noteTextInput = document.getElementById("inspect-note-text");
  if (noteTextInput) {
    noteTextInput.addEventListener("input", (e) => {
      updateNodeProperty(node.id, "text", e.target.value);
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      deleteNode(node.id);
    });
  }
}

/**
 * Modal Subroutine Procedure Dialog
 */
function showModal() {
  modalContainer.style.display = "flex";
  procedureNameInput.value = "";
  procedureNameInput.focus();
}

function hideModal() {
  modalContainer.style.display = "none";
}

function handleNewProcedure(e) {
  e.preventDefault();
  const name = procedureNameInput.value.trim();
  if (addProcedure(name)) {
    hideModal();
    zoomToFit();
  } else {
    alert("Procedure name already exists or is invalid.");
  }
}

/**
 * File Actions & Operations
 */
function handleExport() {
  const stateStr = exportState();
  const blob = new Blob([stateStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flowchart-${appState.activeScreen}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleExportPDF() {
  const originalText = exportPdfBtn.innerHTML;

  // Dynamically load jsPDF library if not already loaded in the window
  if (!window.jspdf) {
    exportPdfBtn.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; margin-right: 6px;"></i> Loading PDF Library...`;
    exportPdfBtn.disabled = true;
    lucide.createIcons({ node: exportPdfBtn });

    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Failed to download PDF library from CDN."));
        document.body.appendChild(script);
      });
    } catch (error) {
      alert("Failed to load PDF library. Please check your internet connection.");
      exportPdfBtn.innerHTML = originalText;
      exportPdfBtn.disabled = false;
      lucide.createIcons({ node: exportPdfBtn });
      return;
    }
  }

  const { jsPDF } = window.jspdf;
  if (!jsPDF) {
    alert("jsPDF library not loaded.");
    return;
  }

  // Show generating loading state
  exportPdfBtn.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; margin-right: 6px;"></i> Generating PDF...`;
  exportPdfBtn.disabled = true;
  lucide.createIcons({ node: exportPdfBtn });

  // Save the user's current screen and selection to restore later
  const originalScreen = appState.activeScreen;
  const originalSelectedNodeId = appState.selectedNodeId;

  try {
    const procedureNames = Object.keys(appState.procedures);
    if (procedureNames.length === 0) return;

    let pdfInstance = null;

    // Loop through each procedure, render it, and add it as a PDF page
    for (let i = 0; i < procedureNames.length; i++) {
      const procName = procedureNames[i];
      
      // 1. Temporarily switch the active screen and select nothing
      appState.activeScreen = procName;
      appState.selectedNodeId = null;
      
      // 2. Force layout coordinates and render SVG markup onto the DOM
      refreshSVGOnly();

      // 3. Get the exact bounding box of the newly drawn content
      const bbox = contentGroup.getBBox();
      const padding = 30;
      const exportW = Math.max(100, bbox.width + padding * 2);
      const exportH = Math.max(100, bbox.height + padding * 2);

      // 4. Clone the main SVG
      const clonedSvg = svg.cloneNode(true);
      
      // Set static dimensions and viewBox matching the bounding box
      clonedSvg.setAttribute("width", exportW);
      clonedSvg.setAttribute("height", exportH);
      clonedSvg.setAttribute("viewBox", `${bbox.x - padding} ${bbox.y - padding} ${exportW} ${exportH}`);
      
      // Remove grid and insert solid white background rectangle for printable look
      const gridRect = clonedSvg.querySelector('rect[fill="url(#grid)"]');
      if (gridRect) {
        gridRect.remove();
      }

      const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bgRect.setAttribute("x", bbox.x - padding);
      bgRect.setAttribute("y", bbox.y - padding);
      bgRect.setAttribute("width", exportW);
      bgRect.setAttribute("height", exportH);
      bgRect.setAttribute("fill", "#ffffff");
      clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);
      
      // Remove zoom and pan transform from content group in cloned SVG
      const clonedContentGroup = clonedSvg.querySelector("#flowchart-content");
      if (clonedContentGroup) {
        clonedContentGroup.removeAttribute("transform");
      }
      
      // Remove all hitzone buttons and hover indicators from the cloned SVG DOM completely
      clonedSvg.querySelectorAll(".plus-button-bg").forEach(el => el.remove());
      clonedSvg.querySelectorAll(".plus-button-icon").forEach(el => el.remove());
      clonedSvg.querySelectorAll(".hit-indicator").forEach(el => el.remove());
      clonedSvg.querySelectorAll(".note-resize-handle").forEach(el => el.remove());

      // Embed styling rules directly inside the SVG
      // Injects high-contrast document styles optimized for a white background
      const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
      styleEl.textContent = `
        .node-group {
          cursor: pointer;
        }
        .node-shape {
          stroke-width: 1.5px;
        }
        /* Node specific fills */
        [data-type="start"] .node-shape { fill: url(#grad-start); stroke: #047857; }
        [data-type="end"] .node-shape { fill: url(#grad-end); stroke: #be123c; }
        [data-type="return"] .node-shape { fill: url(#grad-start); stroke: #047857; }
        [data-type="input"] .node-shape, [data-type="output"] .node-shape { fill: url(#grad-io); stroke: #0369a1; }
        [data-type="assignment"] .node-shape { fill: url(#grad-assign); stroke: #5b21b6; }
        [data-type="call"] .node-shape { fill: url(#grad-call); stroke: #be185d; }
        [data-type="if"] .node-shape, [data-type="while"] .node-shape, [data-type="do-while"] .node-shape { fill: url(#grad-cond); stroke: #b45309; }
        
        /* Sticky Note - light yellow background with dark brown text */
        [data-type="note"] .node-shape { fill: #fef9c3; stroke: #eab308; }

        /* Flowlines - dark slate for high contrast printing */
        .flowline {
          stroke: #475569;
          stroke-width: 2.5px;
          stroke-linecap: round;
          fill: none;
        }
        .flowline-arrow {
          fill: #475569;
        }
        .loop-back-line {
          stroke: #475569;
          stroke-width: 2.5px;
          stroke-dasharray: 4 3;
          fill: none;
        }

        /* Labels and Containers */
        .node-label-container {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          height: 100%;
          color: #ffffff;
          text-align: center;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .note-text-container {
          color: #451a03;
          font-size: 0.8rem;
          line-height: 1.4;
          word-break: break-word;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .node-type {
          font-size: 0.65rem;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.05em;
          opacity: 0.8;
          margin-bottom: 2px;
        }
        .node-expression {
          font-size: 0.85rem;
          font-weight: 600;
          font-family: monospace;
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        /* Diamond wraps */
        [data-type="if"] .node-expression,
        [data-type="while"] .node-expression,
        [data-type="do-while"] .node-expression {
          font-size: 0.78rem;
          font-weight: 600;
          max-width: 120px;
          white-space: normal;
          word-break: break-all;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          line-height: 1.25;
        }

        .line-label {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 0.75rem;
          font-weight: 700;
          fill: #475569;
        }
        .line-label.true-label { fill: #059669; }
        .line-label.false-label { fill: #dc2626; }

        /* Sticky note specifics */
        .note-drag-handle {
          fill: rgba(234, 179, 8, 0.15);
        }
      `;
      clonedSvg.insertBefore(styleEl, clonedSvg.firstChild);

      // Serialize SVG to XML string
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clonedSvg);

      // Convert SVG to inline Data URL to bypass CORS/origin checks and prevent canvas tainting
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);

      // Load SVG into Image
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      // Draw Image to Canvas at 2.5x resolution for ultra-sharp vector details
      const canvas = document.createElement("canvas");
      const scale = 2.5;
      canvas.width = exportW * scale;
      canvas.height = exportH * scale;
      
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      
      // Fill canvas background with clean white for printing
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw the scaled SVG image onto canvas
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Export Canvas as high-quality PNG data URL
      const imgData = canvas.toDataURL("image/png");

      // Create PDF page matching the flowchart aspect ratio
      // 1 px = 0.75 points
      const pdfW = exportW * 0.75;
      const pdfH = exportH * 0.75;

      if (i === 0) {
        pdfInstance = new jsPDF({
          orientation: pdfW > pdfH ? "landscape" : "portrait",
          unit: "pt",
          format: [pdfW, pdfH]
        });
      } else {
        pdfInstance.addPage([pdfW, pdfH], pdfW > pdfH ? "landscape" : "portrait");
      }

      pdfInstance.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
    }

    if (pdfInstance) {
      pdfInstance.save("flowchart_studio_export.pdf");
    }

  } catch (error) {
    console.error("PDF Export failed:", error);
    alert("Export to PDF failed. See console for details.");
  } finally {
    // Restore the user's active screen and selection
    appState.activeScreen = originalScreen;
    appState.selectedNodeId = originalSelectedNodeId;
    render(appState, "structure");

    exportPdfBtn.innerHTML = originalText;
    exportPdfBtn.disabled = false;
    lucide.createIcons({ node: exportPdfBtn });
  }
}

function handleExportSVG() {
  try {
    const activeProc = appState.procedures[appState.activeScreen];
    if (!activeProc) return;

    // Save user selection to restore later
    const originalSelectedNodeId = appState.selectedNodeId;
    
    // Clear selection so borders are not exported
    appState.selectedNodeId = null;
    refreshSVGOnly();

    // Get the exact bounding box of the contents
    const bbox = contentGroup.getBBox();
    const padding = 20;
    const exportW = Math.max(100, bbox.width + padding * 2);
    const exportH = Math.max(100, bbox.height + padding * 2);

    // Clone the main SVG
    const clonedSvg = svg.cloneNode(true);
    
    // Set static dimensions and viewBox matching the bounding box
    clonedSvg.setAttribute("width", exportW);
    clonedSvg.setAttribute("height", exportH);
    clonedSvg.setAttribute("viewBox", `${bbox.x - padding} ${bbox.y - padding} ${exportW} ${exportH}`);
    
    // Remove grid and insert solid white background rectangle for printable look
    const gridRect = clonedSvg.querySelector('rect[fill="url(#grid)"]');
    if (gridRect) {
      gridRect.remove();
    }

    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("x", bbox.x - padding);
    bgRect.setAttribute("y", bbox.y - padding);
    bgRect.setAttribute("width", exportW);
    bgRect.setAttribute("height", exportH);
    bgRect.setAttribute("fill", "#ffffff");
    clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);
    
    // Remove zoom and pan transform from content group in cloned SVG
    const clonedContentGroup = clonedSvg.querySelector("#flowchart-content");
    if (clonedContentGroup) {
      clonedContentGroup.removeAttribute("transform");
    }
    
    // Remove all hitzone buttons and hover indicators from the cloned SVG DOM completely
    clonedSvg.querySelectorAll(".plus-button-bg").forEach(el => el.remove());
    clonedSvg.querySelectorAll(".plus-button-icon").forEach(el => el.remove());
    clonedSvg.querySelectorAll(".hit-indicator").forEach(el => el.remove());
    clonedSvg.querySelectorAll(".note-resize-handle").forEach(el => el.remove());

    // Embed styling rules directly inside the SVG
    // Injects high-contrast document styles optimized for a white background
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.textContent = `
      .node-group {
        cursor: pointer;
      }
      .node-shape {
        stroke-width: 1.5px;
      }
      /* Node specific fills */
      [data-type="start"] .node-shape { fill: url(#grad-start); stroke: #047857; }
      [data-type="end"] .node-shape { fill: url(#grad-end); stroke: #be123c; }
      [data-type="return"] .node-shape { fill: url(#grad-start); stroke: #047857; }
      [data-type="input"] .node-shape, [data-type="output"] .node-shape { fill: url(#grad-io); stroke: #0369a1; }
      [data-type="assignment"] .node-shape { fill: url(#grad-assign); stroke: #5b21b6; }
      [data-type="call"] .node-shape { fill: url(#grad-call); stroke: #be185d; }
      [data-type="if"] .node-shape, [data-type="while"] .node-shape, [data-type="do-while"] .node-shape { fill: url(#grad-cond); stroke: #b45309; }
      
      /* Sticky Note - light yellow background with dark brown text */
      [data-type="note"] .node-shape { fill: #fef9c3; stroke: #eab308; }

      /* Flowlines - dark slate for high contrast printing */
      .flowline {
        stroke: #475569;
        stroke-width: 2.5px;
        stroke-linecap: round;
        fill: none;
      }
      .flowline-arrow {
        fill: #475569;
      }
      .loop-back-line {
        stroke: #475569;
        stroke-width: 2.5px;
        stroke-dasharray: 4 3;
        fill: none;
      }

      /* Labels and Containers */
      .node-label-container {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        color: #ffffff;
        text-align: center;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .note-text-container {
        color: #451a03;
        font-size: 0.8rem;
        line-height: 1.4;
        word-break: break-word;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .node-type {
        font-size: 0.65rem;
        text-transform: uppercase;
        font-weight: 700;
        letter-spacing: 0.05em;
        opacity: 0.8;
        margin-bottom: 2px;
      }
      .node-expression {
        font-size: 0.85rem;
        font-weight: 600;
        font-family: monospace;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      /* Diamond wraps */
      [data-type="if"] .node-expression,
      [data-type="while"] .node-expression,
      [data-type="do-while"] .node-expression {
        font-size: 0.78rem;
        font-weight: 600;
        max-width: 120px;
        white-space: normal;
        word-break: break-all;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        line-height: 1.25;
      }

      .line-label {
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 0.75rem;
        font-weight: 700;
        fill: #475569;
      }
      .line-label.true-label { fill: #059669; }
      .line-label.false-label { fill: #dc2626; }

      /* Sticky note specifics */
      .note-drag-handle {
        fill: rgba(234, 179, 8, 0.15);
      }
    `;
    clonedSvg.insertBefore(styleEl, clonedSvg.firstChild);

    // Serialize SVG to XML string
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);

    // Download Standalone SVG File
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeProc.name}_flowchart.svg`;
    a.click();
    URL.revokeObjectURL(url);

    // Restore user state
    appState.selectedNodeId = originalSelectedNodeId;
    render(appState, "structure");

  } catch (error) {
    console.error("SVG Export failed:", error);
    alert("Export to SVG failed. See console for details.");
  }
}

function handleImport(e) {
  stopExecution();
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    if (importState(event.target.result)) {
      zoomToFit();
    }
  };
  reader.readAsText(file);
  e.target.value = ""; // clear selector input
}

function handleClear() {
  if (confirm("Are you sure you want to clear all flowchart screens? This will reset the workspace.")) {
    stopExecution();
    clearState();
    zoomToFit();
  }
}

// Subscribe to global state changes
subscribe((state, changeType) => {
  render(state, changeType);
});

// Run Init
init();
