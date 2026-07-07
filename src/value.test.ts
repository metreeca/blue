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

import type { Probe, Selection, Transform } from "@metreeca/qest/template";
import { describe, expect, it } from "vitest";
import { boolean } from "./boolean.js";
import { TraceError } from "./index.core.js";
import type { Trace } from "./index.js";
import { byte, decimal, double, float, int, integer, long, number, short } from "./number.js";
import { reference } from "./reference.js";
import { id, resource, type ResourceShape, type } from "./resource.js";
import { date, duration, instant, iri, string, time, timestamp, year } from "./string.js";
import { text } from "./text.js";
import { union, type UnionShape } from "./union.js";
import {
	checkValues,
	deriveValue,
	deriveValues,
	mergeValue,
	mergeValues,
	model,
	narrowsValue,
	narrowsValues,
	validateValue
} from "./value.core.js";
import {
	cardinality,
	eager,
	effective,
	multiple,
	optional,
	type RangeShape,
	repeatable,
	required,
	type SetShape,
	type ValuesShape
} from "./value.js";


describe("factories", () => {

	describe("cardinality shorthands", () => {

		describe("cardinality bounds", () => {

			it.each([
				["multiple", multiple, undefined, undefined],
				["repeatable", repeatable, 1, undefined],
				["optional", optional, undefined, 1],
				["required", required, 1, 1]
			])("%s sets correct cardinality bounds", async (_name, factory, expectedMin, expectedMax) => {

				const range = factory(string());

				expect(range.minCount).toBe(expectedMin);
				expect(range.maxCount).toBe(expectedMax);
				expect(range.shape.kind).toBe("string");

			});

			it("accepts lazy resource shape", async () => {

				const range = multiple(() => resource({}));

				expect(range.shape.kind).toBe("resource");

			});

			it("returns an immutable range", async () => {

				const range = required(string());

				expect(() => {
					(range as any).minCount = 99;
				}).toThrow();

			});

			it("includes only expected properties", async () => {

				const range = required(string());

				expect(Object.keys(range).sort()).toEqual(["kind", "maxCount", "minCount", "model", "shape"]);

			});

		});

	});

	describe("cardinality", () => {

		it("returns a factory function", async () => {

			const twoToFive = cardinality(2, 5);

			expect(typeof twoToFive).toBe("function");

		});

		it("creates ranges with specified cardinality", async () => {

			const twoToFive = cardinality(2, 5);
			const range = twoToFive(string());

			expect(range.minCount).toBe(2);
			expect(range.maxCount).toBe(5);
			expect(range.shape.kind).toBe("string");

		});

		it("supports undefined lower bound", async () => {

			const upToThree = cardinality(undefined, 3);
			const range = upToThree(string());

			expect(range.minCount).toBeUndefined();
			expect(range.maxCount).toBe(3);

		});

		it("supports undefined upper bound", async () => {

			const atLeastTwo = cardinality(2);
			const range = atLeastTwo(string());

			expect(range.minCount).toBe(2);
			expect(range.maxCount).toBeUndefined();

		});

		it("returns immutable ranges", async () => {

			const twoToFive = cardinality(2, 5);
			const range = twoToFive(string());

			expect(() => {
				(range as any).minCount = 0;
			}).toThrow();

		});

		describe("structural integrity", () => {

			it("includes undefined constraints", async () => {

				const upToThree = cardinality(undefined, 3);
				const range = upToThree(string());

				expect(Object.keys(range).sort()).toEqual(["kind", "maxCount", "minCount", "model", "shape"]);
				expect(range.minCount).toBeUndefined();

			});

		});

		describe("selection injection", () => {

			it("appends selection as second tuple slot when upper !== 1", async () => {

				const selection: Selection = { "#": 10 };
				const range = cardinality(2, 5)(string(), selection);

				expect(range.model).toEqual(["", selection]);

			});

			it("appends selection as second tuple slot with undefined upper", async () => {

				const selection: Selection = { "#": 25, "@": 5 };
				const range = cardinality(2)(string(), selection);

				expect(range.model).toEqual(["", selection]);

			});

			it("produces plain tuple model when selection is omitted", async () => {

				const range = cardinality(2, 5)(string());

				expect(range.model).toEqual([""]);

			});

			it("appends selection as second tuple slot for resource model", async () => {

				const selection: Selection = { "#": 10 };
				const range = cardinality(2, 5)(resource({ name: required(string()) }), selection);

				expect(range.model).toEqual([{ name: "" }, selection]);

			});

			it("spreads selection into localised dictionary model", async () => {

				const selection: Selection = { "#": 10 };
				const range = cardinality(2, 5)(text({ en: "", it: "" }), selection);

				expect(range.model).toEqual({
					en: [""],
					it: [""],
					...selection
				});

			});

			it("spreads selection into scalar localised dictionary model", async () => {

				const selection: Selection = { "#": 10 };
				const range = cardinality(1, 1)(text({ en: "", it: "" }), selection);

				expect(range.model).toEqual({
					en: "",
					it: "",
					...selection
				});

			});

		});

		describe("localised default model", () => {

			it("wraps default tag map for scalar cardinality", async () => {

				const range = required(text());

				expect(range.model).toEqual({ "*": "" });

			});

			it("wraps default tag map for optional cardinality", async () => {

				const range = optional(text());

				expect(range.model).toEqual({ "*": "" });

			});

			it("boxes default tag values into singleton tuples for collection cardinality", async () => {

				const range = multiple(text());

				expect(range.model).toEqual({ "*": [""] });

			});

			it("boxes default tag values into singleton tuples for repeatable cardinality", async () => {

				const range = repeatable(text());

				expect(range.model).toEqual({ "*": [""] });

			});

			it("boxes default tag values into singleton tuples for custom bounds", async () => {

				const range = cardinality(2, 5)(text());

				expect(range.model).toEqual({ "*": [""] });

			});

			it("hosts selection alongside default tag map for collection cardinality", async () => {

				const selection: Selection = { "#": 10 };
				const range = cardinality(2, 5)(text(), selection);

				expect(range.model).toEqual({ "*": [""], ...selection });

			});

			it("hosts selection alongside default tag map for scalar cardinality", async () => {

				const selection: Selection = { "#": 10 };
				const range = cardinality(1, 1)(text(), selection);

				expect(range.model).toEqual({ "*": "", ...selection });

			});

		});

	});

});

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

		it("returns the stored model for a non-reference shape", async () => {

			expect(model(string({ model: "sample" }))).toBe("sample");
			expect(model(number())).toBe(0);

		});

		it("returns the default app:/ model for a reference shape regardless of target constraints", async () => {

			expect(model(reference(resource({}, {})))).toBe("app:/");
			expect(model(reference(resource({ in: ["app:/users/1"] }, {})))).toBe("app:/");
			expect(model(reference(resource({ pattern: "/users/{id}" }, {})))).toBe("app:/");

		});

		it("returns the stored model for a boolean shape", async () => {

			expect(model(boolean())).toBe(false);
			expect(model(boolean(true))).toBe(true);

		});

		it("returns the wildcard placeholder for a constrained text shape", async () => {

			expect(model(text({ minLength: 1 }))).toEqual({ "*": "" });

		});

		it("returns a concrete localised model for a text shape", async () => {

			expect(model(text({ und: "Default" }))).toEqual({ und: "Default" });

		});

		it("indexes literal variant models for a union shape", async () => {

			expect(model(union(string({ model: "a" }), number(5)))).toEqual({ "0": "a", "1": 5 });

		});

		it("indexes reference variant models for a union shape", async () => {

			const target = resource({ pattern: "/things/{id}" }, {});

			expect(model(union(reference(target), string()))).toEqual({ "0": "app:/", "1": "" });

		});

	});

	describe("effective", () => {

		function probe(path: readonly string[], pipe: readonly Transform[] = []): Probe {
			return { target: path[path.length-1] ?? "_", pipe, path };
		}

		function range(r: RangeShape | Extract<Trace, string>): RangeShape {
			if ( typeof r === "string" ) { throw new Error(`expected RangeShape, got trace <${r}>`); }
			return r;
		}

		// transform-focused helpers: wrap leaf shape in a resource property

		function transformRange(pipe: readonly Transform[], s: ValuesShape): RangeShape | Extract<Trace, string> {
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

				it("accepts localised text shape", async () => {

					expect(range(transformRange(["count"], text())).variants[0]).toEqual(integer());

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

				it("coalesces single-string-per-tag localised text shape to string", async () => {

					expect(range(transformRange(["max"], text())).variants[0]).toEqual(string());

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

			it("coalesces single-string-per-tag localised text to string for string transforms", async () => {

				const s = text();

				expect(range(transformRange(["lower"], s)).variants[0]).toEqual(string());
				expect(range(transformRange(["upper"], s)).variants[0]).toEqual(string());
				expect(range(transformRange(["length"], s)).variants[0]).toEqual(integer());
				expect(range(transformRange(["min"], s)).variants[0]).toEqual(string());

			});

			it("reports incompatible transform input for out-of-domain transforms on coalesced localised text", async () => {

				const s = text();

				expect(transformRange(["year"], s)).toEqual("incompatible transform input");    // temporal
				expect(transformRange(["abs"], s)).toEqual("incompatible transform input");     // numeric
				expect(transformRange(["sum"], s)).toEqual("incompatible transform input");     // numeric total

			});

			it.each([
				["text", text()]
			] as const)("accepts count (any value) on %s yielding integer", async (_label, s) => {

				expect(range(transformRange(["count"], s)).variants[0]).toEqual(integer());

			});

			it("coalesces array-per-tag localised text to a multi-valued string set", async () => {

				function arrayPerTagRange(pipe: readonly Transform[]): RangeShape | Extract<Trace, string> {
					return effective(resource({ _: repeatable(text()) }), probe(["_"], pipe));
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
				label: required(text()),
				labels: repeatable(text())
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

			it("coalesces single-string-per-tag localised text behind a multi-valued prefix", async () => {

				expect(range(effective(Wrapper, probe(["items", "label"], ["lower"]))).variants[0]).toEqual(string());

			});

			it("coalesces array-per-tag localised text behind a multi-valued prefix to a multi-valued string set", async () => {

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

			it("preserves repeatable cardinality through identity", async () => {

				const result = effective(resource({ name: repeatable(string()) }), probe(["name"]));

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

				const result = effective(resource({ value: repeatable(integer()) }), probe(["value"], ["abs"]));

				expect(range(result).minCount).toBeUndefined();
				expect(range(result).maxCount).toBeUndefined();

			});

			it.each([
				["count", ["count"], repeatable(integer())],
				["sum", ["sum"], repeatable(integer())]
			] as const)("%s total aggregate sets maxCount and minCount to 1", async (_label, pipe, set) => {

				const result = effective(resource({ value: set }), probe(["value"], [...pipe]));

				// total aggregates always yield a value (0 on the empty set), so minCount is 1

				expect(range(result).minCount).toBe(1);
				expect(range(result).maxCount).toBe(1);

			});

			it.each([
				["avg", ["avg"], repeatable(integer())],
				["min", ["min"], repeatable(string())],
				["max", ["max"], repeatable(string())],
				["avg+floor", ["avg", "floor"], repeatable(decimal())]
			] as const)("%s aggregate sets maxCount to 1 and minCount to undefined", async (_label, pipe, set) => {

				const result = effective(resource({ value: set }), probe(["value"], [...pipe]));

				// non-total aggregates yield undefined on the empty set, so minCount is undefined

				expect(range(result).minCount).toBeUndefined();
				expect(range(result).maxCount).toBe(1);

			});

		});

		describe("path cardinality accumulation", () => {

			function pathRange(p: Probe, s: ResourceShape): RangeShape | Extract<Trace, string> {
				return effective(s, p);
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

				expect(range(result).minCount).toBe(expectedMin);
				expect(range(result).maxCount).toBe(expectedMax);

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

				expect(range(result).minCount).toBeUndefined();
				expect(range(result).maxCount).toBeUndefined();

			});

			it("preserves a forbidden step's maxCount of 0 as the strongest upper bound", async () => {

				const s = resource({
					forbidden: cardinality(0, 0)(string())
				});

				// minCount: 1×0 = 0; maxCount: 1×0 = 0 (exactly zero values admitted)

				const result = pathRange(probe(["forbidden"]), s);

				expect(range(result).minCount).toBe(0);
				expect(range(result).maxCount).toBe(0);

			});

			it("propagates a forbidden mid-path step's 0 through the branch product", async () => {

				const s = resource({
					child: cardinality(0, 0)(resource({ name: required(string()) }))
				});

				// the forbidden step zeroes both bounds: minCount 1×0×1 = 0, maxCount 1×0×1 = 0

				const result = pathRange(probe(["child", "name"]), s);

				expect(range(result).minCount).toBe(0);
				expect(range(result).maxCount).toBe(0);

			});

			it("accumulates through union using outer range cardinality", async () => {

				const s = resource({
					value: repeatable(union(
						resource({ name: required(string()) }),
						resource({ name: required(integer()) })
					))
				});

				// step 1 (value): minCount=1, maxCount=undef (repeatable)
				// step 2 (name): minCount=1, maxCount=1 (required in both variants)
				// accumulated: minCount=1×1=1, maxCount=undef×1=undef

				const result = pathRange(probe(["value", "name"]), s);

				expect(range(result).minCount).toBe(1);
				expect(range(result).maxCount).toBeUndefined();

			});

		});

		describe("path traversal", () => {

			function probeRange(p: Probe, s: ResourceShape): RangeShape | Extract<Trace, string> {
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

			it("resolves path through union to localised leaves preserving text variants", async () => {

				const s = resource({
					value: required(union(
						resource({ label: required(text()) }),
						resource({ label: required(integer()) })
					))
				});

				// the localised variant contributes a `text` shape to the effective range — a union
				// range carrying a `text` variant only ever arises here, via traversal, never from a
				// union shape declared directly (its variants exclude `text`)

				const result = probeRange(probe(["value", "label"]), s);

				expect(range(result).variants).toHaveLength(2);
				expect(range(result).variants.map(variant => variant.kind)).toContain("text");
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

				// "year" requires temporal strings — neither text nor num qualifies

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

			it("resolves path through inherited properties", async () => {

				const Base = resource({
					label: required(string())
				});

				const Derived = resource({ extends: Base }, {
					extra: required(integer())
				});

				expect(range(probeRange(probe(["label"]), Derived)).variants[0]).toEqual(string());

			});

		});

		describe("id/type path resolution", () => {

			function probeRange(p: Probe, s: ResourceShape): RangeShape | Extract<Trace, string> {
				return effective(s, p);
			}


			describe("id field", () => {

				it("resolves single-segment path to id field", async () => {

					const s = resource({
						rid: id(),
						name: required(string())
					});

					expect(range(probeRange(probe(["rid"]), s)).variants[0]).toEqual(iri({ variant: "absolute" }));

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

					expect(range(probeRange(probe(["child", "rid"]), s)).variants[0]).toEqual(iri({ variant: "absolute" }));

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

					const s = resource({ class: "app:/types/T" }, {
						kind: type(),
						name: required(string())
					});

					expect(range(probeRange(probe(["kind"]), s)).variants[0]).toEqual(iri({ variant: "absolute" }));

				});

				it("resolves type field with optional cardinality", async () => {

					const s = resource({ class: "app:/types/T" }, {
						kind: type(),
						name: required(string())
					});

					const result = probeRange(probe(["kind"]), s);

					expect(range(result).minCount).toBeUndefined();
					expect(range(result).maxCount).toBe(1);

				});

				it("resolves trailing path segment to type through reference", async () => {

					const Inner = resource({ class: "app:/types/T" }, {
						kind: type(),
						label: required(string())
					});

					const s = resource({
						child: optional(reference(Inner))
					});

					expect(range(probeRange(probe(["child", "kind"]), s)).variants[0]).toEqual(iri({ variant: "absolute" }));

				});

				it("rejects leading type with trailing segments", async () => {

					const s = resource({ class: "app:/types/T" }, {
						kind: type(),
						name: required(string())
					});

					expect(effective(s, probe(["kind", "something"]))).toEqual("undefined property path");

				});

				it("rejects inner type in multi-segment path", async () => {

					const Inner = resource({ class: "app:/types/T" }, {
						kind: type(),
						nested: required(resource({
							value: required(string())
						}))
					});

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
							resource({ class: "app:/types/A" }, { name: type() }),
							resource({ class: "app:/types/B" }, { name: type() })
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

			it("resolves path through resolved resource properties", async () => {

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
						resource({ name: repeatable(integer()) })
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
				["text", text()]
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

			expect(trace).toHaveProperty("{minCount/maxCount}");

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

			const Person = resource({ class: "http://example.org/Person" }, { name: required(string()) });
			const Org = resource({ class: "http://example.org/Org" }, { name: required(string()) });

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

		it("accepts a child that tightens a text length", async () => {

			expect(narrowsValue(text({ minLength: 5 }), text())).toBeUndefined();

		});

		it("rejects a text child that widens a length bound", async () => {

			expect(narrowsValue(text({ minLength: 1 }), text({ minLength: 5 }))).toBeDefined();

		});

		it("accepts a resource child carrying the base class", async () => {

			const Person = resource({ class: "http://example.org/Person" }, { name: required(string()) });

			expect(narrowsValue(Person, Person)).toBeUndefined();

		});

		it("rejects a resource child missing the base class", async () => {

			const Person = resource({ class: "http://example.org/Person" }, { name: required(string()) });
			const Org = resource({ class: "http://example.org/Org" }, { name: required(string()) });

			expect(narrowsValue(Org, Person)).toBeDefined();

		});

	});

	describe("narrowsValues", () => {

		it("accepts a child that tightens cardinality", async () => {

			expect(narrowsValues(required(string()), optional(string()))).toBeUndefined();

		});

		it("rejects a child that widens minCount", async () => {

			expect(narrowsValues(cardinality(0, 1)(string()), cardinality(1, 1)(string()))).toBeDefined();

		});

		it("rejects a child that widens maxCount", async () => {

			expect(narrowsValues(cardinality(1, 5)(string()), cardinality(1, 2)(string()))).toBeDefined();

		});

		it("accepts a child that tightens the wrapped shape", async () => {

			expect(narrowsValues(required(string({
				model: "hello",
				minLength: 5
			})), required(string()))).toBeUndefined();

		});

		it("rejects a child shape of a different kind", async () => {

			expect(narrowsValues(required(string()), required(boolean()))).toBeDefined();

		});

		it("accepts a union child narrowing a base union", async () => {

			expect(narrowsValues(required(union(string())), required(union(string(), integer())))).toBeUndefined();

		});

		it("accepts a non-union child narrowing one base variant", async () => {

			expect(narrowsValues(required(string()), required(union(string(), integer())))).toBeUndefined();

		});

		it("rejects a non-union child narrowing no base variant", async () => {

			expect(narrowsValues(required(boolean()), required(union(string(), integer())))).toBeDefined();

		});

		it("rejects a union child against a non-union base", async () => {

			expect(narrowsValues(required(union(string())), required(string()))).toBeDefined();

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

				const merged = mergeValues(required(string()), required(string()));

				expect(merged.kind).toBe("set");

			});

		});

		describe.each([

			{
				bound: "minCount" as const,
				inheritTarget: multiple(string()),
				inheritSource: required(string()),
				keepTarget: required(string()),
				keepSource: multiple(string()),
				compatibleTarget: cardinality(2)(string()),
				compatibleSource: cardinality(1)(string()),
				compatibleExpected: 2,
				incompatibleTarget: cardinality(1)(string()),
				incompatibleSource: cardinality(2)(string())
			},

			{
				bound: "maxCount" as const,
				inheritTarget: multiple(string()),
				inheritSource: optional(string()),
				keepTarget: optional(string()),
				keepSource: multiple(string()),
				compatibleTarget: cardinality(undefined, 2)(string()),
				compatibleSource: cardinality(undefined, 5)(string()),
				compatibleExpected: 2,
				incompatibleTarget: cardinality(undefined, 10)(string()),
				incompatibleSource: cardinality(undefined, 5)(string())
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
					required(string({ model: "hello", minLength: 5 })),
					required(string())
				);

				expect((merged.shape as any).minLength).toBe(5);

			});

			it("rejects shape kind mismatch", async () => {

				expect(() => mergeValues(
					required(string()),
					required(boolean())
				)).toThrow(RangeError);

			});

			it("delegates to union merge for union shapes", async () => {

				const merged = mergeValues(
					required(union(string({ model: "hello", minLength: 5 }), boolean())),
					required(union(string(), boolean()))
				);

				expect((merged.shape as any).variants[0].minLength).toBe(5);

			});

			it("narrows a parent union to a single variant when the child narrows exactly one variant", async () => {

				const merged = mergeValues(
					required(string({ model: "hello", minLength: 5 })),
					required(union(string(), integer()))
				);

				expect(merged.shape.kind).toBe("string");
				expect((merged.shape as any).minLength).toBe(5);
				expect(merged.model).toBe("hello");

			});

			it("rejects single-variant narrowing when the child narrows no variant", async () => {

				expect(() => mergeValues(
					required(boolean()),
					required(union(string(), integer()))
				)).toThrow(RangeError);

			});

			it("rejects single-variant narrowing when the child narrows several variants", async () => {

				expect(() => mergeValues(
					required(string()),
					required(union(string(), string(), integer()))
				)).toThrow(RangeError);

			});

			it("narrows a parent union to a specific numeric datatype", async () => {

				const merged = mergeValues(
					required(integer()),
					required(union(integer(), decimal()))
				);

				expect(merged.shape.kind).toBe("number");
				expect(merged.model).toBe(0);

			});

			it("preserves union form when child is a single-variant union", async () => {

				const merged = mergeValues(
					required(union(string({ model: "hello", minLength: 5 }))),
					required(union(string(), integer()))
				);

				expect(merged.shape.kind).toBe("union");
				expect((merged.shape as UnionShape).variants).toHaveLength(1);
				expect(merged.model).toEqual({ "0": "hello" });

			});

			it("narrows a parent union containing references by target class", async () => {

				const Person = resource({ class: "http://example.org/Person" }, { name: required(string()) });
				const Org = resource({ class: "http://example.org/Org" }, { name: required(string()) });

				const merged = mergeValues(
					required(reference(Person)),
					required(union(reference(Person), reference(Org)))
				);

				expect(merged.shape.kind).toBe("reference");

			});

			it("composes Form 1 narrowing with cardinality narrowing", async () => {

				const merged = mergeValues(
					required(string({ model: "hello", minLength: 5 })),
					optional(union(string(), integer()))
				);

				expect(merged.shape.kind).toBe("string");
				expect(merged.minCount).toBe(1);
				expect(merged.maxCount).toBe(1);

			});

		});

		describe("post-merge validation", () => {

			it("rejects merged minCount > maxCount", async () => {

				expect(() => mergeValues(
					cardinality(3)(string()),
					cardinality(undefined, 2)(string())
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

			expect(deriveValue(text())).toEqual({ "*": "" });

		});

		it("returns the stored reference model", async () => {

			expect(deriveValue(reference(resource({ in: ["app:/users/1"] }, {})))).toBe("app:/");

		});

		it("derives a resource template from its properties", async () => {

			expect(deriveValue(resource({ name: required(string()) }))).toEqual({ name: "" });

		});

		it("derives an indexed union model", async () => {

			expect(deriveValue(union(string(), integer()))).toEqual({ "0": "", "1": 0 });

		});

	});

	describe("deriveValues", () => {

		it("derives a per-tag array placeholder for a multi-valued localised set", async () => {

			expect(deriveValues(multiple(text()))).toEqual({ "*": [""] });

		});

		it("derives a scalar placeholder for a single-valued localised set", async () => {

			// a multi-valued stored model overridden to scalar cardinality: the form is derived, not read from model

			const set: SetShape = { ...multiple(text()), maxCount: 1 };

			expect(deriveValues(set)).toEqual({ "*": "" });

		});

		it("derives a per-tag array placeholder for every languageIn range", async () => {

			expect(deriveValues(multiple(text({ languageIn: ["en", "it"] })))).toEqual({ en: [""], it: [""] });

		});

		it("honours a stored localised model for a scalar set", async () => {

			expect(deriveValues(required(text({ en: "" })))).toEqual({ en: "" });

		});

		it("honours a stored localised model for a multi-valued set", async () => {

			expect(deriveValues(multiple(text({ en: "" })))).toEqual({ en: [""] });

		});

	});

});

describe("validators", () => {

	describe("validateValue", () => {

		it("returns undefined for valid local value", async () => {

			expect(validateValue([{ "en": "hello" }], text())).toBeUndefined();

		});

		it("rejects plain string for local shape (no und shorthand)", async () => {

			expect(validateValue(["hello"], text())).toBeDefined();

		});

		it("rejects non-localised value for localised shape", async () => {

			expect(validateValue([42], text())).toBeDefined();

		});

		it("returns undefined for valid localised array value", async () => {

			expect(validateValue([{ "en": ["hello"] }], text())).toBeUndefined();

		});

		it("returns undefined for valid localised scalar value", async () => {

			expect(validateValue([{ "en": "hello" }], text())).toBeUndefined();

		});

	});

});
