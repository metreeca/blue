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

import type { Probe, Transform } from "@metreeca/qest/model";
import { describe, expect, it } from "vitest";
import { boolean } from "./boolean.js";
import { validateValue } from "./index.core.js";
import { apply, audit, classify, identify, validate, type ValueShape } from "./index.js";
import { local, locals } from "./local.js";
import { byte, decimal, double, float, int, integer, long, number, short } from "./number.js";
import {
	id,
	optional,
	type Range,
	reference,
	repeatable,
	required,
	resource,
	type ResourceShape,
	type,
	union,
	type UnionShape
} from "./resource.js";
import { date, duration, instant, iri, string, time, timestamp, year } from "./string.js";


describe("shape methods", () => {

	describe("audit", () => {

		it("returns undefined for untagged value with value scope", async () => {

			expect(audit({ name: "Alice" }, { scope: "value" })).toBeUndefined();

		});

		it("returns undefined for untagged model with model scope", async () => {

			expect(audit({}, { scope: "model" })).toBeUndefined();

		});

		it("returns undefined for untagged value with entry scope", async () => {

			expect(audit({ name: "Alice" }, { scope: "entry" })).toBeUndefined();

		});

		it("returns shape when scope matches value-validated resource", async () => {

			const shape = resource({ name: required(string()) });
			const value = validate({ name: "Alice" }, { scope: "value", shape })({ value: v => v });

			expect(audit(value!, { scope: "value" })).toBe(shape);

		});

		it("returns undefined when scope mismatches value-validated resource", async () => {

			const shape = resource({ name: required(string()) });
			const value = validate({ name: "Alice" }, { scope: "value", shape })({ value: v => v });

			expect(audit(value as never, { scope: "model" })).toBeUndefined();

		});

		it("returns shape when scope matches model-validated model", async () => {

			const shape = resource({ name: required(string()) });
			const value = validate({}, { scope: "model", shape })({ model: v => v });

			expect(audit(value!, { scope: "model" })).toBe(shape);

		});

		it("returns undefined when scope mismatches model-validated model", async () => {

			const shape = resource({ name: required(string()) });
			const value = validate({}, { scope: "model", shape })({ model: v => v });

			expect(audit(value!, { scope: "value" })).toBeUndefined();

		});

		it("returns undefined for untagged value with wildcard scope", async () => {

			expect(audit({ name: "Alice" }, { scope: "*" })).toBeUndefined();

		});

		it("returns shape when wildcard scope matches value-validated resource", async () => {

			const shape = resource({ name: required(string()) });
			const value = validate({ name: "Alice" }, { scope: "value", shape })({ value: v => v });

			expect(audit(value!, { scope: "*" })).toBe(shape);

		});

		it("returns shape when wildcard scope matches entry-validated resource", async () => {

			const shape = resource({ id: id(), name: required(string()) });
			const value = validate({ id: "https://example.com/1", name: "Alice" }, {
				scope: "entry",
				shape
			})({ entry: v => v });

			expect(audit(value!, { scope: "*" })).toBe(shape);

		});

		it("returns undefined when wildcard scope does not match model-validated model", async () => {

			const shape = resource({ name: required(string()) });
			const value = validate({}, { scope: "model", shape })({ model: v => v });

			expect(audit(value as never, { scope: "*" })).toBeUndefined();

		});

		it("overwrites scope set by previous validate", async () => {

			const shape = resource({ name: required(string()) });
			const value = { name: "Alice" };

			const first = validate(value, { scope: "value", shape })({ value: v => v });

			const second = validate(first, { scope: "model", shape })({ model: v => v });

			expect(audit(second!, { scope: "model" })).toBe(shape);
			expect(audit(second!, { scope: "value" })).toBeUndefined();

		});

		it("returns shape for entry-validated resource with entry scope", async () => {

			const shape = resource({ id: id() });

			const value = validate({ id: "app:/users/123" }, { scope: "entry", shape })({ entry: v => v })!;

			expect(audit(value, { scope: "entry" })).toBeDefined();

		});

	});

	describe("validate", () => {

		describe("structural validation", () => {

			it("returns value for valid empty resource", async () => {

				const shape = resource({});
				const result = validate({}, { scope: "value", shape });

				expect(result({ value: v => v })).toEqual({});

			});

			it("returns value for resource with properties", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "Alice" }, { scope: "value", shape });
				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

			it("returns value for resource with id", async () => {

				const shape = resource({ id: id() });

				const result = validate({ id: "app:/users/123" }, { scope: "value", shape });
				expect(result({ value: v => v })).toEqual({ id: "app:/users/123" });

			});

			it("returns value for resource with type", async () => {

				const shape = resource({ type: type() });

				const result = validate({ type: "app:/types/Person" }, { scope: "value", shape });
				expect(result({ value: v => v })).toEqual({ type: "app:/types/Person" });

			});

			it.each([
				["null", null],
				["undefined", undefined],
				["string", "not a resource"],
				["array", [{ name: "Alice" }]]
			])("returns trace for %s", async (_label, value) => {

				const shape = resource({});
				const result = validate(value, { scope: "value", shape });

				expect(result({ trace: t => t })).toBeDefined();

			});

		});

		describe("return behaviour", () => {

			it("returns a new reference on success", async () => {

				const shape = resource({ name: required(string()) });
				const value = { name: "Alice" };

				const result = validate(value, { scope: "value", shape })({ value: v => v });

				expect(result).not.toBe(value);
				expect(result).toEqual(value);

			});

			it("returns an immutable value on success", async () => {

				const shape = resource({ name: required(string()) });

				const result = validate({ name: "Alice" }, { scope: "value", shape })({ value: v => v });

				expect(() => {
					(result as any).name = "Bob";
				}).toThrow();

			});

			it("returns a new reference for model on success", async () => {

				const shape = resource({ name: required(string()) });
				const model = { name: "Alice" };

				const result = validate(model, { scope: "model", shape })({ model: v => v });

				expect(result).not.toBe(model);
				expect(result).toEqual(model);

			});

			it("returns an immutable model on success", async () => {

				const shape = resource({ name: required(string()) });

				const result = validate({}, { scope: "model", shape })({ model: v => v });

				expect(() => {
					(result as any).name = [true];
				}).toThrow();

			});

		});

		describe("branding", () => {

			it("skips validation for resource already validated with same mode", async () => {

				const shape = resource({
					name: required(string())
				});

				// first validation should succeed and brand the resource

				const value = { name: "Alice" };
				const first = validate(value, { scope: "value", shape });
				const branded = first({ value: v => v });

				// second validation with same mode should return the same branded resource

				const second = validate(branded, { scope: "value", shape });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("revalidates when mode changes", async () => {

				const shape = resource({
					name: required(string())
				});

				// first validation with value mode

				const value = { name: "Alice" };
				const first = validate(value, { scope: "value", shape });
				const branded = first({ value: v => v });

				// second validation with different mode should revalidate

				const second = validate(branded, { scope: "model", shape });
				const revalidated = second({ model: v => v });

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
				const first = validate(value, { scope: "value", shape: shapeA });
				const branded = first({ value: v => v });

				// same mode but different shape should revalidate

				const second = validate(branded, { scope: "value", shape: shapeB });
				const revalidated = second({ value: v => v });

				expect(revalidated).not.toBe(branded);

			});

			it("skips validation for model already validated with same shape", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: [true] };
				const first = validate(value, { scope: "model", shape });
				const branded = first({ model: v => v });

				const second = validate(branded, { scope: "model", shape });
				expect(second({ model: v => v })).toBe(branded);

			});

			it("does not brand on validation failure", async () => {

				const shape = resource({
					name: required(string())
				});

				// invalid resource should not be branded

				const invalid = validate({}, { scope: "value", shape });
				expect(invalid({ trace: t => t })).toBeDefined();

			});

		});

		describe("mode dispatch", () => {

			it("rejects missing required property in value mode", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({}, { scope: "value", shape });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts missing required property in model mode", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({}, { scope: "model", shape });
				expect(result({ model: v => v })).toEqual({});

			});

		});

		describe("indexed union containers", () => {

			const PostalAddress = resource({
				street: required(string()),
				city: required(string())
			});

			const Contact = resource({
				address: optional(union({
					text: string(),
					PostalAddress: reference(PostalAddress)
				}))
			});


			it("accepts indexed container with scalar variant in value scope", async () => {

				const result = validate({ address: { text: "123 Main St" } }, { scope: "value", shape: Contact });
				expect(result({ value: v => v })).toEqual({ address: { text: "123 Main St" } });

			});

			it("accepts indexed container with reference variant in value scope", async () => {

				const result = validate({
					address: { PostalAddress: { street: "12 Harbour St", city: "Copenhagen" } }
				}, { scope: "value", shape: Contact });

				expect(result({ value: v => v })).toEqual({
					address: { PostalAddress: { street: "12 Harbour St", city: "Copenhagen" } }
				});

			});

			it("rejects indexed container with unknown variant key in value scope", async () => {

				const result = validate({ address: { unknown: "value" } }, { scope: "value", shape: Contact });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("rejects indexed container with invalid variant value in value scope", async () => {

				const result = validate({ address: { text: 42 } }, { scope: "value", shape: Contact });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts absent optional indexed union property in value scope", async () => {

				const result = validate({}, { scope: "value", shape: Contact });
				expect(result({ value: v => v })).toEqual({});

			});

		});

		describe("non-resource shapes", () => {

			it("accepts valid string in value scope", async () => {

				const result = validate("hello", { scope: "value", shape: string() });
				expect(result({ value: v => v })).toBe("hello");

			});

			it("rejects invalid string in value scope", async () => {

				const result = validate(42, { scope: "value", shape: string() });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts any value in entry scope for non-resource shape", async () => {

				const result = validate(42, { scope: "entry", shape: string() });
				expect(result({ entry: v => v })).toBe(42);

			});

			it("accepts valid value in model scope for non-resource shape", async () => {

				const result = validate(42, { scope: "model", shape: integer() });
				expect(result({ model: v => v })).toBe(42);

			});

			it("rejects invalid value in model scope for non-resource shape", async () => {

				const result = validate("hello", { scope: "model", shape: integer() });
				expect(result({ trace: t => t })).toBeDefined();

			});

		});

		describe("model mode", () => {

			it("returns value for valid model", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "Alice" }, { scope: "model", shape });
				expect(result({ model: v => v })).toEqual({ name: "Alice" });

			});

			it("returns value for empty model", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({}, { scope: "model", shape });
				expect(result({ model: v => v })).toEqual({});

			});

			it("rejects nested model via reference when depth is omitted", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const result = validate({ child: { label: "x" } }, { scope: "model", shape });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts nested model via reference when depth is null", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const result = validate({ child: { label: "x" } }, { scope: "model", shape, depth: null });
				expect(result({ model: v => v })).toEqual({ child: { label: "x" } });

			});

			it("accepts nested model via reference when depth is 1", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const result = validate({ child: { label: "x" } }, { scope: "model", shape, depth: 1 });
				expect(result({ model: v => v })).toEqual({ child: { label: "x" } });

			});

			it("rejects aggregate binding when stats defaults to false", async () => {

				const shape = resource({
					price: optional(integer())
				});

				const result = validate({ "total=count:": 0 }, { scope: "model", shape });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts aggregate binding when stats is true", async () => {

				const shape = resource({
					price: optional(integer())
				});

				const result = validate({ "total=count:": 0 }, { scope: "model", shape, stats: true });
				expect(result({ model: v => v })).toEqual({ "total=count:": 0 });

			});

			it("rejects aggregate binding when stats is false", async () => {

				const shape = resource({
					price: optional(integer())
				});

				const result = validate({ "total=count:": 0 }, { scope: "model", shape, stats: false });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts non-aggregate binding when stats is false", async () => {

				const shape = resource({
					released: optional(year())
				});

				const result = validate({ "y=year:released": 0 }, { scope: "model", shape, stats: false });
				expect(result({ model: v => v })).toEqual({ "y=year:released": 0 });

			});

			it("accepts plain property when stats is false", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "" }, { scope: "model", shape, stats: false });
				expect(result({ model: v => v })).toEqual({ name: "" });

			});

		});

		describe("entry mode", () => {

			it("returns value for entry with valid id", async () => {

				const shape = resource({ id: id(), name: required(string()) });

				const result = validate({ id: "app:/users/123", name: "Alice" }, { scope: "entry", shape });
				expect(result({ entry: v => v })).toEqual({ id: "app:/users/123", name: "Alice" });

			});

			it("returns value for shape without id property", async () => {

				const shape = resource({ name: required(string()) });

				const result = validate({ name: "Alice" }, { scope: "entry", shape });
				expect(result({ entry: v => v })).toEqual({ name: "Alice" });

			});

			it("returns trace for entry with missing id", async () => {

				const shape = resource({ id: id() });

				const result = validate({}, { scope: "entry", shape });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("returns trace for entry with invalid id", async () => {

				const shape = resource({ id: id() });

				const result = validate({ id: "not an iri" }, { scope: "entry", shape });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("ignores non-id property violations", async () => {

				const shape = resource({
					id: id(),
					name: required(string({ minLength: 10 }))
				});

				// name violates minLength but entry scope should not check it
				const result = validate({ id: "app:/users/123", name: "Al" }, { scope: "entry", shape });
				expect(result({ entry: v => v })).toEqual({ id: "app:/users/123", name: "Al" });

			});

			it("enforces pattern constraint on id", async () => {

				const shape = resource({ pattern: "/users/{id}" }, { id: id() });

				const result = validate({ id: "/products/123" }, { scope: "entry", shape });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("returns immutable value on success", async () => {

				const shape = resource({ id: id() });

				const result = validate({ id: "app:/users/123" }, { scope: "entry", shape })({ entry: v => v });
				expect(() => { (result as any).id = "changed"; }).toThrow();

			});

			it("is idempotent on same scope and shape", async () => {

				const shape = resource({ id: id() });

				const first = validate({ id: "app:/users/123" }, { scope: "entry", shape })({ entry: v => v });
				const second = validate(first, { scope: "entry", shape })({ entry: v => v });

				expect(second).toBe(first);

			});

		});

		describe("lazy shapes", () => {

			it("resolves factory function before validation", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "Alice" }, { scope: "value", shape: () => shape });
				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

			it("resolves factory for model mode", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "Alice" }, { scope: "model", shape: () => shape });
				expect(result({ model: v => v })).toEqual({ name: "Alice" });

			});

			it("caches resolved factory result", async () => {

				const shape = resource({
					name: required(string())
				});

				const factory = () => shape;

				const first = validate({ name: "Alice" }, { scope: "value", shape: factory });
				const branded = first({ value: v => v });

				const second = validate(branded, { scope: "value", shape: factory });
				expect(second({ value: v => v })).toBe(branded);

			});

		});

	});

	describe("apply", () => {

		function probe(path: readonly string[], pipe: readonly Transform[] = []): Probe {
			return { target: path[path.length-1] ?? "_", pipe, path };
		}

		// transform-focused helpers: wrap leaf shape in a resource property

		function transformRange(pipe: readonly Transform[], s: ValueShape): Range | undefined {
			return apply(probe(["_"], pipe), resource({ _: required(s) }));
		}


		describe("empty pipe", () => {

			it("returns range with input shape unchanged", async () => {

				const input = integer();

				expect(transformRange([], input)?.shape).toBe(input);

			});

			it("preserves required cardinality", async () => {

				const result = transformRange([], integer());

				expect(result?.minCount).toBe(1);
				expect(result?.maxCount).toBe(1);

			});

		});

		describe("single transform", () => {

			describe("accepting any input", () => {

				it("accepts number shape", async () => {

					expect(transformRange(["count"], integer())?.shape).toEqual(integer());

				});

				it("accepts string shape", async () => {

					expect(transformRange(["count"], string())?.shape).toEqual(integer());

				});

				it("returns input shape for output-preserving transform", async () => {

					const input = decimal();

					expect(transformRange(["min"], input)?.shape).toBe(input);

				});

			});

			describe("numeric input", () => {

				it.each([
					["number", number()],
					["byte", byte()],
					["short", short()],
					["int", int()],
					["long", long()],
					["float", float()],
					["double", double()],
					["integer", integer()],
					["decimal", decimal()]
				])("accepts %s shape for sum and preserves it", async (_label, s) => {

					expect(transformRange(["sum"], s)?.shape).toBe(s);

				});

				it("returns undefined range for plain string shape with sum", async () => {

					expect(transformRange(["sum"], string())).toBeUndefined();

				});

				it("returns undefined range for temporal string shape with sum", async () => {

					expect(transformRange(["sum"], date())).toBeUndefined();

				});

			});

			describe("string input", () => {

				it("accepts plain string shape for lower and preserves it", async () => {

					const input = string();

					expect(transformRange(["lower"], input)?.shape).toBe(input);

				});

				it("returns undefined range for temporal shape with lower", async () => {

					expect(transformRange(["lower"], date())).toBeUndefined();

				});

				it("returns undefined range for number shape with lower", async () => {

					expect(transformRange(["lower"], integer())).toBeUndefined();

				});

			});

			describe("temporal input", () => {

				it.each([
					["year", year()],
					["date", date()],
					["time", time()],
					["instant", instant()],
					["timestamp", timestamp()],
					["duration", duration()]
				])("accepts %s shape for year", async (_label, s) => {

					expect(transformRange(["year"], s)?.shape).toEqual(integer());

				});

				it("returns undefined range for plain string shape with year", async () => {

					expect(transformRange(["year"], string())).toBeUndefined();

				});

				it("returns undefined range for number shape with year", async () => {

					expect(transformRange(["year"], integer())).toBeUndefined();

				});

			});

		});

		describe("local/locals input", () => {

			it.each([
				["local", local()],
				["locals", locals()]
			])("accepts string-to-string transform on %s and preserves it", async (_label, s) => {

				expect(transformRange(["lower"], s)?.shape).toBe(s);

			});

			it.each([
				["local", local()],
				["locals", locals()]
			])("accepts string-to-string pipe on %s and preserves it", async (_label, s) => {

				expect(transformRange(["lower", "upper"], s)?.shape).toBe(s);

			});

			it.each([
				["local", local()],
				["locals", locals()]
			] as const)("returns undefined range for incompatible transforms on %s", async (_label, s) => {

				expect(transformRange(["length"], s)).toBeUndefined(); // non-string-to-string
				expect(transformRange(["sum"], s)).toBeUndefined(); // numeric
				expect(transformRange(["year"], s)).toBeUndefined(); // temporal
				expect(transformRange(["count"], s)).toBeUndefined(); // any-to-non-string

			});

		});

		describe("transform pipe", () => {

			it("resolves through numeric chain (avg then floor)", async () => {

				expect(transformRange(["avg", "floor"], decimal())?.shape).toEqual(decimal());

			});

			it("resolves through temporal-to-numeric chain (year then abs)", async () => {

				expect(transformRange(["year", "abs"], date())?.shape).toEqual(integer());

			});

			it("resolves through output-preserving transform (min then floor)", async () => {

				expect(transformRange(["min", "floor"], decimal())?.shape).toEqual(decimal());

			});

			it("returns undefined range for incompatible first-stage input", async () => {

				expect(transformRange(["floor"], string())).toBeUndefined();

			});

			it("returns undefined range for incompatible inter-stage types (year then lower)", async () => {

				expect(transformRange(["year", "lower"], date())).toBeUndefined();

			});

			it("returns undefined range for aggregate after aggregate", async () => {

				expect(transformRange(["count", "sum"], integer())).toBeUndefined();

			});

		});

		describe("cardinality preservation", () => {

			it("preserves required cardinality through identity", async () => {

				const result = apply(probe(["name"]), resource({ name: required(string()) }));

				expect(result?.minCount).toBe(1);
				expect(result?.maxCount).toBe(1);

			});

			it("preserves optional cardinality through identity", async () => {

				const result = apply(probe(["name"]), resource({ name: optional(string()) }));

				expect(result?.minCount).toBeUndefined();
				expect(result?.maxCount).toBe(1);

			});

			it("preserves repeatable cardinality through identity", async () => {

				const result = apply(probe(["name"]), resource({ name: repeatable(string()) }));

				expect(result?.minCount).toBe(1);
				expect(result?.maxCount).toBeUndefined();

			});

			it("scalar transform preserves maxCount and sets minCount to undefined", async () => {

				const result = apply(probe(["count"], ["abs"]), resource({ count: required(integer()) }));

				// scalar preserves maxCount; minCount becomes undefined (domain violations → undefined)

				expect(result?.minCount).toBeUndefined();
				expect(result?.maxCount).toBe(1);

			});

			it("scalar transform preserves undefined maxCount", async () => {

				const result = apply(probe(["value"], ["abs"]), resource({ value: repeatable(integer()) }));

				expect(result?.minCount).toBeUndefined();
				expect(result?.maxCount).toBeUndefined();

			});

			it.each([
				["count", ["count"], repeatable(integer())],
				["sum", ["sum"], repeatable(integer())],
				["avg", ["avg"], repeatable(integer())],
				["min", ["min"], repeatable(string())],
				["max", ["max"], repeatable(string())],
				["avg+floor", ["avg", "floor"], repeatable(decimal())]
			] as const)("%s aggregate sets maxCount to 1 and minCount to undefined", async (_label, pipe, range) => {

				const result = apply(probe(["value"], [...pipe]), resource({ value: range }));

				// aggregate collapses to single value; minCount undefined (empty sets → undefined)

				expect(result?.minCount).toBeUndefined();
				expect(result?.maxCount).toBe(1);

			});

		});

		describe("path cardinality accumulation", () => {

			function pathRange(p: Probe, s: ReturnType<typeof resource>): Range | undefined {
				return apply(p, s);
			}


			it.each([
				["required×required", required, required, 1, 1],
				["required×optional", required, optional, undefined, 1],
				["required×repeatable", required, repeatable, 1, undefined],
				["optional×required", optional, required, undefined, 1],
				["optional×optional", optional, optional, undefined, 1],
				["optional×repeatable", optional, repeatable, undefined, undefined],
				["repeatable×required", repeatable, required, 1, undefined],
				["repeatable×optional", repeatable, optional, undefined, undefined],
				["repeatable×repeatable", repeatable, repeatable, 1, undefined]
			] as const)("accumulates %s", async (_label, outer, inner, expectedMin, expectedMax) => {

				const s = resource({
					child: outer(resource({ name: inner(string()) }))
				});

				const result = pathRange(probe(["child", "name"]), s);

				expect(result?.minCount).toBe(expectedMin);
				expect(result?.maxCount).toBe(expectedMax);

			});

			it("accumulates across three-step path", async () => {

				const s = resource({
					a: repeatable(resource({
						b: optional(resource({
							c: required(string())
						}))
					}))
				});

				// minCount: 1×undef×1 = undef; maxCount: undef×1×1 = undef

				const result = pathRange(probe(["a", "b", "c"]), s);

				expect(result?.minCount).toBeUndefined();
				expect(result?.maxCount).toBeUndefined();

			});

			it("accumulates through union using outer range cardinality", async () => {

				const s = resource({
					value: repeatable(union({
						a: resource({ name: required(string()) }),
						b: resource({ name: required(integer()) })
					}))
				});

				// step 1 (value): minCount=1, maxCount=undef (repeatable)
				// step 2 (name): minCount=1, maxCount=1 (required in both variants)
				// accumulated: minCount=1×1=1, maxCount=undef×1=undef

				const result = pathRange(probe(["value", "name"]), s);

				expect(result?.minCount).toBe(1);
				expect(result?.maxCount).toBeUndefined();

			});

		});

		describe("path traversal", () => {

			function probeRange(p: Probe, s: ReturnType<typeof resource>): Range | undefined {
				return apply(p, s);
			}


			it("returns range wrapping resource for empty path and empty pipe", async () => {

				const s = resource({
					name: required(string())
				});

				const result = probeRange(probe([]), s);

				expect(result?.shape).toBe(s);

			});

			it("resolves single path segment to leaf property range", async () => {

				const s = resource({
					name: required(string())
				});

				const result = probeRange(probe(["name"]), s);

				expect(result?.shape).toEqual(string());
				expect(result?.minCount).toBe(1);
				expect(result?.maxCount).toBe(1);

			});

			it("resolves multi-segment path through nested resources", async () => {

				const Inner = resource({
					label: required(string())
				});

				const s = resource({
					child: required(Inner)
				});

				expect(probeRange(probe(["child", "label"]), s)?.shape).toEqual(string());

			});

			it("resolves path through reference shapes", async () => {

				const Inner = resource({
					label: required(string())
				});

				const s = resource({
					child: optional(reference(Inner))
				});

				expect(probeRange(probe(["child", "label"]), s)?.shape).toEqual(string());

			});

			it("returns undefined range for undefined property", async () => {

				const s = resource({
					name: required(string())
				});

				expect(apply(probe(["missing"]), s)).toBeUndefined();

			});

			it("returns undefined range for undefined nested property", async () => {

				const Inner = resource({
					label: required(string())
				});

				const s = resource({
					child: required(Inner)
				});

				expect(apply(probe(["child", "missing"]), s)).toBeUndefined();

			});

			it("resolves path through union preserving per-variant shapes in range", async () => {

				const s = resource({
					value: required(union({
						a: resource({ name: required(string()) }),
						b: resource({ name: required(integer()) })
					}))
				});

				// both variants define "name" — result is a range with union of per-variant resolved shapes

				const result = probeRange(probe(["value", "name"]), s);

				expect(result?.shape).toHaveProperty("kind", "union");
				expect(Object.values((result!.shape as UnionShape).variants)).toContainEqual(string());
				expect(Object.values((result!.shape as UnionShape).variants)).toContainEqual(integer());

			});

			it("resolves path through union skipping variants that lack the property", async () => {

				const s = resource({
					value: required(union({
						a: resource({ name: required(string()) }),
						b: resource({ age: required(integer()) })
					}))
				});

				// variant "b" lacks "name" — skipped; result includes only variant "a"'s shape

				const result = probeRange(probe(["value", "name"]), s);

				expect(result?.shape).toEqual(string());

			});

			it("returns undefined range for path through union when no variant has the property", async () => {

				const s = resource({
					value: required(union({
						a: resource({ name: required(string()) }),
						b: resource({ age: required(integer()) })
					}))
				});

				// neither variant defines "missing" — returns undefined range

				expect(apply(probe(["value", "missing"]), s)).toBeUndefined();

			});

			it("resolves union pipe preserving per-variant shapes in range", async () => {

				const s = resource({
					value: required(union({ text: string(), num: integer() }))
				});

				// "count" accepts "any" — result preserves per-variant output shapes

				const result = probeRange(probe(["value"], ["count"]), s);

				expect(result?.shape).toHaveProperty("kind", "union");

			});

			it("skips incompatible union variants in pipe and returns compatible ones", async () => {

				const s = resource({
					value: required(union({ text: string(), num: integer() }))
				});

				// "length" accepts only strings — integer variant is skipped, string variant passes through

				expect(probeRange(probe(["value"], ["length"]), s)?.shape).toEqual(integer());

			});

			it("returns undefined range for union when no variant is compatible with pipe", async () => {

				const s = resource({
					value: required(union({ text: string(), num: integer() }))
				});

				// "year" requires temporal strings — neither text nor num qualifies

				expect(apply(probe(["value"], ["year"]), s)).toBeUndefined();

			});

			it("resolves combined path and pipe", async () => {

				const s = resource({
					price: required(decimal())
				});

				expect(probeRange(probe(["price"], ["floor"]), s)?.shape).toEqual(decimal());

			});

			it("returns undefined range for incompatible pipe on resolved path", async () => {

				const s = resource({
					name: required(string())
				});

				expect(apply(probe(["name"], ["floor"]), s)).toBeUndefined();

			});

			it("resolves path through inherited properties", async () => {

				const Base = resource({
					label: required(string())
				});

				const Derived = resource({ extends: Base }, {
					extra: required(integer())
				});

				expect(probeRange(probe(["label"]), Derived)?.shape).toEqual(string());

			});

		});

		describe("id/type path resolution", () => {

			function probeRange(p: Probe, s: ResourceShape): Range | undefined {
				return apply(p, s);
			}


			describe("id field", () => {

				it("resolves single-segment path to id field", async () => {

					const s = resource({
						rid: id(),
						name: required(string())
					});

					expect(probeRange(probe(["rid"]), s)?.shape).toEqual(iri({ variant: "absolute" }));

				});

				it("resolves id field with required cardinality", async () => {

					const s = resource({
						rid: id(),
						name: required(string())
					});

					const result = probeRange(probe(["rid"]), s);

					expect(result?.minCount).toBe(1);
					expect(result?.maxCount).toBe(1);

				});

				it("resolves trailing path segment to nested id field", async () => {

					const Inner = resource({
						rid: id(),
						label: required(string())
					});

					const s = resource({
						child: required(Inner)
					});

					expect(probeRange(probe(["child", "rid"]), s)?.shape).toEqual(iri({ variant: "absolute" }));

				});

				it("resolves trailing path segment to id through reference", async () => {

					const Inner = resource({
						rid: id(),
						label: required(string())
					});

					const s = resource({
						child: optional(reference(Inner))
					});

					expect(probeRange(probe(["child", "rid"]), s)?.shape).toEqual(iri({ variant: "absolute" }));

				});

				it("returns undefined range for leading id with trailing segments", async () => {

					const s = resource({
						rid: id(),
						name: required(string())
					});

					expect(apply(probe(["rid", "something"]), s)).toBeUndefined();

				});

				it("returns undefined range for inner id in multi-segment path", async () => {

					const Inner = resource({
						rid: id(),
						nested: required(resource({
							value: required(string())
						}))
					});

					const s = resource({
						child: required(Inner)
					});

					expect(apply(probe(["child", "rid", "value"]), s)).toBeUndefined();

				});

			});

			describe("type field", () => {

				it("resolves single-segment path to type field", async () => {

					const s = resource({
						kind: type(),
						name: required(string())
					});

					expect(probeRange(probe(["kind"]), s)?.shape).toEqual(iri({ variant: "absolute" }));

				});

				it("resolves type field with optional cardinality", async () => {

					const s = resource({
						kind: type(),
						name: required(string())
					});

					const result = probeRange(probe(["kind"]), s);

					expect(result?.minCount).toBeUndefined();
					expect(result?.maxCount).toBe(1);

				});

				it("resolves trailing path segment to nested type field", async () => {

					const Inner = resource({
						kind: type(),
						label: required(string())
					});

					const s = resource({
						child: required(Inner)
					});

					expect(probeRange(probe(["child", "kind"]), s)?.shape).toEqual(iri({ variant: "absolute" }));

				});

				it("resolves trailing path segment to type through reference", async () => {

					const Inner = resource({
						kind: type(),
						label: required(string())
					});

					const s = resource({
						child: optional(reference(Inner))
					});

					expect(probeRange(probe(["child", "kind"]), s)?.shape).toEqual(iri({ variant: "absolute" }));

				});

				it("returns undefined range for leading type with trailing segments", async () => {

					const s = resource({
						kind: type(),
						name: required(string())
					});

					expect(apply(probe(["kind", "something"]), s)).toBeUndefined();

				});

				it("returns undefined range for inner type in multi-segment path", async () => {

					const Inner = resource({
						kind: type(),
						nested: required(resource({
							value: required(string())
						}))
					});

					const s = resource({
						child: required(Inner)
					});

					expect(apply(probe(["child", "kind", "value"]), s)).toBeUndefined();

				});

			});

		});

		describe("reference shape input", () => {

			it("resolves empty path to materialized resource shape", async () => {

				const Inner = resource({ label: required(string()) });

				const result = apply(probe([]), reference(Inner));

				expect(result?.shape).toBe(Inner);

			});

			it("resolves path through materialized resource properties", async () => {

				const Inner = resource({ label: required(string()) });

				const result = apply(probe(["label"]), reference(Inner));

				expect(result?.shape).toEqual(string());

			});

			it("preserves cardinality through materialized resource", async () => {

				const Inner = resource({ label: optional(string()) });

				const result = apply(probe(["label"]), reference(Inner));

				expect(result?.minCount).toBeUndefined();
				expect(result?.maxCount).toBe(1);

			});

			it("applies transform pipe after materialization", async () => {

				const Inner = resource({ value: required(integer()) });

				const result = apply(probe(["value"], ["abs"]), reference(Inner));

				expect(result?.shape).toEqual(integer());

			});

			it("returns undefined range for undefined property", async () => {

				const Inner = resource({ label: required(string()) });

				expect(apply(probe(["missing"]), reference(Inner))).toBeUndefined();

			});

		});

		describe("leaf shape input", () => {

			it.each([
				["boolean", boolean()],
				["number", integer()],
				["string", string()],
				["local", local()],
				["locals", locals()]
			])("resolves empty path for %s shape", async (_label, s) => {

				const result = apply(probe([]), s);

				expect(result?.shape).toBe(s);

			});

			it("applies compatible transform pipe on empty path", async () => {

				const result = apply(probe([], ["floor"]), decimal());

				expect(result?.shape).toEqual(decimal());

			});

			it("applies aggregate transform on empty path", async () => {

				const result = apply(probe([], ["count"]), integer());

				expect(result?.shape).toEqual(integer());
				expect(result?.maxCount).toBe(1);

			});

			it.each([
				["number", integer()],
				["string", string()],
				["boolean", boolean()]
			])("returns undefined range for non-empty path on %s shape", async (_label, s) => {

				expect(apply(probe(["missing"]), s)).toBeUndefined();

			});

			it("returns undefined range for incompatible pipe on leaf shape", async () => {

				expect(apply(probe([], ["floor"]), string())).toBeUndefined();

			});

			it("chains transforms on leaf shape", async () => {

				const result = apply(probe([], ["avg", "floor"]), decimal());

				expect(result?.shape).toEqual(decimal());

			});

		});

	});

});

describe("resource metadata", () => {

	describe("identify", () => {

		describe("getter", () => {

			it("throws if resource is not validated", async () => {

				expect(() => identify({ id: "https://example.com/1", name: "Alice" })).toThrow();

			});

			it("returns undefined if shape declares no id property", async () => {

				const shape = resource({ name: required(string()) });
				const value = validate({ name: "Alice" }, { scope: "value", shape })({ value: v => v })!;

				expect(identify(value)).toBeUndefined();

			});

			it("returns the identifier from a value-validated resource", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const value = validate({ id: "https://example.com/1", name: "Alice" }, {
					scope: "value",
					shape
				})({ value: v => v })!;

				expect(identify(value)).toBe("https://example.com/1");

			});

			it("returns the identifier from an entry-validated resource", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const value = validate({ id: "https://example.com/1", name: "Alice" }, {
					scope: "entry",
					shape
				})({ entry: v => v })!;

				expect(identify(value)).toBe("https://example.com/1");

			});

		});

		describe("setter", () => {

			it("throws if resource is not validated", async () => {

				expect(() => identify({
					id: "https://example.com/1",
					name: "Alice"
				}, "https://example.com/2")).toThrow();

			});

			it("throws if shape declares no id property", async () => {

				const shape = resource({ name: required(string()) });
				const value = validate({ name: "Alice" }, { scope: "value", shape })({ value: v => v })!;

				expect(() => identify(value, "https://example.com/1")).toThrow();

			});

			it("throws if id is not an absolute IRI", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const value = validate({ id: "https://example.com/1", name: "Alice" }, {
					scope: "value",
					shape
				})({ value: v => v })!;

				expect(() => identify(value, "not-an-iri")).toThrow();

			});

			it("returns a copy with the updated identifier", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const value = validate({ id: "https://example.com/1", name: "Alice" }, {
					scope: "value",
					shape
				})({ value: v => v })!;

				const updated = identify(value, "https://example.com/2");

				expect(updated).not.toBe(value);
				expect(updated.id).toBe("https://example.com/2");
				expect(updated.name).toBe("Alice");

			});

			it("preserves validation tagging on the returned resource", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const value = validate({ id: "https://example.com/1", name: "Alice" }, {
					scope: "value",
					shape
				})({ value: v => v })!;

				const updated = identify(value, "https://example.com/2");

				expect(audit(updated, { scope: "value" })).toBe(shape);

			});

			it("returns an immutable resource", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const value = validate({ id: "https://example.com/1", name: "Alice" }, {
					scope: "value",
					shape
				})({ value: v => v })!;

				const updated = identify(value, "https://example.com/2");

				expect(() => {
					(updated as any).name = "Bob";
				}).toThrow();

			});

		});

	});

	describe("classify", () => {

		describe("getter", () => {

			it("throws if resource is not validated", async () => {

				expect(() => classify({ type: "https://example.com/Person", name: "Alice" })).toThrow();

			});

			it("returns undefined if shape declares no type property", async () => {

				const shape = resource({ name: required(string()) });
				const value = validate({ name: "Alice" }, { scope: "value", shape })({ value: v => v })!;

				expect(classify(value)).toBeUndefined();

			});

			it("returns the type from a value-validated resource", async () => {

				const shape = resource({ type: type(), name: required(string()) });
				const value = validate({ type: "https://example.com/Person", name: "Alice" }, {
					scope: "value",
					shape
				})({ value: v => v })!;

				expect(classify(value)).toBe("https://example.com/Person");

			});

			it("returns undefined if type is absent on the resource", async () => {

				const shape = resource({ type: type(), name: required(string()) });
				const value = validate({ name: "Alice" }, { scope: "value", shape })({ value: v => v })!;

				expect(classify(value)).toBeUndefined();

			});

		});

		describe("setter", () => {

			it("throws if resource is not validated", async () => {

				expect(() => classify({
					type: "https://example.com/Person",
					name: "Alice"
				}, "https://example.com/Animal")).toThrow();

			});

			it("throws if shape declares no type property", async () => {

				const shape = resource({ name: required(string()) });
				const value = validate({ name: "Alice" }, { scope: "value", shape })({ value: v => v })!;

				expect(() => classify(value, "https://example.com/Person")).toThrow();

			});

			it("throws if type is defined and not an absolute IRI", async () => {

				const shape = resource({ type: type(), name: required(string()) });
				const value = validate({ type: "https://example.com/Person", name: "Alice" }, {
					scope: "value",
					shape
				})({ value: v => v })!;

				expect(() => classify(value, "not-an-iri")).toThrow();

			});

			it("returns a copy with the updated type", async () => {

				const shape = resource({ type: type(), name: required(string()) });
				const value = validate({ type: "https://example.com/Person", name: "Alice" }, {
					scope: "value",
					shape
				})({ value: v => v })!;

				const updated = classify(value, "https://example.com/Animal");

				expect(updated).not.toBe(value);
				expect(updated.type).toBe("https://example.com/Animal");
				expect(updated.name).toBe("Alice");

			});

			it("removes the type when undefined is passed", async () => {

				const shape = resource({ type: type(), name: required(string()) });
				const value = validate({ type: "https://example.com/Person", name: "Alice" }, {
					scope: "value",
					shape
				})({ value: v => v })!;

				const updated = classify(value, undefined);

				expect(updated).not.toBe(value);
				expect(updated.type).toBeUndefined();
				expect(updated.name).toBe("Alice");

			});

			it("preserves validation tagging on the returned resource", async () => {

				const shape = resource({ type: type(), name: required(string()) });
				const value = validate({ type: "https://example.com/Person", name: "Alice" }, {
					scope: "value",
					shape
				})({ value: v => v })!;

				const updated = classify(value, "https://example.com/Animal");

				expect(audit(updated, { scope: "value" })).toBe(shape);

			});

			it("returns an immutable resource", async () => {

				const shape = resource({ type: type(), name: required(string()) });
				const value = validate({ type: "https://example.com/Person", name: "Alice" }, {
					scope: "value",
					shape
				})({ value: v => v })!;

				const updated = classify(value, "https://example.com/Animal");

				expect(() => {
					(updated as any).name = "Bob";
				}).toThrow();

			});

		});

	});

});

describe("operators", () => {

	describe("validateValue", () => {

		it("returns undefined for valid local value", async () => {

			expect(validateValue([{ "en": "hello" }], local())).toBeUndefined();

		});

		it("accepts plain string shorthand for local shape", async () => {

			expect(validateValue(["hello"], local())).toBeUndefined();

		});

		it("rejects locals value for local shape", async () => {

			expect(validateValue([{ "en": ["hello", "world"] }], local())).toBeDefined();

		});

		it("rejects non-local value for local shape", async () => {

			expect(validateValue([42], local())).toBeDefined();

		});

		it("returns undefined for valid locals value", async () => {

			expect(validateValue([{ "en": ["hello"] }], locals())).toBeUndefined();

		});

		it("rejects non-locals value for locals shape", async () => {

			expect(validateValue([42], locals())).toBeDefined();

		});

		it("rejects local value for locals shape", async () => {

			expect(validateValue([{ "en": "hello" }], locals())).toBeDefined();

		});

	});

});
