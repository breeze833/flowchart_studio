/**
 * Pluggable Expression Evaluator for Flowchart Studio.
 * Currently implements JavaScript-based expression parsing and assignment.
 */

function rewriteExpression(expression, functionNames) {
  if (functionNames.length === 0) return expression;
  const escapedNames = functionNames.map(name => name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
  const regex = new RegExp(`\\b(${escapedNames})\\s*\\(`, 'g');
  return expression.replace(regex, 'await $1(');
}

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

    const functionNames = keys.filter(k => typeof scope[k] === 'function');
    const hasFunctionCall = functionNames.some(name => {
      const regex = new RegExp(`\\b${name}\\s*\\(`);
      return regex.test(trimmedExpr);
    });

    try {
      if (hasFunctionCall) {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const rewrittenExpr = rewriteExpression(trimmedExpr, functionNames);
        const evaluatorFn = new AsyncFunction(...keys, `return (${rewrittenExpr});`);
        return evaluatorFn(...values);
      } else {
        const evaluatorFn = new Function(...keys, `return (${trimmedExpr});`);
        return evaluatorFn(...values);
      }
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
