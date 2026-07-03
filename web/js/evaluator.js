/**
 * Pluggable Expression Evaluator for Flowchart Studio.
 * Currently implements JavaScript-based expression parsing and assignment.
 */

export class JSExpressionEvaluator {
  /**
   * Evaluates a string expression against a variable scope object.
   * @param {string} expression - The expression to evaluate.
   * @param {Object} scope - An object containing variable names and values.
   * @returns {*} The evaluated result.
   */
  evaluate(expression, scope) {
    if (expression === undefined || expression === null || String(expression).trim() === "") {
      return undefined;
    }

    const trimmedExpr = String(expression).trim();
    const keys = Object.keys(scope);
    const values = Object.values(scope);

    try {
      // We construct a Function with the scope keys as arguments
      // and call it passing the scope values.
      const evaluatorFn = new Function(...keys, `return (${trimmedExpr});`);
      return evaluatorFn(...values);
    } catch (err) {
      throw new Error(`Evaluation Error in "${trimmedExpr}": ${err.message}`);
    }
  }

  /**
   * Evaluates an expression and assigns the result to a variable in the scope.
   * @param {string} variableName - Name of the target variable.
   * @param {string} expression - The expression whose value is assigned.
   * @param {Object} scope - The variable scope object.
   * @returns {*} The evaluated value.
   */
  assign(variableName, expression, scope) {
    if (!variableName || String(variableName).trim() === "") {
      throw new Error("Assignment Error: Variable name cannot be empty.");
    }

    const trimmedVar = String(variableName).trim();
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmedVar)) {
      throw new Error(`Assignment Error: Invalid variable name "${trimmedVar}".`);
    }

    const value = this.evaluate(expression, scope);
    scope[trimmedVar] = value;
    return value;
  }
}
