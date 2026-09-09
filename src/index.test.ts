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

import type { Probe, Transform } from "@metreeca/qest/template";
import { describe, expect, it } from "vitest";
import { boolean } from "./boolean.js";
import { dictionary } from "./dictionary.js";
import { sh } from "./index.core.js";
import { validate } from "./index.js";
import { byte, decimal, double, float, int, integer, long, number, short } from "./number.js";
import { reference } from "./reference.js";
import { id, resource, type ResourceShape, type } from "./resource.js";
import { date, duration, instant, string, time, timestamp, year } from "./string.js";
import { union } from "./union.js";
import { effective, multiple, optional, type RangeShape, repeatable, required, type ValuesShape } from "./value.js";


describe("apply", () => {

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

		// a non-empty pipe is coalesced access: a single-string-per-tag localised leaf contributes its
		// coalesced string, an ordinary xsd:string thereafter; out-of-domain transforms still drop it

		it("coalesces single-string-per-tag localised dictionary to string for string transforms", async () => {

			const s = dictionary();

			expect(range(transformRange(["lower"], s)).variants[0]).toEqual(string());
			expect(range(transformRange(["upper"], s)).variants[0]).toEqual(string());
			expect(range(transformRange(["length"], s)).variants[0]).toEqual(integer());

		});

		it("reports incompatible transform input for out-of-domain transforms on coalesced dictionary", async () => {

			const s = dictionary();

			expect(transformRange(["year"], s)).toEqual("incompatible transform input");    // temporal
			expect(transformRange(["sum"], s)).toEqual("incompatible transform input");     // numeric total

		});

		it.each([
			["dictionary", dictionary()]
		] as const)("accepts count (any value) on %s yielding integer", async (_label, s) => {

			expect(range(transformRange(["count"], s)).variants[0]).toEqual(integer());

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

		it("reports multiple aggregate transforms for aggregate after aggregate", async () => {

			expect(transformRange(["count", "sum"], integer())).toEqual("multiple aggregate transforms");

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

		function pathRange(p: Probe, s: ResourceShape): RangeShape | string {
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

			// both variants define "name" — result is a range with union of per-variant resolved shapes

			const result = probeRange(probe(["value", "name"]), s);

			expect(range(result).variants).toContainEqual(string());
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

			const Derived = resource({ extends: Base }, {
				extra: required(integer())
			});

			expect(range(probeRange(probe(["label"]), Derived)).variants[0]).toEqual(string());

		});

	});

	describe("id/type path resolution", () => {

		function probeRange(p: Probe, s: ResourceShape): RangeShape | string {
			return effective(s, p);
		}


		describe("id field", () => {

			it("resolves single-segment path to id field", async () => {

				const s = resource({
					rid: id(),
					name: required(string())
				});

				expect(range(probeRange(probe(["rid"]), s)).variants[0]).toHaveProperty("datatype", sh.IRI);

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

				expect(range(probeRange(probe(["child", "rid"]), s)).variants[0]).toHaveProperty("datatype", sh.IRI);

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

				expect(range(probeRange(probe(["kind"]), s)).variants[0]).toHaveProperty("datatype", sh.IRI);

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

				expect(range(probeRange(probe(["child", "kind"]), s)).variants[0]).toHaveProperty("datatype", sh.IRI);

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

});

describe("validation", () => {

	describe("validate (resource)", () => {

		describe("structural validation", () => {

			it("returns value for valid empty resource", async () => {

				const shape = resource({});
				const result = validate({}, { shape });

				expect(result({ value: v => v })).toEqual({});

			});

			it("returns value for resource with entries", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "Alice" }, { shape });
				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

			it("returns value for resource with id", async () => {

				const shape = resource({ id: id() });

				const result = validate({ id: "app:/users/123" }, { shape });
				expect(result({ value: v => v })).toEqual({ id: "app:/users/123" });

			});

			it("returns value for resource with type", async () => {

				const shape = resource({ class: "app:/types/Person" }, { type: type() });

				const result = validate({ type: "app:/types/Person" }, { shape });
				expect(result({ value: v => v })).toEqual({ type: "app:/types/Person" });

			});

			it.each([
				["null", null],
				["undefined", undefined],
				["string", "not a resource"],
				["array", [{ name: "Alice" }]]
			])("returns trace for %s", async (_label, value) => {

				const shape = resource({});
				const result = validate(value, { shape });

				expect(result({ trace: t => t })).toBeDefined();

			});

		});

		describe("entry", () => {

			it("accepts resource when id matches entry", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const result = validate({ id: "app:/users/1", name: "Alice" }, { shape, entry: "app:/users/1" });

				expect(result({ value: v => v })).toEqual({ id: "app:/users/1", name: "Alice" });

			});

			it("rejects resource when id does not match entry", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const result = validate({ id: "app:/users/2", name: "Alice" }, { shape, entry: "app:/users/1" });

				expect(result({ trace: t => t })).toBeDefined();

			});

			it("ignores entry when resource has no id property", async () => {

				const shape = resource({ name: required(string()) });
				const result = validate({ name: "Alice" }, { shape, entry: "app:/users/1" });

				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

			it("ignores entry when resource id is undefined", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const result = validate({ name: "Alice" }, { shape, entry: "app:/users/1" });

				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

			it("accepts resource when entry is not provided", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const result = validate({ id: "app:/users/1", name: "Alice" }, { shape });

				expect(result({ value: v => v })).toEqual({ id: "app:/users/1", name: "Alice" });

			});

		});

		describe("return behaviour", () => {

			it("returns a new reference on success", async () => {

				const shape = resource({ name: required(string()) });
				const value = { name: "Alice" };

				const result = validate(value, { shape })({ value: v => v });

				expect(result).not.toBe(value);
				expect(result).toEqual(value);

			});

			it("returns an immutable value on success", async () => {

				const shape = resource({ name: required(string()) });

				const result = validate({ name: "Alice" }, { shape })({ value: v => v });

				expect(() => {
					(result as any).name = "Bob";
				}).toThrow();

			});

		});

		describe("branding", () => {

			it("skips validation for resource already validated with same scope", async () => {

				const shape = resource({
					name: required(string())
				});

				// first validation should succeed and brand the resource

				const value = { name: "Alice" };
				const first = validate(value, { shape });
				const branded = first({ value: v => v });

				// second validation with same scope should return the same branded resource

				const second = validate(branded, { shape });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("revalidates when shape changes", async () => {

				const shapeA = resource({
					name: required(string())
				});

				const shapeB = resource({
					name: required(string({ model: "x", minLength: 1 }))
				});

				const value = { name: "Alice" };
				const first = validate(value, { shape: shapeA });
				const branded = first({ value: v => v });

				// same scope but different shape should revalidate

				const second = validate(branded, { shape: shapeB });
				const revalidated = second({ value: v => v });

				expect(revalidated).not.toBe(branded);

			});

			it("revalidates when scope changes from template to resource", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape });
				const branded = first({ value: v => v });

				const second = validate(branded, { shape });
				const revalidated = second({ value: v => v });

				expect(revalidated).not.toBe(branded);

			});

			it("does not brand on validation failure", async () => {

				const shape = resource({
					name: required(string())
				});

				// invalid resource should not be branded

				const invalid = validate({}, { shape });
				expect(invalid({ trace: t => t })).toBeDefined();

			});

			it("revalidates when entry changes", async () => {

				const shape = resource({ id: id(), name: required(string()) });

				const value = { id: "app:/users/1", name: "Alice" };
				const first = validate(value, { shape, entry: "app:/users/1" });
				const branded = first({ value: v => v });

				// different entry should revalidate

				const second = validate(branded, { shape, entry: "app:/users/2" });
				expect(second({ trace: t => t })).toBeDefined();

			});

			it("revalidates when entry is added", async () => {

				const shape = resource({ id: id(), name: required(string()) });

				const value = { id: "app:/users/1", name: "Alice" };
				const first = validate(value, { shape });
				const branded = first({ value: v => v });

				// adding entry should revalidate

				const second = validate(branded, { shape, entry: "app:/users/2" });
				expect(second({ trace: t => t })).toBeDefined();

			});

			it("skips validation when entry matches previous", async () => {

				const shape = resource({ id: id(), name: required(string()) });

				const value = { id: "app:/users/1", name: "Alice" };
				const first = validate(value, { shape, entry: "app:/users/1" });
				const branded = first({ value: v => v });

				// same entry should skip revalidation

				const second = validate(branded, { shape, entry: "app:/users/1" });
				expect(second({ value: v => v })).toBe(branded);

			});

		});

		describe("rejects missing required property", () => {

			it("rejects missing required property", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({}, { shape });
				expect(result({ trace: t => t })).toBeDefined();

			});

		});

		describe("union values", () => {

			const PostalAddress = resource({
				id: id(),
				street: required(string()),
				city: required(string())
			});

			const Contact = resource({
				address: optional(union(
					string(),
					reference(PostalAddress, { captive: true })
				))
			});


			it("accepts a string variant value", async () => {

				const result = validate({ address: "123 Main St" }, { shape: Contact });
				expect(result({ value: v => v })).toEqual({ address: "123 Main St" });

			});

			it("accepts a reference variant value", async () => {

				const result = validate({
					address: { street: "12 Harbour St", city: "Copenhagen" }
				}, { shape: Contact });

				expect(result({ value: v => v })).toEqual({
					address: { street: "12 Harbour St", city: "Copenhagen" }
				});

			});

			it("rejects a value matching no variant", async () => {

				const result = validate({ address: 42 }, { shape: Contact });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("rejects a reference variant value with an invalid embedded resource", async () => {

				const result = validate({ address: { street: "12 Harbour St" } }, { shape: Contact });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts absent optional union property", async () => {

				const result = validate({}, { shape: Contact });
				expect(result({ value: v => v })).toEqual({});

			});

			it("accepts a keyed union placeholder matching several branches", async () => {

				const Coded = resource({ code: required(union(string(), string())) });

				const result = validate({ code: { "0": "" } }, { model: true, shape: Coded });

				expect(result({ value: () => "ok", trace: () => "err" })).toBe("ok");

			});

		});

		describe("depth idempotency", () => {

			const Inner = resource({ id: id(), label: required(string()) });

			const shape = resource({
				child: optional(reference(Inner, { captive: true }))
			});

			const value = { child: { id: "app:/inner/1", label: "x" } };

			it("skips validation when depth was stricter and is now relaxed", async () => {

				const branded = validate(value, { shape, depth: 1 })({ value: v => v });

				expect(validate(branded, { shape, depth: 3 })({ value: v => v })).toBe(branded);

			});

			it("skips validation when depth was limited and is now omitted", async () => {

				const branded = validate(value, { shape, depth: 1 })({ value: v => v });

				expect(validate(branded, { shape })({ value: v => v })).toBe(branded);

			});

			it("revalidates when depth was relaxed and is now stricter", async () => {

				const branded = validate(value, { shape, depth: 3 })({ value: v => v });

				expect(validate(branded, { shape, depth: 1 })({ value: v => v })).not.toBe(branded);

			});

			it("revalidates and rejects when depth was omitted and is now zero", async () => {

				const branded = validate(value, { shape })({ value: v => v });

				expect(validate(branded, { shape, depth: 0 })({ trace: t => t })).toBeDefined();

			});

		});


		describe("lazy shapes", () => {

			it("resolves factory function before validation", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "Alice" }, { shape: () => shape });
				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

			it("caches resolved factory result", async () => {

				const shape = resource({
					name: required(string())
				});

				const factory = () => shape;

				const first = validate({ name: "Alice" }, { shape: factory });
				const branded = first({ value: v => v });

				const second = validate(branded, { shape: factory });
				expect(second({ value: v => v })).toBe(branded);

			});

		});

		describe("local shorthand on scalar cardinality", () => {

			it("accepts local object shorthand on optional property", async () => {

				const shape = resource({ label: optional(dictionary()) });
				const result = validate({ label: { en: "hello" } }, { shape });

				expect(result({ value: v => v })).toEqual({ label: { en: "hello" } });

			});

		});

		describe("localised tag map on multi cardinality", () => {

			it("accepts tag map with array-valued tag on multi property", async () => {

				const shape = resource({ labels: multiple(dictionary()) });
				const result = validate({ labels: { en: ["hello"] } }, { shape });

				expect(result({ value: v => v })).toEqual({ labels: { en: ["hello"] } });

			});

		});

		describe("arbitrary JSON hardening", () => {

			const shape = resource({ name: optional(string()) });

			it("returns trace for non-plain objects", async () => {

				expect(validate(new Date(), { shape })({ trace: t => t })).toBeDefined();
				expect(validate(/regex/, { shape })({ trace: t => t })).toBeDefined();
				expect(validate(new Map(), { shape })({ trace: t => t })).toBeDefined();
				expect(validate(new Set(), { shape })({ trace: t => t })).toBeDefined();
				expect(validate(new Error("boom"), { shape })({ trace: t => t })).toBeDefined();
				expect(validate(Object.create(null), { shape })({ trace: t => t })).toBeDefined();

				class Custom {name = "Alice";}

				expect(validate(new Custom(), { shape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for functions, symbols, bigints as input", async () => {

				expect(validate(() => {}, { shape })({ trace: t => t })).toBeDefined();
				expect(validate(Symbol("x"), { shape })({ trace: t => t })).toBeDefined();
				expect(validate(BigInt(1), { shape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for non-identifier top-level keys", async () => {

				expect(validate({ "foo-bar": "x" }, { shape })({ trace: t => t })).toBeDefined();
				expect(validate({ "foo.bar": "x" }, { shape })({ trace: t => t })).toBeDefined();
				expect(validate({ "@id": "x" }, { shape })({ trace: t => t })).toBeDefined();
				expect(validate({ "ns:prop": "x" }, { shape })({ trace: t => t })).toBeDefined();
				expect(validate({ "123": "x" }, { shape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for function, symbol, bigint property values", async () => {

				expect(validate({ name: () => {} }, { shape })({ trace: t => t })).toBeDefined();
				expect(validate({ name: Symbol("s") }, { shape })({ trace: t => t })).toBeDefined();
				expect(validate({ name: BigInt(1) }, { shape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for non-finite numbers as property values", async () => {

				const numShape = resource({ price: optional(integer()) });

				expect(validate({ price: Number.NaN }, { shape: numShape })({ trace: t => t })).toBeDefined();
				expect(validate({ price: Number.POSITIVE_INFINITY }, { shape: numShape })({ trace: t => t })).toBeDefined();
				expect(validate({ price: Number.NEGATIVE_INFINITY }, { shape: numShape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for non-plain objects nested as property values", async () => {

				expect(validate({ name: new Date() }, { shape })({ trace: t => t })).toBeDefined();
				expect(validate({ name: /regex/ }, { shape })({ trace: t => t })).toBeDefined();
				expect(validate({ name: new Map() }, { shape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for invalid structures nested inside arrays", async () => {

				const arrShape = resource({ tags: repeatable(string()) });

				expect(validate({ tags: [null] }, { shape: arrShape })({ trace: t => t })).toBeDefined();
				expect(validate({ tags: [undefined] }, { shape: arrShape })({ trace: t => t })).toBeDefined();
				expect(validate({ tags: [new Date()] }, { shape: arrShape })({ trace: t => t })).toBeDefined();
				expect(validate({ tags: [Number.NaN] }, { shape: arrShape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for invalid structures nested inside sub-resources", async () => {

				const Inner = resource({ label: optional(string()) });
				const nested = resource({ child: optional(reference(Inner)) });

				expect(validate({ child: { "bad-key": "x" } }, { shape: nested })({ trace: t => t })).toBeDefined();
				expect(validate({ child: new Date() }, { shape: nested })({ trace: t => t })).toBeDefined();

			});

			it("accepts JSON.parse output of a valid resource", async () => {

				const shape = resource({
					name: required(string()),
					price: optional(integer()),
					available: optional(boolean()),
					tags: repeatable(string())
				});

				const json = JSON.stringify({
					name: "Widget",
					price: 30,
					available: true,
					tags: ["a", "b"]
				});

				expect(validate(JSON.parse(json), { shape })({ value: v => v }))
					.toEqual({ name: "Widget", price: 30, available: true, tags: ["a", "b"] });

			});

			describe("prototype pollution resilience", () => {

				it("returns trace for JSON-parsed __proto__ own property when not declared by shape", async () => {

					// JSON.parse creates __proto__ as an own property, not the prototype. It is a valid
					// identifier, so it iterates like any other key and gets caught by closed-shape checks.
					const parsed = JSON.parse("{\"__proto__\": \"value\"}");

					expect(validate(parsed, { shape })({ trace: t => t })).toBeDefined();

				});

				it("returns trace for objects with non-plain prototype even if keys look valid", async () => {

					const weird: Record<string, unknown> = Object.create({ name: "inherited" });
					weird.name = "own";

					expect(validate(weird, { shape })({ trace: t => t })).toBeDefined();

				});

			});

		});

	});

	describe("validate (projection)", () => {

		describe("partial resources", () => {

			it("accepts response omitting shape-required field absent from model", async () => {

				const shape = resource({
					name: required(string()),
					price: required(integer())
				});

				const model = { price: 0 };
				const result = validate({ price: 42 }, { shape, model });

				expect(result({ value: v => v })).toEqual({ price: 42 });

			});

			it("accepts response omitting multiple shape-required fields absent from model", async () => {

				const shape = resource({
					a: required(string()),
					b: required(string()),
					c: required(integer())
				});

				const model = { c: 0 };
				const result = validate({ c: 1 }, { shape, model });

				expect(result({ value: v => v })).toEqual({ c: 1 });

			});

			it("rejects response missing a projected required field", async () => {

				const shape = resource({
					name: required(string()),
					price: required(integer())
				});

				const model = { name: "", price: 0 };
				const result = validate({ name: "Widget" }, { shape, model });

				expect(result({ trace: t => t })).toBeDefined();

			});

			it("rejects wrong type for a projected field", async () => {

				const shape = resource({
					name: required(string()),
					price: required(integer())
				});

				const model = { name: "", price: 0 };
				const result = validate({ name: "Widget", price: "NaN" }, { shape, model });

				expect(result({ trace: t => t })).toBeDefined();

			});

			it("rejects projected field violating a value constraint", async () => {

				const shape = resource({
					name: required(string({ model: "ab", minLength: 2 }))
				});

				const model = { name: "" };
				const result = validate({ name: "x" }, { shape, model });

				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts projected field satisfying a value constraint", async () => {

				const shape = resource({
					name: required(string({ model: "ab", minLength: 2 }))
				});

				const model = { name: "" };
				const result = validate({ name: "abc" }, { shape, model });

				expect(result({ value: v => v })).toEqual({ name: "abc" });

			});

			it("rejects array value for a projected scalar field", async () => {

				const shape = resource({
					name: required(string())
				});

				const model = { name: "" };
				const result = validate({ name: ["one", "two"] }, { shape, model });

				expect(result({ trace: t => t })).toBeDefined();

			});

			it("rejects empty array for a projected repeatable field", async () => {

				const shape = resource({
					tags: repeatable(string())
				});

				const model = { tags: [""] };
				const result = validate({ tags: [] }, { shape, model });

				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts projected optional field absent from value", async () => {

				const shape = resource({
					name: required(string()),
					note: optional(string())
				});

				const model = { name: "", note: "" };
				const result = validate({ name: "Alice" }, { shape, model });

				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

			it("rejects property not declared in shape", async () => {

				const shape = resource({
					name: required(string())
				});

				const model = { name: "" };
				const result = validate({ name: "Alice", stray: "x" }, { shape, model });

				expect(result({ trace: t => t })).toBeDefined();

			});

		});

		describe("expanded nested references", () => {

			const Inner = resource({
				id: id(),
				label: required(string()),
				hidden: required(string())
			});

			it("accepts bare IRI for reference slot", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				const model = { child: "" };
				const result = validate({ child: "app:/inner/1" }, { shape, model });

				expect(result({ value: v => v })).toEqual({ child: "app:/inner/1" });

			});

			it("accepts expanded nested resource for reference slot", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				const model = { child: { id: "", label: "" } };
				const result = validate(
					{ child: { id: "app:/inner/1", label: "x" } },
					{ shape, model }
				);

				expect(result({ value: v => v })).toEqual({
					child: { id: "app:/inner/1", label: "x" }
				});

			});

			it("narrows nested validation to the nested projection in model", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				const model = { child: { label: "" } };
				const result = validate({ child: { label: "x" } }, { shape, model });

				expect(result({ value: v => v })).toEqual({ child: { label: "x" } });

			});

			it("rejects expanded nested resource violating a projected nested field", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				const model = { child: { label: "" } };
				const result = validate({ child: { label: 42 } }, { shape, model });

				expect(result({ trace: t => t })).toBeDefined();

			});

			it("rejects expanded nested resource missing a projected required field", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				const model = { child: { label: "" } };
				const result = validate({ child: {} }, { shape, model });

				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts repeatable reference with mixed IRI and expanded resource", async () => {

				const shape = resource({
					items: repeatable(reference(Inner))
				});

				const model = { items: [{ label: "" }] };
				const result = validate({
					items: [
						"app:/inner/1",
						{ label: "x" }
					]
				}, { shape, model });

				expect(result({ value: v => v })).toEqual({
					items: ["app:/inner/1", { label: "x" }]
				});

			});

			it("rejects expanded nested resource with property not declared in target shape", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				const model = { child: { label: "" } };
				const result = validate(
					{ child: { label: "x", stray: true } },
					{ shape, model }
				);

				expect(result({ trace: t => t })).toBeDefined();

			});

		});

		describe("entry", () => {

			it("accepts resource when id matches entry", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const model = { id: "", name: "" };

				const result = validate(
					{ id: "app:/users/1", name: "Alice" },
					{ shape, model, entry: "app:/users/1" }
				);

				expect(result({ value: v => v })).toEqual({ id: "app:/users/1", name: "Alice" });

			});

			it("rejects resource when id does not match entry", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const model = { id: "", name: "" };

				const result = validate(
					{ id: "app:/users/2", name: "Alice" },
					{ shape, model, entry: "app:/users/1" }
				);

				expect(result({ trace: t => t })).toBeDefined();

			});

			it("ignores entry when resource has no id property", async () => {

				const shape = resource({ id: id(), name: required(string()) });
				const model = { name: "" };

				const result = validate(
					{ name: "Alice" },
					{ shape, model, entry: "app:/users/1" }
				);

				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

		});

		describe("return behaviour", () => {

			it("returns a new reference on success", async () => {

				const shape = resource({ name: required(string()) });
				const model = { name: "" };
				const value = { name: "Alice" };

				const result = validate(value, { shape, model })({ value: v => v });

				expect(result).not.toBe(value);
				expect(result).toEqual(value);

			});

			it("returns an immutable value on success", async () => {

				const shape = resource({ name: required(string()) });
				const model = { name: "" };

				const result = validate({ name: "Alice" }, { shape, model })({ value: v => v });

				expect(() => {
					(result as any).name = "Bob";
				}).toThrow();

			});

			it("returns trace on failure", async () => {

				const shape = resource({ name: required(string()) });
				const model = { name: "" };

				const result = validate({ name: 42 }, { shape, model });

				expect(result({ trace: t => t })).toBeDefined();

			});

			it.each([
				["null", null],
				["undefined", undefined],
				["string", "not a resource"],
				["array", [{ name: "Alice" }]]
			])("returns trace for %s", async (_label, value) => {

				const shape = resource({ name: required(string()) });
				const model = { name: "" };

				const result = validate(value, { shape, model });

				expect(result({ trace: t => t })).toBeDefined();

			});

		});

		describe("branding", () => {

			it("skips validation for resource already validated with same (shape, model)", async () => {

				const shape = resource({ name: required(string()) });
				const model = { name: "" };

				const value = { name: "Alice" };
				const first = validate(value, { shape, model });
				const branded = first({ value: v => v });

				const second = validate(branded, { shape, model });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("revalidates when model changes", async () => {

				const shape = resource({
					name: required(string()),
					age: optional(integer())
				});

				const modelA = { name: "" };
				const modelB = { name: "", age: 0 };

				const first = validate({ name: "Alice" }, { shape, model: modelA });
				const branded = first({ value: v => v });

				const second = validate(branded, { shape, model: modelB });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("revalidates when shape changes", async () => {

				const shapeA = resource({ name: required(string()) });
				const shapeB = resource({ name: required(string({ model: "x", minLength: 1 })) });
				const model = { name: "" };

				const first = validate({ name: "Alice" }, { shape: shapeA, model });
				const branded = first({ value: v => v });

				const second = validate(branded, { shape: shapeB, model });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("rejects projection-branded value re-validated under the bonded-shape overload", async () => {

				// a projection-validated value is a partial resource; re-validating under the
				// bonded-shape overload must not trust the projection brand, since unrequested
				// required fields may be missing

				const shape = resource({
					name: required(string()),
					hidden: required(string())
				});

				const model = { name: "" };

				const first = validate({ name: "Alice" }, { shape, model });
				const branded = first({ value: v => v });

				const second = validate(branded, { shape });
				expect(second({ trace: t => t })).toBeDefined();

			});

		});

		describe("lazy shapes", () => {

			it("resolves factory function before validation", async () => {

				const shape = resource({ name: required(string()) });
				const model = { name: "" };

				const result = validate({ name: "Alice" }, { shape: () => shape, model });

				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

			it("caches resolved factory result", async () => {

				const shape = resource({ name: required(string()) });
				const model = { name: "" };
				const factory = () => shape;

				const first = validate({ name: "Alice" }, { shape: factory, model });
				const branded = first({ value: v => v });

				const second = validate(branded, { shape: factory, model });
				expect(second({ value: v => v })).toBe(branded);

			});

		});

	});

	describe("validate (template)", () => {

		describe("return behaviour", () => {

			it("returns a new reference on success", async () => {

				const shape = resource({ name: required(string()) });
				const model = { name: "Alice" };

				const result = validate(model, { model: true, shape })({ value: v => v });

				expect(result).not.toBe(model);
				expect(result).toEqual(model);

			});

			it("returns an immutable model on success", async () => {

				const shape = resource({ name: required(string()) });

				const result = validate({}, { model: true, shape })({ value: v => v });

				expect(() => {
					(result as any).name = [true];
				}).toThrow();

			});

		});

		describe("branding", () => {

			it("revalidates when scope changes from resource to template", async () => {

				const shape = resource({
					name: required(string())
				});

				// first validation with sealResource

				const value = { name: "Alice" };
				const first = validate(value, { shape });
				const branded = first({ value: v => v });

				// second validation with sealTemplate should revalidate

				const second = validate(branded, { model: true, shape });
				const revalidated = second({ value: v => v });

				expect(revalidated).not.toBe(branded);

			});

			it("skips validation for template already validated with same shape", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: [true] };
				const first = validate(value, { model: true, shape });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("skips validation when plain was true and is now false", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape, plain: true });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, plain: false });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("skips validation when plain was true and is now omitted", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape, plain: true });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("revalidates when plain was false and is now true", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape, plain: false });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, plain: true });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("revalidates when plain was omitted and is now true", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, plain: true });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("skips validation when depth was stricter and is now relaxed", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const value = { child: { label: "x" } };
				const first = validate(value, { model: true, shape, depth: 1 });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, depth: 3 });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("skips validation when depth was limited and is now omitted", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const value = { child: { label: "x" } };
				const first = validate(value, { model: true, shape, depth: 2 });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("revalidates when depth was relaxed and is now stricter", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const value = { child: { label: "x" } };
				const first = validate(value, { model: true, shape, depth: 5 });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, depth: 2 });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("revalidates when depth was omitted and is now limited", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const value = { child: { label: "x" } };
				const first = validate(value, { model: true, shape });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, depth: 1 });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("revalidates when shape changes", async () => {

				const shapeA = resource({
					name: required(string())
				});

				const shapeB = resource({
					name: required(string({ model: "x", minLength: 1 }))
				});

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape: shapeA });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape: shapeB });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("skips validation when limit was stricter and is now relaxed", async () => {

				const shape = resource({ name: required(string()) });

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape, limit: 50 });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, limit: 100 });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("skips validation when limit was set and is now omitted", async () => {

				const shape = resource({ name: required(string()) });

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape, limit: 50 });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("revalidates when limit was relaxed and is now stricter", async () => {

				const shape = resource({ name: required(string()) });

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape, limit: 100 });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, limit: 50 });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("revalidates when limit was omitted and is now set", async () => {

				const shape = resource({ name: required(string()) });

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, limit: 50 });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			// a `limit` of 0 means unbounded: it ranks above any finite cap, so it is the
			// most permissive limit for the short-circuit monotonicity check

			it("skips validation when limit was finite and is now unbounded via zero", async () => {

				const shape = resource({ name: required(string()) });

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape, limit: 50 });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, limit: 0 });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("skips validation when limit was unbounded via zero and is now omitted", async () => {

				const shape = resource({ name: required(string()) });

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape, limit: 0 });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("skips validation when both limits are unbounded via zero", async () => {

				const shape = resource({ name: required(string()) });

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape, limit: 0 });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, limit: 0 });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("revalidates when limit was unbounded via zero and is now finite", async () => {

				const shape = resource({ name: required(string()) });

				const value = { name: "Alice" };
				const first = validate(value, { model: true, shape, limit: 0 });
				const branded = first({ value: v => v });

				const second = validate(branded, { model: true, shape, limit: 50 });
				expect(second({ value: v => v })).not.toBe(branded);

			});

		});

		describe("accepts missing required property", () => {

			it("accepts missing required property", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({}, { model: true, shape });
				expect(result({ value: v => v })).toEqual({});

			});

		});


		describe("limit post-processing", () => {

			it("injects # into nested query when limit is set and # is absent", async () => {

				const Target = resource({ name: required(string()) });
				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{ name: "" }] }, { model: true, shape, limit: 50 });
				expect(result({ value: v => v })).toEqual({ items: [{ name: "" }, { "#": 50 }] });

			});

			it("preserves existing # when within limit", async () => {

				const Target = resource({ name: required(string()) });
				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{}, { "#": 25 }] }, { model: true, shape, limit: 50 });
				expect(result({ value: v => v })).toEqual({ items: [{}, { "#": 25 }] });

			});

			it("does not inject # when limit is not set", async () => {

				const Target = resource({ name: required(string()) });
				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{ name: "" }] }, { model: true, shape });
				expect(result({ value: v => v })).toEqual({ items: [{ name: "" }] });

			});

			it("rejects a client # exceeding the limit", async () => {

				const Target = resource({ name: required(string()) });
				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{}, { "#": 101 }] }, { model: true, shape, limit: 100 });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("rejects a client # of zero as unbounded under a limit", async () => {

				const Target = resource({ name: required(string()) });
				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{}, { "#": 0 }] }, { model: true, shape, limit: 100 });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts a client # within the limit", async () => {

				const Target = resource({ name: required(string()) });
				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{}, { "#": 100 }] }, { model: true, shape, limit: 100 });
				expect(result({ value: v => v })).toEqual({ items: [{}, { "#": 100 }] });

			});

			it("injects # recursively into nested queries", async () => {

				const Inner = resource({ label: required(string()) });
				const Outer = resource({ children: multiple(reference(Inner)) });
				const shape = resource({ items: multiple(reference(Outer)) });

				const result = validate({ items: [{ children: [{ label: "" }] }] }, {
					model: true,
					shape,
					limit: 30,
					depth: 3
				});
				expect(result({ value: v => v })).toEqual({ items: [{ children: [{ label: "" }, { "#": 30 }] }, { "#": 30 }] });

			});

			it("does not inject # into non-query values", async () => {

				const shape = resource({ name: required(string()), age: optional(integer()) });

				const result = validate({ name: "Alice", age: 30 }, { model: true, shape, limit: 50 });
				expect(result({ value: v => v })).toEqual({ name: "Alice", age: 30 });

			});

			it("injects # on bare-scalar collection", async () => {

				const shape = resource({ tags: multiple(string()) });

				const result = validate({ tags: [""] }, { model: true, shape, limit: 50 });
				expect(result({ value: v => v })).toEqual({ tags: ["", { "#": 50 }] });

			});

			it("preserves localised tag map collection", async () => {

				const shape = resource({ labels: multiple(dictionary()) });

				const result = validate({ labels: { en: ["hello"] } }, { model: true, shape, limit: 50 });
				expect(result({ value: v => v })).toEqual({ labels: { en: ["hello"] } });

			});

			it("injects # on indexed-union collection wrapper", async () => {

				const A = resource({ name: required(string()) });
				const B = resource({ title: required(string()) });
				const shape = resource({ items: multiple(union(A, B)) });

				const result = validate(
					{ items: [{ "0": { name: "" }, "1": { title: "" } }] },
					{ model: true, shape, limit: 50 }
				);
				expect(result({ value: v => v })).toEqual({
					items: [{ "0": { name: "" }, "1": { title: "" } }, { "#": 50 }]
				});

			});

			it("injects # into nested collection when wrapper already specifies #", async () => {

				const Inner = resource({ label: required(string()) });
				const Outer = resource({ children: multiple(reference(Inner)) });
				const shape = resource({ items: multiple(reference(Outer)) });

				const result = validate(
					{ items: [{ children: [{ label: "" }] }, { "#": 25 }] },
					{ model: true, shape, limit: 50, depth: 3 }
				);
				expect(result({ value: v => v })).toEqual({
					items: [{ children: [{ label: "" }, { "#": 50 }] }, { "#": 25 }]
				});

			});

			it("does not descend into selection-operator payloads", async () => {

				const Target = resource({ name: required(string()), age: optional(integer()) });
				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate(
					{ items: [{ name: "" }, { "?age": [18, 21] }] },
					{ model: true, shape, limit: 50 }
				);
				expect(result({ value: v => v })).toEqual({
					items: [{ name: "" }, { "?age": [18, 21], "#": 50 }]
				});

			});

		});

		describe("model mode", () => {

			it("returns value for valid model", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "Alice" }, { model: true, shape });
				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

			it("returns value for empty model", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({}, { model: true, shape });
				expect(result({ value: v => v })).toEqual({});

			});

			it("accepts nested model via reference when depth is omitted (defaults to null)", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const result = validate({ child: { label: "x" } }, { model: true, shape });
				expect(result({ value: v => v })).toEqual({ child: { label: "x" } });

			});

			it("accepts nested model via reference when depth is null", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const result = validate({ child: { label: "x" } }, { model: true, shape });
				expect(result({ value: v => v })).toEqual({ child: { label: "x" } });

			});

			it("accepts nested model via reference when depth is 1", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const result = validate({ child: { label: "x" } }, { model: true, shape, depth: 1 });
				expect(result({ value: v => v })).toEqual({ child: { label: "x" } });

			});

			it("accepts aggregate binding when plain is omitted (defaults to false)", async () => {

				const Target = resource({
					price: optional(integer())
				});

				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{ "total=count:": 0 }] }, { model: true, shape });
				expect(result({ value: v => v })).toEqual({ items: [{ "total=count:": 0 }] });

			});

			it("accepts aggregate binding when plain is false", async () => {

				const Target = resource({
					price: optional(integer())
				});

				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{ "total=count:": 0 }] }, { model: true, shape, plain: false });
				expect(result({ value: v => v })).toEqual({ items: [{ "total=count:": 0 }] });

			});

			it("rejects aggregate binding when plain is true", async () => {

				const shape = resource({
					price: optional(integer())
				});

				const result = validate({ "total=count:": 0 }, { model: true, shape, plain: true });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts non-aggregate binding when plain is true", async () => {

				const Target = resource({
					released: optional(date())
				});

				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{ "y=year:released": 0 }] }, { model: true, shape, plain: true });
				expect(result({ value: v => v })).toEqual({ items: [{ "y=year:released": 0 }] });

			});

			it("accepts plain property when plain is true", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "" }, { model: true, shape, plain: true });
				expect(result({ value: v => v })).toEqual({ name: "" });

			});

		});

		describe("lazy shapes", () => {

			it("resolves factory for model mode", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "Alice" }, { model: true, shape: () => shape });
				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

		});

		describe("arbitrary JSON hardening", () => {

			const shape = resource({ name: optional(string()) });

			it("returns trace for non-plain objects", async () => {

				expect(validate(new Date(), { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate(/regex/, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate(new Map(), { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate(new Set(), { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate(new Error("boom"), { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate(Object.create(null), { model: true, shape })({ trace: t => t })).toBeDefined();

				class Custom {name = "";}

				expect(validate(new Custom(), { model: true, shape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for null, undefined, strings, arrays, primitives", async () => {

				expect(validate(null, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate(undefined, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate("not a template", { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate([{ name: "" }], { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate(42, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate(true, { model: true, shape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for functions, symbols, bigints as input", async () => {

				expect(validate(() => {}, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate(Symbol("x"), { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate(BigInt(1), { model: true, shape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for non-identifier top-level keys", async () => {

				expect(validate({ "foo-bar": "" }, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate({ "foo.bar": "" }, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate({ "@id": "" }, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate({ "123": "" }, { model: true, shape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for non-finite number placeholders", async () => {

				const numShape = resource({ price: optional(integer()) });

				expect(validate({ price: Number.NaN }, {
					model: true,
					shape: numShape
				})({ trace: t => t })).toBeDefined();
				expect(validate({ price: Number.POSITIVE_INFINITY }, {
					model: true,
					shape: numShape
				})({ trace: t => t })).toBeDefined();
				expect(validate({ price: Number.NEGATIVE_INFINITY }, {
					model: true,
					shape: numShape
				})({ trace: t => t })).toBeDefined();

			});

			it("returns trace for function, symbol, bigint placeholder values", async () => {

				expect(validate({ name: () => {} }, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate({ name: Symbol("s") }, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate({ name: BigInt(1) }, { model: true, shape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for non-plain objects nested as placeholder values", async () => {

				expect(validate({ name: new Date() }, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate({ name: /regex/ }, { model: true, shape })({ trace: t => t })).toBeDefined();
				expect(validate({ name: new Map() }, { model: true, shape })({ trace: t => t })).toBeDefined();

			});

			it("returns trace for invalid singleton-tuple structures", async () => {

				const arrShape = resource({ tags: repeatable(string()) });

				expect(validate({ tags: [null] }, { model: true, shape: arrShape })({ trace: t => t })).toBeDefined();
				expect(validate({ tags: [] }, { model: true, shape: arrShape })({ trace: t => t })).toBeDefined();
				expect(validate({ tags: ["a", "b"] }, {
					model: true,
					shape: arrShape
				})({ trace: t => t })).toBeDefined();
				expect(validate({ tags: [new Date()] }, {
					model: true,
					shape: arrShape
				})({ trace: t => t })).toBeDefined();

			});

			it("returns trace for non-identifier keys nested in sub-templates", async () => {

				const Inner = resource({ label: optional(string()) });
				const nested = resource({ child: optional(reference(Inner)) });

				expect(validate({ child: { "bad-key": "" } }, {
					model: true,
					shape: nested
				})({ trace: t => t })).toBeDefined();

			});

			it("returns trace when depth=0 is combined with a nested template", async () => {

				const Inner = resource({ label: required(string()) });
				const parent = resource({ child: optional(reference(Inner)) });

				expect(validate({ child: { label: "" } }, {
					model: true,
					shape: parent,
					depth: 0
				})({ trace: t => t })).toBeDefined();

			});

			it("accepts IRI reference when depth=0", async () => {

				const Inner = resource({ label: required(string()) });
				const parent = resource({ child: optional(reference(Inner)) });

				const result = validate({ child: "app:/things/1" }, { model: true, shape: parent, depth: 0 });
				expect(result({ value: v => v })).toEqual({ child: "app:/things/1" });

			});

			it("returns trace when # selection exceeds limit", async () => {

				const Target = resource({ name: required(string()) });
				const parent = resource({ items: multiple(reference(Target)) });

				expect(validate({ items: [{ "#": 100 }] }, {
					model: true,
					shape: parent,
					limit: 50
				})({ trace: t => t }))
					.toBeDefined();

			});

			it("returns trace for aggregate binding when plain is true", async () => {

				const Target = resource({ price: optional(integer()) });
				const parent = resource({ items: multiple(reference(Target)) });

				expect(validate({ items: [{ "total=count:": 0 }] }, {
					model: true,
					shape: parent,
					plain: true
				})({ trace: t => t }))
					.toBeDefined();

			});

			it("accepts JSON.parse output of a valid template", async () => {

				const Vendor = resource({ id: id(), name: required(string()) });
				const parent = resource({
					id: id(),
					name: required(string()),
					price: optional(integer()),
					tags: repeatable(string()),
					vendor: optional(reference(Vendor))
				});

				const json = JSON.stringify({
					id: "",
					name: "",
					price: 0,
					tags: [""],
					vendor: { id: "", name: "" }
				});

				expect(validate(JSON.parse(json), { model: true, shape: parent })({ value: v => v })).toBeDefined();

			});

			describe("prototype pollution resilience", () => {

				it("returns trace for objects with non-plain prototype even if keys look valid", async () => {

					const weird: Record<string, unknown> = Object.create({ name: "inherited" });
					weird.name = "";

					expect(validate(weird, { model: true, shape })({ trace: t => t })).toBeDefined();

				});

				it("accepts JSON-parsed __proto__ own property as an ordinary identifier key", async () => {

					// Template mode rejects unknown identifier keys with an "undefined property path" trace.
					// __proto__ is a valid ECMAScript identifier and iterates as an own property, so it
					// must be handled uniformly with any other identifier rather than leaking into the
					// shape prototype chain.
					const parsed = JSON.parse("{\"__proto__\": \"\"}");

					expect(() => validate(parsed, { model: true, shape })).not.toThrow();

				});

			});

		});

	});

});
