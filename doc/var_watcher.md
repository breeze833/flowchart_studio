# Variable Watcher Specification & Design

This document details the functional specifications, visual design, and integration architecture for the **Variable Watcher** feature in Flowchart Studio.

---

## 1. Functional Specifications

The Variable Watcher is an interactive debugging panel that displays the active call stack and local variable states in real-time during flowchart execution.

### 1.1 Activation & Visibility
*   **State-based display**: The Variable Watcher is visible *only* when flowchart execution is active (`running` or `paused`).
*   **Stopped State**: The watcher is hidden (`display: none`) when execution is stopped or reset.
*   **Export Hiding**: During PDF or SVG export operations, the watcher is excluded from the generated canvas viewport.

### 1.2 Layout & Hierarchy
The watcher mirrors the interpreter's call stack. The call stack grows vertically, representing the call chain.
*   **Stack Alignment**: Organized as a vertical stack of subroutine frames.
*   **Active Frame Highlight**: The currently executing frame (top of the call stack) is visually highlighted, while caller frames (below the top of the stack) are slightly dimmed to guide focus.
*   **Variables List**: Under each subroutine header, its local parameters and variables are listed vertically.
*   **Empty State Placeholder**: If a subroutine is active but has no local variables or parameters initialized yet, a placeholder text *"No variables initialized yet"* is shown.
*   **Auto-scrolling**: When the call stack grows deep and fills the visual area, the container becomes scrollable. The watcher must automatically scroll to the bottom when a new function call is added, keeping the newly active function frame fully visible.

### 1.3 Data Formatting
To ensure clarity, values are formatted based on their data type:
*   **Strings**: Rendered inside double quotes (e.g., `"Hello"`).
*   **Arrays**: Rendered inside square brackets (e.g., `[10, 20, 30]`).
*   **Numbers & Booleans**: Rendered as literal values (e.g., `42`, `true`).
*   **Undefined/Null**: Rendered as `undefined` / `null`.

---

## 2. Visual Design & Layout

The panel floats on top of the flowchart canvas at the upper-right corner.

### 2.1 CSS Layout Structure
*   **Positioning**: Absolute placement in the top-right corner of the canvas wrapper (`top: 24px; right: 24px;`).
*   **Sizing**: Fixed width (`280px`), with a maximum height (`calc(100% - 120px)`) and vertical scrollbar (`overflow-y: auto`) to accommodate deep call stacks.
*   **Aesthetic**: Blurs the flowchart canvas beneath it using glassmorphism styling (`backdrop-filter: blur(12px)`) matching the editor panels.

### 2.2 UI Elements Specifications

#### Subroutine Frame Header
*   **Background**: Semi-transparent dark background.
*   **Typography**: Monospace font (`JetBrains Mono`), bold weights.
*   **Header Text**: Formatted as `subroutineName(evaluatedArguments...)` using parsed and formatted arguments.
*   **Active state**: Accent border glow (emerald green) and brighter text.
*   **Dimmed state**: 60% opacity for parent frames.

#### Variable Cards
```
+---------------------------------------+
|  VARIABLE_NAME                        |
+---------------------------------------+
|  value                                |
+---------------------------------------+
```
*   **Name Label**: Rendered in a small, muted font (`font-size: 0.7rem`) to act as a secondary label. The variable names must preserve their original casing (no uppercase text transformations) to ensure case-sensitive variables are clearly distinguishable.
*   **Value Container**: Rendered in a large monospace font (`font-size: 1rem`), with word-break rules enabled to prevent clipping of long string/array values.

---

## 3. Implementation Architecture

The feature integrates into the existing MVC model of Flowchart Studio:

### 3.1 Interpreter Data Model (`js/interpreter.js`)
We extend the call stack frame object pushed during a procedure invocation (`executeProcedure`) to preserve the initial arguments list:
```javascript
this.callStack.push({
  procedureName: name,
  localScope: localScope,
  arguments: argValues // Array of initial evaluated arguments
});
```

### 3.2 Main Coordinator Sync (`js/app.js`)
*   The main event loop updates the variable watcher display by invoking `updateVariableWatcher()` after each step inside `runStep()`.
*   On execution stop (`stopExecution()`), `updateVariableWatcher()` is called to hide the watcher.
*   In PDF/SVG export operations, the watcher's DOM element is temporarily hidden.
*   **Deep Stack Scrolling**: The rendering function in `app.js` will programmatically scroll the container to the bottom (`scrollTop = scrollHeight`) whenever the call stack length increases compared to the previous step.
