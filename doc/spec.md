# Project Specification & Requirements: Web-Based Visual Flowchart Editor

This document outlines the software specification and functional requirements for **Flowchart Studio**, a lightweight, visual flowchart drawing application. The application utilizes a structural layout model, ensuring diagrams remain syntactically valid at all times.

---

## 1. Project Overview

Flowchart Studio is a client-side visual programming environment. Instead of dragging and connecting nodes in a free-form canvas, users build flowcharts by inserting blocks directly into existing flowlines.

### Core Features
* **Structural Flow Editing:** Blocks are strictly inserted *into* existing connections via interactive hitzones, preserving execution flow validity.
* **Subroutine & Parameter Management:** Supports a `main` procedure and separate custom procedure screens with customizable input parameters.
* **Floating Sticky Notes:** Independent yellow sticky notes that can be dragged, resized, and filled with free text.
* **Vector-First Rendering:** Recalculates diagram layouts recursively and renders them as standard SVGs for infinite scaling.
* **No Server-Side Compilation:** Operates purely in client-side JavaScript, CSS3, and HTML5.

---

## 2. Supported Flow Elements

| Block Type | Properties | Visual Shape | Layout Behavior |
| --- | --- | --- | --- |
| **Start** | Name, Parameter list | Capsule (Pill) | Entry point. Single flowline outlet. Sized to fit parameter lists. |
| **End** | None | Capsule (Pill) | Terminal block. Single flowline inlet. |
| **Return** | Optional expression string | Capsule (Pill) | Terminal block. Centered text when empty; lists return expression. |
| **Input / Output** | Variable name / Expression string | Parallelogram | Sequential block. Single linear flowline. |
| **Assignment** | Variable name, Expression string | Rectangle | Sequential block. Single linear flowline. |
| **Call Block** | Subroutine selection | Rectangle (Double Border) | Invokes procedures. Displays subroutine creation buttons inline if custom names are typed. |
| **If-Else** | Condition string, `true` branch, `false` branch | Diamond | Splits flow into two parallel paths, merging at a join point. |
| **While Loop** | Condition string, loop body branch | Diamond | Enters nested body when true; loops back to header; exits straight down when false. |
| **Do-While** | Condition string, loop body branch | Diamond | Evaluates body first, followed by bottom condition loop-back to body start. |
| **Break** | None | Capsule (Orange) | Exits the innermost loop immediately. Single flowline inlet. |
| **Continue** | None | Capsule (Teal) | Skips the rest of the loop body. Single flowline inlet. |
| **Sticky Note** | Free text body | Rounded Square (Yellow) | Free-placement note box. Supports drag-to-pan, drag-to-resize, and text reflow. |

---

## 3. Technical Requirements & Design Decisions

### 3.1 Data Architecture (The Abstract Syntax Tree)
The program state is represented as a deterministic tree structure using nested plain JavaScript objects and arrays. Procedure body arrays list elements sequentially, while nested conditionals (`if`, `while`, `do-while`) contain their own nested body branches.

### 3.2 Layout & Graphic Engine
* **State-Driven Unidirectional Flow:** When state modifications happen, a global layout algorithm runs, followed by a total re-render of the SVG viewport.
* **Recursive Measuring:** A pure utility function walks the active procedure tree bottom-up to compute bounding boxes ($width$ and $height$) for complex structures like nested loops and deep branches.
* **Native SVG Text Rendering:** To ensure full compatibility with vector drawing software (e.g. GIMP, LibreOffice Draw, Inkscape, Illustrator), the application avoids HTML `<foreignObject>` containers. All text is rendered using native `<text>` tags. Text wrapping is computed programmatically, and vertical/horizontal alignment is centered using baseline coordinates.
* **Interactive Hitzones:** Flowlines are overlaid with thick, transparent hit-indicators to make hover triggers and clicks responsive.

### 3.3 Dynamic Resource Management
* **On-Demand Loading:** Large libraries (like `jsPDF` for compiling PDF documents) are loaded dynamically in the background only when the user triggers the corresponding action. This keeps initial page rendering and JSON loading fast.
* **DOM Scoping:** Third-party component updates (e.g. Lucide icons) are scoped directly to the elements being modified to prevent full-page DOM scans.

---

## 4. UI Layout & Screen Flow

The application interface is divided into three fixed layout panels:

```
+-------------------------------------------------------------------------+
|  Top Navigation Bar (Tabs, Add Subroutines, Action Dropdown, Clear)     |
+-------------------+-----------------------------------------------------+
|                   |                                                     |
|                   |                                                     |
|  Sidebar Context  |               Main Canvas Area                      |
|     Inspector     |               (SVG Viewport)                        |
|                   |                                                     |
| (Edit select node |                                                     |
|    properties)    |                                                     |
|                   |                                                     |
+-------------------+-----------------------------------------------------+
```

### Component Breakdown
1. **Top Navigation & File Menu:**
   - Tabs representing defined procedures (`main` and custom subroutines).
   - Unified "File" operations dropdown grouping:
     - **Import JSON** / **Export JSON**
     - **Export PDF** (creates multi-page documents, mapping each subroutine flow to a dedicated page sized to fit the diagram)
     - **Export SVG** (downloads the active procedure as a transparent vector SVG file)
2. **SVG Viewport Canvas:** Handles scroll-zooming and click-drag panning by updating viewbox attributes. Includes a floating **Variable Watcher** panel in the upper-right corner that appears during active execution to track call stack frames and variables.
3. **Inspector Panel:** Displays parameter controls for the `Start` block, expressions/variables for body blocks, and textareas for notes.

---

## 5. Development Phases

* **Phase 1: Core State & Base Layout Engine** (Data tree design, flat linear rendering of sequential blocks).
* **Phase 2: Complex Geometry Handlers** (Recursive layout calculations for nested branches and loop systems).
* **Phase 3: Interactive Hitzones & Splice Mutations** (Event delegation, dropdown item picker, insertion arrays).
* **Phase 4: Node Inspector & Context Management** (Sidebar sync, parameter bindings, block removal).
* **Phase 5: Procedure Scope Switching** (Navigation bar tabs, multi-canvas tree isolation, custom subroutine builders).
* **Phase 6: Floating Note Blocks** (Free text note creation, drag-pan coordinates, relative drag resizing).
* **Phase 7: Vector Exports & Performance Optimization** (Native SVG text wrappers, multi-page PDF compilation, dynamic dependency lazy-loading, DOM-scoped icon updates).
* **Phase 8: Debugger Variable Watcher & Async Subroutine Tracing** (Stack-frame argument capturing, real-time scrollable glassmorphism call-stack panel, `AsyncFunction` expression rewriting to support step-into subroutine tracing/debugging inside expressions).
* **Phase 9: Loop Control Interruptions** (Break & Continue block templates, context menu integration, colored capsule SVG rendering, bubble-up control flow execution in interpreter, and documentation updates).
