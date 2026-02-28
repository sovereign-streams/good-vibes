import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class Validator {
  /**
   * @param {string} schemaDir - Absolute path to the directory containing JSON schema files.
   */
  constructor(schemaDir) {
    this.schemaDir = schemaDir;
    this._cache = new Map();
  }

  /**
   * Load and cache a JSON schema file.
   * @param {string} schemaName - Schema file name without extension (e.g., 'enrichment-envelope').
   * @returns {object} The parsed JSON schema.
   */
  loadSchema(schemaName) {
    if (this._cache.has(schemaName)) {
      return this._cache.get(schemaName);
    }

    const filePath = join(this.schemaDir, `${schemaName}.schema.json`);
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const schema = JSON.parse(raw);
      this._cache.set(schemaName, schema);
      return schema;
    } catch (err) {
      throw new Error(`Failed to load schema "${schemaName}" from ${filePath}: ${err.message}`);
    }
  }

  /**
   * Validate data against a named schema.
   * Lightweight validator that checks required fields, types, enums, and ranges.
   *
   * @param {object} data - The data to validate.
   * @param {string} schemaName - The schema to validate against.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, schemaName) {
    const schema = this.loadSchema(schemaName);
    const errors = [];

    this._validateObject(data, schema, schema.$defs || {}, '', errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate an object against a schema node, collecting errors.
   * @private
   */
  _validateObject(data, schema, defs, path, errors) {
    // Resolve $ref
    if (schema.$ref) {
      const resolved = this._resolveRef(schema.$ref, defs);
      if (!resolved) {
        errors.push(`${path}: unresolvable $ref "${schema.$ref}"`);
        return;
      }
      this._validateObject(data, resolved, defs, path, errors);
      return;
    }

    // Handle oneOf
    if (schema.oneOf) {
      const anyMatch = schema.oneOf.some(subSchema => {
        const subErrors = [];
        this._validateObject(data, subSchema, defs, path, subErrors);
        return subErrors.length === 0;
      });
      if (!anyMatch) {
        errors.push(`${path}: does not match any oneOf schemas`);
      }
      return;
    }

    // Type check
    if (schema.type) {
      if (!this._checkType(data, schema.type, path, errors)) {
        return; // No point checking further if type is wrong
      }
    }

    // Null check
    if (data === null || data === undefined) {
      if (schema.type === 'null') return;
      if (schema.type && schema.type !== 'null') {
        errors.push(`${path}: expected ${schema.type} but got ${data === null ? 'null' : 'undefined'}`);
      }
      return;
    }

    // Enum check
    if (schema.enum && !schema.enum.includes(data)) {
      errors.push(`${path}: value "${data}" not in enum [${schema.enum.join(', ')}]`);
    }

    // Number range checks
    if (typeof data === 'number') {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`${path}: ${data} is less than minimum ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push(`${path}: ${data} is greater than maximum ${schema.maximum}`);
      }
    }

    // Object: check required fields and recurse into properties
    if (schema.type === 'object' && typeof data === 'object' && data !== null) {
      // Required fields
      if (schema.required) {
        for (const reqField of schema.required) {
          if (!(reqField in data)) {
            errors.push(`${path}: missing required field "${reqField}"`);
          }
        }
      }

      // Validate each defined property
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          if (propName in data) {
            this._validateObject(data[propName], propSchema, defs, `${path}.${propName}`, errors);
          }
        }
      }
    }

    // Array: validate items
    if (schema.type === 'array' && Array.isArray(data)) {
      if (schema.items) {
        for (let i = 0; i < data.length; i++) {
          this._validateObject(data[i], schema.items, defs, `${path}[${i}]`, errors);
        }
      }
    }
  }

  /**
   * Check if a value matches the expected JSON Schema type.
   * @private
   * @returns {boolean} True if type matches.
   */
  _checkType(data, expectedType, path, errors) {
    if (data === null) {
      if (expectedType === 'null') return true;
      errors.push(`${path}: expected ${expectedType} but got null`);
      return false;
    }

    if (data === undefined) {
      errors.push(`${path}: expected ${expectedType} but got undefined`);
      return false;
    }

    switch (expectedType) {
      case 'string':
        if (typeof data !== 'string') {
          errors.push(`${path}: expected string but got ${typeof data}`);
          return false;
        }
        return true;

      case 'number':
        if (typeof data !== 'number' || isNaN(data)) {
          errors.push(`${path}: expected number but got ${typeof data}`);
          return false;
        }
        return true;

      case 'integer':
        if (typeof data !== 'number' || !Number.isInteger(data)) {
          errors.push(`${path}: expected integer but got ${typeof data}${typeof data === 'number' ? ` (${data})` : ''}`);
          return false;
        }
        return true;

      case 'boolean':
        if (typeof data !== 'boolean') {
          errors.push(`${path}: expected boolean but got ${typeof data}`);
          return false;
        }
        return true;

      case 'object':
        if (typeof data !== 'object' || Array.isArray(data)) {
          errors.push(`${path}: expected object but got ${Array.isArray(data) ? 'array' : typeof data}`);
          return false;
        }
        return true;

      case 'array':
        if (!Array.isArray(data)) {
          errors.push(`${path}: expected array but got ${typeof data}`);
          return false;
        }
        return true;

      case 'null':
        if (data !== null) {
          errors.push(`${path}: expected null but got ${typeof data}`);
          return false;
        }
        return true;

      default:
        return true; // Unknown type, don't block
    }
  }

  /**
   * Resolve a $ref pointer within the schema's $defs.
   * Supports "#/$defs/name" format.
   * @private
   */
  _resolveRef(ref, defs) {
    const match = ref.match(/^#\/\$defs\/(.+)$/);
    if (match && defs[match[1]]) {
      return defs[match[1]];
    }
    return null;
  }
}
