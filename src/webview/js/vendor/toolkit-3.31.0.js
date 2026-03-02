/**
 * @file Tantrum.js
 *
 * Defines the Tantrum class, a custom AggregateError type for toolkit
 * that collects multiple errors with Sass-style reporting.
 *
 * Auto-wraps plain Error objects in Sass instances while preserving
 * existing Sass errors, providing consistent formatted output for
 * multiple error scenarios.
 */


/**
 * Custom aggregate error class that extends AggregateError.
 * Automatically wraps plain errors in Sass instances for consistent reporting.
 */
class Tantrum extends AggregateError {
  #trace = []
  #sass

  /**
   * Creates a new Tantrum instance.
   *
   * @param {string} message - The aggregate error message
   * @param {Array<Error|Sass>} errors - Array of errors to aggregate
   * @param {Sass} sass - Sass constructor
   */
  constructor(message, errors = [], sass=Sass) {
    // Auto-wrap plain errors in Sass, keep existing Sass instances
    const wrappedErrors = errors.map(error => {
      if(error instanceof sass)
        return error

      if(!(error instanceof Error))
        throw new TypeError(`All items in errors array must be Error instances, got: ${typeof error}`)

      return sass.new(error.message, error)
    });

    super(wrappedErrors, message);

    this.name = "Tantrum";
    this.#sass = sass;
  }

  /**
   * Adds a trace message and returns this instance for chaining.
   *
   * @param {string} message - The trace message to add
   * @param {Error|Sass} [_error] - Optional error (currently unused, reserved for future use)
   * @returns {this} This Tantrum instance for method chaining
   */
  addTrace(message, _error) {
    if(typeof message !== "string")
      throw this.#sass.new(`Tantrum.addTrace expected string, got ${JSON.stringify(message)}`)

    this.trace = message;

    return this
  }

  /**
   * Gets the error trace array.
   *
   * @returns {Array<string>} Array of trace messages
   */
  get trace() {
    return this.#trace
  }

  /**
   * Adds a message to the beginning of the trace array.
   *
   * @param {string} message - The trace message to add
   */
  set trace(message) {
    this.#trace.unshift(message);
  }

  /**
   * Reports all aggregated errors to the console with formatted output.
   *
   * @param {boolean} [nerdMode] - Whether to include detailed stack traces
   * @param {boolean} [isNested] - Whether this is a nested error report
   */
  report(nerdMode = false, isNested = false) {
    if(isNested)
      console.error();

    console.group(
      `[Tantrum Incoming] x${this.errors.length}\n` +
      this.message
    );

    if(this.trace.length > 0)
      console.error(this.trace.join("\n"));

    this.errors.forEach(error => {
      error.report(nerdMode, true);
    });

    console.groupEnd();
  }

  /**
   * Factory method to create a Tantrum instance.
   *
   * @param {string} message - The aggregate error message
   * @param {Array<Error|Sass>} errors - Array of errors to aggregate
   * @returns {Tantrum} New Tantrum instance
   */
  static new(message, errors = []) {
    if(errors instanceof this)
      return errors.addTrace(message)

    return new this(message, errors)
  }
}

/**
 * @file Sass.js
 *
 * Defines the Sass class, a custom error type for toolkit compilation
 * errors.
 *
 * Supports error chaining, trace management, and formatted reporting for both
 * user-friendly and verbose (nerd) output.
 *
 * Used throughout the toolkit for structured error handling and
 * debugging.
 */


/**
 * Custom error class for toolkit errors.
 * Provides error chaining, trace management, and formatted error reporting.
 */
class Sass extends Error {
  #trace = []

  /**
   * Creates a new Sass instance.
   *
   * @param {string} message - The error message
   * @param {...unknown} [arg] - Additional arguments passed to parent Error constructor
   */
  constructor(message, ...arg) {
    super(message, ...arg);

    this.trace = message;
  }

  /**
   * Gets the error trace array.
   *
   * @returns {Array<string>} Array of trace messages
   */
  get trace() {
    return this.#trace
  }

  /**
   * Adds a message to the beginning of the trace array.
   *
   * @param {string} message - The trace message to add
   */
  set trace(message) {
    this.#trace.unshift(message);
  }

  /**
   * Adds a trace message and returns this instance for chaining.
   *
   * @param {string} message - The trace message to add
   * @returns {this} This Sass instance for method chaining
   */
  addTrace(message) {
    if(typeof message !== "string")
      throw this.constructor.new(`Sass.addTrace expected string, got ${JSON.stringify(message)}`)

    this.trace = message;

    return this
  }

  /**
   * Reports the error to the console with formatted output.
   * Optionally includes detailed stack trace information.
   *
   * @param {boolean} [nerdMode] - Whether to include detailed stack trace
   * @param {boolean} [isNested] - Whether this is a nested error report
   */
  report(nerdMode=false, isNested=false) {
    if(isNested)
      console.error();

    console.group(
      `[error] Something Went Wrong\n` +
      this.trace.join("\n")
    );

    if(nerdMode) {
      console.error(
        "\n" +
        `[error] Nerd Victuals\n` +
        this.#fullBodyMassage(this.stack)
      );
    }

    if(this.cause) {
      if(typeof this.cause.report === "function") {
        if(nerdMode) {
          console.error(
            "\n" +
            `[error] Caused By`
          );
        }

        this.cause.report(nerdMode, true);
      } else if(nerdMode && this.cause.stack) {
        console.error();
        console.group();
        console.error(
          `[error] Rethrown From\n` +
          this.#fullBodyMassage(this.cause.stack)
        );
        console.groupEnd();
      }
    }

    console.groupEnd();
  }

  /**
   * Formats the stack trace for display, removing the first line and
   * formatting each line with appropriate indentation.
   *
   * Note: Returns formatted stack trace or undefined if no stack available.
   *
   * @param {string} stack - The error stack to massage.
   * @returns {string|undefined} Formatted stack trace or undefined
   */
  #fullBodyMassage(stack) {
    stack = stack ?? "";
    // Remove the first line, it's already been reported
    const {rest} = stack.match(/^.*?\n(?<rest>[\s\S]+)$/m)?.groups ?? {};
    const lines = [];

    if(rest) {
      lines.push(
        ...rest
          .split("\n")
          .map(line => {
            const at = line.match(/^\s{4}at\s(?<at>.*)$/)?.groups?.at ?? "";

            return at
              ? `* ${at}`
              : line
          })
      );
    }

    return lines.join("\n")
  }

  /**
   * Creates an Sass from an existing Error object with additional
   * trace message.
   *
   * @param {Error} error - The original error object
   * @param {string} message - Additional trace message to add
   * @returns {Sass} New Sass instance with trace from the original error
   * @throws {Sass} If the first parameter is not an Error instance
   */
  static from(error, message) {
    if(!(error instanceof Error))
      throw this.new("Sass.from must take an Error object.")

    const oldMessage = error.message;
    const newError = new this(
      oldMessage, {cause: error}
    ).addTrace(message);

    return newError
  }

  /**
   * Factory method to create or enhance Sass instances.
   * If error parameter is provided, enhances existing Sass or wraps
   * other errors. Otherwise creates a new Sass instance.
   *
   * @param {string} message - The error message
   * @param {Error|Sass|Tantrum} [error] - Optional existing error to wrap or enhance
   * @returns {Sass} New or enhanced Sass instance
   */
  static new(message, error) {
    if(error) {
      if(error instanceof Tantrum)
        return Tantrum.new(message, error)

      return error instanceof this
        ? error.addTrace(message)
        : this.from(error, message)
    } else {

      return new this(message)
    }
  }
}

/**
 * @file Valid.js
 *
 * Provides validation utilities for type checking and assertion.
 * Includes prototype pollution protection for secure object manipulation.
 */


/**
 * Validation utility class providing type checking and assertion methods.
 */
class Valid {
  /**
   * Validates a value against a type. Uses Data.isType.
   *
   * @param {unknown} value - The value to validate
   * @param {string} type - The expected type in the form of "object", "object[]", "object|object[]"
   * @param {object} [options] - Additional options for validation.
   */
  static type(value, type, options) {
    Valid.assert(
      Data.isType(value, type, options),
      `Invalid type. Expected ${type}, got ${JSON.stringify(value)}`,
      1,
    );
  }

  /**
   * Asserts a condition
   *
   * @param {boolean} condition - The condition to assert
   * @param {string} message - The message to display if the condition is not
   *                           met
   * @param {number} [arg] - The argument to display if the condition is not
   *                         met (optional)
   */
  static assert(condition, message, arg = null) {
    if(!Data.isType(condition, "boolean")) {
      throw Sass.new(`Condition must be a boolean, got ${condition}`)
    }

    if(!Data.isType(message, "string")) {
      throw Sass.new(`Message must be a string, got ${message}`)
    }

    if(!(arg === null || arg === undefined || typeof arg === "number")) {
      throw Sass.new(`Arg must be a number, got ${arg}`)
    }

    if(!condition)
      throw Sass.new(`${message}${arg ? `: ${arg}` : ""}`)
  }

  static #restrictedProto = ["__proto__", "constructor", "prototype"]

  /**
   * Protects against prototype pollution by checking keys for dangerous property names.
   * Throws if any restricted prototype properties are found in the keys array.
   *
   * @param {Array<string>} keys - Array of property keys to validate
   * @throws {Sass} If any key matches restricted prototype properties (__proto__, constructor, prototype)
   */
  static prototypePollutionProtection(keys) {
    Valid.type(keys, "String[]");

    const oopsIDidItAgain = Collection.intersection(this.#restrictedProto, keys);

    Valid.assert(
      oopsIDidItAgain.length === 0,
      `We don't pee in your pool, don't pollute ours with your ${String(oopsIDidItAgain)}`
    );
  }
}

/**
 * Utility class providing common helper functions for string manipulation,
 * timing, and option parsing.
 */
class Util {
  /**
   * Capitalizes the first letter of a string.
   *
   * @param {string} text - The text to capitalize
   * @returns {string} Text with first letter capitalized
   */
  static capitalize(text) {
    if(typeof text !== "string")
      throw new TypeError("Util.capitalize expects a string")

    if(text.length === 0)
      return ""

    const [first, ...rest] = Array.from(text);

    return `${first.toLocaleUpperCase()}${rest.join("")}`
  }

  /**
   * Measure wall-clock time for an async function.
   *
   * @template T
   * @param {() => Promise<T>} fn - Thunk returning a promise.
   * @returns {Promise<{result: T, cost: number}>} Object containing result and elapsed ms (number, 1 decimal).
   */
  static async time(fn) {
    const t0 = performance.now();
    const result = await fn();
    const cost = Math.round((performance.now() - t0) * 10) / 10;

    return {result, cost}
  }

  /**
   * Right-align a string inside a fixed width (left pad with spaces).
   * If the string exceeds width it is returned unchanged.
   *
   * @param {string|number} text - Text to align.
   * @param {number} width - Target field width (default 80).
   * @returns {string} Padded string.
   */
  static rightAlignText(text, width=80) {
    const work = String(text);

    if(work.length > width)
      return work

    const diff = width-work.length;

    return `${" ".repeat(diff)}${work}`
  }

  /**
   * Centre-align a string inside a fixed width (pad with spaces on left).
   * If the string exceeds width it is returned unchanged.
   *
   * @param {string|number} text - Text to align.
   * @param {number} width - Target field width (default 80).
   * @returns {string} Padded string with text centred.
   */
  static centreAlignText(text, width=80) {
    const work = String(text);

    if(work.length >= width)
      return work

    const totalPadding = width - work.length;
    const leftPadding = Math.floor(totalPadding / 2);
    const rightPadding = totalPadding - leftPadding;

    return `${" ".repeat(leftPadding)}${work}${" ".repeat(rightPadding)}`
  }

  /**
   * Determine the Levenshtein distance between two string values
   *
   * @param {string} a The first value for comparison.
   * @param {string} b The second value for comparison.
   * @returns {number} The Levenshtein distance
   */
  static levenshteinDistance(a, b) {
    const matrix = Array.from({length: a.length + 1}, (_, i) =>
      Array.from({length: b.length + 1}, (_, j) =>
        (i === 0 ? j : j === 0 ? i : 0)
      )
    );

    for(let i = 1; i <= a.length; i++) {
      for(let j = 1; j <= b.length; j++) {
        matrix[i][j] =
          a[i - 1] === b[j - 1]
            ? matrix[i - 1][j - 1]
            : 1 + Math.min(
              matrix[i - 1][j], matrix[i][j - 1],
              matrix[i - 1][j - 1]
            );
      }
    }

    return matrix[a.length][b.length]
  }

  /**
   * Determine the closest match between a string and allowed values
   * from the Levenshtein distance.
   *
   * @param {string} input The input string to resolve
   * @param {Array<string>} allowedValues The values which are permitted
   * @param {number} [threshold] Max edit distance for a "close match"
   * @returns {string} Suggested, probable match.
   */
  static findClosestMatch(input, allowedValues, threshold=2) {
    let closestMatch = null;
    let closestDistance = Infinity;
    let closestLengthDiff = Infinity;

    for(const value of allowedValues) {
      const distance = this.levenshteinDistance(input, value);
      const lengthDiff = Math.abs(input.length - value.length);

      if(distance < closestDistance && distance <= threshold) {
        closestMatch = value;
        closestDistance = distance;
        closestLengthDiff = lengthDiff;
      } else if(distance === closestDistance &&
                 distance <= threshold &&
                 lengthDiff < closestLengthDiff) {
        closestMatch = value;
        closestLengthDiff = lengthDiff;
      }
    }

    return closestMatch
  }

  static regexify(input, trim=true, flags=[]) {
    Valid.type(input, "String");
    Valid.type(trim, "Boolean");
    Valid.type(flags, "Array");

    Valid.assert(
      flags.length === 0 ||
      (flags.length > 0 && Collection.isArrayUniform(flags, "String")),
      "All flags must be strings");

    return new RegExp(
      input
        .split(/\r\n|\r|\n/)
        .map(i => trim ? i.trim() : i)
        .filter(i => trim ? Boolean(i) : true)
        .join("")
      , flags?.join(""))
  }
}

/**
 * @file Type specification and validation utilities.
 * Provides TypeSpec class for parsing and validating complex type specifications
 * including arrays, unions, and options.
 */


/**
 * Options for creating a new TypeSpec.
 *
 * @typedef {object} TypeSpecOptions
 * @property {string} [delimiter="|"] - The delimiter for union types
 */

/**
 * Options for type validation methods.
 *
 * @typedef {object} TypeValidationOptions
 * @property {boolean} [allowEmpty=true] - Whether empty values are allowed
 */

/**
 * Type specification class for parsing and validating complex type definitions.
 * Supports union types, array types, and validation options.
 */
class TypeSpec {
  #specs

  /**
   * Creates a new TypeSpec instance.
   *
   * @param {string} string - The type specification string (e.g., "string|number", "object[]")
   * @param {TypeSpecOptions} [options] - Additional parsing options
   */
  constructor(string, options) {
    this.#specs = [];
    this.#parse(string, options);
    Object.freeze(this.#specs);
    this.specs = this.#specs;
    this.length = this.#specs.length;
    this.stringRepresentation = this.toString();
    Object.freeze(this);
  }

  /**
   * Returns a string representation of the type specification.
   *
   * @returns {string} The type specification as a string (e.g., "string|number[]")
   */
  toString() {
    return this.#specs
      .map(spec => {
        return `${spec.typeName}${spec.array ? "[]" : ""}`
      })
      .join("|")
  }

  /**
   * Returns a JSON representation of the TypeSpec.
   *
   * @returns {unknown} Object containing specs, length, and string representation
   */
  toJSON() {
    // Serialize as a string representation or as raw data
    return {
      specs: this.#specs,
      length: this.length,
      stringRepresentation: this.toString(),
    }
  }

  /**
   * Executes a provided function once for each type specification.
   *
   * @param {function(unknown): void} callback - Function to execute for each spec
   */
  forEach(callback) {
    this.#specs.forEach(callback);
  }

  /**
   * Tests whether all type specifications pass the provided test function.
   *
   * @param {function(unknown): boolean} callback - Function to test each spec
   * @returns {boolean} True if all specs pass the test
   */
  every(callback) {
    return this.#specs.every(callback)
  }

  /**
   * Tests whether at least one type specification passes the provided test function.
   *
   * @param {function(unknown): boolean} callback - Function to test each spec
   * @returns {boolean} True if at least one spec passes the test
   */
  some(callback) {
    return this.#specs.some(callback)
  }

  /**
   * Creates a new array with all type specifications that pass the provided test function.
   *
   * @param {function(unknown): boolean} callback - Function to test each spec
   * @returns {Array<unknown>} New array with filtered specs
   */
  filter(callback) {
    return this.#specs.filter(callback)
  }

  /**
   * Creates a new array populated with the results of calling the provided function on every spec.
   *
   * @param {function(unknown): unknown} callback - Function to call on each spec
   * @returns {Array<unknown>} New array with mapped values
   */
  map(callback) {
    return this.#specs.map(callback)
  }

  /**
   * Executes a reducer function on each spec, resulting in a single output value.
   *
   * @param {function(unknown, unknown): unknown} callback - Function to execute on each spec
   * @param {unknown} initialValue - Initial value for the accumulator
   * @returns {unknown} The final accumulated value
   */
  reduce(callback, initialValue) {
    return this.#specs.reduce(callback, initialValue)
  }

  /**
   * Returns the first type specification that satisfies the provided testing function.
   *
   * @param {function(unknown): boolean} callback - Function to test each spec
   * @returns {object|undefined} The first spec that matches, or undefined
   */
  find(callback) {
    return this.#specs.find(callback)
  }

  /**
   * Tests whether a value matches any of the type specifications.
   * Handles array types, union types, and empty value validation.
   *
   * @param {unknown} value - The value to test against the type specifications
   * @param {TypeValidationOptions} [options] - Validation options
   * @returns {boolean} True if the value matches any type specification
   */
  matches(value, options) {
    return this.match(value, options).length > 0
  }

  /**
   * Returns matching type specifications for a value.
   *
   * @param {unknown} value - The value to test against the type specifications
   * @param {TypeValidationOptions} [options] - Validation options
   * @returns {Array<object>} Array of matching type specifications
   */
  match(value, options) {
    const allowEmpty = options?.allowEmpty ?? true;

    // If we have a list of types, because the string was validly parsed, we
    // need to ensure that all of the types that were parsed are valid types in
    // JavaScript.
    if(this.length && !this.every(t => Data.isValidType(t.typeName)))
      return []

    // Now, let's do some checking with the types, respecting the array flag
    // with the value
    const valueType = Data.typeOf(value);
    const isArray = valueType === "Array";

    // We need to ensure that we match the type and the consistency of the
    // types in an array, if it is an array and an array is allowed.
    const matchingTypeSpec = this.filter(spec => {
      const {typeName: allowedType, array: allowedArray} = spec;
      const empty =
        Data.emptyableTypes.includes(allowedType) &&
        Data.isEmpty(value);

      // Handle non-array values
      if(!isArray && !allowedArray) {
        if(valueType === allowedType)
          return allowEmpty || !empty

        if(valueType === "Null" || valueType === "Undefined")
          return false

        if(allowedType === "Object" && Data.isPlainObject(value))
          return true

        // We already don't match directly, let's check their breeding.
        const lineage = this.#getTypeLineage(value);

        return lineage.includes(allowedType)
      }

      // Handle array values
      if(isArray) {
        // Special case for generic "Array" type
        if(allowedType === "Array" && !allowedArray)
          return allowEmpty || !empty

        // Must be an array type specification
        if(!allowedArray)
          return false

        // Handle empty arrays
        if(empty)
          return allowEmpty

        // Check if array elements match the required type
        return Collection.isArrayUniform(value, allowedType)
      }

      return false
    });

    return matchingTypeSpec
  }

  /**
   * Parses a type specification string into individual type specs.
   * Handles union types separated by delimiters and array notation.
   *
   * @private
   * @param {string} string - The type specification string to parse
   * @param {TypeSpecOptions} [options] - Parsing options
   * @throws {Sass} If the type specification is invalid
   */
  #parse(string, options={delimiter: "|"}) {
    const delimiter = options?.delimiter ?? "|";
    const parts = string.split(delimiter);

    this.#specs = parts.map(part => {
      const typeMatches = /^(\w+)(\[\])?$/.exec(part);

      if(!typeMatches || typeMatches.length !== 3)
        throw Sass.new(`Invalid type: ${part}`)

      const typeName = Util.capitalize(typeMatches[1]);

      if(!Data.isValidType(typeName))
        throw Sass.new(`Invalid type: ${typeMatches[1]}`)

      return {
        typeName,
        array: typeMatches[2] === "[]",
      }
    });
  }

  #getTypeLineage(value) {
    const lineage = [Object.getPrototypeOf(value)];
    const names = [lineage.at(-1).constructor.name];

    for(;;) {
      const prototype = Object.getPrototypeOf(lineage.at(-1));
      const name = prototype?.constructor.name;

      if(!prototype || !name || name === "Object")
        break

      lineage.push(prototype);
      names.push(prototype.constructor.name);
    }

    return names
  }
}

/**
 * @file Data utility functions for type checking, object manipulation, and
 * array operations.
 *
 * Provides comprehensive utilities for working with JavaScript data types and
 * structures.
 */


class Data {
/**
 * Array of JavaScript primitive type names.
 * Includes basic types and object categories from the typeof operator.
 *
 * @type {Array<string>}
 */
  static primitives = Object.freeze([
  // Primitives
    "Bigint",
    "Boolean",
    "Class",
    "Null",
    "Number",
    "String",
    "Symbol",
    "Undefined",

    // Object Categories from typeof
    "Function",
    "Object",
  ])

  /**
   * Array of JavaScript constructor names for built-in objects.
   * Includes common object types and typed arrays.
   *
   * @type {Array<string>}
   */
  static constructors = Object.freeze([
  // Object Constructors
    "Array",
    "Date",
    "Error",
    "Float32Array",
    "Float64Array",
    "Function",
    "Int8Array",
    "Map",
    "Object",
    "Promise",
    "RegExp",
    "Set",
    "Uint8Array",
    "WeakMap",
    "WeakSet",
  ])

  /**
   * Combined array of all supported data types (primitives and constructors in
   * lowercase).
   *
   * Used for type validation throughout the utility functions.
   *
   * @type {Array<string>}
   */
  static dataTypes = Object.freeze([
    ...Data.primitives,
    ...Data.constructors
  ])

  /**
   * Array of type names that can be checked for emptiness.
   * These types have meaningful empty states that can be tested.
   *
   * @type {Array<string>}
   */
  static emptyableTypes = Object.freeze(["String", "Array", "Object", "Map", "Set"])

  /**
   * Appends a string to another string if it does not already end with it.
   *
   * @param {string} string - The string to append to
   * @param {string} append - The string to append
   * @returns {string} The appended string
   */
  static append(string, append) {
    return string.endsWith(append)
      ? string :
      `${string}${append}`
  }

  /**
   * Prepends a string to another string if it does not already start with it.
   *
   * @param {string} string - The string to prepend to
   * @param {string} prepend - The string to prepend
   * @returns {string} The prepended string
   */
  static prepend(string, prepend) {
    return string.startsWith(prepend)
      ? string
      : `${prepend}${string}`
  }

  /**
   * Remove a suffix from the end of a string if present.
   *
   * @param {string} string - The string to process
   * @param {string} toChop - The suffix to remove from the end
   * @param {boolean} [caseInsensitive=false] - Whether to perform case-insensitive matching
   * @returns {string} The string with suffix removed, or original if suffix not found
   * @example
   * Data.chopRight("hello.txt", ".txt") // "hello"
   * Data.chopRight("Hello", "o") // "Hell"
   * Data.chopRight("HELLO", "lo", true) // "HEL"
   */
  static chopRight(string, toChop, caseInsensitive=false) {
    const escaped = toChop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`${escaped}$`, caseInsensitive === true ? "i" : "");

    return string.replace(regex, "")
  }

  /**
   * Remove a prefix from the beginning of a string if present.
   *
   * @param {string} string - The string to process
   * @param {string} toChop - The prefix to remove from the beginning
   * @param {boolean} [caseInsensitive=false] - Whether to perform case-insensitive matching
   * @returns {string} The string with prefix removed, or original if prefix not found
   * @example
   * Data.chopLeft("hello.txt", "hello") // ".txt"
   * Data.chopLeft("Hello", "H") // "ello"
   * Data.chopLeft("HELLO", "he", true) // "LLO"
   */
  static chopLeft(string, toChop, caseInsensitive=false) {
    const escaped = toChop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped}`, caseInsensitive === true ? "i" : "");

    return string.replace(regex, "")
  }

  /**
   * Chop a string after the first occurence of another string.
   *
   * @param {string} string - The string to search
   * @param {string} needle - The bit to chop after
   * @param {boolean} caseInsensitive - Whether to search insensitive to case
   * @returns {string} The remaining string
   */
  static chopAfter(string, needle, caseInsensitive=false) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`${escaped}`, caseInsensitive === true ? "i" : "");
    const index = string.search(regex);

    if(index === -1)
      return string

    return string.slice(0, index)
  }

  /**
   * Chop a string before the first occurrence of another string.
   *
   * @param {string} string - The string to search
   * @param {string} needle - The bit to chop before
   * @param {boolean} caseInsensitive - Whether to search insensitive to case
   * @returns {string} The remaining string
   */
  static chopBefore(string, needle, caseInsensitive=false) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`${escaped}`, caseInsensitive === true ? "i" : "");
    const length = needle.length;
    const index = string.search(regex);

    if(index === -1)
      return string

    return string.slice(index + length)
  }

  /**
   * Options for creating a new TypeSpec.
   *
   * @typedef {object} TypeSpecOptions
   * @property {string} [delimiter="|"] - The delimiter for union types
   */

  /**
   * Options for type validation methods.
   *
   * @typedef {object} TypeValidationOptions
   * @property {boolean} [allowEmpty=true] - Whether empty values are allowed
   */

  /**
   * Creates a type spec from a string. A type spec is an array of objects
   * defining the type of a value and whether an array is expected.
   *
   * @param {string} string - The string to parse into a type spec.
   * @param {TypeSpecOptions} [options] - Additional options for parsing.
   * @returns {Array<object>} An array of type specs.
   */
  static newTypeSpec(string, options) {
    return new TypeSpec(string, options)
  }

  /**
   * Checks if a value is of a specified type
   *
   * @param {unknown} value The value to check
   * @param {string|TypeSpec} type The type to check for
   * @param {TypeValidationOptions} [options] Additional options for checking
   * @returns {boolean} Whether the value is of the specified type
   */
  static isType(value, type, options = {}) {
    const typeSpec = type instanceof TypeSpec
      ? type
      : Data.newTypeSpec(type, options);

    return typeSpec.matches(value, options)
  }

  /**
   * Checks if a type is valid
   *
   * @param {string} type - The type to check
   * @returns {boolean} Whether the type is valid
   */
  static isValidType(type) {
    // Allow built-in types
    if(Data.dataTypes.includes(type))
      return true

    // Allow custom classes (PascalCase starting with capital letter)
    return /^[A-Z][a-zA-Z0-9]*$/.test(type)
  }

  /**
   * Checks if a value is of a specified type. Unlike the type function, this
   * function does not parse the type string, and only checks for primitive
   * or constructor types.
   *
   * @param {unknown} value - The value to check
   * @param {string} type - The type to check for
   * @returns {boolean} Whether the value is of the specified type
   */
  static isBaseType(value, type) {
    if(!Data.isValidType(type))
      return false

    // We gotta do classes up front. Ugh.
    if(/^[Cc]lass$/.test(type)) {
      if(typeof value === "function" &&
      value.prototype &&
      value.prototype.constructor === value)

        return true
    }

    const valueType = Data.typeOf(value);

    // Special cases that need extra validation
    switch(valueType) {
      case "Number":
        return type === "Number" && !isNaN(value) // Excludes NaN
      default:
        return valueType === type
    }
  }

  /**
   * Returns the type of a value, whether it be a primitive, object, or function.
   *
   * @param {unknown} value - The value to check
   * @returns {string} The type of the value
   */
  static typeOf(value) {
    if(value === null)
      return "Null"

    const type = typeof value;

    if(type === "object")
      return value.constructor?.name ?? "Object"

    const [first, ...rest] = Array.from(type);

    return `${first?.toLocaleUpperCase() ?? ""}${rest.join("")}`
  }

  /**
   * Checks a value is undefined or null.
   *
   * @param {unknown} value The value to check
   * @returns {boolean} Whether the value is undefined or null
   */
  static isNothing(value) {
    return value === undefined || value === null
  }

  /**
   * Checks if a value is empty. This function is used to check if an object,
   * array, or string is empty. Null and undefined values are considered empty.
   *
   * @param {unknown} value The value to check
   * @param {boolean} checkForNothing Whether to check for null or undefined
   *                                  values
   * @returns {boolean} Whether the value is empty
   */
  static isEmpty(value, checkForNothing = true) {
    if(checkForNothing && Data.isNothing(value))
      return true

    // When checkForNothing is false, null/undefined should not be treated as empty
    // They should be processed like regular values
    if(!checkForNothing && Data.isNothing(value))
      return false

    const type = Data.typeOf(value);

    if(!Data.emptyableTypes.includes(type))
      return false

    switch(type) {
      case "Array":
        return value.length === 0
      case "Object":
        // null was already handled above, so this should only be real objects
        return Object.keys(value).length === 0
      case "String":
        return value.trim().length === 0
      case "Map":
      case "Set":
        return value.size === 0
      default:
        return false
    }
  }

  /**
   * Freezes an object and all of its properties recursively.
   *
   * @param {object} obj The object to freeze.
   * @returns {object} The frozen object.
   */
  static deepFreezeObject(obj) {
    if(obj === null || typeof obj !== "object")
      return obj // Skip null and non-objects

    // Retrieve and freeze properties
    const propNames = Object.getOwnPropertyNames(obj);

    for(const name of propNames) {
      const value = obj[name];

      // Recursively freeze nested objects
      if(typeof value === "object" && value !== null)
        Data.deepFreezeObject(value);
    }

    // Freeze the object itself
    return Object.freeze(obj)
  }

  /**
   * Ensures that a nested path of objects exists within the given object.
   * Creates empty objects along the path if they don't exist.
   *
   * @param {object} obj - The object to check/modify
   * @param {Array<string>} keys - Array of keys representing the path to ensure
   * @returns {object} Reference to the deepest nested object in the path
   */
  static assureObjectPath(obj, keys) {
    let current = obj;  // a moving reference to internal objects within obj
    const len = keys.length;

    for(let i = 0; i < len; i++) {
      const elem = keys[i];

      if(!current[elem])
        current[elem] = {};

      current = current[elem];
    }

    // Return the current pointer
    return current
  }

  /**
   * Sets a value in a nested object structure using an array of keys; creating
   * the structure if it does not exist.
   *
   * @param {object} obj - The target object to set the value in
   * @param {Array<string>} keys - Array of keys representing the path to the target property
   * @param {unknown} value - The value to set at the target location
   */
  static setNestedValue(obj, keys, value) {
    const nested = Data.assureObjectPath(obj, keys.slice(0, -1));

    nested[keys[keys.length-1]] = value;
  }

  /**
   * Deeply merges two or more objects. Arrays are replaced, not merged.
   *
   * @param {...object} sources - Objects to merge (left to right)
   * @returns {object} The merged object
   */
  static mergeObject(...sources) {
    const isObject = obj => typeof obj === "object" && obj !== null && !Array.isArray(obj);

    return sources.reduce((acc, obj) => {
      if(!isObject(obj))
        return acc

      Object.keys(obj).forEach(key => {
        const accVal = acc[key];
        const objVal = obj[key];

        if(isObject(accVal) && isObject(objVal))
          acc[key] = Data.mergeObject(accVal, objVal);
        else
          acc[key] = objVal;
      });

      return acc
    }, {})
  }

  /**
   * Filters an array asynchronously using a predicate function.
   * Applies the predicate to all items in parallel and returns filtered results.
   *
   * @param {Array<unknown>} arr - The array to filter
   * @param {(value: unknown) => Promise<boolean>} predicate - Async predicate function that returns a promise resolving to boolean
   * @returns {Promise<Array<unknown>>} Promise resolving to the filtered array
   */
  static async asyncFilter(arr, predicate) {
    const results = await Promise.all(arr.map(predicate));

    return arr.filter((_, index) => results[index])
  }

  /**
   * Ensures a value is within a specified range.
   *
   * @param {number} val - The value to check.
   * @param {number} min - The minimum value.
   * @param {number} max - The maximum value.
   * @returns {number} The value, constrained within the range of `min` to `max`.
   */
  static clamp(val, min, max) {
    return val >= min ? val <= max ? val : max : min
  }

  /**
   * Checks if a value is within a specified range (inclusive).
   *
   * @param {number} val - The value to check.
   * @param {number} min - The minimum value (inclusive).
   * @param {number} max - The maximum value (inclusive).
   * @returns {boolean} True if the value is within the range, false otherwise.
   */
  static clamped(val, min, max) {
    return val >= min && val <= max
  }

  /**
   * Checks if a value is a plain object - created with object literals {},
   * new Object(), or Object.create(null).
   *
   * Distinguishes plain objects from objects created by custom constructors, built-ins,
   * or primitives. Plain objects only have Object.prototype or null in their prototype chain.
   *
   * @param {unknown} value - The value to check
   * @returns {boolean} True if the value is a plain object, false otherwise
   *
   * @example
   * isPlainObject({}) // true
   * isPlainObject(new Object()) // true
   * isPlainObject(Object.create(null)) // true
   * isPlainObject([]) // false
   * isPlainObject(new Date()) // false
   * isPlainObject(null) // false
   * isPlainObject("string") // false
   * isPlainObject(class Person{}) // false
   */
  static isPlainObject(value) {
    // First, check if it's an object and not null
    if(typeof value !== "object" || value === null)
      return false

    // If it has no prototype, it's plain (created with Object.create(null))
    const proto = Object.getPrototypeOf(value);

    if(proto === null)
      return true

    // Check if the prototype chain ends at Object.prototype
    // This handles objects created with {} or new Object()
    let current = proto;

    while(Object.getPrototypeOf(current) !== null)
      current = Object.getPrototypeOf(current);

    return proto === current
  }

  /**
   * Checks if a value is binary data.
   * Returns true for ArrayBuffer, TypedArrays (Uint8Array, Int16Array, etc.),
   * Blob, and Node Buffer instances.
   *
   * @param {unknown} value - The value to check
   * @returns {boolean} True if the value is binary data, false otherwise
   * @example
   * Data.isBinary(new Uint8Array([1, 2, 3])) // true
   * Data.isBinary(new ArrayBuffer(10)) // true
   * Data.isBinary(Buffer.from('hello')) // true
   * Data.isBinary(new Blob(['text'])) // true
   * Data.isBinary('string') // false
   * Data.isBinary({}) // false
   * Data.isBinary(undefined) // false
   */
  static isBinary(value) {
    return (value !== undefined) &&
           (
             ArrayBuffer.isView(value) ||
             Data.isType(value, "ArrayBuffer|Blob|Buffer")
           )
  }
}

/**
 * @file Collection.js
 *
 * Provides utility functions for working with collections (arrays, objects, sets, maps).
 * Includes methods for iteration, transformation, validation, and manipulation of
 * various collection types.
 */


/**
 * Utility class for collection operations.
 * Provides static methods for working with arrays, objects, sets, and maps.
 */
class Collection {
  /**
   * Evaluates an array with a predicate function, optionally in reverse order.
   * Returns the first truthy result from the predicate.
   *
   * @param {Array<unknown>} collection - The array to evaluate
   * @param {(value: unknown, index: number, array: Array<unknown>) => unknown} predicate - Function to evaluate each element
   * @param {boolean} [forward] - Whether to iterate forward (true) or backward (false). Defaults to true
   * @returns {unknown|undefined} The first truthy result from the predicate, or undefined
   * @throws {Sass} If collection is not an array or predicate is not a function
   */
  static evalArray(collection, predicate, forward=true) {
    const req = "Array";
    const type = Data.typeOf(collection);

    Valid.type(collection, req, `Invalid collection. Expected '${req}, got ${type}`);
    Valid.type(predicate, "Function",
      `Invalid predicate, expected 'Function', got ${Data.typeOf(predicate)}`);

    const work = forward
      ? Array.from(collection)
      : Array.from(collection).toReversed();

    for(let i = 0; i < work.length; i++) {
      const result = predicate(work[i], i, collection) ?? null;

      if(result)
        return result
    }
  }

  /**
   * Evaluates an object with a predicate function.
   * Returns the first truthy result from the predicate.
   *
   * @param {object} collection - The object to evaluate
   * @param {(value: unknown, key: string, object: object) => unknown} predicate - Function to evaluate each property
   * @returns {unknown|undefined} The first truthy result from the predicate, or undefined
   * @throws {Sass} If collection is not an object or predicate is not a function
   */
  static evalObject(collection, predicate) {
    const req = "Object";
    const type = Data.typeOf(collection);

    Valid.type(collection, req, `Invalid collection. Expected '${req}, got ${type}`);
    Valid.type(predicate, "Function",
      `Invalid predicate, expected 'Function', got ${Data.typeOf(predicate)}`);

    const work = Object.entries(collection);

    for(let i = 0; i < work.length; i++) {
      const result = predicate(work[i][1], work[i][0], collection);

      if(result)
        return result
    }
  }

  /**
   * Evaluates a Set with a predicate function.
   * Returns the first truthy result from the predicate.
   *
   * @param {Set<unknown>} collection - The Set to evaluate
   * @param {(value: unknown, set: Set<unknown>) => unknown} predicate - Function to evaluate each element
   * @returns {unknown|undefined} The first truthy result from the predicate, or undefined
   * @throws {Sass} If collection is not a Set or predicate is not a function
   */
  static evalSet(collection, predicate) {
    const req = "Set";
    const type = Data.typeOf(collection);

    Valid.type(collection, req, `Invalid collection. Expected '${req}, got ${type}`);
    Valid.type(predicate, "Function",
      `Invalid predicate, expected 'Function', got ${Data.typeOf(predicate)}`);

    const work = Array.from(collection);

    for(let i = 0; i < work.length; i++) {
      const result = predicate(work[i], collection);

      if(result)
        return result
    }
  }

  /**
   * Evaluates a Map with a predicate function, optionally in reverse order.
   * Returns the first truthy result from the predicate.
   *
   * @param {Map<unknown, unknown>} collection - The Map to evaluate
   * @param {(value: unknown, key: unknown, map: Map<unknown, unknown>) => unknown} predicate - Function to evaluate each entry
   * @param {boolean} [forward] - Whether to iterate forward (true) or backward (false). Defaults to true
   * @returns {unknown|undefined} The first truthy result from the predicate, or undefined
   * @throws {Sass} If collection is not a Map or predicate is not a function
   */
  static evalMap(collection, predicate, forward=true) {
    const req = "Map";
    const type = Data.typeOf(collection);

    Valid.type(collection, req, `Invalid collection. Expected '${req}, got ${type}`);
    Valid.type(predicate, "Function",
      `Invalid predicate, expected 'Function', got ${Data.typeOf(predicate)}`);

    const work = forward
      ? Array.from(collection)
      : Array.from(collection).toReversed();

    for(let i = 0; i < work.length; i++) {
      const result = predicate(work[i][1], work[i][0], collection) ?? null;

      if(result)
        return result
    }
  }

  /**
   * Zips two arrays together into an array of pairs.
   * The resulting array length equals the shorter input array.
   *
   * @param {Array<unknown>} array1 - The first array
   * @param {Array<unknown>} array2 - The second array
   * @returns {Array<[unknown, unknown]>} Array of paired elements
   */
  static zip(array1, array2) {
    const minLength = Math.min(array1.length, array2.length);

    return Array.from({length: minLength}, (_, i) => [array1[i], array2[i]])
  }

  /**
   * Unzips an array of pairs into separate arrays.
   * Transposes a 2D array structure.
   *
   * @param {Array<Array<unknown>>} array - Array of arrays to unzip
   * @returns {Array<Array<unknown>>} Array of unzipped arrays, or empty array for invalid input
   */
  static unzip(array) {
    if(!Array.isArray(array) || array.length === 0) {
      return [] // Handle empty or invalid input
    }

    // Determine the number of "unzipped" arrays needed
    // This assumes all inner arrays have the same length, or we take the max length
    const numUnzippedArrays = Math.max(...array.map(arr => arr.length));

    // Initialize an array of empty arrays to hold the unzipped results
    const unzipped = Array.from({length: numUnzippedArrays}, () => []);

    // Iterate through the zipped array and populate the unzipped arrays
    for(let i = 0; i < array.length; i++) {
      for(let j = 0; j < numUnzippedArrays; j++) {
        unzipped[j].push(array[i][j]);
      }
    }

    return unzipped
  }

  /**
   * Maps an array using an async function, processing items sequentially.
   * Unlike Promise.all(array.map()), this processes one item at a time.
   *
   * @param {Array<unknown>} array - The array to map
   * @param {(item: unknown) => Promise<unknown>} asyncFn - Async function to apply to each element
   * @returns {Promise<Array<unknown>>} Promise resolving to the mapped array
   * @throws {Sass} If array is not an Array or asyncFn is not a function
   */
  static async asyncMap(array, asyncFn) {
    const req = "Array";
    const type = Data.typeOf(array);

    Valid.type(array, req, `Invalid array. Expected '${req}', got '${type}'`);
    Valid.type(asyncFn, "Function",
      `Invalid mapper function, expected 'Function', got '${Data.typeOf(asyncFn)}'`);

    const results = [];

    for(const item of array) {
      results.push(await asyncFn(item));
    }

    return results
  }

  /**
   * Checks if all elements in an array are of a specified type
   *
   * @param {Array<unknown>} arr - The array to check
   * @param {string} [type] - The type to check for (optional, defaults to the type of the first element)
   * @param {unknown} options - Options for checking types
   * @param {boolean} [options.strict] - Whether to use strict type or looser TypeSpec checking
   * @returns {boolean} Whether all elements are of the specified type
   */
  static isArrayUniform(arr, type, options={strict: true}) {
    const req = "Array";
    const arrType = Data.typeOf(arr);

    Valid.type(arr, req, `Invalid array. Expected '${req}', got '${arrType}'`);

    // Validate type parameter if provided
    if(type !== undefined) {
      Valid.type(type, "string", `Invalid type parameter. Expected 'string', got '${Data.typeOf(type)}'`);
    }

    const checkType = type ? Util.capitalize(type) : Data.typeOf(arr[0]);

    if(options?.strict === false) {
      const ts = new TypeSpec(checkType);

      return arr.every(e =>  ts.matches(e))
    }

    return arr.every(e => Data.typeOf(e) === checkType)
  }

  /**
   * Checks if an array is unique
   *
   * @param {Array<unknown>} arr - The array of which to remove duplicates
   * @returns {Array<unknown>} The unique elements of the array
   */
  static isArrayUnique(arr) {
    const req = "Array";
    const arrType = Data.typeOf(arr);

    Valid.type(arr, req, `Invalid array. Expected '${req}', got '${arrType}'`);

    return arr.filter((item, index, self) => self.indexOf(item) === index)
  }

  /**
   * Returns the intersection of two arrays.
   *
   * @param {Array<unknown>} arr1 - The first array.
   * @param {Array<unknown>} arr2 - The second array.
   * @returns {Array<unknown>} The intersection of the two arrays.
   */
  static intersection(arr1, arr2) {
    const req = "Array";
    const arr1Type = Data.typeOf(arr1);
    const arr2Type = Data.typeOf(arr2);

    Valid.type(arr1, req, `Invalid first array. Expected '${req}', got '${arr1Type}'`);
    Valid.type(arr2, req, `Invalid second array. Expected '${req}', got '${arr2Type}'`);

    const [short,long] = [arr1,arr2].sort((a,b) => a.length - b.length);

    return short.filter(value => long.includes(value))
  }

  /**
   * Checks whether two arrays have any elements in common.
   *
   * This function returns `true` if at least one element from `arr1` exists in
   * `arr2`, and `false` otherwise. It optimizes by iterating over the shorter
   * array for efficiency.
   *
   * Example:
   *   Collection.intersects([1, 2, 3], [3, 4, 5]) // returns true
   *   Collection.intersects(["a", "b"], ["c", "d"]) // returns false
   *
   * @param {Array<unknown>} arr1 - The first array to check for intersection.
   * @param {Array<unknown>} arr2 - The second array to check for intersection.
   * @returns {boolean} True if any element is shared between the arrays, false otherwise.
   */
  static intersects(arr1, arr2) {
    const req = "Array";
    const arr1Type = Data.typeOf(arr1);
    const arr2Type = Data.typeOf(arr2);

    Valid.type(arr1, req, `Invalid first array. Expected '${req}', got '${arr1Type}'`);
    Valid.type(arr2, req, `Invalid second array. Expected '${req}', got '${arr2Type}'`);

    const [short,long] = [arr1,arr2].sort((a,b) => a.length - b.length);

    return !!short.find(value => long.includes(value))
  }

  /**
   * Pads an array to a specified length with a value. This operation
   * occurs in-place.
   *
   * @param {Array<unknown>} arr - The array to pad.
   * @param {number} length - The length to pad the array to.
   * @param {unknown} value - The value to pad the array with.
   * @param {number} [position] - The position to pad the array at. Defaults to 0
   * @returns {Array<unknown>} The padded array.
   */
  static arrayPad(arr, length, value, position = 0) {
    const req = "Array";
    const arrType = Data.typeOf(arr);

    Valid.type(arr, req, `Invalid array. Expected '${req}', got '${arrType}'`);
    Valid.type(length, "Number", `Invalid length. Expected 'Number', got '${Data.typeOf(length)}'`);
    Valid.type(position, "Number", `Invalid position. Expected 'Number', got '${Data.typeOf(position)}'`);

    const diff = length - arr.length;

    if(diff <= 0)
      return arr

    const padding = Array(diff).fill(value);

    if(position === 0)
    // prepend - default
      return padding.concat(arr)
    else if(position === -1)
    // append
      return arr.concat(padding) // somewhere in the middle - THAT IS ILLEGAL
    else
      throw Sass.new("Invalid position")
  }

  /**
   * Filters an array asynchronously using a predicate function.
   * Applies the predicate to all items in parallel and returns filtered results.
   *
   * @param {Array<unknown>} arr - The array to filter
   * @param {(value: unknown, index: number, array: Array<unknown>) => Promise<boolean>} predicate - Async predicate function that returns a promise resolving to boolean
   * @returns {Promise<Array<unknown>>} Promise resolving to the filtered array
   */
  static async asyncFilter(arr, predicate) {
    const req = "Array";
    const arrType = Data.typeOf(arr);

    Valid.type(arr, req, `Invalid array. Expected '${req}', got '${arrType}'`);
    Valid.type(predicate, "Function",
      `Invalid predicate function, expected 'Function', got '${Data.typeOf(predicate)}'`);

    const results = await Promise.all(arr.map(predicate));

    return arr.filter((_, index) => results[index])
  }

  /**
   * Clones an object
   *
   * @param {object} obj - The object to clone
   * @param {boolean} freeze - Whether to freeze the cloned object
   * @returns {object} The cloned object
   */
  static cloneObject(obj, freeze = false) {
    const result = {};

    for(const [key, value] of Object.entries(obj)) {
      if(Data.isType(value, "Array")) {
        // Clone arrays by mapping over them
        result[key] = value.map(item =>
          Data.isType(item, "object") || Data.isType(item, "Array")
            ? Collection.cloneObject(item)
            : item
        );
      } else if(Data.isType(value, "object")) {
        result[key] = Collection.cloneObject(value);
      } else {
        result[key] = value;
      }
    }

    return freeze ? Object.freeze(result) : result
  }

  /**
   * Checks if an object is empty
   *
   * @param {object} obj - The object to check
   * @returns {boolean} Whether the object is empty
   */
  static isObjectEmpty(obj) {
    const req = "Object";
    const objType = Data.typeOf(obj);

    Valid.type(obj, req, `Invalid object. Expected '${req}', got '${objType}'`);

    return Object.keys(obj).length === 0
  }

  /**
   * Ensures that a nested path of objects exists within the given object.
   * Creates empty objects along the path if they don't exist.
   *
   * @param {object} obj - The object to check/modify
   * @param {Array<string>} keys - Array of keys representing the path to ensure
   * @returns {object} Reference to the deepest nested object in the path
   */
  static assureObjectPath(obj, keys) {
    const req = "Object";
    const objType = Data.typeOf(obj);
    const keysReq = "Array";
    const keysType = Data.typeOf(keys);

    Valid.type(obj, req, `Invalid object. Expected '${req}', got '${objType}'`);
    Valid.type(keys, keysReq, `Invalid keys array. Expected '${keysReq}', got '${keysType}'`);

    let current = obj;  // a moving reference to internal objects within obj
    const len = keys.length;

    Valid.prototypePollutionProtection(keys);

    for(let i = 0; i < len; i++) {
      const elem = keys[i];

      if(!current[elem])
        current[elem] = {};

      current = current[elem];
    }

    // Return the current pointer
    return current
  }

  /**
   * Sets a value in a nested object structure using an array of keys; creating
   * the structure if it does not exist.
   *
   * @param {object} obj - The target object to set the value in
   * @param {Array<string>} keys - Array of keys representing the path to the target property
   * @param {unknown} value - The value to set at the target location
   */
  static setNestedValue(obj, keys, value) {
    const req = "Object";
    const objType = Data.typeOf(obj);
    const keysReq = "Array";
    const keysType = Data.typeOf(keys);

    Valid.type(obj, req, `Invalid object. Expected '${req}', got '${objType}'`);
    Valid.type(keys, keysReq, `Invalid keys array. Expected '${keysReq}', got '${keysType}'`);

    const nested = Collection.assureObjectPath(obj, keys.slice(0, -1));
    const finalKey = keys[keys.length-1];

    Valid.prototypePollutionProtection([finalKey]);

    nested[finalKey] = value;
  }

  /**
   * Deeply merges two or more objects. Arrays are replaced, not merged.
   *
   * @param {...object} sources - Objects to merge (left to right)
   * @returns {object} The merged object
   */
  static mergeObject(...sources) {
    const isObject = obj => typeof obj === "object" && obj !== null && !Array.isArray(obj);

    return sources.reduce((acc, obj) => {
      if(!isObject(obj))
        return acc

      Object.keys(obj).forEach(key => {
        const accVal = acc[key];
        const objVal = obj[key];

        if(isObject(accVal) && isObject(objVal))
          acc[key] = Collection.mergeObject(accVal, objVal);
        else
          acc[key] = objVal;
      });

      return acc
    }, {})
  }

  /**
   * Freezes an object and all of its properties recursively.
   *
   * @param {object} obj The object to freeze.
   * @returns {object} The frozen object.
   */
  static deepFreezeObject(obj) {
    if(obj === null || typeof obj !== "object")
      return obj // Skip null and non-objects

    // Retrieve and freeze properties
    const propNames = Object.getOwnPropertyNames(obj);

    for(const name of propNames) {
      const value = obj[name];

      // Recursively freeze nested objects
      if(typeof value === "object" && value !== null)
        Collection.deepFreezeObject(value);
    }

    // Freeze the object itself
    return Object.freeze(obj)
  }

  /**
   * Maps an object using a transformer function
   *
   * @param {object} original The original object
   * @param {function(unknown): unknown} transformer The transformer function
   * @param {boolean} mutate Whether to mutate the original object
   * @returns {Promise<object>} The mapped object
   */
  static async mapObject(original, transformer, mutate = false) {
    Valid.type(original, "object", {allowEmpty: true});
    Valid.type(transformer, "function");
    Valid.type(mutate, "boolean");

    const result = mutate ? original : {};

    for(const [key, value] of Object.entries(original))
      result[key] = Data.isType(value, "object")
        ? await Collection.mapObject(value, transformer, mutate)
        : (result[key] = await transformer(key, value));

    return result
  }

  /**
   * Allocates an object from a source array and a spec array or function.
   *
   * @param {Array<unknown>} source The source array
   * @param {Array<unknown>|function(Array<unknown>): Promise<Array<unknown>>|Array<unknown>} spec The spec array or function
   * @returns {Promise<object>} The allocated object
   */
  static async allocateObject(source, spec) {
    const workSource = [],
      workSpec = [],
      result = {};

    if(!Data.isType(source, "Array", {allowEmpty: false}))
      throw Sass.new("Source must be an array.")

    workSource.push(...source);

    if(
      !Data.isType(spec, "Array", {allowEmpty: false}) &&
      !Data.isType(spec, "Function")
    )
      throw Sass.new("Spec must be an array or a function.")

    if(Data.isType(spec, "Function")) {
      const specResult = await spec(workSource);

      if(!Data.isType(specResult, "Array"))
        throw Sass.new("Spec resulting from function must be an array.")

      workSpec.push(...specResult);
    } else if(Data.isType(spec, "Array", {allowEmpty: false})) {
      workSpec.push(...spec);
    }

    if(workSource.length !== workSpec.length)
      throw Sass.new("Source and spec must have the same number of elements.")

    // Objects must always be indexed by strings.
    workSource.map((element, index, arr) => (arr[index] = String(element)));

    // Check that all keys are strings
    if(!Collection.isArrayUniform(workSource, "String"))
      throw Sass.new("Indices of an Object must be of type string.")

    workSource.forEach((element, index) => (result[element] = workSpec[index]));

    return result
  }

  /**
   * Trims falsy values from both ends of an array (in-place).
   * Optionally preserves specific falsy values.
   *
   * @param {Array<unknown>} arr - The array to trim
   * @param {Array<unknown>} [except] - Values to preserve even if falsy. Defaults to empty array
   * @returns {Array<unknown>} The trimmed array (same reference, modified in-place)
   * @throws {Sass} If arr is not an Array or except is not an Array
   */
  static trimArray(arr, except=[]) {
    Valid.type(arr, "Array");
    Valid.type(except, "Array");

    Collection.trimArrayLeft(arr, except);
    Collection.trimArrayRight(arr, except);

    return arr
  }

  /**
   * Trims falsy values from the right end of an array (in-place).
   * Optionally preserves specific falsy values.
   *
   * @param {Array<unknown>} arr - The array to trim
   * @param {Array<unknown>} [except] - Values to preserve even if falsy. Defaults to empty array
   * @returns {Array<unknown>} The trimmed array (same reference, modified in-place)
   * @throws {Sass} If arr is not an Array or except is not an Array
   */
  static trimArrayRight(arr, except=[]) {
    Valid.type(arr, "Array");
    Valid.type(except, "Array");

    arr.reverse();
    Collection.trimArrayLeft(arr, except);
    arr.reverse();

    return arr
  }

  /**
   * Trims falsy values from the left end of an array (in-place).
   * Optionally preserves specific falsy values.
   *
   * @param {Array<unknown>} arr - The array to trim
   * @param {Array<unknown>} [except] - Values to preserve even if falsy. Defaults to empty array
   * @returns {Array<unknown>} The trimmed array (same reference, modified in-place)
   * @throws {Sass} If arr is not an Array or except is not an Array
   */
  static trimArrayLeft(arr, except=[]) {
    Valid.type(arr, "Array");
    Valid.type(except, "Array");

    while(arr.length > 0) {
      const value = arr[0];

      if(value || except.includes(value))
        break

      arr.shift();
    }

    return arr
  }

  /**
   * Transposes an array of objects into an object of arrays.
   * Collects values for each key across all objects into arrays.
   *
   * @param {Array<object>} objects - Array of plain objects to transpose
   * @returns {object} Object with keys from input objects, values as arrays
   * @throws {Sass} If objects is not an Array or contains non-plain objects
   */
  static transposeObjects(objects) {
    const req = "Array";
    const type = Data.typeOf(objects);

    Valid.type(objects, req, `Invalid objects array. Expected '${req}', got '${type}'`);

    return objects.reduce((acc, curr) => {
      const elemType = Data.typeOf(curr);

      if(!Data.isPlainObject(curr))
        throw Sass.new(`Invalid array element. Expected plain object, got '${elemType}'`)

      Valid.prototypePollutionProtection(Object.keys(curr));

      Object.entries(curr).forEach(([key, value]) => {
        if(!acc[key])
          acc[key] = [];

        acc[key].push(value);
      });

      return acc
    }, {})
  }

  /**
   * Flattens an array (or nested array) of objects and transposes them.
   * Combines flat() and transposeObjects() operations.
   *
   * @param {Array<object>|Array<Array<object>>} input - Array or nested array of objects
   * @returns {object} Transposed object with arrays of values
   */
  static flattenObjectArray(input) {
    const flattened = Array.isArray(input) ? input.flat() : input;

    return Collection.transposeObjects(flattened)
  }
}

/**
 * Simple lifecycle helper that tracks disposer callbacks.
 * Register any teardown functions and call dispose() to run them in reverse.
 */
class Disposer {
  #disposers = []

  /**
   * Registers a disposer callback to be executed when disposed.
   *
   * Accepts one or more callbacks (or a single array) and returns matching
   * unregisters. A single disposer returns a single unregister for
   * convenience.
   *
   * @param {...(() => void)|Array<() => void>} disposers - Cleanup callbacks.
   * @returns {(() => void)|Array<() => void>} Unregister function(s).
   */
  register(...disposers) {
    const normalized = this.#normalizeDisposers(disposers);
    const unregisters = normalized.map(
      disposer => this.#registerDisposer(disposer)
    );

    return unregisters.length === 1 ? unregisters[0] : unregisters
  }

  #registerDisposer(disposer) {
    if(typeof disposer !== "function")
      return () => {}

    this.#disposers.push(disposer);

    return () => this.#removeDisposer(disposer)
  }

  /**
   * Runs all registered disposers in reverse order.
   *
   * @returns {void}
   */
  dispose() {
    const errors = [];
    this.#disposers.toReversed().forEach(disposer => {
      try {
        disposer();
      } catch(error) {
        errors.push(error);
      }
    });
    this.#disposers.length = 0;

    if(errors.length > 0)
      throw new AggregateError(errors, "Errors occurred during disposal.")
  }

  #normalizeDisposers(disposers) {
    const normalized = (
      disposers.length === 1 && Array.isArray(disposers[0])
        ? disposers[0]
        : disposers
    );

    Valid.type(normalized, "Function[]");

    return normalized
  }

  /**
   * Read-only list of registered disposers.
   *
   * @returns {Array<() => void>} Snapshot of disposer callbacks.
   */
  get disposers() {
    return Object.freeze([...this.#disposers])
  }

  #removeDisposer(disposer) {
    const index = this.#disposers.indexOf(disposer);

    if(index >= 0)
      this.#disposers.splice(index, 1);
  }
}

var Disposer_default = new Disposer();

/*! @license DOMPurify 3.3.0 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.3.0/LICENSE */

const {
  entries,
  setPrototypeOf,
  isFrozen,
  getPrototypeOf,
  getOwnPropertyDescriptor
} = Object;
let {
  freeze,
  seal,
  create
} = Object; // eslint-disable-line import/no-mutable-exports
let {
  apply,
  construct
} = typeof Reflect !== "undefined" && Reflect;
if(!freeze) {
  freeze = function freeze(x) {
    return x
  };
}

if(!seal) {
  seal = function seal(x) {
    return x
  };
}

if(!apply) {
  apply = function apply(func, thisArg) {
    for(var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
      args[_key - 2] = arguments[_key];
    }

    return func.apply(thisArg, args)
  };
}

if(!construct) {
  construct = function construct(Func) {
    for(var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }

    return new Func(...args)
  };
}

const arrayForEach = unapply(Array.prototype.forEach);
const arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
const arrayPop = unapply(Array.prototype.pop);
const arrayPush = unapply(Array.prototype.push);
const arraySplice = unapply(Array.prototype.splice);
const stringToLowerCase = unapply(String.prototype.toLowerCase);
const stringToString = unapply(String.prototype.toString);
const stringMatch = unapply(String.prototype.match);
const stringReplace = unapply(String.prototype.replace);
const stringIndexOf = unapply(String.prototype.indexOf);
const stringTrim = unapply(String.prototype.trim);
const objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
const regExpTest = unapply(RegExp.prototype.test);
const typeErrorCreate = unconstruct(TypeError);
/**
 * Creates a new function that calls the given function with a specified thisArg and arguments.
 *
 * @param func - The function to be wrapped and called.
 * @returns A new function that calls the given function with a specified thisArg and arguments.
 */
function unapply(func) {
  return function(thisArg) {
    if(thisArg instanceof RegExp) {
      thisArg.lastIndex = 0;
    }

    for(var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
      args[_key3 - 1] = arguments[_key3];
    }

    return apply(func, thisArg, args)
  }
}
/**
 * Creates a new function that constructs an instance of the given constructor function with the provided arguments.
 *
 * @param func - The constructor function to be wrapped and called.
 * @param Func
 * @returns A new function that constructs an instance of the given constructor function with the provided arguments.
 */
function unconstruct(Func) {
  return function() {
    for(var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      args[_key4] = arguments[_key4];
    }

    return construct(Func, args)
  }
}
/**
 * Add properties to a lookup table
 *
 * @param set - The set to which elements will be added.
 * @param array - The array containing elements to be added to the set.
 * @param transformCaseFunc - An optional function to transform the case of each element before adding to the set.
 * @returns The modified set with added elements.
 */
function addToSet(set, array) {
  const transformCaseFunc = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : stringToLowerCase;
  if(setPrototypeOf) {
    // Make 'in' and truthy checks like Boolean(set.constructor)
    // independent of any properties defined on Object.prototype.
    // Prevent prototype setters from intercepting set as a this value.
    setPrototypeOf(set, null);
  }

  let l = array.length;
  while(l--) {
    let element = array[l];
    if(typeof element === "string") {
      const lcElement = transformCaseFunc(element);
      if(lcElement !== element) {
        // Config presets (e.g. tags.js, attrs.js) are immutable.
        if(!isFrozen(array)) {
          array[l] = lcElement;
        }

        element = lcElement;
      }
    }

    set[element] = true;
  }

  return set
}
/**
 * Clean up an array to harden against CSPP
 *
 * @param array - The array to be cleaned.
 * @returns The cleaned version of the array
 */
function cleanArray(array) {
  for(let index = 0; index < array.length; index++) {
    const isPropertyExist = objectHasOwnProperty(array, index);
    if(!isPropertyExist) {
      array[index] = null;
    }
  }

  return array
}
/**
 * Shallow clone an object
 *
 * @param object - The object to be cloned.
 * @returns A new object that copies the original.
 */
function clone(object) {
  const newObject = create(null);
  for(const [property, value] of entries(object)) {
    const isPropertyExist = objectHasOwnProperty(object, property);
    if(isPropertyExist) {
      if(Array.isArray(value)) {
        newObject[property] = cleanArray(value);
      } else if(value && typeof value === "object" && value.constructor === Object) {
        newObject[property] = clone(value);
      } else {
        newObject[property] = value;
      }
    }
  }

  return newObject
}
/**
 * This method automatically checks if the prop is function or getter and behaves accordingly.
 *
 * @param object - The object to look up the getter function in its prototype chain.
 * @param prop - The property name for which to find the getter function.
 * @returns The getter function found in the prototype chain or a fallback function.
 */
function lookupGetter(object, prop) {
  while(object !== null) {
    const desc = getOwnPropertyDescriptor(object, prop);
    if(desc) {
      if(desc.get) {
        return unapply(desc.get)
      }

      if(typeof desc.value === "function") {
        return unapply(desc.value)
      }
    }

    object = getPrototypeOf(object);
  }

  function fallbackValue() {
    return null
  }

  return fallbackValue
}

const html$1 = freeze(["a", "abbr", "acronym", "address", "area", "article", "aside", "audio", "b", "bdi", "bdo", "big", "blink", "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup", "content", "data", "datalist", "dd", "decorator", "del", "details", "dfn", "dialog", "dir", "div", "dl", "dt", "element", "em", "fieldset", "figcaption", "figure", "font", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "img", "input", "ins", "kbd", "label", "legend", "li", "main", "map", "mark", "marquee", "menu", "menuitem", "meter", "nav", "nobr", "ol", "optgroup", "option", "output", "p", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "search", "section", "select", "shadow", "slot", "small", "source", "spacer", "span", "strike", "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "tr", "track", "tt", "u", "ul", "var", "video", "wbr"]);
const svg$1 = freeze(["svg", "a", "altglyph", "altglyphdef", "altglyphitem", "animatecolor", "animatemotion", "animatetransform", "circle", "clippath", "defs", "desc", "ellipse", "enterkeyhint", "exportparts", "filter", "font", "g", "glyph", "glyphref", "hkern", "image", "inputmode", "line", "lineargradient", "marker", "mask", "metadata", "mpath", "part", "path", "pattern", "polygon", "polyline", "radialgradient", "rect", "stop", "style", "switch", "symbol", "text", "textpath", "title", "tref", "tspan", "view", "vkern"]);
const svgFilters = freeze(["feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence"]);
// List of SVG elements that are disallowed by default.
// We still need to know them so that we can do namespace
// checks properly in case one wants to add them to
// allow-list.
const svgDisallowed = freeze(["animate", "color-profile", "cursor", "discard", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "foreignobject", "hatch", "hatchpath", "mesh", "meshgradient", "meshpatch", "meshrow", "missing-glyph", "script", "set", "solidcolor", "unknown", "use"]);
const mathMl$1 = freeze(["math", "menclose", "merror", "mfenced", "mfrac", "mglyph", "mi", "mlabeledtr", "mmultiscripts", "mn", "mo", "mover", "mpadded", "mphantom", "mroot", "mrow", "ms", "mspace", "msqrt", "mstyle", "msub", "msup", "msubsup", "mtable", "mtd", "mtext", "mtr", "munder", "munderover", "mprescripts"]);
// Similarly to SVG, we want to know all MathML elements,
// even those that we disallow by default.
const mathMlDisallowed = freeze(["maction", "maligngroup", "malignmark", "mlongdiv", "mscarries", "mscarry", "msgroup", "mstack", "msline", "msrow", "semantics", "annotation", "annotation-xml", "mprescripts", "none"]);
const text = freeze(["#text"]);

const html = freeze(["accept", "action", "align", "alt", "autocapitalize", "autocomplete", "autopictureinpicture", "autoplay", "background", "bgcolor", "border", "capture", "cellpadding", "cellspacing", "checked", "cite", "class", "clear", "color", "cols", "colspan", "controls", "controlslist", "coords", "crossorigin", "datetime", "decoding", "default", "dir", "disabled", "disablepictureinpicture", "disableremoteplayback", "download", "draggable", "enctype", "enterkeyhint", "exportparts", "face", "for", "headers", "height", "hidden", "high", "href", "hreflang", "id", "inert", "inputmode", "integrity", "ismap", "kind", "label", "lang", "list", "loading", "loop", "low", "max", "maxlength", "media", "method", "min", "minlength", "multiple", "muted", "name", "nonce", "noshade", "novalidate", "nowrap", "open", "optimum", "part", "pattern", "placeholder", "playsinline", "popover", "popovertarget", "popovertargetaction", "poster", "preload", "pubdate", "radiogroup", "readonly", "rel", "required", "rev", "reversed", "role", "rows", "rowspan", "spellcheck", "scope", "selected", "shape", "size", "sizes", "slot", "span", "srclang", "start", "src", "srcset", "step", "style", "summary", "tabindex", "title", "translate", "type", "usemap", "valign", "value", "width", "wrap", "xmlns", "slot"]);
const svg = freeze(["accent-height", "accumulate", "additive", "alignment-baseline", "amplitude", "ascent", "attributename", "attributetype", "azimuth", "basefrequency", "baseline-shift", "begin", "bias", "by", "class", "clip", "clippathunits", "clip-path", "clip-rule", "color", "color-interpolation", "color-interpolation-filters", "color-profile", "color-rendering", "cx", "cy", "d", "dx", "dy", "diffuseconstant", "direction", "display", "divisor", "dur", "edgemode", "elevation", "end", "exponent", "fill", "fill-opacity", "fill-rule", "filter", "filterunits", "flood-color", "flood-opacity", "font-family", "font-size", "font-size-adjust", "font-stretch", "font-style", "font-variant", "font-weight", "fx", "fy", "g1", "g2", "glyph-name", "glyphref", "gradientunits", "gradienttransform", "height", "href", "id", "image-rendering", "in", "in2", "intercept", "k", "k1", "k2", "k3", "k4", "kerning", "keypoints", "keysplines", "keytimes", "lang", "lengthadjust", "letter-spacing", "kernelmatrix", "kernelunitlength", "lighting-color", "local", "marker-end", "marker-mid", "marker-start", "markerheight", "markerunits", "markerwidth", "maskcontentunits", "maskunits", "max", "mask", "mask-type", "media", "method", "mode", "min", "name", "numoctaves", "offset", "operator", "opacity", "order", "orient", "orientation", "origin", "overflow", "paint-order", "path", "pathlength", "patterncontentunits", "patterntransform", "patternunits", "points", "preservealpha", "preserveaspectratio", "primitiveunits", "r", "rx", "ry", "radius", "refx", "refy", "repeatcount", "repeatdur", "restart", "result", "rotate", "scale", "seed", "shape-rendering", "slope", "specularconstant", "specularexponent", "spreadmethod", "startoffset", "stddeviation", "stitchtiles", "stop-color", "stop-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke", "stroke-width", "style", "surfacescale", "systemlanguage", "tabindex", "tablevalues", "targetx", "targety", "transform", "transform-origin", "text-anchor", "text-decoration", "text-rendering", "textlength", "type", "u1", "u2", "unicode", "values", "viewbox", "visibility", "version", "vert-adv-y", "vert-origin-x", "vert-origin-y", "width", "word-spacing", "wrap", "writing-mode", "xchannelselector", "ychannelselector", "x", "x1", "x2", "xmlns", "y", "y1", "y2", "z", "zoomandpan"]);
const mathMl = freeze(["accent", "accentunder", "align", "bevelled", "close", "columnsalign", "columnlines", "columnspan", "denomalign", "depth", "dir", "display", "displaystyle", "encoding", "fence", "frame", "height", "href", "id", "largeop", "length", "linethickness", "lspace", "lquote", "mathbackground", "mathcolor", "mathsize", "mathvariant", "maxsize", "minsize", "movablelimits", "notation", "numalign", "open", "rowalign", "rowlines", "rowspacing", "rowspan", "rspace", "rquote", "scriptlevel", "scriptminsize", "scriptsizemultiplier", "selection", "separator", "separators", "stretchy", "subscriptshift", "supscriptshift", "symmetric", "voffset", "width", "xmlns"]);
const xml = freeze(["xlink:href", "xml:id", "xlink:title", "xml:space", "xmlns:xlink"]);

// eslint-disable-next-line unicorn/better-regex
const MUSTACHE_EXPR = seal(/\{\{[\w\W]*|[\w\W]*\}\}/gm); // Specify template detection regex for SAFE_FOR_TEMPLATES mode
const ERB_EXPR = seal(/<%[\w\W]*|[\w\W]*%>/gm);
const TMPLIT_EXPR = seal(/\$\{[\w\W]*/gm); // eslint-disable-line unicorn/better-regex
const DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/); // eslint-disable-line no-useless-escape
const ARIA_ATTR = seal(/^aria-[\-\w]+$/); // eslint-disable-line no-useless-escape
const IS_ALLOWED_URI = seal(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i // eslint-disable-line no-useless-escape
);
const IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
const ATTR_WHITESPACE = seal(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g // eslint-disable-line no-control-regex
);
const DOCTYPE_NAME = seal(/^html$/i);
const CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);

var EXPRESSIONS = /*#__PURE__*/Object.freeze({
  __proto__: null,
  ARIA_ATTR: ARIA_ATTR,
  ATTR_WHITESPACE: ATTR_WHITESPACE,
  CUSTOM_ELEMENT: CUSTOM_ELEMENT,
  DATA_ATTR: DATA_ATTR,
  DOCTYPE_NAME: DOCTYPE_NAME,
  ERB_EXPR: ERB_EXPR,
  IS_ALLOWED_URI: IS_ALLOWED_URI,
  IS_SCRIPT_OR_DATA: IS_SCRIPT_OR_DATA,
  MUSTACHE_EXPR: MUSTACHE_EXPR,
  TMPLIT_EXPR: TMPLIT_EXPR
});

/* eslint-disable @typescript-eslint/indent */
// https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
const NODE_TYPE = {
  element: 1,
  text: 3,
  // Deprecated
  progressingInstruction: 7,
  comment: 8,
  document: 9};
const getGlobal = function getGlobal() {
  return typeof window === "undefined" ? null : window
};
/**
 * Creates a no-op policy for internal use only.
 * Don't export this function outside this module!
 *
 * @param trustedTypes The policy factory.
 * @param purifyHostElement The Script element used to load DOMPurify (to determine policy name suffix).
 * @returns The policy created (or null, if Trusted Types
 * are not supported or creating the policy failed).
 */
const _createTrustedTypesPolicy = function _createTrustedTypesPolicy(trustedTypes, purifyHostElement) {
  if(typeof trustedTypes !== "object" || typeof trustedTypes.createPolicy !== "function") {
    return null
  }

  // Allow the callers to control the unique policy name
  // by adding a data-tt-policy-suffix to the script element with the DOMPurify.
  // Policy creation with duplicate names throws in Trusted Types.
  let suffix = null;
  const ATTR_NAME = "data-tt-policy-suffix";
  if(purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME)) {
    suffix = purifyHostElement.getAttribute(ATTR_NAME);
  }

  const policyName = "dompurify" + (suffix ? "#" + suffix : "");
  try {
    return trustedTypes.createPolicy(policyName, {
      createHTML(html) {
        return html
      },
      createScriptURL(scriptUrl) {
        return scriptUrl
      }
    })
  } catch(_) {
    // Policy creation failed (most likely another DOMPurify script has
    // already run). Skip creating the policy, as this will only cause errors
    // if TT are enforced.
    console.warn("TrustedTypes policy " + policyName + " could not be created.");

    return null
  }
};
const _createHooksMap = function _createHooksMap() {
  return {
    afterSanitizeAttributes: [],
    afterSanitizeElements: [],
    afterSanitizeShadowDOM: [],
    beforeSanitizeAttributes: [],
    beforeSanitizeElements: [],
    beforeSanitizeShadowDOM: [],
    uponSanitizeAttribute: [],
    uponSanitizeElement: [],
    uponSanitizeShadowNode: []
  }
};
function createDOMPurify() {
  const window = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : getGlobal();
  const DOMPurify = root => createDOMPurify(root);
  DOMPurify.version = "3.3.0";
  DOMPurify.removed = [];
  if(!window || !window.document || window.document.nodeType !== NODE_TYPE.document || !window.Element) {
    // Not running in a browser, provide a factory function
    // so that you can pass your own Window
    DOMPurify.isSupported = false;

    return DOMPurify
  }

  let {
    document
  } = window;
  const originalDocument = document;
  const currentScript = originalDocument.currentScript;
  const {
    DocumentFragment,
    HTMLTemplateElement,
    Node,
    Element,
    NodeFilter,
    NamedNodeMap = window.NamedNodeMap || window.MozNamedAttrMap,
    HTMLFormElement,
    DOMParser,
    trustedTypes
  } = window;
  const ElementPrototype = Element.prototype;
  const cloneNode = lookupGetter(ElementPrototype, "cloneNode");
  const remove = lookupGetter(ElementPrototype, "remove");
  const getNextSibling = lookupGetter(ElementPrototype, "nextSibling");
  const getChildNodes = lookupGetter(ElementPrototype, "childNodes");
  const getParentNode = lookupGetter(ElementPrototype, "parentNode");
  // As per issue #47, the web-components registry is inherited by a
  // new document created via createHTMLDocument. As per the spec
  // (http://w3c.github.io/webcomponents/spec/custom/#creating-and-passing-registries)
  // a new empty registry is used when creating a template contents owner
  // document, so we use that as our parent document to ensure nothing
  // is inherited.
  if(typeof HTMLTemplateElement === "function") {
    const template = document.createElement("template");
    if(template.content && template.content.ownerDocument) {
      document = template.content.ownerDocument;
    }
  }

  let trustedTypesPolicy;
  let emptyHTML = "";
  const {
    implementation,
    createNodeIterator,
    createDocumentFragment,
    getElementsByTagName
  } = document;
  const {
    importNode
  } = originalDocument;
  let hooks = _createHooksMap();
  /**
   * Expose whether this browser supports running the full DOMPurify.
   */
  DOMPurify.isSupported = typeof entries === "function" && typeof getParentNode === "function" && implementation && implementation.createHTMLDocument !== undefined;
  const {
    MUSTACHE_EXPR,
    ERB_EXPR,
    TMPLIT_EXPR,
    DATA_ATTR,
    ARIA_ATTR,
    IS_SCRIPT_OR_DATA,
    ATTR_WHITESPACE,
    CUSTOM_ELEMENT
  } = EXPRESSIONS;
  let {
    IS_ALLOWED_URI: IS_ALLOWED_URI$1
  } = EXPRESSIONS;
  /**
   * We consider the elements and attributes below to be safe. Ideally
   * don't add any new ones but feel free to remove unwanted ones.
   */
  /* allowed element names */
  let ALLOWED_TAGS = null;
  const DEFAULT_ALLOWED_TAGS = addToSet({}, [...html$1, ...svg$1, ...svgFilters, ...mathMl$1, ...text]);
  /* Allowed attribute names */
  let ALLOWED_ATTR = null;
  const DEFAULT_ALLOWED_ATTR = addToSet({}, [...html, ...svg, ...mathMl, ...xml]);
  /*
   * Configure how DOMPurify should handle custom elements and their attributes as well as customized built-in elements.
   * @property {RegExp|Function|null} tagNameCheck one of [null, regexPattern, predicate]. Default: `null` (disallow any custom elements)
   * @property {RegExp|Function|null} attributeNameCheck one of [null, regexPattern, predicate]. Default: `null` (disallow any attributes not on the allow list)
   * @property {boolean} allowCustomizedBuiltInElements allow custom elements derived from built-ins if they pass CUSTOM_ELEMENT_HANDLING.tagNameCheck. Default: `false`.
   */
  let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
    tagNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    allowCustomizedBuiltInElements: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: false
    }
  }));
  /* Explicitly forbidden tags (overrides ALLOWED_TAGS/ADD_TAGS) */
  let FORBID_TAGS = null;
  /* Explicitly forbidden attributes (overrides ALLOWED_ATTR/ADD_ATTR) */
  let FORBID_ATTR = null;
  /* Config object to store ADD_TAGS/ADD_ATTR functions (when used as functions) */
  const EXTRA_ELEMENT_HANDLING = Object.seal(create(null, {
    tagCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    }
  }));
  /* Decide if ARIA attributes are okay */
  let ALLOW_ARIA_ATTR = true;
  /* Decide if custom data attributes are okay */
  let ALLOW_DATA_ATTR = true;
  /* Decide if unknown protocols are okay */
  let ALLOW_UNKNOWN_PROTOCOLS = false;
  /* Decide if self-closing tags in attributes are allowed.
   * Usually removed due to a mXSS issue in jQuery 3.0 */
  let ALLOW_SELF_CLOSE_IN_ATTR = true;
  /* Output should be safe for common template engines.
   * This means, DOMPurify removes data attributes, mustaches and ERB
   */
  let SAFE_FOR_TEMPLATES = false;
  /* Output should be safe even for XML used within HTML and alike.
   * This means, DOMPurify removes comments when containing risky content.
   */
  let SAFE_FOR_XML = true;
  /* Decide if document with <html>... should be returned */
  let WHOLE_DOCUMENT = false;
  /* Track whether config is already set on this instance of DOMPurify. */
  let SET_CONFIG = false;
  /* Decide if all elements (e.g. style, script) must be children of
   * document.body. By default, browsers might move them to document.head */
  let FORCE_BODY = false;
  /* Decide if a DOM `HTMLBodyElement` should be returned, instead of a html
   * string (or a TrustedHTML object if Trusted Types are supported).
   * If `WHOLE_DOCUMENT` is enabled a `HTMLHtmlElement` will be returned instead
   */
  let RETURN_DOM = false;
  /* Decide if a DOM `DocumentFragment` should be returned, instead of a html
   * string  (or a TrustedHTML object if Trusted Types are supported) */
  let RETURN_DOM_FRAGMENT = false;
  /* Try to return a Trusted Type object instead of a string, return a string in
   * case Trusted Types are not supported  */
  let RETURN_TRUSTED_TYPE = false;
  /* Output should be free from DOM clobbering attacks?
   * This sanitizes markups named with colliding, clobberable built-in DOM APIs.
   */
  let SANITIZE_DOM = true;
  /* Achieve full DOM Clobbering protection by isolating the namespace of named
   * properties and JS variables, mitigating attacks that abuse the HTML/DOM spec rules.
   *
   * HTML/DOM spec rules that enable DOM Clobbering:
   *   - Named Access on Window (§7.3.3)
   *   - DOM Tree Accessors (§3.1.5)
   *   - Form Element Parent-Child Relations (§4.10.3)
   *   - Iframe srcdoc / Nested WindowProxies (§4.8.5)
   *   - HTMLCollection (§4.2.10.2)
   *
   * Namespace isolation is implemented by prefixing `id` and `name` attributes
   * with a constant string, i.e., `user-content-`
   */
  let SANITIZE_NAMED_PROPS = false;
  const SANITIZE_NAMED_PROPS_PREFIX = "user-content-";
  /* Keep element content when removing element? */
  let KEEP_CONTENT = true;
  /* If a `Node` is passed to sanitize(), then performs sanitization in-place instead
   * of importing it into a new Document and returning a sanitized copy */
  let IN_PLACE = false;
  /* Allow usage of profiles like html, svg and mathMl */
  let USE_PROFILES = {};
  /* Tags to ignore content of when KEEP_CONTENT is true */
  let FORBID_CONTENTS = null;
  const DEFAULT_FORBID_CONTENTS = addToSet({}, ["annotation-xml", "audio", "colgroup", "desc", "foreignobject", "head", "iframe", "math", "mi", "mn", "mo", "ms", "mtext", "noembed", "noframes", "noscript", "plaintext", "script", "style", "svg", "template", "thead", "title", "video", "xmp"]);
  /* Tags that are safe for data: URIs */
  let DATA_URI_TAGS = null;
  const DEFAULT_DATA_URI_TAGS = addToSet({}, ["audio", "video", "img", "source", "image", "track"]);
  /* Attributes safe for values like "javascript:" */
  let URI_SAFE_ATTRIBUTES = null;
  const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, ["alt", "class", "for", "id", "label", "name", "pattern", "placeholder", "role", "summary", "title", "value", "style", "xmlns"]);
  const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
  /* Document namespace */
  let NAMESPACE = HTML_NAMESPACE;
  let IS_EMPTY_INPUT = false;
  /* Allowed XHTML+XML namespaces */
  let ALLOWED_NAMESPACES = null;
  const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [MATHML_NAMESPACE, SVG_NAMESPACE, HTML_NAMESPACE], stringToString);
  let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, ["mi", "mo", "mn", "ms", "mtext"]);
  let HTML_INTEGRATION_POINTS = addToSet({}, ["annotation-xml"]);
  // Certain elements are allowed in both SVG and HTML
  // namespace. We need to specify them explicitly
  // so that they don't get erroneously deleted from
  // HTML namespace.
  const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, ["title", "style", "font", "a", "script"]);
  /* Parsing of strict XHTML documents */
  let PARSER_MEDIA_TYPE = null;
  const SUPPORTED_PARSER_MEDIA_TYPES = ["application/xhtml+xml", "text/html"];
  const DEFAULT_PARSER_MEDIA_TYPE = "text/html";
  let transformCaseFunc = null;
  /* Keep a reference to config to pass to hooks */
  let CONFIG = null;
  /* Ideally, do not touch anything below this line */
  /* ______________________________________________ */
  const formElement = document.createElement("form");
  const isRegexOrFunction = function isRegexOrFunction(testValue) {
    return testValue instanceof RegExp || testValue instanceof Function
  };
  /**
   * _parseConfig
   *
   * @param cfg optional config literal
   */

  const _parseConfig = function _parseConfig() {
    let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    if(CONFIG && CONFIG === cfg) {
      return
    }

    /* Shield configuration object from tampering */
    if(!cfg || typeof cfg !== "object") {
      cfg = {};
    }

    /* Shield configuration object from prototype pollution */
    cfg = clone(cfg);
    PARSER_MEDIA_TYPE =
    // eslint-disable-next-line unicorn/prefer-includes
      SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
    // HTML tags and attributes are not case-sensitive, converting to lowercase. Keeping XHTML as is.
    transformCaseFunc = PARSER_MEDIA_TYPE === "application/xhtml+xml" ? stringToString : stringToLowerCase;
    /* Set configuration parameters */
    ALLOWED_TAGS = objectHasOwnProperty(cfg, "ALLOWED_TAGS") ? addToSet({}, cfg.ALLOWED_TAGS, transformCaseFunc) : DEFAULT_ALLOWED_TAGS;
    ALLOWED_ATTR = objectHasOwnProperty(cfg, "ALLOWED_ATTR") ? addToSet({}, cfg.ALLOWED_ATTR, transformCaseFunc) : DEFAULT_ALLOWED_ATTR;
    ALLOWED_NAMESPACES = objectHasOwnProperty(cfg, "ALLOWED_NAMESPACES") ? addToSet({}, cfg.ALLOWED_NAMESPACES, stringToString) : DEFAULT_ALLOWED_NAMESPACES;
    URI_SAFE_ATTRIBUTES = objectHasOwnProperty(cfg, "ADD_URI_SAFE_ATTR") ? addToSet(clone(DEFAULT_URI_SAFE_ATTRIBUTES), cfg.ADD_URI_SAFE_ATTR, transformCaseFunc) : DEFAULT_URI_SAFE_ATTRIBUTES;
    DATA_URI_TAGS = objectHasOwnProperty(cfg, "ADD_DATA_URI_TAGS") ? addToSet(clone(DEFAULT_DATA_URI_TAGS), cfg.ADD_DATA_URI_TAGS, transformCaseFunc) : DEFAULT_DATA_URI_TAGS;
    FORBID_CONTENTS = objectHasOwnProperty(cfg, "FORBID_CONTENTS") ? addToSet({}, cfg.FORBID_CONTENTS, transformCaseFunc) : DEFAULT_FORBID_CONTENTS;
    FORBID_TAGS = objectHasOwnProperty(cfg, "FORBID_TAGS") ? addToSet({}, cfg.FORBID_TAGS, transformCaseFunc) : clone({});
    FORBID_ATTR = objectHasOwnProperty(cfg, "FORBID_ATTR") ? addToSet({}, cfg.FORBID_ATTR, transformCaseFunc) : clone({});
    USE_PROFILES = objectHasOwnProperty(cfg, "USE_PROFILES") ? cfg.USE_PROFILES : false;
    ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false; // Default true
    ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false; // Default true
    ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false; // Default false
    ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false; // Default true
    SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false; // Default false
    SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false; // Default true
    WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false; // Default false
    RETURN_DOM = cfg.RETURN_DOM || false; // Default false
    RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false; // Default false
    RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false; // Default false
    FORCE_BODY = cfg.FORCE_BODY || false; // Default false
    SANITIZE_DOM = cfg.SANITIZE_DOM !== false; // Default true
    SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false; // Default false
    KEEP_CONTENT = cfg.KEEP_CONTENT !== false; // Default true
    IN_PLACE = cfg.IN_PLACE || false; // Default false
    IS_ALLOWED_URI$1 = cfg.ALLOWED_URI_REGEXP || IS_ALLOWED_URI;
    NAMESPACE = cfg.NAMESPACE || HTML_NAMESPACE;
    MATHML_TEXT_INTEGRATION_POINTS = cfg.MATHML_TEXT_INTEGRATION_POINTS || MATHML_TEXT_INTEGRATION_POINTS;
    HTML_INTEGRATION_POINTS = cfg.HTML_INTEGRATION_POINTS || HTML_INTEGRATION_POINTS;
    CUSTOM_ELEMENT_HANDLING = cfg.CUSTOM_ELEMENT_HANDLING || {};
    if(cfg.CUSTOM_ELEMENT_HANDLING && isRegexOrFunction(cfg.CUSTOM_ELEMENT_HANDLING.tagNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.tagNameCheck = cfg.CUSTOM_ELEMENT_HANDLING.tagNameCheck;
    }

    if(cfg.CUSTOM_ELEMENT_HANDLING && isRegexOrFunction(cfg.CUSTOM_ELEMENT_HANDLING.attributeNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.attributeNameCheck = cfg.CUSTOM_ELEMENT_HANDLING.attributeNameCheck;
    }

    if(cfg.CUSTOM_ELEMENT_HANDLING && typeof cfg.CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements === "boolean") {
      CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = cfg.CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements;
    }

    if(SAFE_FOR_TEMPLATES) {
      ALLOW_DATA_ATTR = false;
    }

    if(RETURN_DOM_FRAGMENT) {
      RETURN_DOM = true;
    }

    /* Parse profile info */
    if(USE_PROFILES) {
      ALLOWED_TAGS = addToSet({}, text);
      ALLOWED_ATTR = [];
      if(USE_PROFILES.html === true) {
        addToSet(ALLOWED_TAGS, html$1);
        addToSet(ALLOWED_ATTR, html);
      }

      if(USE_PROFILES.svg === true) {
        addToSet(ALLOWED_TAGS, svg$1);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }

      if(USE_PROFILES.svgFilters === true) {
        addToSet(ALLOWED_TAGS, svgFilters);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }

      if(USE_PROFILES.mathMl === true) {
        addToSet(ALLOWED_TAGS, mathMl$1);
        addToSet(ALLOWED_ATTR, mathMl);
        addToSet(ALLOWED_ATTR, xml);
      }
    }

    /* Merge configuration parameters */
    if(cfg.ADD_TAGS) {
      if(typeof cfg.ADD_TAGS === "function") {
        EXTRA_ELEMENT_HANDLING.tagCheck = cfg.ADD_TAGS;
      } else {
        if(ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) {
          ALLOWED_TAGS = clone(ALLOWED_TAGS);
        }

        addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
      }
    }

    if(cfg.ADD_ATTR) {
      if(typeof cfg.ADD_ATTR === "function") {
        EXTRA_ELEMENT_HANDLING.attributeCheck = cfg.ADD_ATTR;
      } else {
        if(ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) {
          ALLOWED_ATTR = clone(ALLOWED_ATTR);
        }

        addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
      }
    }

    if(cfg.ADD_URI_SAFE_ATTR) {
      addToSet(URI_SAFE_ATTRIBUTES, cfg.ADD_URI_SAFE_ATTR, transformCaseFunc);
    }

    if(cfg.FORBID_CONTENTS) {
      if(FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }

      addToSet(FORBID_CONTENTS, cfg.FORBID_CONTENTS, transformCaseFunc);
    }

    /* Add #text in case KEEP_CONTENT is set to true */
    if(KEEP_CONTENT) {
      ALLOWED_TAGS["#text"] = true;
    }

    /* Add html, head and body to ALLOWED_TAGS in case WHOLE_DOCUMENT is true */
    if(WHOLE_DOCUMENT) {
      addToSet(ALLOWED_TAGS, ["html", "head", "body"]);
    }

    /* Add tbody to ALLOWED_TAGS in case tables are permitted, see #286, #365 */
    if(ALLOWED_TAGS.table) {
      addToSet(ALLOWED_TAGS, ["tbody"]);
      delete FORBID_TAGS.tbody;
    }

    if(cfg.TRUSTED_TYPES_POLICY) {
      if(typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== "function") {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.')
      }

      if(typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== "function") {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.')
      }

      // Overwrite existing TrustedTypes policy.
      trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
      // Sign local variables required by `sanitize`.
      emptyHTML = trustedTypesPolicy.createHTML("");
    } else {
      // Uninitialized policy, attempt to initialize the internal dompurify policy.
      if(trustedTypesPolicy === undefined) {
        trustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
      }

      // If creating the internal policy succeeded sign internal variables.
      if(trustedTypesPolicy !== null && typeof emptyHTML === "string") {
        emptyHTML = trustedTypesPolicy.createHTML("");
      }
    }

    // Prevent further manipulation of configuration.
    // Not available in IE8, Safari 5, etc.
    if(freeze) {
      freeze(cfg);
    }

    CONFIG = cfg;
  };
  /* Keep track of all possible SVG and MathML tags
   * so that we can perform the namespace checks
   * correctly. */
  const ALL_SVG_TAGS = addToSet({}, [...svg$1, ...svgFilters, ...svgDisallowed]);
  const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
  /**
   * @param element a DOM element whose namespace is being checked
   * @returns Return false if the element has a
   *  namespace that a spec-compliant parser would never
   *  return. Return true otherwise.
   */
  const _checkValidNamespace = function _checkValidNamespace(element) {
    let parent = getParentNode(element);
    // In JSDOM, if we're inside shadow DOM, then parentNode
    // can be null. We just simulate parent in this case.
    if(!parent || !parent.tagName) {
      parent = {
        namespaceURI: NAMESPACE,
        tagName: "template"
      };
    }

    const tagName = stringToLowerCase(element.tagName);
    const parentTagName = stringToLowerCase(parent.tagName);
    if(!ALLOWED_NAMESPACES[element.namespaceURI]) {
      return false
    }

    if(element.namespaceURI === SVG_NAMESPACE) {
      // The only way to switch from HTML namespace to SVG
      // is via <svg>. If it happens via any other tag, then
      // it should be killed.
      if(parent.namespaceURI === HTML_NAMESPACE) {
        return tagName === "svg"
      }

      // The only way to switch from MathML to SVG is via`
      // svg if parent is either <annotation-xml> or MathML
      // text integration points.
      if(parent.namespaceURI === MATHML_NAMESPACE) {
        return tagName === "svg" && (parentTagName === "annotation-xml" || MATHML_TEXT_INTEGRATION_POINTS[parentTagName])
      }

      // We only allow elements that are defined in SVG
      // spec. All others are disallowed in SVG namespace.
      return Boolean(ALL_SVG_TAGS[tagName])
    }

    if(element.namespaceURI === MATHML_NAMESPACE) {
      // The only way to switch from HTML namespace to MathML
      // is via <math>. If it happens via any other tag, then
      // it should be killed.
      if(parent.namespaceURI === HTML_NAMESPACE) {
        return tagName === "math"
      }

      // The only way to switch from SVG to MathML is via
      // <math> and HTML integration points
      if(parent.namespaceURI === SVG_NAMESPACE) {
        return tagName === "math" && HTML_INTEGRATION_POINTS[parentTagName]
      }

      // We only allow elements that are defined in MathML
      // spec. All others are disallowed in MathML namespace.
      return Boolean(ALL_MATHML_TAGS[tagName])
    }

    if(element.namespaceURI === HTML_NAMESPACE) {
      // The only way to switch from SVG to HTML is via
      // HTML integration points, and from MathML to HTML
      // is via MathML text integration points
      if(parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName]) {
        return false
      }

      if(parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName]) {
        return false
      }

      // We disallow tags that are specific for MathML
      // or SVG and should never appear in HTML namespace
      return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName])
    }

    // For XHTML and XML documents that support custom namespaces
    if(PARSER_MEDIA_TYPE === "application/xhtml+xml" && ALLOWED_NAMESPACES[element.namespaceURI]) {
      return true
    }

    // The code should never reach this place (this means
    // that the element somehow got namespace that is not
    // HTML, SVG, MathML or allowed via ALLOWED_NAMESPACES).
    // Return false just in case.
    return false
  };
  /**
   * _forceRemove
   *
   * @param node a DOM node
   */
  const _forceRemove = function _forceRemove(node) {
    arrayPush(DOMPurify.removed, {
      element: node
    });
    try {
      // eslint-disable-next-line unicorn/prefer-dom-node-remove
      getParentNode(node).removeChild(node);
    } catch(_) {
      remove(node);
    }
  };
  /**
   * _removeAttribute
   *
   * @param name an Attribute name
   * @param element a DOM node
   */
  const _removeAttribute = function _removeAttribute(name, element) {
    try {
      arrayPush(DOMPurify.removed, {
        attribute: element.getAttributeNode(name),
        from: element
      });
    } catch(_) {
      arrayPush(DOMPurify.removed, {
        attribute: null,
        from: element
      });
    }
    element.removeAttribute(name);
    // We void attribute values for unremovable "is" attributes
    if(name === "is") {
      if(RETURN_DOM || RETURN_DOM_FRAGMENT) {
        try {
          _forceRemove(element);
        } catch(_) {}
      } else {
        try {
          element.setAttribute(name, "");
        } catch(_) {}
      }
    }
  };
  /**
   * _initDocument
   *
   * @param dirty - a string of dirty markup
   * @returns a DOM, filled with the dirty markup
   */
  const _initDocument = function _initDocument(dirty) {
    /* Create a HTML document */
    let doc = null;
    let leadingWhitespace = null;
    if(FORCE_BODY) {
      dirty = "<remove></remove>" + dirty;
    } else {
      /* If FORCE_BODY isn't used, leading whitespace needs to be preserved manually */
      const matches = stringMatch(dirty, /^[\r\n\t ]+/);
      leadingWhitespace = matches && matches[0];
    }

    if(PARSER_MEDIA_TYPE === "application/xhtml+xml" && NAMESPACE === HTML_NAMESPACE) {
      // Root of XHTML doc must contain xmlns declaration (see https://www.w3.org/TR/xhtml1/normative.html#strict)
      dirty = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + dirty + "</body></html>";
    }

    const dirtyPayload = trustedTypesPolicy ? trustedTypesPolicy.createHTML(dirty) : dirty;
    /*
     * Use the DOMParser API by default, fallback later if needs be
     * DOMParser not work for svg when has multiple root element.
     */
    if(NAMESPACE === HTML_NAMESPACE) {
      try {
        doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
      } catch(_) {}
    }

    /* Use createHTMLDocument in case DOMParser is not available */
    if(!doc || !doc.documentElement) {
      doc = implementation.createDocument(NAMESPACE, "template", null);
      try {
        doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
      } catch(_) {
        // Syntax error if dirtyPayload is invalid xml
      }
    }

    const body = doc.body || doc.documentElement;
    if(dirty && leadingWhitespace) {
      body.insertBefore(document.createTextNode(leadingWhitespace), body.childNodes[0] || null);
    }

    /* Work on whole document or just its body */
    if(NAMESPACE === HTML_NAMESPACE) {
      return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? "html" : "body")[0]
    }

    return WHOLE_DOCUMENT ? doc.documentElement : body
  };
  /**
   * Creates a NodeIterator object that you can use to traverse filtered lists of nodes or elements in a document.
   *
   * @param root The root element or node to start traversing on.
   * @returns The created NodeIterator
   */
  const _createNodeIterator = function _createNodeIterator(root) {
    return createNodeIterator.call(root.ownerDocument || root, root,

      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION, null)
  };
  /**
   * _isClobbered
   *
   * @param element element to check for clobbering attacks
   * @returns true if clobbered, false if safe
   */
  const _isClobbered = function _isClobbered(element) {
    return element instanceof HTMLFormElement && (typeof element.nodeName !== "string" || typeof element.textContent !== "string" || typeof element.removeChild !== "function" || !(element.attributes instanceof NamedNodeMap) || typeof element.removeAttribute !== "function" || typeof element.setAttribute !== "function" || typeof element.namespaceURI !== "string" || typeof element.insertBefore !== "function" || typeof element.hasChildNodes !== "function")
  };
  /**
   * Checks whether the given object is a DOM node.
   *
   * @param value object to check whether it's a DOM node
   * @returns true is object is a DOM node
   */
  const _isNode = function _isNode(value) {
    return typeof Node === "function" && value instanceof Node
  };
  function _executeHooks(hooks, currentNode, data) {
    arrayForEach(hooks, hook => {
      hook.call(DOMPurify, currentNode, data, CONFIG);
    });
  }
  /**
   * _sanitizeElements
   *
   * @protect nodeName
   * @protect textContent
   * @protect removeChild
   * @param currentNode to check for permission to exist
   * @returns true if node was killed, false if left alive
   */
  const _sanitizeElements = function _sanitizeElements(currentNode) {
    let content = null;
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeElements, currentNode, null);
    /* Check if element is clobbered or can clobber */
    if(_isClobbered(currentNode)) {
      _forceRemove(currentNode);

      return true
    }

    /* Now let's check the element's type and name */
    const tagName = transformCaseFunc(currentNode.nodeName);
    /* Execute a hook if present */
    _executeHooks(hooks.uponSanitizeElement, currentNode, {
      tagName,
      allowedTags: ALLOWED_TAGS
    });
    /* Detect mXSS attempts abusing namespace confusion */
    if(SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(/<[/\w!]/g, currentNode.innerHTML) && regExpTest(/<[/\w!]/g, currentNode.textContent)) {
      _forceRemove(currentNode);

      return true
    }

    /* Remove any occurrence of processing instructions */
    if(currentNode.nodeType === NODE_TYPE.progressingInstruction) {
      _forceRemove(currentNode);

      return true
    }

    /* Remove any kind of possibly harmful comments */
    if(SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(/<[/\w]/g, currentNode.data)) {
      _forceRemove(currentNode);

      return true
    }

    /* Remove element if anything forbids its presence */
    if(!(EXTRA_ELEMENT_HANDLING.tagCheck instanceof Function && EXTRA_ELEMENT_HANDLING.tagCheck(tagName)) && (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName])) {
      /* Check if we have a custom element to handle */
      if(!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName)) {
        if(CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName)) {
          return false
        }

        if(CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(tagName)) {
          return false
        }
      }

      /* Keep content except for bad-listed elements */
      if(KEEP_CONTENT && !FORBID_CONTENTS[tagName]) {
        const parentNode = getParentNode(currentNode) || currentNode.parentNode;
        const childNodes = getChildNodes(currentNode) || currentNode.childNodes;
        if(childNodes && parentNode) {
          const childCount = childNodes.length;
          for(let i = childCount - 1; i >= 0; --i) {
            const childClone = cloneNode(childNodes[i], true);
            childClone.__removalCount = (currentNode.__removalCount || 0) + 1;
            parentNode.insertBefore(childClone, getNextSibling(currentNode));
          }
        }
      }

      _forceRemove(currentNode);

      return true
    }

    /* Check whether element has a valid namespace */
    if(currentNode instanceof Element && !_checkValidNamespace(currentNode)) {
      _forceRemove(currentNode);

      return true
    }

    /* Make sure that older browsers don't get fallback-tag mXSS */
    if((tagName === "noscript" || tagName === "noembed" || tagName === "noframes") && regExpTest(/<\/no(script|embed|frames)/i, currentNode.innerHTML)) {
      _forceRemove(currentNode);

      return true
    }

    /* Sanitize element content to be template-safe */
    if(SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
      /* Get the element's text content */
      content = currentNode.textContent;
      arrayForEach([MUSTACHE_EXPR, ERB_EXPR, TMPLIT_EXPR], expr => {
        content = stringReplace(content, expr, " ");
      });
      if(currentNode.textContent !== content) {
        arrayPush(DOMPurify.removed, {
          element: currentNode.cloneNode()
        });
        currentNode.textContent = content;
      }
    }

    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeElements, currentNode, null);

    return false
  };
  /**
   * _isValidAttribute
   *
   * @param lcTag Lowercase tag name of containing element.
   * @param lcName Lowercase attribute name.
   * @param value Attribute value.
   * @returns Returns true if `value` is valid, otherwise false.
   */

  const _isValidAttribute = function _isValidAttribute(lcTag, lcName, value) {
    /* Make sure attribute cannot clobber */
    if(SANITIZE_DOM && (lcName === "id" || lcName === "name") && (value in document || value in formElement)) {
      return false
    }

    /* Allow valid data-* attributes: At least one character after "-"
        (https://html.spec.whatwg.org/multipage/dom.html#embedding-custom-non-visible-data-with-the-data-*-attributes)
        XML-compatible (https://html.spec.whatwg.org/multipage/infrastructure.html#xml-compatible and http://www.w3.org/TR/xml/#d0e804)
        We don't need to check the value; it's always URI safe. */
    if(ALLOW_DATA_ATTR && !FORBID_ATTR[lcName] && regExpTest(DATA_ATTR, lcName))
    ; else if(ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR, lcName))
    ; else if(EXTRA_ELEMENT_HANDLING.attributeCheck instanceof Function && EXTRA_ELEMENT_HANDLING.attributeCheck(lcName, lcTag))
    ; else if(!ALLOWED_ATTR[lcName] || FORBID_ATTR[lcName]) {
      if(
      // First condition does a very basic check if a) it's basically a valid custom element tagname AND
      // b) if the tagName passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
      // and c) if the attribute name passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.attributeNameCheck
        _isBasicCustomElement(lcTag) && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(lcTag)) && (CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName) || CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.attributeNameCheck(lcName, lcTag)) ||
      // Alternative, second condition checks if it's an `is`-attribute, AND
      // the value passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
      lcName === "is" && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(value)))
      ; else {
        return false
      }
      /* Check value is safe. First, is attr inert? If so, is safe */
    } else if(URI_SAFE_ATTRIBUTES[lcName])
    ; else if(regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE, "")))
    ; else if((lcName === "src" || lcName === "xlink:href" || lcName === "href") && lcTag !== "script" && stringIndexOf(value, "data:") === 0 && DATA_URI_TAGS[lcTag])
    ; else if(ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA, stringReplace(value, ATTR_WHITESPACE, "")))
    ; else if(value) {
      return false
    } else
      ;

    return true
  };
  /**
   * _isBasicCustomElement
   * checks if at least one dash is included in tagName, and it's not the first char
   * for more sophisticated checking see https://github.com/sindresorhus/validate-element-name
   *
   * @param tagName name of the tag of the node to sanitize
   * @returns Returns true if the tag name meets the basic criteria for a custom element, otherwise false.
   */
  const _isBasicCustomElement = function _isBasicCustomElement(tagName) {
    return tagName !== "annotation-xml" && stringMatch(tagName, CUSTOM_ELEMENT)
  };
  /**
   * _sanitizeAttributes
   *
   * @protect attributes
   * @protect nodeName
   * @protect removeAttribute
   * @protect setAttribute
   *
   * @param currentNode to sanitize
   */
  const _sanitizeAttributes = function _sanitizeAttributes(currentNode) {
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
    const {
      attributes
    } = currentNode;
    /* Check if we have attributes; if not we might have a text node */
    if(!attributes || _isClobbered(currentNode)) {
      return
    }

    const hookEvent = {
      attrName: "",
      attrValue: "",
      keepAttr: true,
      allowedAttributes: ALLOWED_ATTR,
      forceKeepAttr: undefined
    };
    let l = attributes.length;
    /* Go backwards over all attributes; safely remove bad ones */
    while(l--) {
      const attr = attributes[l];
      const {
        name,
        namespaceURI,
        value: attrValue
      } = attr;
      const lcName = transformCaseFunc(name);
      const initValue = attrValue;
      let value = name === "value" ? initValue : stringTrim(initValue);
      /* Execute a hook if present */
      hookEvent.attrName = lcName;
      hookEvent.attrValue = value;
      hookEvent.keepAttr = true;
      hookEvent.forceKeepAttr = undefined; // Allows developers to see this is a property they can set
      _executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
      value = hookEvent.attrValue;
      /* Full DOM Clobbering protection via namespace isolation,
       * Prefix id and name attributes with `user-content-`
       */
      if(SANITIZE_NAMED_PROPS && (lcName === "id" || lcName === "name")) {
        // Remove the attribute with this value
        _removeAttribute(name, currentNode);
        // Prefix the value and later re-create the attribute with the sanitized value
        value = SANITIZE_NAMED_PROPS_PREFIX + value;
      }

      /* Work around a security issue with comments inside attributes */
      if(SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|title|textarea)/i, value)) {
        _removeAttribute(name, currentNode);
        continue
      }

      /* Make sure we cannot easily use animated hrefs, even if animations are allowed */
      if(lcName === "attributename" && stringMatch(value, "href")) {
        _removeAttribute(name, currentNode);
        continue
      }

      /* Did the hooks approve of the attribute? */
      if(hookEvent.forceKeepAttr) {
        continue
      }

      /* Did the hooks approve of the attribute? */
      if(!hookEvent.keepAttr) {
        _removeAttribute(name, currentNode);
        continue
      }

      /* Work around a security issue in jQuery 3.0 */
      if(!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(/\/>/i, value)) {
        _removeAttribute(name, currentNode);
        continue
      }

      /* Sanitize attribute content to be template-safe */
      if(SAFE_FOR_TEMPLATES) {
        arrayForEach([MUSTACHE_EXPR, ERB_EXPR, TMPLIT_EXPR], expr => {
          value = stringReplace(value, expr, " ");
        });
      }

      /* Is `value` valid for this attribute? */
      const lcTag = transformCaseFunc(currentNode.nodeName);
      if(!_isValidAttribute(lcTag, lcName, value)) {
        _removeAttribute(name, currentNode);
        continue
      }

      /* Handle attributes that require Trusted Types */
      if(trustedTypesPolicy && typeof trustedTypes === "object" && typeof trustedTypes.getAttributeType === "function") {
        if(namespaceURI)
        ; else {
          switch(trustedTypes.getAttributeType(lcTag, lcName)) {
            case "TrustedHTML":
            {
              value = trustedTypesPolicy.createHTML(value);
              break
            }
            case "TrustedScriptURL":
            {
              value = trustedTypesPolicy.createScriptURL(value);
              break
            }
          }
        }
      }

      /* Handle invalid data-* attribute set by try-catching it */
      if(value !== initValue) {
        try {
          if(namespaceURI) {
            currentNode.setAttributeNS(namespaceURI, name, value);
          } else {
            /* Fallback to setAttribute() for browser-unrecognized namespaces e.g. "x-schema". */
            currentNode.setAttribute(name, value);
          }

          if(_isClobbered(currentNode)) {
            _forceRemove(currentNode);
          } else {
            arrayPop(DOMPurify.removed);
          }
        } catch(_) {
          _removeAttribute(name, currentNode);
        }
      }
    }

    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
  };
  /**
   * _sanitizeShadowDOM
   *
   * @param fragment to iterate over recursively
   */
  const _sanitizeShadowDOM = function _sanitizeShadowDOM(fragment) {
    let shadowNode = null;
    const shadowIterator = _createNodeIterator(fragment);
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
    while(shadowNode = shadowIterator.nextNode()) {
      /* Execute a hook if present */
      _executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
      /* Sanitize tags and elements */
      _sanitizeElements(shadowNode);
      /* Check attributes next */
      _sanitizeAttributes(shadowNode);
      /* Deep shadow DOM detected */
      if(shadowNode.content instanceof DocumentFragment) {
        _sanitizeShadowDOM(shadowNode.content);
      }
    }

    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
  };

  DOMPurify.sanitize = function(dirty) {
    const cfg = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    let body = null;
    let importedNode = null;
    let currentNode = null;
    let returnNode = null;
    /* Make sure we have a string to sanitize.
      DO NOT return early, as this will return the wrong type if
      the user has requested a DOM object rather than a string */
    IS_EMPTY_INPUT = !dirty;
    if(IS_EMPTY_INPUT) {
      dirty = "<!-->";
    }

    /* Stringify, in case dirty is an object */
    if(typeof dirty !== "string" && !_isNode(dirty)) {
      if(typeof dirty.toString === "function") {
        dirty = dirty.toString();
        if(typeof dirty !== "string") {
          throw typeErrorCreate("dirty is not a string, aborting")
        }
      } else {
        throw typeErrorCreate("toString is not a function")
      }
    }

    /* Return dirty HTML if DOMPurify cannot run */
    if(!DOMPurify.isSupported) {
      return dirty
    }

    /* Assign config vars */
    if(!SET_CONFIG) {
      _parseConfig(cfg);
    }

    /* Clean up removed elements */
    DOMPurify.removed = [];
    /* Check if dirty is correctly typed for IN_PLACE */
    if(typeof dirty === "string") {
      IN_PLACE = false;
    }

    if(IN_PLACE) {
      /* Do some early pre-sanitization to avoid unsafe root nodes */
      if(dirty.nodeName) {
        const tagName = transformCaseFunc(dirty.nodeName);
        if(!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
          throw typeErrorCreate("root node is forbidden and cannot be sanitized in-place")
        }
      }
    } else if(dirty instanceof Node) {
      /* If dirty is a DOM element, append to an empty document to avoid
         elements being stripped by the parser */
      body = _initDocument("<!---->");
      importedNode = body.ownerDocument.importNode(dirty, true);
      if(importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === "BODY") {
        /* Node is already a body, use as is */
        body = importedNode;
      } else if(importedNode.nodeName === "HTML") {
        body = importedNode;
      } else {
        // eslint-disable-next-line unicorn/prefer-dom-node-append
        body.appendChild(importedNode);
      }
    } else {
      /* Exit directly if we have nothing to do */
      if(!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT &&
      // eslint-disable-next-line unicorn/prefer-includes
      dirty.indexOf("<") === -1) {
        return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? trustedTypesPolicy.createHTML(dirty) : dirty
      }

      /* Initialize the document to work on */
      body = _initDocument(dirty);
      /* Check we have a DOM node from the data */
      if(!body) {
        return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : ""
      }
    }

    /* Remove first element node (ours) if FORCE_BODY is set */
    if(body && FORCE_BODY) {
      _forceRemove(body.firstChild);
    }

    /* Get node iterator */
    const nodeIterator = _createNodeIterator(IN_PLACE ? dirty : body);
    /* Now start iterating over the created document */
    while(currentNode = nodeIterator.nextNode()) {
      /* Sanitize tags and elements */
      _sanitizeElements(currentNode);
      /* Check attributes next */
      _sanitizeAttributes(currentNode);
      /* Shadow DOM detected, sanitize it */
      if(currentNode.content instanceof DocumentFragment) {
        _sanitizeShadowDOM(currentNode.content);
      }
    }

    /* If we sanitized `dirty` in-place, return it. */
    if(IN_PLACE) {
      return dirty
    }

    /* Return sanitized string or DOM */
    if(RETURN_DOM) {
      if(RETURN_DOM_FRAGMENT) {
        returnNode = createDocumentFragment.call(body.ownerDocument);
        while(body.firstChild) {
          // eslint-disable-next-line unicorn/prefer-dom-node-append
          returnNode.appendChild(body.firstChild);
        }
      } else {
        returnNode = body;
      }

      if(ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode) {
        /*
          AdoptNode() is not used because internal state is not reset
          (e.g. the past names map of a HTMLFormElement), this is safe
          in theory but we would rather not risk another attack vector.
          The state that is cloned by importNode() is explicitly defined
          by the specs.
        */
        returnNode = importNode.call(originalDocument, returnNode, true);
      }

      return returnNode
    }

    let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
    /* Serialize doctype if allowed */
    if(WHOLE_DOCUMENT && ALLOWED_TAGS["!doctype"] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name)) {
      serializedHTML = "<!DOCTYPE " + body.ownerDocument.doctype.name + ">\n" + serializedHTML;
    }

    /* Sanitize final string template-safe */
    if(SAFE_FOR_TEMPLATES) {
      arrayForEach([MUSTACHE_EXPR, ERB_EXPR, TMPLIT_EXPR], expr => {
        serializedHTML = stringReplace(serializedHTML, expr, " ");
      });
    }

    return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? trustedTypesPolicy.createHTML(serializedHTML) : serializedHTML
  };
  DOMPurify.setConfig = function() {
    const cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    _parseConfig(cfg);
    SET_CONFIG = true;
  };
  DOMPurify.clearConfig = function() {
    CONFIG = null;
    SET_CONFIG = false;
  };
  DOMPurify.isValidAttribute = function(tag, attr, value) {
    /* Initialize shared config vars if necessary. */
    if(!CONFIG) {
      _parseConfig({});
    }

    const lcTag = transformCaseFunc(tag);
    const lcName = transformCaseFunc(attr);

    return _isValidAttribute(lcTag, lcName, value)
  };
  DOMPurify.addHook = function(entryPoint, hookFunction) {
    if(typeof hookFunction !== "function") {
      return
    }

    arrayPush(hooks[entryPoint], hookFunction);
  };
  DOMPurify.removeHook = function(entryPoint, hookFunction) {
    if(hookFunction !== undefined) {
      const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);

      return index === -1 ? undefined : arraySplice(hooks[entryPoint], index, 1)[0]
    }

    return arrayPop(hooks[entryPoint])
  };
  DOMPurify.removeHooks = function(entryPoint) {
    hooks[entryPoint] = [];
  };
  DOMPurify.removeAllHooks = function() {
    hooks = _createHooksMap();
  };

  return DOMPurify
}
var purify = createDOMPurify();

class HTML {
  #domPurify

  /**
   * Lightweight HTML helper utilities for browser contexts.
   *
   * @param {object|(() => unknown)} domPurify - Optional DOMPurify instance or factory.
   */
  constructor(domPurify=purify) {
    this.#domPurify = domPurify;
  }

  /**
   * Fetches an HTML fragment and returns the contents inside the <body> tag when present.
   *
   * @param {string} url - Location of the HTML resource to load.
   * @param {boolean} filterBodyContent - If true, returns only content found between the <body> tags. Defaults to false.
   * @returns {Promise<string>} Sanitized HTML string or empty string on missing content.
   */
  async loadHTML(url, filterBodyContent=false) {
    try {
      const response = await fetch(url);
      const html = await response?.text();

      if(!html)
        return ""

      const {body} = /<body[^>]*>(?<body>[\s\S]*?)<\/body>/i.exec(html)?.groups ?? {};

      if(filterBodyContent)
        return body ?? html

      return html
    } catch(error) {
      throw Sass.new(`Loading HTML from '${url}'.`, error)
    }
  }

  /**
   * Sanitizes arbitrary HTML using DOMPurify.
   *
   * @param {string} text - HTML string to sanitize. Defaults to "".
   * @returns {string} Sanitized HTML.
   */
  sanitise(text="") {
    const sanitizer = this.#resolveSanitizer();

    return sanitizer(String(text ?? ""))
  }

  /**
   * Sanitizes an HTML string and replaces the element's children with the result.
   *
   * @param {Element} element - Target element to replace content within.
   * @param {string} htmlString - HTML string to sanitize and insert.
   */
  setHTMLContent(element, htmlString) {
    if(!element)
      throw Sass.new("setHTMLContent requires a valid element.")

    const sanitised = this.sanitise(htmlString);
    const doc = element.ownerDocument ?? globalThis.document;

    if(doc?.createRange && typeof element.replaceChildren === "function") {
      const range = doc.createRange();
      const fragment = range.createContextualFragment(sanitised);

      element.replaceChildren(fragment);

      return
    }

    if("innerHTML" in element) {
      element.innerHTML = sanitised;

      return
    }

    if(typeof element.replaceChildren === "function") {
      element.replaceChildren(sanitised);

      return
    }

    throw Sass.new("Unable to set HTML content: unsupported element.")
  }

  /**
   * Removes all child nodes from the given element.
   *
   * @param {Element} element - Element to clear.
   */
  clearHTMLContent(element) {
    if(!element)
      throw Sass.new("clearHTMLContent requires a valid element.")

    if(typeof element.replaceChildren === "function") {
      element.replaceChildren();

      return
    }

    if("innerHTML" in element) {
      element.innerHTML = "";

      return
    }

    throw Sass.new("Unable to clear HTML content: unsupported element.")
  }

  /**
   * Resolves the DOMPurify sanitize function.
   *
   * @returns {(input: string) => string} Sanitizer function.
   */
  #resolveSanitizer() {
    if(this.#domPurify?.sanitize)
      return this.#domPurify.sanitize

    if(typeof this.#domPurify === "function") {
      try {
        const configured = this.#domPurify(globalThis.window ?? globalThis);

        if(configured?.sanitize)
          return configured.sanitize
      } catch(error) {
        throw Sass.new("DOMPurify sanitization is unavailable in this environment.", error)
      }
    }

    throw Sass.new("DOMPurify sanitization is unavailable in this environment.")
  }
}

var HTML_default = new HTML();

/**
 * Thin wrapper around `window` event handling to centralize emit/on/off
 * helpers. Used to dispatch simple CustomEvents and manage listeners in one
 * place.
 */

/**
 * @typedef {object} NotifyEventOptions
 * @property {boolean} [bubbles] - Whether the event bubbles up the DOM tree.
 * @property {boolean} [cancelable] - Whether the event can be canceled.
 * @property {boolean} [composed] - Whether the event can cross the shadow DOM boundary.
 */
class Notify {
  /** @type {string} Display name for debugging. */
  name = "Notify"

  /**
   * Emits a CustomEvent without expecting a return value.
   *
   * @param {string} type - Event name to dispatch.
   * @param {unknown} [payload] - Value assigned to `event.detail`.
   * @param {boolean | NotifyEventOptions} [options] - CustomEvent options or boolean to set `bubbles`.
   * @returns {void}
   */
  emit(type, payload=undefined, options=undefined) {
    const evt = new CustomEvent(type, this.#buildEventInit(payload, options));
    window.dispatchEvent(evt);
  }

  /**
   * Emits a CustomEvent and returns the detail for simple request/response flows.
   *
   * @param {string} type - Event name to dispatch.
   * @param {unknown} [payload] - Value assigned to `event.detail`.
   * @param {boolean | NotifyEventOptions} [options] - CustomEvent options or boolean to set `bubbles`.
   * @returns {unknown} The detail placed on the CustomEvent.
   */
  request(type, payload={}, options=undefined) {
    const evt = new CustomEvent(type, this.#buildEventInit(payload, options));
    window.dispatchEvent(evt);

    return evt.detail
  }

  /**
   * Registers a listener for the given event type on an HTMLElement (or
   * window, if not specified).
   *
   * @param {string} type - Event name to listen for.
   * @param {(evt: Notify) => void} handler - Listener callback.
   * @param {HTMLElement | Window} [element] - The object to which to attach the handler. Default is window.
   * @param {boolean | object} [options] - Options to pass to addEventListener.
   * @returns {() => void} Dispose function to unregister the handler.
   */
  on(type, handler, element=window, options=undefined) {
    if(!(typeof type === "string" && type))
      throw new Error("No event 'type' specified to listen for.")

    if(typeof handler !== "function")
      throw new Error("No handler function specified.")

    element.addEventListener(type, handler, options);

    return () => this.off(type, handler, element, options)
  }

  /**
   * Removes a previously registered listener for the given event type.
   *
   * @param {string} type - Event name to remove.
   * @param {(evt: Notify) => void} handler - Listener callback to detach.
   * @param {HTMLElement | Window} [element] - The object from which to remove the handler. Default is window.
   * @param {boolean | object} [options] - Options to pass to removeEventListener.
   * @returns {void}
   */
  off(type, handler, element=window, options=undefined) {
    element.removeEventListener(type, handler, options);
  }

  #buildEventInit(detail, options) {
    if(typeof options === "boolean")
      return {detail, bubbles: options}

    if(typeof options === "object" && options !== null)
      return {detail, ...options}

    return {detail}
  }
}

var Notify_default = new Notify();

/**
 * Utility class providing helper functions for working with Promises,
 * including settling, filtering, and extracting values from promise results.
 */
class Promised {
  /**
   * Asynchronously awaits all promises in parallel.
   * Wrapper around Promise.all for consistency with other utility methods.
   *
   * @param {Array<Promise<unknown>>} promises - Array of promises to await
   * @returns {Promise<Array<unknown>>} Results of all promises
   */
  static async await(promises) {
    Valid.type(promises, "Promise[]");

    return await Promise.all(promises)
  }

  /**
   * Returns the first promise to resolve or reject from an array of promises.
   * Wrapper around Promise.race for consistency with other utility methods.
   *
   * @param {Array<Promise<unknown>>} promises - Array of promises to race
   * @returns {Promise<unknown>} Result of the first settled promise
   */
  static async race(promises) {
    Valid.type(promises, "Promise[]");

    return await Promise.race(promises)
  }

  /**
   * Settles all promises (both fulfilled and rejected) in parallel.
   * Wrapper around Promise.allSettled for consistency with other utility methods.
   *
   * @param {Array<Promise<unknown>>} promises - Array of promises to settle
   * @returns {Promise<Array<{status: 'fulfilled'|'rejected', value?: unknown, reason?: unknown}>>} Results of all settled promises with status and value/reason
   */
  static async settle(promises) {
    Valid.type(promises, "Promise[]");

    return await Promise.allSettled(promises)
  }

  /**
   * Checks if any result in the settled promise array is rejected.
   *
   * @param {Array<{status: 'fulfilled'|'rejected', value?: unknown, reason?: unknown}>} settled - Array of settled promise results
   * @returns {boolean} True if any result is rejected, false otherwise
   */
  static hasRejected(settled) {
    return settled.some(r => r.status === "rejected")
  }

  /**
   * Checks if any result in the settled promise array is fulfilled.
   *
   * @param {Array<{status: 'fulfilled'|'rejected', value?: unknown, reason?: unknown}>} settled - Array of settled promise results
   * @returns {boolean} True if any result is fulfilled, false otherwise
   */
  static hasFulfilled(settled) {
    return settled.some(r => r.status === "fulfilled")
  }

  /**
   * Filters and returns all rejected results from a settled promise array.
   *
   * @param {Array<{status: 'fulfilled'|'rejected', value?: unknown, reason?: unknown}>} settled - Array of settled promise results
   * @returns {Array<{status: 'rejected', reason: unknown}>} Array of rejected results
   */
  static rejected(settled) {
    return settled.filter(r => r.status === "rejected")
  }

  /**
   * Filters and returns all fulfilled results from a settled promise array.
   *
   * @param {Array<{status: 'fulfilled'|'rejected', value?: unknown, reason?: unknown}>} result - Array of settled promise results
   * @returns {Array<{status: 'fulfilled', value: unknown}>} Array of fulfilled results
   */
  static fulfilled(result) {
    return result.filter(r => r.status === "fulfilled")
  }

  /**
   * Extracts the rejection reasons from a settled promise array.
   *
   * @param {Array<{status: 'fulfilled'|'rejected', value?: unknown, reason?: unknown}>} settled - Array of settled promise results
   * @returns {Array<unknown>} Array of rejection reasons
   */
  static reasons(settled) {
    const rejected = this.rejected(settled);
    const reasons = rejected.map(e => e.reason);

    return reasons
  }

  /**
   * Extracts the values from fulfilled results in a settled promise array.
   *
   * @param {Array<{status: 'fulfilled'|'rejected', value?: unknown, reason?: unknown}>} settled - Array of settled promise results
   * @returns {Array<unknown>} Array of fulfilled values
   */
  static values(settled) {
    const fulfilled = this.fulfilled(settled);
    const values = fulfilled.map(e => e.value);

    return values
  }

  /**
   * Throws a Tantrum containing all rejection reasons from settled promises.
   *
   * @param {string} message - Error message. Defaults to "GIGO"
   * @param {Array<{status: 'fulfilled'|'rejected', value?: unknown, reason?: unknown}>} settled - Array of settled promise results
   * @throws {Tantrum} Throws a Tantrum error with rejection reasons
   */
  static throw(message, settled) {
    Valid.type(message, "Null|Undefined|String", {allowEmpty: false});
    Valid.type(settled, "Array");

    message ??= "GIGO";

    const rejected = this.rejected(settled);
    const reasons = this.reasons(rejected);

    throw Tantrum.new(message, reasons)
  }
}

/**
 * Utility class for timing operations and promise-based delays.
 * Provides methods for creating cancellable timeout promises.
 */
class Time {
  /**
   * Creates a promise that resolves after a specified delay.
   * The returned promise includes a timerId property that can be used with cancel().
   *
   * @param {number} delay - Delay in milliseconds before resolving (must be >= 0)
   * @param {unknown} [value] - Optional value to resolve with after the delay
   * @returns {Promise<unknown> & {timerId: number}} Promise that resolves with the value after delay, extended with timerId property
   * @throws {Sass} If delay is not a number or is negative
   * @example
   * // Wait 1 second then continue
   * await Time.after(1000)
   *
   * // Wait 1 second then get a value
   * const result = await Time.after(1000, 'done')
   *
   * // Create a cancellable delay
   * const promise = Time.after(5000, 'data')
   * Time.cancel(promise) // Cancel before it resolves
   */
  static after(delay, value) {
    Valid.type(delay, "Number", "delay");
    Valid.assert(delay >= 0, "delay must be non-negative", delay);

    let timerId;
    const promise = new Promise(resolve => {
      // Cap at max 32-bit signed integer to avoid Node.js timeout overflow warning
      const safeDelay = Math.min(delay, 2147483647);
      timerId = setTimeout(() => resolve(value), safeDelay);
    });
    promise.timerId = timerId;

    return promise
  }

  /**
   * Cancels a promise created by Time.after() by clearing its timeout.
   * If the promise has already resolved or is not a Time.after() promise, this is a no-op.
   *
   * @param {Promise<unknown> & {timerId?: number}} promise - Promise returned from Time.after() to cancel
   * @returns {void}
   * @example
   * const promise = Time.after(5000, 'data')
   * Time.cancel(promise) // Prevents the promise from resolving
   */
  static cancel(promise) {
    if(promise && typeof promise === "object" && "timerId" in promise)
      clearTimeout(promise.timerId);
  }
}

export { Collection, Data, Disposer_default as Disposer, Disposer as DisposerClass, HTML_default as HTML, HTML as HTMLClass, Notify_default as Notify, Notify as NotifyClass, Promised, Sass, Tantrum, Time, TypeSpec as Type, Util, Valid };
