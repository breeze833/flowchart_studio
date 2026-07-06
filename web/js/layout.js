/**
 * Layout and Rendering Engine
 * Computes bounding boxes recursively bottom-up, arranges coordinates top-down,
 * and generates SVG template markup strings.
 */

import { appState } from './state.js';

// Helper to escape HTML to prevent SVG syntax breakage
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Word wrapper based on character limit
function wrapText(text, maxChars = 20) {
  if (typeof text !== 'string' || !text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";
  
  for (const word of words) {
    if (word.length > maxChars) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      let remaining = word;
      while (remaining.length > maxChars) {
        lines.push(remaining.substring(0, maxChars));
        remaining = remaining.substring(maxChars);
      }
      currentLine = remaining;
    } else if ((currentLine + " " + word).trim().length <= maxChars) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// Flat SVG text rendering helper for standard blocks
function renderSVGText(lines, centerX, centerY, lineSpacing = 14, options = {}) {
  const N = lines.length;
  return lines.map((line, idx) => {
    const y = centerY - ((N - 1) / 2) * lineSpacing + idx * lineSpacing;
    const fontSize = options.fontSizes ? (options.fontSizes[idx] || 12) : (options.fontSize || 12);
    const opacity = options.opacities ? (options.opacities[idx] || 1.0) : 1.0;
    const fontWeight = options.fontWeights ? (options.fontWeights[idx] || "500") : "500";
    const fontFamily = options.fontFamily || "system-ui, -apple-system, sans-serif";
    const fill = options.fill || "white";
    
    return `<text x="${centerX}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="${fill}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" opacity="${opacity}">${escapeHtml(line)}</text>`;
  }).join("");
}

// Estimates text height based on approximate font wrapping dimensions
function estimateHeight(text, width, baseHeight) {
  if (!text) return baseHeight;
  const charsPerLine = Math.floor(width / 9.5); // Approx character width for 14px Outfit font
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return baseHeight + (lines - 1) * 16;
}

/**
 * First Pass: Measure (Bottom-Up)
 * Calculates the bounding box (w, h) and xAnchor for a node or sub-tree.
 */
export function calculateLayout(node, pathString = "") {
  if (!node) return null;

  const layout = {
    id: node.id,
    type: node.type,
    original: node,
    path: pathString,
    w: 0,
    h: 0,
    xAnchor: 0,
    x: 0,
    y: 0
  };

  switch (node.type) {
    case "start": {
      const activeProc = appState.procedures[appState.activeScreen];
      const procName = activeProc ? activeProc.name : "main";
      const params = activeProc ? (activeProc.parameters || []) : [];
      const label = `${procName}(${params.join(", ")})`;

      layout.w = 180;
      layout.h = estimateHeight(label, 150, 50);
      layout.xAnchor = 90;
      break;
    }
    case "end":
    case "break":
    case "continue": {
      layout.w = 180;
      layout.h = 50;
      layout.xAnchor = 90;
      break;
    }
    case "return": {
      layout.w = 180;
      const expr = node.expression || "";
      const label = expr ? `RETURN ${expr}` : "RETURN";
      layout.h = estimateHeight(label, 150, 50);
      layout.xAnchor = 90;
      break;
    }
    case "input": {
      layout.w = 180;
      const val = node.variable || "";
      layout.h = estimateHeight(val, 180, 55);
      layout.xAnchor = 90;
      break;
    }
    case "output": {
      layout.w = 180;
      const val = node.expression || "";
      layout.h = estimateHeight(val, 180, 55);
      layout.xAnchor = 90;
      break;
    }
    case "assignment": {
      layout.w = 180;
      const val = `${node.variable || ""} = ${node.expression || ""}`;
      layout.h = estimateHeight(val, 180, 55);
      layout.xAnchor = 90;
      break;
    }
    case "call": {
      layout.w = 180;
      const label = `${node.procedure || ""}(${node.arguments || ""})`;
      layout.h = estimateHeight(label, 144, 55);
      layout.xAnchor = 90;
      break;
    }
    case "if": {
      const trueLayout = calculateSequenceLayout(node.trueBranch, `${pathString}.trueBranch`);
      const falseLayout = calculateSequenceLayout(node.falseBranch, `${pathString}.falseBranch`);

      // Lateral spacing: gap between inner edges of branches
      const sLeft = Math.max(120, trueLayout.w / 2 + 35);
      const sRight = Math.max(120, falseLayout.w / 2 + 35);

      layout.trueLayout = trueLayout;
      layout.falseLayout = falseLayout;
      layout.sLeft = sLeft;
      layout.sRight = sRight;

      layout.w = sLeft + sRight + trueLayout.w / 2 + falseLayout.w / 2;
      layout.xAnchor = sLeft + trueLayout.w / 2;

      const cond = node.condition || "";
      const condHeight = estimateHeight(cond, 120, 60); // diamond bounding box is narrower
      layout.condHeight = condHeight;
      // height = diamond + split drop (20) + max branch height + merge line (30)
      layout.h = condHeight + 20 + Math.max(trueLayout.h, falseLayout.h) + 30;
      break;
    }
    case "while": {
      const bodyLayout = calculateSequenceLayout(node.loopBody, `${pathString}.loopBody`);

      const sLoop = Math.max(120, bodyLayout.w / 2 + 35);
      const xLeft = -sLoop - bodyLayout.w / 2 - 25; // X-coord of loop-back line

      layout.bodyLayout = bodyLayout;
      layout.sLoop = sLoop;
      layout.xLeft = xLeft;

      layout.w = 90 - xLeft; // width from leftmost loopback to right tip of diamond (+90)
      layout.xAnchor = -xLeft;

      const cond = node.condition || "";
      const condHeight = estimateHeight(cond, 120, 60);
      layout.condHeight = condHeight;
      // height = diamond + drop (20) + body height + exit buffer (25)
      layout.h = condHeight + 20 + bodyLayout.h + 25;
      break;
    }
    case "do-while": {
      const bodyLayout = calculateSequenceLayout(node.loopBody, `${pathString}.loopBody`);

      const sLoop = Math.max(120, bodyLayout.w / 2 + 35);
      const xLeft = -sLoop - bodyLayout.w / 2 - 25;

      layout.bodyLayout = bodyLayout;
      layout.sLoop = sLoop;
      layout.xLeft = xLeft;

      const rightBoundary = Math.max(90, bodyLayout.w / 2);
      layout.w = rightBoundary - xLeft;
      layout.xAnchor = -xLeft;

      const cond = node.condition || "";
      const condHeight = estimateHeight(cond, 120, 60);
      layout.condHeight = condHeight;
      // height = inlet (20) + body + connection (20) + diamond + outlet (20)
      layout.h = 20 + bodyLayout.h + 20 + condHeight + 20;
      break;
    }
  }

  return layout;
}

/**
 * Calculates a sequence's layout.
 * A sequence represents a list of sequential blocks.
 */
export function calculateSequenceLayout(blocks, pathPrefix = "") {
  const seqLayout = {
    type: "sequence",
    path: pathPrefix,
    children: [],
    w: 0,
    h: 0,
    xAnchor: 0
  };

  if (!blocks || blocks.length === 0) {
    seqLayout.w = 40;
    seqLayout.h = 50; // simple line of height 50
    seqLayout.xAnchor = 20;
    return seqLayout;
  }

  seqLayout.children = blocks.map((block, idx) => calculateLayout(block, `${pathPrefix}.${idx}`));

  // Width is the max width of children
  const maxChildW = Math.max(...seqLayout.children.map(c => c.w));
  seqLayout.w = Math.max(maxChildW, 180);
  seqLayout.xAnchor = seqLayout.w / 2;

  // Height: inlet (25) + children heights + spaces between children (35px) + outlet (25)
  const sumChildrenH = seqLayout.children.reduce((sum, c) => sum + c.h, 0);
  seqLayout.h = 25 + sumChildrenH + (seqLayout.children.length - 1) * 35 + 25;

  return seqLayout;
}

/**
 * Second Pass: Arrange (Top-Down)
 * Assigns absolute (x, y) coordinates to all nodes in the tree.
 */
export function arrangeLayout(layout, x, y) {
  layout.x = x;
  layout.y = y;

  const center = x + layout.xAnchor;

  switch (layout.type) {
    case "if": {
      const branchY = y + layout.condHeight + 20;
      const trueX = center - layout.sLeft - layout.trueLayout.xAnchor;
      const falseX = center + layout.sRight - layout.falseLayout.xAnchor;

      arrangeSequence(layout.trueLayout, trueX, branchY);
      arrangeSequence(layout.falseLayout, falseX, branchY);
      break;
    }
    case "while": {
      const bodyY = y + layout.condHeight + 20;
      const bodyX = center - layout.sLoop - layout.bodyLayout.xAnchor;

      arrangeSequence(layout.bodyLayout, bodyX, bodyY);
      break;
    }
    case "do-while": {
      const bodyY = y + 20;
      const bodyX = center - layout.bodyLayout.xAnchor;

      arrangeSequence(layout.bodyLayout, bodyX, bodyY);
      break;
    }
  }
}

export function arrangeSequence(seqLayout, startX, startY) {
  seqLayout.x = startX;
  seqLayout.y = startY;

  const mainLineX = startX + seqLayout.xAnchor;

  if (seqLayout.children.length === 0) {
    return;
  }

  let currentY = startY + 25;
  for (const child of seqLayout.children) {
    const childX = mainLineX - child.xAnchor;
    arrangeLayout(child, childX, currentY);
    currentY += child.h + 35;
  }
}

/**
 * Third Pass: Render
 * Generates semantic SVG markup recursively.
 */

// Draws a flowline with hitzone for block insertion
function renderHitzone(x1, y1, x2, y2, path, index, showArrow = true) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  
  // Custom Lucide plus icon equivalent path
  return `
    <g class="hitzone" data-path="${path}" data-index="${index}">
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="flowline" />
      ${showArrow ? `<polygon points="${x2},${y2} ${x2-4},${y2-7} ${x2+4},${y2-7}" class="flowline-arrow" />` : ''}
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="hit-indicator" />
      <circle cx="${mx}" cy="${my}" r="11" class="plus-button-bg" />
      <path d="M ${mx - 4} ${my} L ${mx + 4} ${my} M ${mx} ${my - 4} L ${mx} ${my + 4}" class="plus-button-icon" />
    </g>
  `;
}

export function renderLayoutSVG(layout, selectedId) {
  const isSelected = selectedId === layout.id;
  const selectedClass = isSelected ? `selected selected-${layout.type}` : '';
  const center = layout.x + layout.xAnchor;

  switch (layout.type) {
    case "start": {
      const activeProc = appState.procedures[appState.activeScreen];
      const procName = activeProc ? activeProc.name : "main";
      const params = activeProc ? (activeProc.parameters || []) : [];
      const label = `${procName}(${params.join(", ")})`;
      const grad = "url(#grad-start)";

      const lines = ["START", ...wrapText(label, 18)];
      const textMarkup = renderSVGText(lines, center, layout.y + layout.h / 2, 14, {
        fontSizes: [8.5, 12, 12, 12],
        fontWeights: ["bold", "500", "500", "500"],
        opacities: [0.75, 1.0, 1.0, 1.0]
      });

      return `
        <g class="node-group ${selectedClass}" data-id="${layout.id}" data-type="start">
          <rect x="${layout.x}" y="${layout.y}" width="${layout.w}" height="${layout.h}" rx="${layout.h / 2}" ry="${layout.h / 2}" class="node-shape" fill="${grad}" filter="url(#shadow)" />
          ${textMarkup}
        </g>
      `;
    }
    case "end": {
      const grad = "url(#grad-end)";
      const textMarkup = renderSVGText(["END"], center, layout.y + layout.h / 2, 14, {
        fontSize: 13,
        fontWeight: "bold"
      });
      return `
        <g class="node-group ${selectedClass}" data-id="${layout.id}" data-type="end">
          <rect x="${layout.x}" y="${layout.y}" width="${layout.w}" height="${layout.h}" rx="${layout.h / 2}" ry="${layout.h / 2}" class="node-shape" fill="${grad}" filter="url(#shadow)" />
          ${textMarkup}
        </g>
      `;
    }
    case "break": {
      const grad = "url(#grad-break)";
      const textMarkup = renderSVGText(["BREAK"], center, layout.y + layout.h / 2, 14, {
        fontSize: 13,
        fontWeight: "bold"
      });
      return `
        <g class="node-group ${selectedClass}" data-id="${layout.id}" data-type="break">
          <rect x="${layout.x}" y="${layout.y}" width="${layout.w}" height="${layout.h}" rx="${layout.h / 2}" ry="${layout.h / 2}" class="node-shape" fill="${grad}" filter="url(#shadow)" />
          ${textMarkup}
        </g>
      `;
    }
    case "continue": {
      const grad = "url(#grad-continue)";
      const textMarkup = renderSVGText(["CONTINUE"], center, layout.y + layout.h / 2, 14, {
        fontSize: 13,
        fontWeight: "bold"
      });
      return `
        <g class="node-group ${selectedClass}" data-id="${layout.id}" data-type="continue">
          <rect x="${layout.x}" y="${layout.y}" width="${layout.w}" height="${layout.h}" rx="${layout.h / 2}" ry="${layout.h / 2}" class="node-shape" fill="${grad}" filter="url(#shadow)" />
          ${textMarkup}
        </g>
      `;
    }
    case "return": {
      const expr = layout.original.expression || "";
      const grad = "url(#grad-start)";
      const lines = expr ? ["RETURN", ...wrapText(expr, 18)] : ["RETURN"];
      const textMarkup = renderSVGText(lines, center, layout.y + layout.h / 2, 14, {
        fontSizes: expr ? [8.5, 12, 12, 12] : [13],
        fontWeights: expr ? ["bold", "500", "500", "500"] : ["bold"],
        opacities: expr ? [0.75, 1.0, 1.0, 1.0] : [1.0]
      });
      return `
        <g class="node-group ${selectedClass}" data-id="${layout.id}" data-type="return">
          <rect x="${layout.x}" y="${layout.y}" width="${layout.w}" height="${layout.h}" rx="${layout.h / 2}" ry="${layout.h / 2}" class="node-shape" fill="${grad}" filter="url(#shadow)" />
          ${textMarkup}
        </g>
      `;
    }

    case "input":
    case "output": {
      const isInput = layout.type === "input";
      const typeLabel = isInput ? "INPUT" : "OUTPUT";
      const val = isInput ? (layout.original.variable || "") : (layout.original.expression || "");
      const points = `${layout.x + 18},${layout.y} ${layout.x + layout.w},${layout.y} ${layout.x + layout.w - 18},${layout.y + layout.h} ${layout.x},${layout.y + layout.h}`;

      const lines = [typeLabel, ...wrapText(val, 18)];
      const textMarkup = renderSVGText(lines, center, layout.y + layout.h / 2, 14, {
        fontSizes: [8.5, 12, 12, 12],
        fontWeights: ["bold", "500", "500", "500"],
        opacities: [0.75, 1.0, 1.0, 1.0]
      });

      return `
        <g class="node-group ${selectedClass}" data-id="${layout.id}" data-type="${layout.type}">
          <polygon points="${points}" class="node-shape" fill="url(#grad-io)" filter="url(#shadow)" />
          ${textMarkup}
        </g>
      `;
    }

    case "assignment": {
      const variable = layout.original.variable || "";
      const expr = layout.original.expression || "";
      const val = `${variable} = ${expr}`;

      const lines = ["ASSIGN", ...wrapText(val, 18)];
      const textMarkup = renderSVGText(lines, center, layout.y + layout.h / 2, 14, {
        fontSizes: [8.5, 12, 12, 12],
        fontWeights: ["bold", "500", "500", "500"],
        opacities: [0.75, 1.0, 1.0, 1.0]
      });

      return `
        <g class="node-group ${selectedClass}" data-id="${layout.id}" data-type="${layout.type}">
          <rect x="${layout.x}" y="${layout.y}" width="${layout.w}" height="${layout.h}" rx="8" ry="8" class="node-shape" fill="url(#grad-assign)" filter="url(#shadow)" />
          ${textMarkup}
        </g>
      `;
    }

    case "call": {
      const procName = layout.original.procedure || "";
      const args = layout.original.arguments || "";
      const val = `${procName}(${args})`;

      const lines = ["CALL", ...wrapText(val, 18)];
      const textMarkup = renderSVGText(lines, center, layout.y + layout.h / 2, 14, {
        fontSizes: [8.5, 12, 12, 12],
        fontWeights: ["bold", "500", "500", "500"],
        opacities: [0.75, 1.0, 1.0, 1.0]
      });

      return `
        <g class="node-group ${selectedClass}" data-id="${layout.id}" data-type="call">
          <rect x="${layout.x}" y="${layout.y}" width="${layout.w}" height="${layout.h}" rx="8" ry="8" class="node-shape" fill="url(#grad-call)" filter="url(#shadow)" />
          <line x1="${layout.x + 15}" y1="${layout.y}" x2="${layout.x + 15}" y2="${layout.y + layout.h}" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" />
          <line x1="${layout.x + layout.w - 15}" y1="${layout.y}" x2="${layout.x + layout.w - 15}" y2="${layout.y + layout.h}" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" />
          ${textMarkup}
        </g>
      `;
    }

    case "if": {
      const cond = layout.original.condition || "";
      const condHeight = layout.condHeight;
      const points = `${center},${layout.y} ${center + 90},${layout.y + condHeight/2} ${center},${layout.y + condHeight} ${center - 90},${layout.y + condHeight/2}`;
      
      const trueBranchY = layout.y + condHeight + 20;
      const yBottom = trueBranchY + Math.max(layout.trueLayout.h, layout.falseLayout.h);
      const trueEnd = trueBranchY + layout.trueLayout.h;
      const falseEnd = trueBranchY + layout.falseLayout.h;

      let html = `
        <g class="node-group ${selectedClass}" data-id="${layout.id}" data-type="if">
          <!-- Diamond Shape -->
          <polygon points="${points}" class="node-shape" fill="url(#grad-cond)" filter="url(#shadow)" />
          ${renderSVGText(wrapText(cond, 14), center, layout.y + condHeight / 2, 14, { fontSize: 12, fontWeight: "500" })}
        </g>

        <!-- True Branch Split Lines (Left) -->
        <path d="M ${center - 90} ${layout.y + condHeight/2} H ${center - layout.sLeft} V ${trueBranchY}" class="flowline" />
        <text x="${center - 100}" y="${layout.y + condHeight/2 - 8}" class="line-label true-label" text-anchor="end">True</text>

        <!-- False Branch Split Lines (Right) -->
        <path d="M ${center + 90} ${layout.y + condHeight/2} H ${center + layout.sRight} V ${trueBranchY}" class="flowline" />
        <text x="${center + 100}" y="${layout.y + condHeight/2 - 8}" class="line-label false-label" text-anchor="start">False</text>

        <!-- Render Branches -->
        ${renderSequenceSVG(layout.trueLayout, selectedId)}
        ${renderSequenceSVG(layout.falseLayout, selectedId)}

        <!-- Bottom Merge Lines -->
        <!-- True Branch Bottom Merge -->
        <path d="M ${center - layout.sLeft} ${trueEnd} V ${yBottom} H ${center}" class="flowline" />
        
        <!-- False Branch Bottom Merge -->
        <path d="M ${center + layout.sRight} ${falseEnd} V ${yBottom} H ${center}" class="flowline" />

        <!-- Final Exit Line -->
        <line x1="${center}" y1="${yBottom}" x2="${center}" y2="${layout.y + layout.h}" class="flowline" />
      `;

      return html;
    }

    case "while": {
      const cond = layout.original.condition || "";
      const condHeight = layout.condHeight;
      const points = `${center},${layout.y} ${center + 90},${layout.y + condHeight/2} ${center},${layout.y + condHeight} ${center - 90},${layout.y + condHeight/2}`;

      const bodyY = layout.y + condHeight + 20;
      const bodyEnd = bodyY + layout.bodyLayout.h;
      const xLoopback = center + layout.xLeft + 15;

      let html = `
        <g class="node-group ${selectedClass}" data-id="${layout.id}" data-type="while">
          <!-- Diamond Shape -->
          <polygon points="${points}" class="node-shape" fill="url(#grad-cond)" filter="url(#shadow)" />
          ${renderSVGText(wrapText(cond, 14), center, layout.y + condHeight / 2, 14, { fontSize: 12, fontWeight: "500" })}
        </g>

        <!-- Loop Body Entry Split Lines (Left) -->
        <path d="M ${center - 90} ${layout.y + condHeight/2} H ${center - layout.sLoop} V ${bodyY}" class="flowline" />
        <text x="${center - 100}" y="${layout.y + condHeight/2 - 8}" class="line-label true-label" text-anchor="end">True</text>

        <!-- Loop Body Render -->
        ${renderSequenceSVG(layout.bodyLayout, selectedId)}

        <!-- Loop Back Path (Dashed) -->
        <path d="M ${center - layout.sLoop} ${bodyEnd} H ${xLoopback} V ${layout.y - 12} H ${center} V ${layout.y}" class="loop-back-line" />
        <polygon points="${center},${layout.y} ${center - 4},${layout.y - 7} ${center + 4},${layout.y - 7}" class="flowline-arrow" style="fill: rgba(148, 163, 184, 0.5);" />

        <!-- False/Exit path (Straight Down) -->
        <line x1="${center}" y1="${layout.y + condHeight}" x2="${center}" y2="${layout.y + layout.h}" class="flowline" />
        <text x="${center + 12}" y="${layout.y + condHeight + 16}" class="line-label false-label" text-anchor="start">False</text>
      `;

      return html;
    }

    case "do-while": {
      const cond = layout.original.condition || "";
      const condHeight = layout.condHeight;
      const bodyY = layout.y + 20;
      const bodyEnd = bodyY + layout.bodyLayout.h;
      const condY = bodyEnd + 20;
      
      const condCenterY = condY + condHeight / 2;
      const points = `${center},${condY} ${center + 90},${condCenterY} ${center},${condY + condHeight} ${center - 90},${condCenterY}`;
      
      const xLoopback = center + layout.xLeft + 15;

      let html = `
        <!-- Inlet Line -->
        <line x1="${center}" y1="${layout.y}" x2="${center}" y2="${bodyY}" class="flowline" />

        <!-- Loop Body Render -->
        ${renderSequenceSVG(layout.bodyLayout, selectedId)}

        <!-- Connection to condition -->
        <line x1="${center}" y1="${bodyEnd}" x2="${center}" y2="${condY}" class="flowline" />
        <polygon points="${center},${condY} ${center - 4},${condY - 7} ${center + 4},${condY - 7}" class="flowline-arrow" />

        <!-- Condition Node -->
        <g class="node-group ${selectedClass}" data-id="${layout.id}" data-type="do-while">
          <!-- Diamond Shape -->
          <polygon points="${points}" class="node-shape" fill="url(#grad-cond)" filter="url(#shadow)" />
          ${renderSVGText(wrapText(cond, 14), center, condY + condHeight / 2, 14, { fontSize: 12, fontWeight: "500" })}
        </g>

        <!-- Loop Back Path (Left) -->
        <path d="M ${center - 90} ${condCenterY} H ${xLoopback} V ${layout.y + 10} H ${center} V ${bodyY}" class="loop-back-line" />
        <polygon points="${center},${bodyY} ${center - 4},${bodyY - 7} ${center + 4},${bodyY - 7}" class="flowline-arrow" style="fill: rgba(148, 163, 184, 0.5);" />
        <text x="${center - 100}" y="${condCenterY - 8}" class="line-label true-label" text-anchor="end">True</text>

        <!-- Exit line (Straight Down) -->
        <line x1="${center}" y1="${condY + condHeight}" x2="${center}" y2="${layout.y + layout.h}" class="flowline" />
        <text x="${center + 12}" y="${condY + condHeight + 16}" class="line-label false-label" text-anchor="start">False</text>
      `;

      return html;
    }
  }

  return "";
}

export function renderSequenceSVG(seqLayout, selectedId) {
  const mainLineX = seqLayout.x + seqLayout.xAnchor;
  let html = "";

  if (seqLayout.children.length === 0) {
    // Return a single hitzone of height 50 representing the flowline (no arrow)
    return renderHitzone(mainLineX, seqLayout.y, mainLineX, seqLayout.y + 50, seqLayout.path, 0, false);
  }

  // Check if first child is "start"
  const hasStartNode = seqLayout.children[0].type === "start";

  // Inlet Line with Hitzone (Index 0) - only render if first node is NOT "start"
  if (!hasStartNode) {
    html += renderHitzone(mainLineX, seqLayout.y, mainLineX, seqLayout.children[0].y, seqLayout.path, 0, true);
  }

  // Render children
  for (let i = 0; i < seqLayout.children.length; i++) {
    const child = seqLayout.children[i];
    
    // Draw the child node
    html += renderLayoutSVG(child, selectedId);
    
    // Draw the line to the next element
    if (i < seqLayout.children.length - 1) {
      const nextChild = seqLayout.children[i + 1];
      html += renderHitzone(mainLineX, child.y + child.h, mainLineX, nextChild.y, seqLayout.path, i + 1, true);
    }
  }

  // Check if last child is "end" or "return"
  const lastChild = seqLayout.children[seqLayout.children.length - 1];
  const hasEndNode = lastChild.type === "end" || lastChild.type === "return";

  // Outlet Line with Hitzone (Index N) - only render if last node is NOT "end" or "return"
  if (!hasEndNode) {
    html += renderHitzone(mainLineX, lastChild.y + lastChild.h, mainLineX, seqLayout.y + seqLayout.h, seqLayout.path, seqLayout.children.length, false);
  }

  return html;
}

/**
 * Renders notes as floating sticky note nodes inside the SVG viewport
 */
export function renderNotesSVG(notes, selectedId) {
  if (!notes || notes.length === 0) return "";

  return notes.map(note => {
    const isSelected = selectedId === note.id;
    const selectedClass = isSelected ? "selected" : "";
    const text = note.text || "Double-click to write note...";

    return `
      <g class="note-group ${selectedClass}" data-id="${note.id}" data-type="note" transform="translate(${note.x}, ${note.y})">
        <!-- Main sticky note shape -->
        <rect x="0" y="0" width="${note.w}" height="${note.h}" rx="6" ry="6" class="note-shape" fill="rgba(250, 204, 21, 0.06)" stroke="rgba(250, 204, 21, 0.3)" stroke-width="1.5" filter="url(#shadow)" />
        
        <!-- Note drag handle header -->
        <rect x="1" y="1" width="${note.w - 2}" height="18" rx="5" ry="5" fill="rgba(250, 204, 21, 0.12)" class="note-drag-handle" style="cursor: move;" />
        <!-- Three grabber dots in drag handle -->
        <circle cx="${note.w / 2 - 6}" cy="9" r="1.2" fill="rgba(250, 204, 21, 0.4)" />
        <circle cx="${note.w / 2}" cy="9" r="1.2" fill="rgba(250, 204, 21, 0.4)" />
        <circle cx="${note.w / 2 + 6}" cy="9" r="1.2" fill="rgba(250, 204, 21, 0.4)" />

        <!-- Text Content -->
        ${(() => {
          const maxChars = Math.max(10, Math.floor((note.w - 16) / 7));
          const lines = wrapText(text, maxChars);
          return lines.map((line, idx) => {
            const ly = 32 + idx * 14;
            if (ly > note.h - 10) return "";
            return `<text x="8" y="${ly}" text-anchor="start" dominant-baseline="central" fill="#fef08a" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="normal">${escapeHtml(line)}</text>`;
          }).join("");
        })()}

        <!-- Resize handle grip -->
        <path d="M ${note.w - 12} ${note.h - 4} L ${note.w - 4} ${note.h - 12} M ${note.w - 8} ${note.h - 4} L ${note.w - 4} ${note.h - 8}" stroke="rgba(250, 204, 21, 0.5)" stroke-width="1.5" stroke-linecap="round" class="note-resize-handle" style="cursor: se-resize;" />
      </g>
    `;
  }).join("");
}

