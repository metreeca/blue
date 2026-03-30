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
import { localised } from "./localised.js";
import { byte, decimal, double, float, int, integer, long, number, short } from "./number.js";
import { reference } from "./reference.js";
import { id, resource, type ResourceShape, type } from "./resource.js";
import { date, duration, instant, iri, string, time, timestamp, year } from "./string.js";
import {
	checkValues,
	materialize,
	mergeUnion,
	mergeValues,
	validateArrayUnion,
	validateScalarUnion,
	validateValue
} from "./value.core.js";
import {
	apply,
	cardinality,
	multiple,
	optional,
	repeatable,
	required,
	type SetShape,
	union,
	type UnionShape,
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

	});

});

describe("apply", () => {

	function probe(path: readonly string[], pipe: readonly Transform[] = []): Probe {
		return { target: path[path.length-1] ?? "_", pipe, path };
	}

	// transform-focused helpers: wrap leaf shape in a resource property

	function transformRange(pipe: readonly Transform[], s: ValuesShape): SetShape | undefined {
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

	describe("localised input", () => {

		it.each([
			["localised", localised()]
		])("accepts string-to-string transform on %s and preserves it", async (_label, s) => {

			expect(transformRange(["lower"], s)?.shape).toBe(s);

		});

		it.each([
			["localised", localised()]
		])("accepts string-to-string pipe on %s and preserves it", async (_label, s) => {

			expect(transformRange(["lower", "upper"], s)?.shape).toBe(s);

		});

		it.each([
			["localised", localised()]
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

		function pathRange(p: Probe, s: ReturnType<typeof resource>): SetShape | undefined {
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

		function probeRange(p: Probe, s: ReturnType<typeof resource>): SetShape | undefined {
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

		function probeRange(p: Probe, s: ResourceShape): SetShape | undefined {
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

			it("resolves id field with optional cardinality", async () => {

				const s = resource({
					rid: id(),
					name: required(string())
				});

				const result = probeRange(probe(["rid"]), s);

				expect(result?.minCount).toBeUndefined();
				expect(result?.maxCount).toBe(1);

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
					child: required(reference(Inner))
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
					child: required(reference(Inner))
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
			["localised", localised()]
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

describe("operators", () => {

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

			expect(trace).toBeDefined();
			expect(trace).toHaveProperty("{minCount/maxCount}");

		});

	});


	describe("validateValue", () => {

		it("returns undefined for valid local value", async () => {

			expect(validateValue([{ "en": "hello" }], localised())).toBeUndefined();

		});

		it("accepts plain string shorthand for local shape", async () => {

			expect(validateValue(["hello"], localised())).toBeUndefined();

		});

		it("rejects non-localised value for localised shape", async () => {

			expect(validateValue([42], localised())).toBeDefined();

		});

		it("returns undefined for valid localised array value", async () => {

			expect(validateValue([{ "en": ["hello"] }], localised())).toBeUndefined();

		});

		it("returns undefined for valid localised scalar value", async () => {

			expect(validateValue([{ "en": "hello" }], localised())).toBeUndefined();

		});

	});

	describe("validateScalarUnion", () => {

		it("accepts single indexed object matching variant shape", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateScalarUnion([{ text: "hello" }], shape)).toBeUndefined();
			expect(validateScalarUnion([{ num: 42 }], shape)).toBeUndefined();

		});

		it("rejects single indexed object with wrong value type", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateScalarUnion([{ text: 42 }], shape)).toBeDefined();

		});

		it("rejects non-identifier key with keyed trace", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateScalarUnion([{ "": "value" }], shape)).toHaveProperty("");

		});

		it("rejects unrecognised variant key with keyed trace", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateScalarUnion([{ unknown: "value" }], shape)).toHaveProperty("unknown");

		});

		it("rejects multiple variant keys", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateScalarUnion([{ text: "hello", num: 42 }], shape)).toBeDefined();

		});

		it("rejects unknown key mixed with valid key", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateScalarUnion([{ text: "hello", unknown: "value" }], shape)).toBeDefined();

		});

		it("accepts reference variant with valid value", async () => {

			const Target = resource({ name: required(string()) });
			const shape = union({ ref: reference(Target), text: string() });

			expect(validateScalarUnion([{ ref: { name: "test" } }], shape)).toBeUndefined();

		});

		it("rejects reference variant with invalid value", async () => {

			const Target = resource({ name: required(string()) });
			const shape = union({ ref: reference(Target), text: string() });

			expect(validateScalarUnion([{ ref: { name: 42 } }], shape)).toBeDefined();

		});

		it("accepts single empty object", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateScalarUnion([{}], shape)).toBeUndefined();

		});

		it("rejects array value for variant entry with keyed trace", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateScalarUnion([{ text: ["hello"] }], shape)).toHaveProperty("text");

		});

		it("rejects non-object values", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateScalarUnion(["hello"], shape)).toBeDefined();
			expect(validateScalarUnion([42], shape)).toBeDefined();

		});

		it("rejects multiple object values", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateScalarUnion([{ text: "hello" }, { num: 42 }], shape)).toBeDefined();

		});

	});

	describe("validateArrayUnion", () => {

		it("accepts single indexed object with variant arrays", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateArrayUnion([{ text: ["hello"], num: [42] }], shape)).toBeUndefined();

		});

		it("accepts variant entries with different array lengths", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateArrayUnion([{ text: ["hello", "world"], num: [42] }], shape)).toBeUndefined();

		});

		it("accepts single variant entry with array", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateArrayUnion([{ text: ["hello"] }], shape)).toBeUndefined();

		});

		it("rejects non-identifier key with keyed trace", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateArrayUnion([{ "": ["value"] }], shape)).toHaveProperty("");

		});

		it("rejects unrecognised variant key with keyed trace", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateArrayUnion([{ unknown: ["value"] }], shape)).toHaveProperty("unknown");

		});

		it("rejects unrecognised key mixed with valid keys", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateArrayUnion([{ text: ["hello"], unknown: ["value"] }], shape)).toHaveProperty("unknown");

		});

		it("rejects non-array variant entry", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateArrayUnion([{ text: "hello" }], shape)).toBeDefined();

		});

		it("rejects array entry with wrong value type", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateArrayUnion([{ text: [42] }], shape)).toBeDefined();

		});

		it("accepts reference variant with valid array", async () => {

			const Target = resource({ name: required(string()) });
			const shape = union({ ref: reference(Target), text: string() });

			expect(validateArrayUnion([{ ref: [{ name: "test" }] }], shape)).toBeUndefined();

		});

		it("rejects reference variant with invalid array entry", async () => {

			const Target = resource({ name: required(string()) });
			const shape = union({ ref: reference(Target), text: string() });

			expect(validateArrayUnion([{ ref: [{ name: 42 }] }], shape)).toBeDefined();

		});

		it("accepts single empty object", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateArrayUnion([{}], shape)).toBeUndefined();

		});

		it("rejects non-object values", async () => {

			const shape = union({ text: string(), num: integer() });

			expect(validateArrayUnion(["hello"], shape)).toBeDefined();

		});

	});


	describe("mergeUnion", () => {

		describe("variants", () => {

			it("merges matching variant keys", async () => {

				const merged = mergeUnion(
					union({ a: string({ minLength: 5 }), b: boolean() }),
					union({ a: string(), b: boolean() })
				);

				expect(merged.kind).toBe("union");
				expect(Object.keys(merged.variants).sort()).toEqual(["a", "b"]);
				expect((merged.variants as any).a.minLength).toBe(5);

			});

			it("rejects mismatched variant keys", async () => {

				expect(() => mergeUnion(
					union({ a: string(), b: boolean() }),
					union({ a: string(), c: boolean() })
				)).toThrow(RangeError);

			});

			it("rejects extra variant keys in target", async () => {

				expect(() => mergeUnion(
					union({ a: string(), b: boolean(), c: string() }),
					union({ a: string(), b: boolean() })
				)).toThrow(RangeError);

			});

			it("rejects missing variant keys in target", async () => {

				expect(() => mergeUnion(
					union({ a: string() }),
					union({ a: string(), b: boolean() })
				)).toThrow(RangeError);

			});

		});

		describe("model", () => {

			it("computes merged model from merged variants", async () => {

				const merged = mergeUnion(
					union({ a: string(), b: boolean() }),
					union({ a: string(), b: boolean() })
				);

				expect(merged.model).toEqual({ a: "", b: false });

			});

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
					required(string({ minLength: 5 })),
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
					required(union({ a: string({ minLength: 5 }), b: boolean() })),
					required(union({ a: string(), b: boolean() }))
				);

				expect((merged.shape as any).variants.a.minLength).toBe(5);

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

});

describe("materialize", () => {

	describe("with direct values", () => {

		it("returns the value unchanged", async () => {

			const value = resource({});

			expect(materialize(value)).toBe(value);

		});

	});

	describe("with factory functions", () => {

		it("returns the materialized value", async () => {

			const factory = () => resource({});

			const value = materialize(factory);

			expect(value.kind).toBe("resource");

		});

		it("caches factory results for idempotent materialization", async () => {

			const factory = () => resource({});

			const first = materialize(factory);
			const second = materialize(factory);

			expect(first).toBe(second);

		});

		it("caches independently per factory", async () => {

			const factoryA = () => resource({});
			const factoryB = () => resource({});

			const shapeA = materialize(factoryA);
			const shapeB = materialize(factoryB);

			expect(shapeA).not.toBe(shapeB);

		});

	});

})
