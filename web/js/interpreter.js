/**
 * Generator-based Flowchart Interpreter.
 * Walks the flowchart AST step-by-step, managing call stacks,
 * variable scopes, and yielding actions back to the runner for UI updates.
 */

export class FlowchartInterpreter {
  /**
   * @param {Object} procedures - The procedures object from appState.
   * @param {Object} evaluator - The expression evaluator instance.
   */
  constructor(procedures, evaluator) {
    this.procedures = procedures;
    this.evaluator = evaluator;
    this.globalScope = {};
    this.callStack = [];
    this.isRunning = false;
    this.activeGenerator = null;
  }

  /**
   * Resolves the current active stack frame.
   */
  getCurrentFrame() {
    if (this.callStack.length === 0) return null;
    return this.callStack[this.callStack.length - 1];
  }

  /**
   * Merges globalScope and current local frame scope for evaluation.
   */
  getCurrentScope() {
    const frame = this.getCurrentFrame();
    const local = frame ? frame.localScope : {};
    return { _result: this.globalScope["_result"], ...local };
  }

  /**
   * Initializes and starts program execution.
   * @returns {Generator} The program execution generator.
   */
  start() {
    this.globalScope = {};
    this.callStack = [];
    this.isRunning = true;
    this.activeGenerator = this.executeProcedure("main", []);
    return this.activeGenerator;
  }

  /**
   * Generator function to execute a specific procedure.
   * @param {string} name - Name of the procedure.
   * @param {Array} argValues - Arguments passed to the procedure.
   */
  *executeProcedure(name, argValues) {
    const proc = this.procedures[name];
    if (!proc) {
      throw new Error(`Subroutine "${name}" not found.`);
    }

    // Set up local parameter scope
    const localScope = {};
    const params = proc.parameters || [];
    for (let i = 0; i < params.length; i++) {
      localScope[params[i]] = argValues[i] !== undefined ? argValues[i] : null;
    }

    this.callStack.push({
      procedureName: name,
      localScope: localScope
    });

    const body = proc.body || [];
    const retVal = yield* this.executeBlockList(body);

    this.callStack.pop();
    return retVal;
  }

  /**
   * Generator to execute a list of nodes sequentially.
   */
  *executeBlockList(blockList) {
    for (const node of blockList) {
      const res = yield* this.executeNode(node);
      if (res && res.type === "RETURN") {
        return res.value;
      }
    }
    return undefined;
  }

  /**
   * Generator to execute a single flowchart node.
   */
  *executeNode(node) {
    // 1. Yield highlight event to let the runner mark the current node
    yield { type: "HIGHLIGHT", nodeId: node.id };

    const currentScope = this.getCurrentScope();

    try {
      switch (node.type) {
        case "start":
          // Entry point, acts as a visual no-op
          break;

        case "end":
          // Terminal block, ends execution
          yield { type: "END" };
          break;

        case "return": {
          let retVal = undefined;
          if (node.expression && String(node.expression).trim() !== "") {
            retVal = this.evaluator.evaluate(node.expression, currentScope);
          }
          return { type: "RETURN", value: retVal };
        }

        case "assignment": {
          const varName = String(node.variable).trim();
          const value = this.evaluator.evaluate(node.expression, currentScope);
          
          const frame = this.getCurrentFrame();
          if (frame) {
            frame.localScope[varName] = value;
          } else {
            this.globalScope[varName] = value;
          }
          break;
        }

        case "input": {
          const varName = String(node.variable).trim();
          // Yield INPUT event. The generator will pause here and resume when user inputs value.
          const val = yield { type: "INPUT", variable: varName };
          
          // Parse value as number if it is a numeric literal to be friendly
          let parsedVal = val;
          if (val !== null && val !== undefined && !isNaN(val) && val.trim() !== "") {
            parsedVal = Number(val);
          }

          const frame = this.getCurrentFrame();
          if (frame) {
            frame.localScope[varName] = parsedVal;
          } else {
            this.globalScope[varName] = parsedVal;
          }
          break;
        }

        case "output": {
          const value = this.evaluator.evaluate(node.expression, currentScope);
          yield { type: "OUTPUT", value: value, newline: node.newline !== false };
          break;
        }

        case "if": {
          const cond = this.evaluator.evaluate(node.condition, currentScope);
          if (cond) {
            const res = yield* this.executeBlockList(node.trueBranch || []);
            if (res && res.type === "RETURN") return res;
          } else {
            const res = yield* this.executeBlockList(node.falseBranch || []);
            if (res && res.type === "RETURN") return res;
          }
          break;
        }

        case "while": {
          while (true) {
            // Highlight the while block itself in each iteration when checking the condition
            yield { type: "HIGHLIGHT", nodeId: node.id };

            const freshScope = this.getCurrentScope();
            const cond = this.evaluator.evaluate(node.condition, freshScope);
            if (!cond) break;

            const res = yield* this.executeBlockList(node.loopBody || []);
            if (res && res.type === "RETURN") return res;
          }
          break;
        }

        case "do-while": {
          while (true) {
            const res = yield* this.executeBlockList(node.loopBody || []);
            if (res && res.type === "RETURN") return res;

            // Highlight the do-while block itself in each iteration when checking the condition
            yield { type: "HIGHLIGHT", nodeId: node.id };

            const freshScope = this.getCurrentScope();
            const cond = this.evaluator.evaluate(node.condition, freshScope);
            if (!cond) break;
          }
          break;
        }

        case "call": {
          // Evaluate arguments list
          let argValues = [];
          if (node.arguments && String(node.arguments).trim() !== "") {
            // Evaluate arguments as a JS array expression
            argValues = this.evaluator.evaluate(`[${node.arguments}]`, currentScope);
            if (!Array.isArray(argValues)) {
              argValues = [argValues];
            }
          }

          // Execute subroutine
          const retVal = yield* this.executeProcedure(node.procedure, argValues);
          
          // Save returned value in global _result variable for debugging / custom flows
          this.globalScope["_result"] = retVal;
          break;
        }
      }
    } catch (err) {
      // Yield execution error details
      yield { type: "ERROR", error: err.message, nodeId: node.id };
      throw err; // Halt generator
    }

    return undefined;
  }
}
