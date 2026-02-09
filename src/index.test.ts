/*
 * Copyright © 2025-2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, expect, it } from "vitest";
import { isTrace, isValidator, isValueShape, materialize, validateValue } from "./index.core.js";
import { collect, type Trace, validate } from "./index.js";
import { local, locals } from "./local.js";
import { integer, number } from "./number.js";
import { id, optional, reference, required, resource, type } from "./resource.js";
import { string } from "./string.js";


describe("validate", () => {

	describe("structural validation", () => {

		it("returns value for valid empty resource", async () => {

			const shape = resource({});
			const result = validate({}, shape);

			expect(result({ value: v => v })).toEqual({});

		});

		it("returns value for resource with properties", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ name: "Alice" }, shape);
			expect(result({ value: v => v })).toEqual({ name: "Alice" });

		});

		it("returns value for resource with id", async () => {

			const shape = resource({ id: id() });

			const result = validate({ id: "app:/users/123" }, shape);
			expect(result({ value: v => v })).toEqual({ id: "app:/users/123" });

		});

		it("returns value for resource with type", async () => {

			const shape = resource({ type: type() });

			const result = validate({ type: "app:/types/Person" }, shape);
			expect(result({ value: v => v })).toEqual({ type: "app:/types/Person" });

		});

		it("returns trace for null", async () => {

			const shape = resource({});
			const result = validate(null, shape);

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("returns trace for undefined", async () => {

			const shape = resource({});
			const result = validate(undefined, shape);

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("returns trace for string", async () => {

			const shape = resource({});
			const result = validate("not a resource", shape);

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("returns trace for number", async () => {

			const shape = resource({});
			const result = validate(42, shape);

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("returns trace for boolean", async () => {

			const shape = resource({});
			const result = validate(true, shape);

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("returns trace for array", async () => {

			const shape = resource({});
			const result = validate([{ name: "Alice" }], shape);

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("returns trace for function", async () => {

			const shape = resource({});
			const result = validate(() => {}, shape);

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

	});

	describe("branding", () => {

		it("skips validation for resource already validated with same mode", async () => {

			const shape = resource({
				name: required(string())
			});

			// first validation should succeed and brand the resource

			const value = { name: "Alice" };
			const first = validate(value, shape);
			const branded = first({ value: v => v });

			// second validation with same mode should return the same branded resource

			const second = validate(branded, shape);
			expect(second({ value: v => v })).toBe(branded);

		});

		it("revalidates when mode changes", async () => {

			const shape = resource({
				name: required(string())
			});

			// first validation with state mode

			const value = { name: "Alice" };
			const first = validate(value, shape);
			const branded = first({ value: v => v });

			// second validation with different mode should revalidate

			const second = validate(branded, shape, { mode: "model" });
			const revalidated = second({ value: v => v });

			expect(revalidated).not.toBe(branded);

		});

		it("revalidates when shape changes", async () => {

			const shapeA = resource({
				name: required(string())
			});

			const shapeB = resource({
				name: required(string({ minLength: 1 }))
			});

			const value = { name: "Alice" };
			const first = validate(value, shapeA);
			const branded = first({ value: v => v });

			// same mode but different shape should revalidate

			const second = validate(branded, shapeB);
			const revalidated = second({ value: v => v });

			expect(revalidated).not.toBe(branded);

		});

		it("revalidates unbranded resources", async () => {

			const shape = resource({
				name: required(string())
			});

			// fresh resource should always be validated

			const value = { name: "Alice" };
			const result = validate(value, shape);

			expect(result({ value: v => v })).toBeDefined();

		});

		it("skips validation for patch already validated with same shape", async () => {

			const shape = resource({
				name: required(string())
			});

			const value = { name: "Alice" };
			const first = validate(value, shape, { mode: "patch" });
			const branded = first({ value: v => v });

			const second = validate(branded, shape, { mode: "patch" });
			expect(second({ value: v => v })).toBe(branded);

		});

		it("skips validation for model already validated with same shape", async () => {

			const shape = resource({
				name: required(string())
			});

			const value = { name: [true] };
			const first = validate(value, shape, { mode: "model" });
			const branded = first({ value: v => v });

			const second = validate(branded, shape, { mode: "model" });
			expect(second({ value: v => v })).toBe(branded);

		});

		it("skips validation for query already validated with same shape", async () => {

			const shape = resource({
				name: required(string())
			});

			const value = { "^name": "asc" };
			const first = validate(value, shape, { mode: "query" });
			const branded = first({ value: v => v });

			const second = validate(branded, shape, { mode: "query" });
			expect(second({ value: v => v })).toBe(branded);

		});

		it("does not brand on validation failure", async () => {

			const shape = resource({
				name: required(string())
			});

			// invalid resource should not be branded

			const invalid = validate({}, shape);
			expect(invalid({ trace: t => t.length })).toBeGreaterThan(0);

		});

	});

	describe("patch mode", () => {

		it("returns value for valid patch", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ name: "Alice" }, shape, { mode: "patch" });
			expect(result({ value: v => v })).toEqual({ name: "Alice" });

		});

		it("returns value for patch with null property", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ name: null }, shape, { mode: "patch" });
			expect(result({ value: v => v })).toEqual({ name: null });

		});

		it("returns value for empty patch", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({}, shape, { mode: "patch" });
			expect(result({ value: v => v })).toEqual({});

		});

		it("returns trace for non-object value", async () => {

			const shape = resource({});
			const result = validate("not a patch", shape, { mode: "patch" });

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

	});

	describe("model mode", () => {

		it("returns value for valid model", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ name: "Alice" }, shape, { mode: "model" });
			expect(result({ value: v => v })).toEqual({ name: "Alice" });

		});

		it("returns value for empty model", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({}, shape, { mode: "model" });
			expect(result({ value: v => v })).toEqual({});

		});

		it("returns trace for non-object value", async () => {

			const shape = resource({});
			const result = validate(42, shape, { mode: "model" });

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("rejects nested model via reference when depth is omitted", async () => {

			const Inner = resource({ label: required(string()) });

			const shape = resource({
				child: optional(reference(Inner))
			});

			const result = validate({ child: { label: "x" } }, shape, { mode: "model" });
			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("accepts nested model via reference when depth is null", async () => {

			const Inner = resource({ label: required(string()) });

			const shape = resource({
				child: optional(reference(Inner))
			});

			const result = validate({ child: { label: "x" } }, shape, { mode: "model", depth: null });
			expect(result({ value: v => v })).toEqual({ child: { label: "x" } });

		});

		it("rejects nested model via reference when depth is 0", async () => {

			const Inner = resource({ label: required(string()) });

			const shape = resource({
				child: optional(reference(Inner))
			});

			const result = validate({ child: { label: "x" } }, shape, { mode: "model", depth: 0 });
			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("accepts IRI reference when depth is 0", async () => {

			const Inner = resource({ id: id(), label: required(string()) });

			const shape = resource({
				child: optional(reference(Inner))
			});

			const result = validate({ child: "app:/items/1" }, shape, { mode: "model", depth: 0 });
			expect(result({ value: v => v })).toEqual({ child: "app:/items/1" });

		});

		it("accepts nested model via reference when depth is 1", async () => {

			const Inner = resource({ label: required(string()) });

			const shape = resource({
				child: optional(reference(Inner))
			});

			const result = validate({ child: { label: "x" } }, shape, { mode: "model", depth: 1 });
			expect(result({ value: v => v })).toEqual({ child: { label: "x" } });

		});

		it("accepts 2-level nesting via reference when depth is 2", async () => {

			const Leaf = resource({ value: required(string()) });
			const Middle = resource({ leaf: optional(reference(Leaf)) });

			const shape = resource({
				middle: optional(reference(Middle))
			});

			const result = validate({
				middle: { leaf: { value: "x" } }
			}, shape, { mode: "model", depth: 2 });

			expect(result({ value: v => v })).toEqual({ middle: { leaf: { value: "x" } } });

		});

		it("rejects 2-level nesting via reference when depth is 1", async () => {

			const Leaf = resource({ value: required(string()) });
			const Middle = resource({ leaf: optional(reference(Leaf)) });

			const shape = resource({
				middle: optional(reference(Middle))
			});

			const result = validate({
				middle: { leaf: { value: "x" } }
			}, shape, { mode: "model", depth: 1 });

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("accepts 2-level nesting via reference when depth is null", async () => {

			const Leaf = resource({ value: required(string()) });
			const Middle = resource({ leaf: optional(reference(Leaf)) });

			const shape = resource({
				middle: optional(reference(Middle))
			});

			const result = validate({
				middle: { leaf: { value: "x" } }
			}, shape, { mode: "model", depth: null });

			expect(result({ value: v => v })).toEqual({ middle: { leaf: { value: "x" } } });

		});

		it("rejects nested embedded resource when depth is 0", async () => {

			const Embedded = resource({ label: required(string()) });

			const shape = resource({
				child: required(Embedded)
			});

			const result = validate({ child: { label: "x" } }, shape, { mode: "model", depth: 0 });
			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("accepts nested embedded resource when depth is 1", async () => {

			const Embedded = resource({ label: required(string()) });

			const shape = resource({
				child: required(Embedded)
			});

			const result = validate({ child: { label: "x" } }, shape, { mode: "model", depth: 1 });
			expect(result({ value: v => v })).toEqual({ child: { label: "x" } });

		});

	});

	describe("query mode", () => {

		it("returns value for valid query with projection", async () => {

			const shape = resource({
				name: required(string()),
				age: optional(integer())
			});

			const result = validate({ name: "", age: 0 }, shape, { mode: "query" });
			expect(result({ value: v => v })).toEqual({ name: "", age: 0 });

		});

		it("returns value for query with filter criteria", async () => {

			const shape = resource({
				name: required(string()),
				age: optional(integer())
			});

			const result = validate({ ">=age": 18, "~name": "alice" }, shape, { mode: "query" });
			expect(result({ value: v => v })).toEqual({ ">=age": 18, "~name": "alice" });

		});

		it("returns value for query with ordering", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ "^name": "asc" }, shape, { mode: "query" });
			expect(result({ value: v => v })).toEqual({ "^name": "asc" });

		});

		it("returns value for query with pagination", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ "@": 10, "#": 25 }, shape, { mode: "query" });
			expect(result({ value: v => v })).toEqual({ "@": 10, "#": 25 });

		});

		it("returns value for empty query", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({}, shape, { mode: "query" });
			expect(result({ value: v => v })).toEqual({});

		});

		it("returns trace for query with unknown projection property", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ name: "", extra: "" }, shape, { mode: "query" });
			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("returns trace for query with filter on undefined property", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ ">=missing": 18 }, shape, { mode: "query" });
			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("returns trace for non-object value", async () => {

			const shape = resource({});
			const result = validate("not a query", shape, { mode: "query" });

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("rejects nested query via reference when depth is omitted", async () => {

			const Member = resource({ name: required(string()) });

			const shape = resource({
				members: optional(reference(Member))
			});

			const result = validate({ members: { name: "" } }, shape, { mode: "query" });
			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("accepts nested query via reference when depth is null", async () => {

			const Member = resource({ name: required(string()) });

			const shape = resource({
				members: optional(reference(Member))
			});

			const result = validate({ members: { name: "" } }, shape, { mode: "query", depth: null });
			expect(result({ value: v => v })).toEqual({ members: { name: "" } });

		});

		it("rejects nested query via reference when depth is 0", async () => {

			const Member = resource({ name: required(string()) });

			const shape = resource({
				members: optional(reference(Member))
			});

			const result = validate({ members: { name: "" } }, shape, { mode: "query", depth: 0 });
			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("accepts IRI reference in query when depth is 0", async () => {

			const Member = resource({ id: id(), name: required(string()) });

			const shape = resource({
				member: optional(reference(Member))
			});

			const result = validate({ member: "app:/items/1" }, shape, { mode: "query", depth: 0 });
			expect(result({ value: v => v })).toEqual({ member: "app:/items/1" });

		});

		it("accepts nested query via reference when depth is 1", async () => {

			const Member = resource({ name: required(string()) });

			const shape = resource({
				members: optional(reference(Member))
			});

			const result = validate({ members: { name: "" } }, shape, { mode: "query", depth: 1 });
			expect(result({ value: v => v })).toEqual({ members: { name: "" } });

		});

		it("accepts 2-level nesting via reference when depth is 2", async () => {

			const Leaf = resource({ value: required(string()) });
			const Middle = resource({ leaf: optional(reference(Leaf)) });

			const shape = resource({
				middle: optional(reference(Middle))
			});

			const result = validate({
				middle: { leaf: { value: "x" } }
			}, shape, { mode: "query", depth: 2 });

			expect(result({ value: v => v })).toEqual({ middle: { leaf: { value: "x" } } });

		});

		it("rejects 2-level nesting via reference when depth is 1", async () => {

			const Leaf = resource({ value: required(string()) });
			const Middle = resource({ leaf: optional(reference(Leaf)) });

			const shape = resource({
				middle: optional(reference(Middle))
			});

			const result = validate({
				middle: { leaf: { value: "x" } }
			}, shape, { mode: "query", depth: 1 });

			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("accepts 2-level nesting via reference when depth is null", async () => {

			const Leaf = resource({ value: required(string()) });
			const Middle = resource({ leaf: optional(reference(Leaf)) });

			const shape = resource({
				middle: optional(reference(Middle))
			});

			const result = validate({
				middle: { leaf: { value: "x" } }
			}, shape, { mode: "query", depth: null });

			expect(result({ value: v => v })).toEqual({ middle: { leaf: { value: "x" } } });

		});

		it("rejects nested embedded resource in query when depth is 0", async () => {

			const Embedded = resource({ label: required(string()) });

			const shape = resource({
				child: required(Embedded)
			});

			const result = validate({ child: { label: "" } }, shape, { mode: "query", depth: 0 });
			expect(result({ trace: t => t.length })).toBeGreaterThan(0);

		});

		it("accepts nested embedded resource in query when depth is 1", async () => {

			const Embedded = resource({ label: required(string()) });

			const shape = resource({
				child: required(Embedded)
			});

			const result = validate({ child: { label: "" } }, shape, { mode: "query", depth: 1 });
			expect(result({ value: v => v })).toEqual({ child: { label: "" } });

		});

	});

	describe("lazy shapes", () => {

		it("resolves factory function before validation", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ name: "Alice" }, () => shape);
			expect(result({ value: v => v })).toEqual({ name: "Alice" });

		});

		it("caches resolved factory result", async () => {

			const shape = resource({
				name: required(string())
			});

			const factory = () => shape;

			const first = validate({ name: "Alice" }, factory);
			const branded = first({ value: v => v });

			const second = validate(branded, factory);
			expect(second({ value: v => v })).toBe(branded);

		});

		it("resolves factory for non-resource shapes", async () => {

			const result = validate("hello", () => string());
			expect(result({ value: v => v })).toBe("hello");

		});

		it("resolves factory for patch mode", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ name: "Alice" }, () => shape, { mode: "patch" });
			expect(result({ value: v => v })).toEqual({ name: "Alice" });

		});

		it("resolves factory for model mode", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ name: "Alice" }, () => shape, { mode: "model" });
			expect(result({ value: v => v })).toEqual({ name: "Alice" });

		});

		it("resolves factory for query mode", async () => {

			const shape = resource({
				name: required(string())
			});

			const result = validate({ "^name": "asc" }, () => shape, { mode: "query" });
			expect(result({ value: v => v })).toEqual({ "^name": "asc" });

		});

	});

	describe("invalid mode", () => {

		it("throws for unsupported mode", async () => {

			const shape = resource({});

			expect(() => validate({}, shape, { mode: "invalid" as any })).toThrow(TypeError);

		});

	});

	describe("invalid depth", () => {

		it("throws for negative depth", async () => {

			const shape = resource({});

			expect(() => validate({}, shape, { mode: "model", depth: -1 })).toThrow(TypeError);

		});

		it("throws for non-integer depth", async () => {

			const shape = resource({});

			expect(() => validate({}, shape, { mode: "model", depth: 1.5 })).toThrow(TypeError);

		});

	});

});

describe("guards", () => {

	describe("isTrace", () => {

		it("returns true for empty array", async () => {

			expect(isTrace([])).toBeTruthy();

		});

		it("returns true for array of strings", async () => {

			expect(isTrace(["error1", "error2"])).toBeTruthy();

		});

		it("returns true for array with nested dictionaries", async () => {

			expect(isTrace(["error", { name: ["invalid"] }])).toBeTruthy();

		});

		it("returns true for deeply nested traces", async () => {

			expect(isTrace([{ address: ["msg", { city: ["invalid"] }] }])).toBeTruthy();

		});

		it("returns false for non-array values", async () => {

			expect(isTrace(null)).toBeFalsy();
			expect(isTrace(undefined)).toBeFalsy();
			expect(isTrace("error")).toBeFalsy();
			expect(isTrace(42)).toBeFalsy();

		});

		it("returns false for array with non-string non-object elements", async () => {

			expect(isTrace([42])).toBeFalsy();
			expect(isTrace([true])).toBeFalsy();

		});

	});

	describe("isValidator", () => {

		it("returns true for functions", async () => {

			expect(isValidator(() => [])).toBeTruthy();
			expect(isValidator((_v: unknown) => [])).toBeTruthy();

		});

		it("returns false for non-function values", async () => {

			expect(isValidator(null)).toBeFalsy();
			expect(isValidator(undefined)).toBeFalsy();
			expect(isValidator("function")).toBeFalsy();
			expect(isValidator(42)).toBeFalsy();
			expect(isValidator({})).toBeFalsy();

		});

	});

	describe("isValueShape", () => {

		it("returns true for boolean shape", async () => {

			expect(isValueShape({ kind: "boolean", model: false })).toBeTruthy();

		});

		it("returns true for number shape", async () => {

			expect(isValueShape(number())).toBeTruthy();

		});

		it("returns true for string shape", async () => {

			expect(isValueShape(string())).toBeTruthy();

		});

		it("returns true for local shape", async () => {

			expect(isValueShape(local())).toBeTruthy();

		});

		it("returns true for locals shape", async () => {

			expect(isValueShape(locals())).toBeTruthy();

		});

		it("returns true for reference shape", async () => {

			expect(isValueShape(reference(resource({})))).toBeTruthy();

		});

		it("returns true for resource shape", async () => {

			expect(isValueShape(resource({}))).toBeTruthy();

		});

		it("returns false for non-object values", async () => {

			expect(isValueShape(null)).toBeFalsy();
			expect(isValueShape(undefined)).toBeFalsy();
			expect(isValueShape("string")).toBeFalsy();
			expect(isValueShape(42)).toBeFalsy();

		});

		it("returns false for object with unknown kind", async () => {

			expect(isValueShape({ kind: "unknown", model: "" })).toBeFalsy();

		});

	});

});

describe("validators", () => {

	describe("validateValue", () => {

		it("returns empty trace for valid string", async () => {

			expect(validateValue(["hello"], string())).toEqual([]);

		});

		it("returns empty trace for valid number", async () => {

			expect(validateValue([42], number())).toEqual([]);

		});

		it("returns trace for type mismatch against string shape", async () => {

			expect(validateValue([42], string()).length).toBeGreaterThan(0);

		});

		it("returns trace for type mismatch against number shape", async () => {

			expect(validateValue(["hello"], number()).length).toBeGreaterThan(0);

		});

		it("returns empty trace for valid local value", async () => {

			expect(validateValue([{ "en": "hello" }], local())).toEqual([]);

		});

		it("rejects plain string for local shape", async () => {

			expect(validateValue(["hello"], local()).length).toBeGreaterThan(0);

		});

		it("rejects locals value for local shape", async () => {

			expect(validateValue([{ "en": ["hello", "world"] }], local()).length).toBeGreaterThan(0);

		});

		it("returns empty trace for valid locals value", async () => {

			expect(validateValue([{ "en": ["hello"] }], locals())).toEqual([]);

		});

		it("rejects local value for locals shape", async () => {

			expect(validateValue([{ "en": "hello" }], locals()).length).toBeGreaterThan(0);

		});

		describe("per-value errors", () => {

			it("reports one type error per mismatched value", async () => {

				expect(validateValue([42, true] as any[], string())).toHaveLength(2);

			});

			it("reports type errors only for mismatched values", async () => {

				expect(validateValue([42, "hello", true] as any[], string())).toHaveLength(2);

			});

			it("validates matching values against constraints", async () => {

				const trace = validateValue(["ab", 42, "c"] as any[], string({ minLength: 3 }));

				// 1 type error (42) + 2 constraint errors ("ab", "c" too short)
				expect(trace).toHaveLength(3);

			});

		});

	});

});

describe("materialize", () => {

	describe("with direct values", () => {

		it("returns the value unchanged", async () => {

			const value = string();

			expect(materialize(value)).toBe(value);

		});

	});

	describe("with factory functions", () => {

		it("returns the materialized value", async () => {

			const factory = () => string();

			const value = materialize(factory);

			expect(value.kind).toBe("string");

		});

		it("caches factory results for idempotent materialization", async () => {

			const factory = () => string();

			const first = materialize(factory);
			const second = materialize(factory);

			expect(first).toBe(second);

		});

		it("caches independently per factory", async () => {

			const factoryA = () => string();
			const factoryB = () => string();

			const shapeA = materialize(factoryA);
			const shapeB = materialize(factoryB);

			expect(shapeA).not.toBe(shapeB);

		});

	});

});

describe("collect", () => {

	describe("validation", () => {

		it("throws on non-array input", async () => {

			expect(() => collect("invalid" as any)).toThrow(TypeError);

		});

		it("throws on non-trace elements", async () => {

			expect(() => collect([123] as any)).toThrow(TypeError);

		});

		it("throws on traces with non-string non-object elements", async () => {

			expect(() => collect([[123]] as any)).toThrow(TypeError);

		});

		it("accepts dictionary at any position (lenient)", async () => {

			const result = collect([[{ name: ["error"] }, "message"]]);

			expect(result).toEqual(["message", { name: ["error"] }]);

		});

	});

	describe("empty input", () => {

		it("returns empty trace for empty array", async () => {

			const result = collect([]);

			expect(result).toEqual([]);

		});

		it("returns empty trace for array of empty traces", async () => {

			const result = collect([[], [], []]);

			expect(result).toEqual([]);

		});

	});

	describe("messages", () => {

		it("collects messages from single trace", async () => {

			const result = collect([["error1", "error2"]]);

			expect(result).toEqual(["error1", "error2"]);

		});

		it("collects messages from multiple traces in order", async () => {

			const result = collect([
				["error1"],
				["error2", "error3"],
				["error4"]
			]);

			expect(result).toEqual(["error1", "error2", "error3", "error4"]);

		});

		it("deduplicates messages preserving encounter order", async () => {

			const result = collect([
				["error1", "error2"],
				["error2", "error3"],
				["error1", "error4"]
			]);

			expect(result).toEqual(["error1 (2)", "error2 (2)", "error3", "error4"]);

		});

		it("removes empty strings", async () => {

			const result = collect([
				["error1", ""],
				["", "error2"],
				[""]
			]);

			expect(result).toEqual(["error1", "error2"]);

		});

	});

	describe("dictionaries", () => {

		it("merges dictionaries from single trace", async () => {

			const trace: Trace = ["error1", { name: ["invalid"] }];

			const result = collect([trace]);

			expect(result).toEqual(["error1", { name: ["invalid"] }]);

		});

		it("merges dictionaries from multiple traces", async () => {

			const trace1: Trace = [{ name: ["invalid"] }];
			const trace2: Trace = [{ age: ["required"] }];

			const result = collect([trace1, trace2]);

			expect(result).toEqual([{ name: ["invalid"], age: ["required"] }]);

		});

		it("preserves key order from encounter", async () => {

			const trace1: Trace = [{ b: ["error"] }];
			const trace2: Trace = [{ a: ["error"] }];
			const trace3: Trace = [{ c: ["error"] }];

			const result = collect([trace1, trace2, trace3]);

			expect(Object.keys((result as any)[0])).toEqual(["b", "a", "c"]);

		});

		it("recursively merges overlapping keys", async () => {

			const trace1: Trace = [{ name: ["error1"] }];
			const trace2: Trace = [{ name: ["error2"] }];

			const result = collect([trace1, trace2]);

			expect(result).toEqual([{ name: ["error1", "error2"] }]);

		});

		it("recursively merges nested dictionaries", async () => {

			const trace1: Trace = [{ address: ["msg1", { city: ["invalid"] }] }];
			const trace2: Trace = [{ address: ["msg2", { street: ["required"] }] }];

			const result = collect([trace1, trace2]);

			expect(result).toEqual([{
				address: ["msg1", "msg2", { city: ["invalid"], street: ["required"] }]
			}]);

		});

		it("removes empty dictionaries", async () => {

			const trace1: Trace = ["error1", {}];
			const trace2: Trace = ["error2"];

			const result = collect([trace1, trace2]);

			expect(result).toEqual(["error1", "error2"]);

		});

	});

	describe("combined", () => {

		it("combines messages and dictionaries", async () => {

			const trace1: Trace = ["error1", { name: ["invalid"] }];
			const trace2: Trace = ["error2", { age: ["required"] }];

			const result = collect([trace1, trace2]);

			expect(result).toEqual([
				"error1", "error2",
				{ name: ["invalid"], age: ["required"] }
			]);

		});

		it("handles traces with only messages and traces with only dictionaries", async () => {

			const trace1: Trace = ["error1", "error2"];
			const trace2: Trace = [{ name: ["invalid"] }];
			const trace3: Trace = ["error3"];

			const result = collect([trace1, trace2, trace3]);

			expect(result).toEqual([
				"error1", "error2", "error3",
				{ name: ["invalid"] }
			]);

		});

	});

});
