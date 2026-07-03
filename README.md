# Flowchart Studio

Flowchart Studio is a lightweight, visual flowchart editor built using pure client-side web technologies. Unlike free-form flowchart tools where nodes are manually positioned and connected, Flowchart Studio uses a **structural layout model**. Flow elements are inserted directly into existing flowlines, guaranteeing that the resulting diagram remains syntactically valid and readable at all times.

For a complete breakdown of requirements and architecture, refer to the documents in the `doc/` folder.

## Core Features

- **Structural Editing:** Blocks are inserted directly into flowlines via interactive hitzones, preserving execution flow validity.
- **Visual Design & Layout:** Automatic recursive layout calculation that formats complex nested logic (conditionals, loops) dynamically.
- **Interactive Execution Engine:** Run flowcharts step-by-step or automatically with adjustable delay speed. Highlights the currently running block with an animated emerald glow, and errors with a red warning state.
- **Embedded Sidebar Console:** A dark-themed terminal console embedded directly in the left sidebar (tab-switchable with the node properties inspector) displaying color-coded lines: green for outputs, yellow for inputs (prompts user for input values directly in the console), and red for runtime evaluation errors.
- **Standard Flow Elements Supported:**
  - **Sequential:** Input/Output, Assignment, Call blocks.
  - **Control Flow:** Start, End, Return capsules; If-Else diamonds; While and Do-While loops.
  - **Annotations:** Yellow floating sticky notes that can be dragged, resized, and filled with free text.
- **Vector-First Rendering:** Diagrams are rendered natively inside an SVG viewport using native `<text>` tags (no `<foreignObject>` hacks) for high-fidelity scaling and vector graphics compatibility.
- **Client-Side Export Capabilities:**
  - Save/Load project state as JSON.
  - Export the active flowchart subroutine as a clean, transparent SVG.
  - Generate a multi-page PDF document mapping each subroutine to its own page.

## Project Structure

- `web/` - Application client files.
  - `web/index.html` - The application user interface.
  - `web/index.css` - Custom styling and design tokens.
  - `web/js/app.js` - Application logic, state binding, and event handling.
  - `web/js/evaluator.js` - Pluggable expression evaluation engine.
  - `web/js/interpreter.js` - Generator-based step-by-step flowchart execution engine.
  - `web/js/layout.js` - Layout arithmetic and SVG generation.
  - `web/js/state.js` - Redux-like flowchart state manager.
- `server.js` - Node.js local development server.
- `doc/spec.md` - Technical specification and development phases.

## Getting Started

### Local Development

1. Clone or download the repository.
2. Run the local development server:
   ```bash
   npm start
   ```
3. Open your browser and navigate to `http://localhost:3000`.

### Static Deployment

Since Flowchart Studio is built entirely with client-side web technologies, you can deploy the contents of the `web` directory directly to any static web hosting provider (e.g., GitHub Pages, Netlify, Vercel, or a standard Nginx/Apache web server) without requiring a Node.js runtime environment.

## Acknowledgements

The visual UI design and structural flow architecture of Flowchart Studio is inspired by **[Flowgorithm](http://www.flowgorithm.org/)**, a free beginner's programming tool. We acknowledge and thank the creators of Flowgorithm for establishing a clean visual standard for educational flowchart-based programming.
