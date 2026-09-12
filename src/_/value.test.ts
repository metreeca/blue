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

import { TraceError } from "@metreeca/core/trace";
import type { Probe, Transform } from "@metreeca/qest/template";
import { describe, expect, it } from "vitest";
import { boolean } from "./boolean.js";
import { dictionary } from "./dictionary.js";
import { sh } from "./index.core.js";
import { byte, decimal, double, float, int, integer, long, number, short } from "./number.js";
import { reference } from "./reference.js";
import {
	id,
	multiple,
	nonempty,
	optional,
	property,
	required,
	resource,
	type ResourceShape,
	type
} from "./resource.js";
import { date, duration, instant, string, time, timestamp, year } from "./string.js";
import { union, type UnionShape } from "./union.js";
import {
	checkValues,
	deriveValue,
	deriveValues,
	mergeValue,
	mergeValues,
	narrowsValue,
	narrowsValues,
	validateValue
} from "./value.core.js";
import {
	eager,
	effective,
	type RangeShape,
	type Schema,
	type SetShape,
	type Shape,
	type ValuesShape
} from "./value.js";


describe("utilities", () => {

	describe("eager", () => {

		describe("with direct values", () => {

			it("returns the value unchanged", async () => {

				const value = resource({});

				expect(eager(value)).toBe(value);

			});

		});

		describe("with factory functions", () => {

			it("returns the resolved value", async () => {

				const factory = () => resource({});

				const value = eager(factory);

				expect(value.kind).toBe("resource");

			});

			it("caches factory results for idempotent resolution", async () => {

				const factory = () => resource({});

				const first = eager(factory);
				const second = eager(factory);

				expect(first).toBe(second);

			});

			it("caches independently per factory", async () => {

				const factoryA = () => resource({});
				const factoryB = () => resource({});

				const shapeA = eager(factoryA);
				const shapeB = eager(factoryB);

				expect(shapeA).not.toBe(shapeB);

			});

		});

	});

	describe("model", () => {

		// derivation is asserted through the harness rather than through the public model() convenience, so the
		// suite pins what a shape derives to without depending on the memoising wrapper around it

		function _model<S extends Shape>(shape: S): Schema<S> {
			return deriveValue(shape);
		}


		it("returns the stored model for a non-reference shape", async () => {

			expect(_model(string({ model: "sample" }))).toBe("sample");
			expect(_model(number())).toBe(0);

		});

		it("returns the default app:/ model for a reference shape regardless of target constraints", async () => {

			expect(_model(reference(resource({}, {})))).toBe("app:/");
			expect(_model(reference(resource({}, { in: ["app:/users/1"] })))).toBe("app:/");
			expect(_model(reference(resource({}, { pattern: "/users/{id}" })))).toBe("app:/");

		});

		it("returns the stored model for a boolean shape", async () => {

			expect(_model(boolean())).toBe(false);
			expect(_model(boolean(true))).toBe(true);

		});

		it("returns the wildcard placeholder for a constrained dictionary shape", async () => {

			expect(_model(dictionary({ minLength: 1 }))).toEqual({ "*": "" });

		});

		it("returns a concrete localised model for a dictionary shape", async () => {

			expect(_model(dictionary({ und: "Default" }))).toEqual({ und: "Default" });

		});

		it("indexes literal variant models for a union shape", async () => {

			expect(_model(union(string({ model: "a" }), number(5)))).toEqual({ "0": "a", "1": 5 });

		});

		it("indexes reference variant models for a union shape", async () => {

			const target = resource({}, { pattern: "/things/{id}" });

			expect(_model(union(reference(target), string()))).toEqual({ "0": "app:/", "1": "" });

		});

	});

	describe("effective", () => {

		function probe(path: readonly string[], pipe: readonly Transform[] = []): Probe {
			return { target: path[path.length-1] ?? "_", pipe, path };
		}

		function range(r: RangeShape | string): RangeShape {
			if ( typeof r === "string" ) { throw new Error(`expected RangeShape, got trace <${r}>`); }
			return r;
		}

		// transform-focused helpers: wrap leaf shape in a resource property

		function transformRange(pipe: readonly Transform[], s: ValuesShape): RangeShape | string {
			return effective(resource({ _: required(s) }), probe(["_"], pipe));
		}


		describe("malformed probe", () => {

			it("throws for a probe whose pipe holds an unknown transform", async () => {

				const bogus = { target: "_", path: ["_"], pipe: ["bogus"] } as unknown as Probe;

				expect(() => effective(resource({ _: required(integer()) }), bogus)).toThrow("malformed probe");

			});

			it("throws for a structurally malformed probe", async () => {

				expect(() => effective(resource({ _: required(integer()) }), {} as unknown as Probe)).toThrow("malformed probe");

			});

		});


		describe("empty pipe", () => {

			it("returns range with input shape unchanged", async () => {

				const input = integer();

				expect(range(transformRange([], input)).variants[0]).toBe(input);

			});

			it("preserves required cardinality", async () => {

				const result = transformRange([], integer());

				expect(range(result).minCount).toBe(1);
				expect(range(result).maxCount).toBe(1);

			});

		});

		describe("single transform", () => {

			describe("count (any value)", () => {

				it("accepts number shape", async () => {

					expect(range(transformRange(["count"], integer())).variants[0]).toEqual(integer());

				});

				it("accepts string shape", async () => {

					expect(range(transformRange(["count"], string())).variants[0]).toEqual(integer());

				});

				it("accepts reference shape", async () => {

					expect(range(transformRange(["count"], reference(resource({ id: id() })))).variants[0]).toEqual(integer());

				});

				it("accepts localised dictionary shape", async () => {

					expect(range(transformRange(["count"], dictionary())).variants[0]).toEqual(integer());

				});

			});

			describe("comparable input (min, max)", () => {

				it("returns input shape for output-preserving transform", async () => {

					const input = decimal();

					expect(range(transformRange(["min"], input)).variants[0]).toBe(input);

				});

				it("accepts boolean shape and preserves it", async () => {

					const input = boolean();

					expect(range(transformRange(["max"], input)).variants[0]).toBe(input);

				});

				it("preserves a temporal shape for min and max", async () => {

					const input = date();

					expect(range(transformRange(["min"], input)).variants[0]).toBe(input);
					expect(range(transformRange(["max"], input)).variants[0]).toBe(input);

				});

				it("reports incompatible transform input for reference shape (out of processing space)", async () => {

					expect(transformRange(["min"], reference(resource({ id: id() })))).toEqual("incompatible transform input");

				});

				it("coalesces single-string-per-tag localised dictionary shape to string", async () => {

					expect(range(transformRange(["max"], dictionary())).variants[0]).toEqual(string());

				});

			});

			describe("numeric input", () => {

				it.each([
					["byte", byte()],
					["short", short()],
					["int", int()],
					["long", long()],
					["integer", integer()]
				])("widens integral %s shape to bare integer for sum", async (_label, s) => {

					// a sum combines values and escapes the element domain and datatype range,
					// so its result carries only the bare integer type, no value-domain facets

					expect(range(transformRange(["sum"], s)).variants[0]).toEqual(integer());

				});

				it.each([
					["number", number()],
					["float", float()],
					["double", double()],
					["decimal", decimal()]
				])("widens fractional %s shape to bare decimal for sum", async (_label, s) => {

					// a fractional or unconstrained numeric sum widens to the bare decimal type

					expect(range(transformRange(["sum"], s)).variants[0]).toEqual(decimal());

				});

				it("reports incompatible transform input for plain string shape with sum", async () => {

					expect(transformRange(["sum"], string())).toEqual("incompatible transform input");

				});

				it("reports incompatible transform input for temporal string shape with sum", async () => {

					expect(transformRange(["sum"], date())).toEqual("incompatible transform input");

				});

				it("narrows avg to decimal for float and double inputs (egress loss)", async () => {

					// avg is declared float→float / double→double, but the processing-space
					// distinction is not preserved on egress, so the effective type is uniformly decimal

					expect(range(transformRange(["avg"], float())).variants[0]).toEqual(decimal());
					expect(range(transformRange(["avg"], double())).variants[0]).toEqual(decimal());

				});

			});

			describe("string input", () => {

				it("accepts plain string shape for lower and preserves it", async () => {

					const input = string();

					expect(range(transformRange(["lower"], input)).variants[0]).toBe(input);

				});

				it("reports incompatible transform input for temporal shape with lower", async () => {

					expect(transformRange(["lower"], date())).toEqual("incompatible transform input");

				});

				it("reports incompatible transform input for number shape with lower", async () => {

					expect(transformRange(["lower"], integer())).toEqual("incompatible transform input");

				});

			});

			describe("temporal input", () => {

				it.each([
					["date", date()],
					["time", time()],
					["instant", instant()],
					["timestamp", timestamp()]
				])("accepts %s shape for year", async (_label, s) => {

					expect(range(transformRange(["year"], s)).variants[0]).toEqual(integer());

				});

				it("reports incompatible transform input for plain string shape with year", async () => {

					expect(transformRange(["year"], string())).toEqual("incompatible transform input");

				});

				it("reports incompatible transform input for number shape with year", async () => {

					expect(transformRange(["year"], integer())).toEqual("incompatible transform input");

				});

			});

			describe("opaque temporal string input (gYear, duration)", () => {

				// gYear and duration are not processing-type temporals; they are opaque
				// xsd:string, so temporal transforms are out-of-domain and string transforms apply

				it.each([
					["year", year()],
					["duration", duration()]
				])("reports incompatible transform input for %s shape with a temporal transform", async (_label, s) => {

					expect(transformRange(["year"], s)).toEqual("incompatible transform input");

				});

				it.each([
					["year", year()],
					["duration", duration()]
				])("accepts %s shape for length as a plain string", async (_label, s) => {

					expect(range(transformRange(["length"], s)).variants[0]).toEqual(integer());

				});

			});

		});

		describe("localised input", () => {

			// a non-empty pipe is coalesced access: a localised leaf contributes the winning tag's
			// value(s) as an ordinary xsd:string of the leaf's per-tag cardinality (one value for
			// single-string-per-tag, the winning tag's set for array-per-tag), domain-matched thereafter

			it("coalesces single-string-per-tag localised dictionary to string for string transforms", async () => {

				const s = dictionary();

				expect(range(transformRange(["lower"], s)).variants[0]).toEqual(string());
				expect(range(transformRange(["upper"], s)).variants[0]).toEqual(string());
				expect(range(transformRange(["length"], s)).variants[0]).toEqual(integer());
				expect(range(transformRange(["min"], s)).variants[0]).toEqual(string());

			});

			it("reports incompatible transform input for out-of-domain transforms on coalesced localised dictionary", async () => {

				const s = dictionary();

				expect(transformRange(["year"], s)).toEqual("incompatible transform input");    // temporal
				expect(transformRange(["abs"], s)).toEqual("incompatible transform input");     // numeric
				expect(transformRange(["sum"], s)).toEqual("incompatible transform input");     // numeric total

			});

			it.each([
				["dictionary", dictionary()]
			] as const)("accepts count (any value) on %s yielding integer", async (_label, s) => {

				expect(range(transformRange(["count"], s)).variants[0]).toEqual(integer());

			});

			it("coalesces array-per-tag localised dictionary to a multi-valued string set", async () => {

				function arrayPerTagRange(pipe: readonly Transform[]): RangeShape | string {
					return effective(resource({ _: nonempty(dictionary()) }), probe(["_"], pipe));
				}

				// the winning tag's value set is a multi-valued xsd:string: a scalar transform preserves
				// its cardinality, an aggregate reduces it to one value, count yields integer

				expect(range(arrayPerTagRange(["lower"])).variants[0]).toEqual(string());
				expect(range(arrayPerTagRange(["lower"])).maxCount).toBeUndefined();
				expect(range(arrayPerTagRange(["min"])).variants[0]).toEqual(string());
				expect(range(arrayPerTagRange(["min"])).maxCount).toBe(1);
				expect(range(arrayPerTagRange(["count"])).variants[0]).toEqual(integer());

			});

		});

		describe("localised step cardinality", () => {

			// a localised step enters the path product like any other step: a single-string-per-tag leaf is
			// single-valued on its own, but a multi-valued prefix multiplies through, so a deep coalescible
			// key resolves multi-valued and the sort/focus single-valued gates reject it (closes #26)

			const Item = resource({
				label: required(dictionary()),
				labels: nonempty(dictionary())
			});

			const Wrapper = resource({ items: multiple(reference(Item)) });

			it("keeps a single-string-per-tag leaf single-valued without a prefix", async () => {

				expect(range(effective(Item, probe(["label"]))).maxCount).toBe(1);

			});

			it("multiplies single-string-per-tag bounds through a multi-valued prefix", async () => {

				expect(range(effective(Wrapper, probe(["items", "label"]))).maxCount).toBeUndefined();

			});

			it("keeps array-per-tag bounds unbounded through a multi-valued prefix", async () => {

				expect(range(effective(Wrapper, probe(["items", "labels"]))).maxCount).toBeUndefined();

			});

			it("coalesces single-string-per-tag localised dictionary behind a multi-valued prefix", async () => {

				expect(range(effective(Wrapper, probe(["items", "label"], ["lower"]))).variants[0]).toEqual(string());

			});

			it("coalesces array-per-tag localised dictionary behind a multi-valued prefix to a multi-valued string set", async () => {

				expect(range(effective(Wrapper, probe(["items", "labels"], ["lower"]))).variants[0]).toEqual(string());
				expect(range(effective(Wrapper, probe(["items", "labels"], ["lower"]))).maxCount).toBeUndefined();

			});

		});

		describe("transform pipe", () => {

			it("resolves through numeric chain (avg then floor)", async () => {

				expect(range(transformRange(["avg", "floor"], decimal())).variants[0]).toEqual(decimal());

			});

			it("resolves through temporal-to-numeric chain (abs:year:date)", async () => {

				// pipe is in source-textual order (matching decodeProbe), so the rightmost
				// transform applies first: year(date) → integer, abs(integer) → integer

				expect(range(transformRange(["abs", "year"], date())).variants[0]).toEqual(integer());

			});

			it("resolves through output-preserving transform (min then floor)", async () => {

				expect(range(transformRange(["min", "floor"], decimal())).variants[0]).toEqual(decimal());

			});

			it("reports incompatible transform input for incompatible first-stage input", async () => {

				expect(transformRange(["floor"], string())).toEqual("incompatible transform input");

			});

			it("reports incompatible transform input for incompatible inter-stage types (year then lower)", async () => {

				expect(transformRange(["year", "lower"], date())).toEqual("incompatible transform input");

			});

			it.each([
				["count then sum", ["count", "sum"]],
				["avg then sum", ["avg", "sum"]],
				["min then max", ["min", "max"]],
				["three aggregates", ["count", "min", "sum"]]
			] as const)("reports multiple aggregate transforms for %s", async (_label, pipe) => {

				expect(transformRange([...pipe], integer())).toEqual("multiple aggregate transforms");

			});

			it("reports multiple aggregate transforms regardless of intervening scalar transforms", async () => {

				expect(transformRange(["sum", "abs", "count"], integer())).toEqual("multiple aggregate transforms");

			});

			it("reports multiple aggregate transforms ahead of domain incompatibility", async () => {

				// two aggregates on a string: sum is numeric-only, but the conflicting-aggregate
				// rule is structural and takes precedence over the per-variant domain check

				expect(transformRange(["count", "sum"], string())).toEqual("multiple aggregate transforms");

			});

		});

		describe("cardinality preservation", () => {

			it("preserves required cardinality through identity", async () => {

				const result = effective(resource({ name: required(string()) }), probe(["name"]));

				expect(range(result).minCount).toBe(1);
				expect(range(result).maxCount).toBe(1);

			});

			it("preserves optional cardinality through identity", async () => {

				const result = effective(resource({ name: optional(string()) }), probe(["name"]));

				expect(range(result).minCount).toBeUndefined();
				expect(range(result).maxCount).toBe(1);

			});

			it("preserves nonempty cardinality through identity", async () => {

				const result = effective(resource({ name: nonempty(string()) }), probe(["name"]));

				expect(range(result).minCount).toBe(1);
				expect(range(result).maxCount).toBeUndefined();

			});

			it("scalar transform preserves maxCount and sets minCount to undefined", async () => {

				const result = effective(resource({ count: required(integer()) }), probe(["count"], ["abs"]));

				// scalar preserves maxCount; minCount becomes undefined (domain violations → undefined)

				expect(range(result).minCount).toBeUndefined();
				expect(range(result).maxCount).toBe(1);

			});

			it("scalar transform preserves undefined maxCount", async () => {

				const result = effective(resource({ value: nonempty(integer()) }), probe(["value"], ["abs"]));

				expect(range(result).minCount).toBeUndefined();
				expect(range(result).maxCount).toBeUndefined();

			});

			it.each([
				["count", ["count"], nonempty(integer())],
				["sum", ["sum"], nonempty(integer())]
			] as const)("%s total aggregate sets maxCount and minCount to 1", async (_label, pipe, set) => {

				const result = effective(resource({ value: set }), probe(["value"], [...pipe]));

				// total aggregates always yield a value (0 on the empty set), so minCount is 1

				expect(range(result).minCount).toBe(1);
				expect(range(result).maxCount).toBe(1);

			});

			it.each([
				["avg", ["avg"], nonempty(integer())],
				["min", ["min"], nonempty(string())],
				["max", ["max"], nonempty(string())],
				["avg+floor", ["avg", "floor"], nonempty(decimal())]
			] as const)("%s aggregate sets maxCount to 1 and minCount to undefined", async (_label, pipe, set) => {

				const result = effective(resource({ value: set }), probe(["value"], [...pipe]));

				// non-total aggregates yield undefined on the empty set, so minCount is undefined

				expect(range(result).minCount).toBeUndefined();
				expect(range(result).maxCount).toBe(1);

			});

		});

		describe("path cardinality accumulation", () => {

			function pathRange(p: Probe, s: ResourceShape): RangeShape | string {
				return effective(s, p);
			}


			it.each([
				["required×required", required, required, 1, 1],
				["required×optional", required, optional, undefined, 1],
				["required×nonempty", required, nonempty, 1, undefined],
				["optional×required", optional, required, undefined, 1],
				["optional×optional", optional, optional, undefined, 1],
				["optional×nonempty", optional, nonempty, undefined, undefined],
				["nonempty×required", nonempty, required, 1, undefined],
				["nonempty×optional", nonempty, optional, undefined, undefined],
				["nonempty×nonempty", nonempty, nonempty, 1, undefined]
			] as const)("accumulates %s", async (_label, outer, inner, expectedMin, expectedMax) => {

				const s = resource({
					child: outer(resource({ name: inner(string()) }))
				});

				const result = pathRange(probe(["child", "name"]), s);

				expect(range(result).minCount).toBe(expectedMin);
				expect(range(result).maxCount).toBe(expectedMax);

			});

			it("accumulates across three-step path", async () => {

				const s = resource({
					a: nonempty(resource({
						b: optional(resource({
							c: required(string())
						}))
					}))
				});

				// minCount: 1×undef×1 = undef; maxCount: undef×1×1 = undef

				const result = pathRange(probe(["a", "b", "c"]), s);

				expect(range(result).minCount).toBeUndefined();
				expect(range(result).maxCount).toBeUndefined();

			});

			it("preserves a forbidden step's maxCount of 0 as the strongest upper bound", async () => {

				const s = resource({
					forbidden: property(string(), { minCount: 0, maxCount: 0 })
				});

				// minCount: 1×0 = 0; maxCount: 1×0 = 0 (exactly zero values admitted)

				const result = pathRange(probe(["forbidden"]), s);

				expect(range(result).minCount).toBe(0);
				expect(range(result).maxCount).toBe(0);

			});

			it("propagates a forbidden mid-path step's 0 through the branch product", async () => {

				const s = resource({
					child: property(resource({ name: required(string()) }), { minCount: 0, maxCount: 0 })
				});

				// the forbidden step zeroes both bounds: minCount 1×0×1 = 0, maxCount 1×0×1 = 0

				const result = pathRange(probe(["child", "name"]), s);

				expect(range(result).minCount).toBe(0);
				expect(range(result).maxCount).toBe(0);

			});

			it("accumulates through union using outer range cardinality", async () => {

				const s = resource({
					value: nonempty(union(
						resource({ name: required(string()) }),
						resource({ name: required(integer()) })
					))
				});

				// step 1 (value): minCount=1, maxCount=undef (nonempty)
				// step 2 (name): minCount=1, maxCount=1 (required in both variants)
				// accumulated: minCount=1×1=1, maxCount=undef×1=undef

				const result = pathRange(probe(["value", "name"]), s);

				expect(range(result).minCount).toBe(1);
				expect(range(result).maxCount).toBeUndefined();

			});

		});

		describe("path traversal", () => {

			function probeRange(p: Probe, s: ResourceShape): RangeShape | string {
				return effective(s, p);
			}


			it("returns range wrapping resource for empty path and empty pipe", async () => {

				const s = resource({
					name: required(string())
				});

				const result = probeRange(probe([]), s);

				expect(range(result).variants[0]).toBe(s);

			});

			it("resolves single path segment to leaf property range", async () => {

				const s = resource({
					name: required(string())
				});

				const result = probeRange(probe(["name"]), s);

				expect(range(result).variants[0]).toEqual(string());
				expect(range(result).minCount).toBe(1);
				expect(range(result).maxCount).toBe(1);

			});

			it("resolves multi-segment path through nested resources", async () => {

				const Inner = resource({
					label: required(string())
				});

				const s = resource({
					child: required(Inner)
				});

				expect(range(probeRange(probe(["child", "label"]), s)).variants[0]).toEqual(string());

			});

			it("resolves path through reference shapes", async () => {

				const Inner = resource({
					label: required(string())
				});

				const s = resource({
					child: optional(reference(Inner))
				});

				expect(range(probeRange(probe(["child", "label"]), s)).variants[0]).toEqual(string());

			});

			it("returns undefined range for undefined property", async () => {

				const s = resource({
					name: required(string())
				});

				expect(effective(s, probe(["missing"]))).toEqual("undefined property path");

			});

			it("returns undefined range for undefined nested property", async () => {

				const Inner = resource({
					label: required(string())
				});

				const s = resource({
					child: required(Inner)
				});

				expect(effective(s, probe(["child", "missing"]))).toEqual("undefined property path");

			});

			it("resolves path through union preserving per-variant shapes in range", async () => {

				const s = resource({
					value: required(union(
						resource({ name: required(string()) }),
						resource({ name: required(integer()) })
					))
				});

				// both variants define "name" — result keys each per-variant resolved shape by its branch id

				const result = probeRange(probe(["value", "name"]), s);

				expect(range(result).variants).toHaveLength(2);
				expect(range(result).variants).toContainEqual(string());
				expect(range(result).variants).toContainEqual(integer());

			});

			it("resolves path through union to localised leaves preserving dictionary variants", async () => {

				const s = resource({
					value: required(union(
						resource({ label: required(dictionary()) }),
						resource({ label: required(integer()) })
					))
				});

				// the localised variant contributes a `dictionary` shape to the effective range — a union
				// range carrying a `dictionary` variant only ever arises here, via traversal, never from a
				// union shape declared directly (its variants exclude `dictionary`)

				const result = probeRange(probe(["value", "label"]), s);

				expect(range(result).variants).toHaveLength(2);
				expect(range(result).variants.map(variant => variant.kind)).toContain("dictionary");
				expect(range(result).variants).toContainEqual(integer());

			});

			it("resolves path through union skipping variants that lack the property", async () => {

				const s = resource({
					value: required(union(
						resource({ name: required(string()) }),
						resource({ age: required(integer()) })
					))
				});

				// variant "b" lacks "name" — skipped; result includes only variant "a"'s shape

				const result = probeRange(probe(["value", "name"]), s);

				expect(range(result).variants[0]).toEqual(string());

			});

			it("returns undefined range for path through union when no variant has the property", async () => {

				const s = resource({
					value: required(union(
						resource({ name: required(string()) }),
						resource({ age: required(integer()) })
					))
				});

				// neither variant defines "missing" — returns undefined range

				expect(effective(s, probe(["value", "missing"]))).toEqual("undefined property path");

			});

			it("resolves multi-segment path through union dropping variants with non-traversable intermediate", async () => {

				const s = resource({
					value: required(union(
						resource({ x: required(resource({ y: required(string()) })) }),
						resource({ x: required(integer()) })
					))
				});

				// variant A traverses "x" → resource → "y"; variant B's "x" is integer
				// (non-traversable) so it drops at segment "y"; A survives the full path

				expect(range(effective(s, probe(["value", "x", "y"]))).variants[0]).toEqual(string());

			});

			it("resolves multi-segment path through union dropping variants that lack a deeper segment", async () => {

				const s = resource({
					value: required(union(
						resource({ x: required(resource({ y: required(string()) })) }),
						resource({ x: required(resource({ z: required(integer()) })) })
					))
				});

				// both variants traverse "x" but only A defines "y"; B drops at "y" silently

				expect(range(effective(s, probe(["value", "x", "y"]))).variants[0]).toEqual(string());

			});

			it("resolves multi-segment path through nested unions when at least one variant resolves the full chain", async () => {

				const s = resource({
					value: required(union(
						resource({
							x: required(union(
								resource({ y: required(string()) }),
								resource({ y: required(integer()) })
							))
						}),
						resource({ x: required(boolean()) })
					))
				});

				// outer A's inner union both define "y"; outer B's "x" is boolean — drops
				// at segment "y"; final range envelopes inner union [string, integer]

				const result = effective(s, probe(["value", "x", "y"]));

				expect(range(result).variants).toContainEqual(string());
				expect(range(result).variants).toContainEqual(integer());

			});

			it("collapses an aggregate-piped union to a single variant", async () => {

				const s = resource({
					value: required(union(string(), integer()))
				});

				// "count" maps every branch to integer, so the union collapses to one distinct variant

				const result = probeRange(probe(["value"], ["count"]), s);

				expect(range(result).variants).toEqual([integer()]);

			});

			it("skips incompatible union variants in pipe and returns compatible ones", async () => {

				const s = resource({
					value: required(union(string(), integer()))
				});

				// "length" accepts only strings — integer variant is skipped, string variant passes through

				expect(range(probeRange(probe(["value"], ["length"]), s)).variants[0]).toEqual(integer());

			});

			it("reports incompatible transform input for union when no variant is compatible with pipe", async () => {

				const s = resource({
					value: required(union(string(), integer()))
				});

				// "year" requires temporal strings — neither dictionary nor num qualifies

				expect(effective(s, probe(["value"], ["year"]))).toEqual("incompatible transform input");

			});

			it("resolves multi-stage union pipe when at least one variant survives every stage", async () => {

				const s = resource({
					value: required(union(string(), integer()))
				});

				// rightmost first — "length" accepts only strings; integer variant drops there
				// "count" then applies to the integer length, surviving as a count of strings

				expect(range(effective(s, probe(["value"], ["count", "length"]))).variants[0]).toEqual(integer());

			});

			it("resolves multi-stage union pipe narrowing different variants at different stages", async () => {

				const s = resource({
					value: required(union(string(), integer(), date()))
				});

				// rightmost first — "year" accepts only temporal strings; string and integer drop
				// "abs" then applies to the year (integer); date variant survives end-to-end

				expect(range(effective(s, probe(["value"], ["abs", "year"]))).variants[0]).toEqual(integer());

			});

			it("rejects multi-stage pipe when no variant survives the full chain", async () => {

				const s = resource({
					value: required(union(string(), integer()))
				});

				// "year" rejects every variant at the first stage; "lower" never applies

				expect(effective(s, probe(["value"], ["lower", "year"]))).toEqual("incompatible transform input");

			});

			it("dedupes variants that distinct branches converge on", async () => {

				const Person = resource({ id: id(), name: required(string()) });
				const Company = resource({ id: id(), name: required(string()) });

				const s = resource({
					link: required(union(reference(Person), reference(Company)))
				});

				// both reference branches resolve `name` to string, converging on a single distinct variant
				expect(range(effective(s, probe(["link", "name"]))).variants).toEqual([string()]);

			});

			it("resolves combined path and pipe", async () => {

				const s = resource({
					price: required(decimal())
				});

				expect(range(probeRange(probe(["price"], ["floor"]), s)).variants[0]).toEqual(decimal());

			});

			it("reports incompatible transform input for incompatible pipe on resolved path", async () => {

				const s = resource({
					name: required(string())
				});

				expect(effective(s, probe(["name"], ["floor"]))).toEqual("incompatible transform input");

			});

			it("resolves path through inherited entries", async () => {

				const Base = resource({
					label: required(string())
				});

				const Derived = resource(Base, {
					extra: required(integer())
				});

				expect(range(probeRange(probe(["label"]), Derived)).variants[0]).toEqual(string());

			});

		});

		describe("id/type path resolution", () => {

			function probeRange(p: Probe, s: ResourceShape): RangeShape | string {
				return effective(s, p);
			}

			// id / type fields resolve to a scalar absolute IRI marked with the sh:IRI datatype

			const idType = string({
				model: "https://example.net/",
				datatype: sh.IRI,
				pattern: /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/
			});


			describe("id field", () => {

				it("resolves single-segment path to id field", async () => {

					const s = resource({
						rid: id(),
						name: required(string())
					});

					expect(range(probeRange(probe(["rid"]), s)).variants[0]).toEqual(idType);

				});

				it("resolves id field with optional cardinality", async () => {

					const s = resource({
						rid: id(),
						name: required(string())
					});

					const result = probeRange(probe(["rid"]), s);

					expect(range(result).minCount).toBeUndefined();
					expect(range(result).maxCount).toBe(1);

				});

				it("resolves trailing path segment to id through reference", async () => {

					const Inner = resource({
						rid: id(),
						label: required(string())
					});

					const s = resource({
						child: optional(reference(Inner))
					});

					expect(range(probeRange(probe(["child", "rid"]), s)).variants[0]).toEqual(idType);

				});

				it("rejects leading id with trailing segments", async () => {

					const s = resource({
						rid: id(),
						name: required(string())
					});

					expect(effective(s, probe(["rid", "something"]))).toEqual("undefined property path");

				});

				it("rejects inner id in multi-segment path", async () => {

					const Inner = resource({
						rid: id(),
						nested: required(resource({
							value: required(string())
						}))
					});

					const s = resource({
						child: required(reference(Inner))
					});

					expect(effective(s, probe(["child", "rid", "value"]))).toEqual("undefined property path");

				});

			});

			describe("type field", () => {

				it("resolves single-segment path to type field", async () => {

					const s = resource({
						kind: type(),
						name: required(string())
					}, { class: "app:/types/T" });

					expect(range(probeRange(probe(["kind"]), s)).variants[0]).toEqual(idType);

				});

				it("resolves type field with optional cardinality", async () => {

					const s = resource({
						kind: type(),
						name: required(string())
					}, { class: "app:/types/T" });

					const result = probeRange(probe(["kind"]), s);

					expect(range(result).minCount).toBeUndefined();
					expect(range(result).maxCount).toBe(1);

				});

				it("resolves trailing path segment to type through reference", async () => {

					const Inner = resource({
						kind: type(),
						label: required(string())
					}, { class: "app:/types/T" });

					const s = resource({
						child: optional(reference(Inner))
					});

					expect(range(probeRange(probe(["child", "kind"]), s)).variants[0]).toEqual(idType);

				});

				it("rejects leading type with trailing segments", async () => {

					const s = resource({
						kind: type(),
						name: required(string())
					}, { class: "app:/types/T" });

					expect(effective(s, probe(["kind", "something"]))).toEqual("undefined property path");

				});

				it("rejects inner type in multi-segment path", async () => {

					const Inner = resource({
						kind: type(),
						nested: required(resource({
							value: required(string())
						}))
					}, { class: "app:/types/T" });

					const s = resource({
						child: required(reference(Inner))
					});

					expect(effective(s, probe(["child", "kind", "value"]))).toEqual("undefined property path");

				});

			});

			describe("union semantics", () => {

				it("preserves traversal through a sibling variant when one variant has midway id", async () => {

					const s = resource({
						value: required(union(
							reference(resource({ name: id() })),
							resource({ name: required(resource({ x: required(string()) })) })
						))
					});

					// variant A is a reference whose target blocks "name" with an id; variant B traverses
					// into a nested resource with property "x" — the navigable branch wins, no trace is surfaced

					expect(range(effective(s, probe(["value", "name", "x"]))).variants[0]).toEqual(string());

				});

				it("rejects when every union variant has midway id", async () => {

					const s = resource({
						value: required(union(
							reference(resource({ name: id() })),
							reference(resource({ name: id() }))
						))
					});

					expect(effective(s, probe(["value", "name", "x"]))).toEqual("undefined property path");

				});

				it("rejects when every union variant has midway type", async () => {

					const s = resource({
						value: required(union(
							resource({ name: type() }, { class: "app:/types/A" }),
							resource({ name: type() }, { class: "app:/types/B" })
						))
					});

					expect(effective(s, probe(["value", "name", "x"]))).toEqual("undefined property path");

				});

				it("preserves the generic trace when failure is unrelated to id/type", async () => {

					const s = resource({
						name: required(string())
					});

					// genuinely unknown property — the dedicated trace must not leak here

					expect(effective(s, probe(["missing"]))).toEqual("undefined property path");

				});

			});

		});

		describe("reference shape input", () => {

			it("resolves empty path to resolved resource shape", async () => {

				const Inner = resource({ label: required(string()) });

				const result = effective(reference(Inner), probe([]));

				expect(range(result).variants[0]).toBe(Inner);

			});

			it("resolves path through resolved resource entries", async () => {

				const Inner = resource({ label: required(string()) });

				const result = effective(reference(Inner), probe(["label"]));

				expect(range(result).variants[0]).toEqual(string());

			});

			it("preserves cardinality through resolved resource", async () => {

				const Inner = resource({ label: optional(string()) });

				const result = effective(reference(Inner), probe(["label"]));

				expect(range(result).minCount).toBeUndefined();
				expect(range(result).maxCount).toBe(1);

			});

			it("applies transform pipe after eager resolution", async () => {

				const Inner = resource({ value: required(integer()) });

				const result = effective(reference(Inner), probe(["value"], ["abs"]));

				expect(range(result).variants[0]).toEqual(integer());

			});

			it("returns undefined range for undefined property", async () => {

				const Inner = resource({ label: required(string()) });

				expect(effective(reference(Inner), probe(["missing"]))).toEqual("undefined property path");

			});

		});

		describe("union shape input", () => {

			it("resolves empty path to set wrapping the input union", async () => {

				const s = union(string(), integer());

				const result = effective(s, probe([]));

				expect(range(result).variants).toEqual([string(), integer()]);
				expect(range(result).minCount).toBe(1);
				expect(range(result).maxCount).toBe(1);

			});

			it("resolves single-segment path across variants to a union range", async () => {

				const s = union(
					resource({ name: required(string()) }),
					resource({ name: required(integer()) })
				);

				const result = effective(s, probe(["name"]));

				expect(range(result).variants).toContainEqual(string());
				expect(range(result).variants).toContainEqual(integer());

			});

			it("resolves path skipping variants that lack the property", async () => {

				const s = union(
					resource({ name: required(string()) }),
					resource({ age: required(integer()) })
				);

				const result = effective(s, probe(["name"]));

				expect(range(result).variants[0]).toEqual(string());

			});

			it("returns undefined range when no variant has the property", async () => {

				const s = union(
					resource({ name: required(string()) }),
					resource({ age: required(integer()) })
				);

				expect(effective(s, probe(["missing"]))).toEqual("undefined property path");

			});

			it("resolves multi-segment path across entry union when at least one variant resolves the full chain", async () => {

				const s = union(
					resource({ x: required(resource({ y: required(string()) })) }),
					resource({ x: required(integer()) })
				);

				// variant A traverses "x" → resource → "y"; variant B's "x" is integer and
				// drops at segment "y"; A survives the full path

				expect(range(effective(s, probe(["x", "y"]))).variants[0]).toEqual(string());

			});

			it("resolves multi-segment path across entry union dropping variants without the deeper segment", async () => {

				const s = union(
					resource({ x: required(resource({ y: required(string()) })) }),
					resource({ x: required(resource({ z: required(integer()) })) })
				);

				// both variants traverse "x" but only A defines "y"; B drops silently

				expect(range(effective(s, probe(["x", "y"]))).variants[0]).toEqual(string());

			});

			it("returns undefined range across entry union when no variant resolves the full chain", async () => {

				const s = union(
					resource({ x: required(integer()) }),
					resource({ y: required(string()) })
				);

				// neither A nor B can resolve ["x", "deeper"]: A's x is integer (non-traversable),
				// B lacks "x" entirely — generic trace, not id/type-specific

				expect(effective(s, probe(["x", "deeper"]))).toEqual("undefined property path");

			});

			it("resolves reference variants inside the input union", async () => {

				const Inner = resource({ label: required(string()) });

				const s = union(reference(Inner), integer());

				const result = effective(s, probe(["label"]));

				expect(range(result).variants[0]).toEqual(string());

			});

			it("collapses a union an aggregate maps to a single type", async () => {

				const s = union(string(), integer());

				const result = effective(s, probe([], ["count"]));

				// "count" maps both branches to integer — the union collapses to one distinct variant
				expect(range(result).variants).toEqual([integer()]);

			});

			it("skips incompatible variants in pipe and unwraps single survivor", async () => {

				const s = union(string(), integer());

				// length accepts only strings — integer variant is skipped

				const result = effective(s, probe([], ["length"]));

				expect(range(result).variants[0]).toEqual(integer());

			});

			it("reports incompatible transform input when no variant is compatible with pipe", async () => {

				const s = union(string(), integer());

				// year requires temporal strings — neither variant qualifies

				expect(effective(s, probe([], ["year"]))).toEqual("incompatible transform input");

			});

			it("resolves multi-stage pipe across entry union when at least one variant survives every stage", async () => {

				const s = union(string(), integer());

				// rightmost first — "length" accepts only strings; integer drops there
				// "count" then applies to the integer length, surviving as a count of strings

				expect(range(effective(s, probe([], ["count", "length"]))).variants[0]).toEqual(integer());

			});

			it("resolves multi-stage pipe across entry union narrowing different variants at different stages", async () => {

				const s = union(string(), integer(), date());

				// rightmost first — "year" accepts only temporal strings; string and integer drop
				// "abs" then applies to the year (integer); date variant survives end-to-end

				expect(range(effective(s, probe([], ["abs", "year"]))).variants[0]).toEqual(integer());

			});

			it("rejects multi-stage pipe across entry union when no variant survives the full chain", async () => {

				const s = union(string(), integer());

				// "year" rejects every variant at the first stage; "lower" never applies

				expect(effective(s, probe([], ["lower", "year"]))).toEqual("incompatible transform input");

			});

			describe("envelope cardinality across branches", () => {

				// when multiple sibling variants resolve the same segment, the effective bounds
				// are the envelope across branches (any branch may match): minCount is the lowest lower
				// bound, maxCount is the highest upper bound, with undefined absorbing at both ends

				it("envelopes minCount across entry-union branches with divergent per-property minimums", async () => {

					const s = union(
						resource({ name: required(string()) }),
						resource({ name: optional(integer()) })
					);

					// envelope: min = minOf(1, undefined) = undefined (no lower bound wins)

					const result = effective(s, probe(["name"]));

					expect(range(result).minCount).toBeUndefined();
					expect(range(result).maxCount).toBe(1);

				});

				it("envelopes maxCount across entry-union branches with divergent per-property maximums", async () => {

					const s = union(
						resource({ name: required(string()) }),
						resource({ name: nonempty(integer()) })
					);

					// envelope: max = maxOf(1, undefined) = undefined (unbounded wins)

					const result = effective(s, probe(["name"]));

					expect(range(result).minCount).toBe(1);
					expect(range(result).maxCount).toBeUndefined();

				});

				it("envelopes cardinality across a mid-path union range crossing", async () => {

					const s = resource({
						value: required(union(
							resource({ name: required(string()) }),
							resource({ name: optional(integer()) })
						))
					});

					// after "value": accumulated = {min:1, max:1, variants:[A,B]}
					// segment "name": A → min=1; B → min=undefined → envelope min = undefined

					const result = effective(s, probe(["value", "name"]));

					expect(range(result).minCount).toBeUndefined();
					expect(range(result).maxCount).toBe(1);

				});

			});

		});

		describe("leaf shape input", () => {

			it.each([
				["boolean", boolean()],
				["number", integer()],
				["string", string()],
				["dictionary", dictionary()]
			])("resolves empty path for %s shape", async (_label, s) => {

				const result = effective(s, probe([]));

				expect(range(result).variants[0]).toBe(s);

			});

			it("applies compatible transform pipe on empty path", async () => {

				const result = effective(decimal(), probe([], ["floor"]));

				expect(range(result).variants[0]).toEqual(decimal());

			});

			it("applies aggregate transform on empty path", async () => {

				const result = effective(integer(), probe([], ["count"]));

				expect(range(result).variants[0]).toEqual(integer());
				expect(range(result).minCount).toBe(1);
				expect(range(result).maxCount).toBe(1);

			});

			it.each([
				["number", integer()],
				["string", string()],
				["boolean", boolean()]
			])("returns undefined range for non-empty path on %s shape", async (_label, s) => {

				expect(effective(s, probe(["missing"]))).toEqual("undefined property path");

			});

			it("reports incompatible transform input for incompatible pipe on leaf shape", async () => {

				expect(effective(string(), probe([], ["floor"]))).toEqual("incompatible transform input");

			});

			it("chains transforms on leaf shape", async () => {

				const result = effective(decimal(), probe([], ["avg", "floor"]));

				expect(range(result).variants[0]).toEqual(decimal());

			});

		});

		describe("range input", () => {

			it("roundtrips a range on empty path and empty pipe", async () => {

				const input: RangeShape = { kind: "range", minCount: 2, maxCount: 5, variants: [integer()] };

				const result = range(effective(input, probe([])));

				expect(result.variants).toEqual([integer()]);
				expect(result.minCount).toBe(2);
				expect(result.maxCount).toBe(5);

			});

			it("seeds one branch per range variant", async () => {

				const input: RangeShape = { kind: "range", variants: [integer(), string()] };

				const result = range(effective(input, probe([])));

				expect(result.variants).toEqual([integer(), string()]);
				expect(result.minCount).toBeUndefined();
				expect(result.maxCount).toBeUndefined();

			});

			it("multiplies range cardinality through a traversed step", async () => {

				const input: RangeShape = {
					kind: "range", minCount: 2, maxCount: 3,
					variants: [resource({ name: required(string()) })]
				};

				const result = range(effective(input, probe(["name"])));

				expect(result.variants).toEqual([string()]);
				expect(result.minCount).toBe(2);
				expect(result.maxCount).toBe(3);

			});

			it("applies a transform pipe to range variants", async () => {

				const input: RangeShape = { kind: "range", minCount: 1, maxCount: 1, variants: [decimal()] };

				const result = range(effective(input, probe([], ["floor"])));

				expect(result.variants).toEqual([decimal()]);

			});

			it("resolves a lazy range factory", async () => {

				const input: RangeShape = { kind: "range", minCount: 1, maxCount: 1, variants: [integer()] };

				const result = range(effective(() => input, probe([])));

				expect(result.variants).toEqual([integer()]);

			});

		});

	});

});

describe("internals", () => {

	describe("checkValues", () => {

		it("returns undefined for consistent constraints", async () => {

			expect(checkValues({ minCount: 1, maxCount: 10 })).toBeUndefined();

		});

		it("returns undefined when minCount equals maxCount", async () => {

			expect(checkValues({ minCount: 1, maxCount: 1 })).toBeUndefined();

		});

		it("returns undefined when only minCount is provided", async () => {

			expect(checkValues({ minCount: 1 })).toBeUndefined();

		});

		it("returns undefined when only maxCount is provided", async () => {

			expect(checkValues({ maxCount: 1 })).toBeUndefined();

		});

		it("returns undefined when no constraints are provided", async () => {

			expect(checkValues({})).toBeUndefined();

		});

		it("returns trace when minCount > maxCount", async () => {

			const trace = checkValues({ minCount: 5, maxCount: 2 });

			expect(trace).toContainEqual(expect.stringContaining("{minCount/maxCount}"));

		});

	});


	describe("narrowsValue", () => {

		it("accepts a child that tightens the base", async () => {

			expect(narrowsValue(string({ model: "hello", minLength: 5 }), string())).toBeUndefined();

		});

		it("accepts an identical child", async () => {

			expect(narrowsValue(string(), string())).toBeUndefined();

		});

		it("rejects a child that widens a base constraint", async () => {

			expect(narrowsValue(string({ model: "x", minLength: 1 }), string({
				model: "hello",
				minLength: 5
			}))).toBeDefined();

		});

		it("rejects a child of a different kind", async () => {

			expect(narrowsValue(boolean(), string())).toBeDefined();

		});

		it("rejects a child string of a different datatype", async () => {

			expect(narrowsValue(date(), time())).toBeDefined();

		});

		it("rejects a reference child targeting a different class", async () => {

			const Person = resource({ name: required(string()) }, { class: "http://example.org/Person" });
			const Org = resource({ name: required(string()) }, { class: "http://example.org/Org" });

			expect(narrowsValue(reference(Person), reference(Org))).toBeDefined();

		});

		it("accepts a child that tightens a numeric bound", async () => {

			expect(narrowsValue(integer({ minInclusive: 0 }), integer())).toBeUndefined();

		});

		it("rejects a child that widens a numeric bound", async () => {

			expect(narrowsValue(integer({ minInclusive: 0 }), integer({ minInclusive: 5 }))).toBeDefined();

		});

		it("accepts an identical boolean child", async () => {

			expect(narrowsValue(boolean(), boolean())).toBeUndefined();

		});

		it("accepts a child that tightens a dictionary length", async () => {

			expect(narrowsValue(dictionary({ minLength: 5 }), dictionary())).toBeUndefined();

		});

		it("rejects a dictionary child that widens a length bound", async () => {

			expect(narrowsValue(dictionary({ minLength: 1 }), dictionary({ minLength: 5 }))).toBeDefined();

		});

		it("accepts a resource child carrying the base class", async () => {

			const Person = resource({ name: required(string()) }, { class: "http://example.org/Person" });

			expect(narrowsValue(Person, Person)).toBeUndefined();

		});

		it("rejects a resource child missing the base class", async () => {

			const Person = resource({ name: required(string()) }, { class: "http://example.org/Person" });
			const Org = resource({ name: required(string()) }, { class: "http://example.org/Org" });

			expect(narrowsValue(Org, Person)).toBeDefined();

		});

		it("accepts a resource child narrowing the base enumeration", async () => {

			const Base = resource({}, { in: ["http://example.org/a", "http://example.org/b"] });
			const Narrow = resource({}, { in: ["http://example.org/a"] });

			expect(narrowsValue(Narrow, Base)).toBeUndefined();

		});

		it("rejects a resource child widening the base enumeration", async () => {

			const Base = resource({}, { in: ["http://example.org/a", "http://example.org/b"] });
			const Wide = resource({}, { in: ["http://example.org/a", "http://example.org/z"] });

			expect(narrowsValue(Wide, Base)).toBeDefined();

		});

		it("accepts a resource child extending the base required values", async () => {

			const Base = resource({}, { hasValue: ["http://example.org/a"] });
			const Child = resource({}, { hasValue: ["http://example.org/a", "http://example.org/b"] });

			expect(narrowsValue(Child, Base)).toBeUndefined();

		});

		it("rejects a resource child dropping a base required value", async () => {

			const Base = resource({}, { hasValue: ["http://example.org/a", "http://example.org/b"] });
			const Child = resource({}, { hasValue: ["http://example.org/a"] });

			expect(narrowsValue(Child, Base)).toBeDefined();

		});

	});

	describe("narrowsValues", () => {

		it("accepts a child that tightens cardinality", async () => {

			expect(narrowsValues(required(string()).range, optional(string()).range)).toBeUndefined();

		});

		it("rejects a child that widens minCount", async () => {

			expect(narrowsValues(property(string(), { minCount: 0, maxCount: 1 }).range, property(string(), { minCount: 1, maxCount: 1 }).range)).toBeDefined();

		});

		it("rejects a child that widens maxCount", async () => {

			expect(narrowsValues(property(string(), { minCount: 1, maxCount: 5 }).range, property(string(), { minCount: 1, maxCount: 2 }).range)).toBeDefined();

		});

		it("accepts a child that tightens the wrapped shape", async () => {

			expect(narrowsValues(required(string({
				model: "hello",
				minLength: 5
			})).range, required(string()).range)).toBeUndefined();

		});

		it("rejects a child shape of a different kind", async () => {

			expect(narrowsValues(required(string()).range, required(boolean()).range)).toBeDefined();

		});

		it("accepts a union child narrowing a base union", async () => {

			expect(narrowsValues(required(union(string())).range, required(union(string(), integer())).range)).toBeUndefined();

		});

		it("accepts a non-union child narrowing one base variant", async () => {

			expect(narrowsValues(required(string()).range, required(union(string(), integer())).range)).toBeUndefined();

		});

		it("rejects a non-union child narrowing no base variant", async () => {

			expect(narrowsValues(required(boolean()).range, required(union(string(), integer())).range)).toBeDefined();

		});

		it("rejects a union child against a non-union base", async () => {

			expect(narrowsValues(required(union(string())).range, required(string()).range)).toBeDefined();

		});

	});


	describe("mergeValue", () => {

		it("dispatches to the string merge", async () => {

			const merged = mergeValue(string({ minLength: 5 }), string());

			expect(merged.kind).toBe("string");
			expect(merged.minLength).toBe(5);

		});

		it("dispatches to the number merge", async () => {

			expect(mergeValue(integer({ minInclusive: 0 }), integer()).kind).toBe("number");

		});

		it("throws on an incompatible override", async () => {

			expect(() => mergeValue(string({ minLength: 1 }), string({ minLength: 5 }))).toThrow(TraceError);

		});

	});

	describe("mergeValues", () => {

		describe("kind", () => {

			it("preserves kind as 'range'", async () => {

				const merged = mergeValues(required(string()).range, required(string()).range);

				expect(merged.kind).toBe("set");

			});

		});

		describe.each([

			{
				bound: "minCount" as const,
				inheritTarget: multiple(string()).range,
				inheritSource: required(string()).range,
				keepTarget: required(string()).range,
				keepSource: multiple(string()).range,
				compatibleTarget: property(string(), { minCount: 2 }).range,
				compatibleSource: property(string(), { minCount: 1 }).range,
				compatibleExpected: 2,
				incompatibleTarget: property(string(), { minCount: 1 }).range,
				incompatibleSource: property(string(), { minCount: 2 }).range
			},

			{
				bound: "maxCount" as const,
				inheritTarget: multiple(string()).range,
				inheritSource: optional(string()).range,
				keepTarget: optional(string()).range,
				keepSource: multiple(string()).range,
				compatibleTarget: property(string(), { maxCount: 2 }).range,
				compatibleSource: property(string(), { maxCount: 5 }).range,
				compatibleExpected: 2,
				incompatibleTarget: property(string(), { maxCount: 10 }).range,
				incompatibleSource: property(string(), { maxCount: 5 }).range
			}

		])("$bound", ({
			bound, inheritTarget, inheritSource, keepTarget, keepSource,
			compatibleTarget, compatibleSource, compatibleExpected,
			incompatibleTarget, incompatibleSource
		}) => {

			it("inherits source value when target has none", async () => {

				const merged = mergeValues(inheritTarget, inheritSource);

				expect(merged[bound]).toBe(1);

			});

			it("keeps target value when source has none", async () => {

				const merged = mergeValues(keepTarget, keepSource);

				expect(merged[bound]).toBe(1);

			});

			it("accepts compatible target override", async () => {

				const merged = mergeValues(compatibleTarget, compatibleSource);

				expect(merged[bound]).toBe(compatibleExpected);

			});

			it("rejects incompatible target override", async () => {

				expect(() => mergeValues(incompatibleTarget, incompatibleSource)).toThrow(RangeError);

			});

		});

		describe("shape", () => {

			it("delegates to value shape merge", async () => {

				const merged = mergeValues(
					required(string({ model: "hello", minLength: 5 })).range,
					required(string()).range
				);

				expect((merged.shape as any).minLength).toBe(5);

			});

			it("rejects shape kind mismatch", async () => {

				expect(() => mergeValues(
					required(string()).range,
					required(boolean()).range
				)).toThrow(RangeError);

			});

			it("delegates to union merge for union shapes", async () => {

				const merged = mergeValues(
					required(union(string({ model: "hello", minLength: 5 }), boolean())).range,
					required(union(string(), boolean())).range
				);

				expect((merged.shape as any).variants[0].minLength).toBe(5);

			});

			it("narrows a parent union to a single variant when the child narrows exactly one variant", async () => {

				const merged = mergeValues(
					required(string({ model: "hello", minLength: 5 })).range,
					required(union(string(), integer())).range
				);

				expect(merged.shape.kind).toBe("string");
				expect((merged.shape as any).minLength).toBe(5);
				expect(merged.model).toBe("hello");

			});

			it("rejects single-variant narrowing when the child narrows no variant", async () => {

				expect(() => mergeValues(
					required(boolean()).range,
					required(union(string(), integer())).range
				)).toThrow(RangeError);

			});

			it("rejects single-variant narrowing when the child narrows several variants", async () => {

				expect(() => mergeValues(
					required(string()).range,
					required(union(string(), string(), integer())).range
				)).toThrow(RangeError);

			});

			it("narrows a parent union to a specific numeric datatype", async () => {

				const merged = mergeValues(
					required(integer()).range,
					required(union(integer(), decimal())).range
				);

				expect(merged.shape.kind).toBe("number");
				expect(merged.model).toBe(0);

			});

			it("preserves union form when child is a single-variant union", async () => {

				const merged = mergeValues(
					required(union(string({ model: "hello", minLength: 5 }))).range,
					required(union(string(), integer())).range
				);

				expect(merged.shape.kind).toBe("union");
				expect((merged.shape as UnionShape).variants).toHaveLength(1);
				expect(merged.model).toEqual({ "0": "hello" });

			});

			it("narrows a parent union containing references by target class", async () => {

				const Person = resource({ name: required(string()) }, { class: "http://example.org/Person" });
				const Org = resource({ name: required(string()) }, { class: "http://example.org/Org" });

				const merged = mergeValues(
					required(reference(Person)).range,
					required(union(reference(Person), reference(Org))).range
				);

				expect(merged.shape.kind).toBe("reference");

			});

			it("composes Form 1 narrowing with cardinality narrowing", async () => {

				const merged = mergeValues(
					required(string({ model: "hello", minLength: 5 })).range,
					optional(union(string(), integer())).range
				);

				expect(merged.shape.kind).toBe("string");
				expect(merged.minCount).toBe(1);
				expect(merged.maxCount).toBe(1);

			});

		});

		describe("post-merge validation", () => {

			it("rejects merged minCount > maxCount", async () => {

				expect(() => mergeValues(
					property(string(), { minCount: 3 }).range,
					property(string(), { maxCount: 2 }).range
				)).toThrow(RangeError);

			});

		});

	});


	describe("deriveValue", () => {

		it("derives a boolean model", async () => {

			expect(deriveValue(boolean())).toBe(false);

		});

		it("returns the stored number model", async () => {

			expect(deriveValue(number(5))).toBe(5);
			expect(deriveValue(number({ in: [2, 1] }))).toBe(0);

		});

		it("derives a string model", async () => {

			expect(deriveValue(string({ model: "x" }))).toBe("x");

		});

		it("derives a localised model", async () => {

			expect(deriveValue(dictionary())).toEqual({ "*": "" });

		});

		it("returns the stored reference model", async () => {

			expect(deriveValue(reference(resource({}, { in: ["app:/users/1"] })))).toBe("app:/");

		});

		it("derives a resource template from its entries", async () => {

			expect(deriveValue(resource({ name: required(string()) }))).toEqual({ name: "" });

		});

		it("derives an indexed union model", async () => {

			expect(deriveValue(union(string(), integer()))).toEqual({ "0": "", "1": 0 });

		});

	});

	describe("deriveValues", () => {

		it("derives a per-tag array placeholder for a multi-valued localised set", async () => {

			expect(deriveValues(multiple(dictionary()).range)).toEqual({ "*": [""] });

		});

		it("derives a scalar placeholder for a single-valued localised set", async () => {

			// a multi-valued stored model overridden to scalar cardinality: the form is derived, not read from model

			const set: SetShape = { ...multiple(dictionary()).range, maxCount: 1 };

			expect(deriveValues(set)).toEqual({ "*": "" });

		});

		it("derives a per-tag array placeholder for every languageIn range", async () => {

			expect(deriveValues(multiple(dictionary({ languageIn: ["en", "it"] })).range)).toEqual({ en: [""], it: [""] });

		});

		it("honours a stored localised model for a scalar set", async () => {

			expect(deriveValues(required(dictionary({ en: "" })).range)).toEqual({ en: "" });

		});

		it("honours a stored localised model for a multi-valued set", async () => {

			expect(deriveValues(multiple(dictionary({ en: "" })).range)).toEqual({ en: [""] });

		});

	});

});

describe("validators", () => {

	describe("validateValue", () => {

		it("returns undefined for valid local value", async () => {

			expect(validateValue([{ "en": "hello" }], dictionary())).toBeUndefined();

		});

		it("rejects plain string for local shape (no und shorthand)", async () => {

			expect(validateValue(["hello"], dictionary())).toBeDefined();

		});

		it("rejects non-localised value for localised shape", async () => {

			expect(validateValue([42], dictionary())).toBeDefined();

		});

		it("returns undefined for valid localised array value", async () => {

			expect(validateValue([{ "en": ["hello"] }], dictionary())).toBeUndefined();

		});

		it("returns undefined for valid localised scalar value", async () => {

			expect(validateValue([{ "en": "hello" }], dictionary())).toBeUndefined();

		});

	});

});
