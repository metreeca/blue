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
import { collect, every, group, normalise } from "./index.core.js";
import { validate } from "./index.js";
import { localised } from "./localised.js";
import { byte, decimal, double, float, int, integer, long, number, short } from "./number.js";
import { reference } from "./reference.js";
import { id, resource, type ResourceShape, type } from "./resource.js";
import { date, duration, instant, iri, string, time, timestamp, year } from "./string.js";
import {
	apply,
	multiple,
	optional,
	repeatable,
	required,
	type SetShape,
	union,
	type UnionShape,
	type ValuesShape
} from "./value.js";


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

describe("validation", () => {

	describe("validate (resource)", () => {

		describe("structural validation", () => {

			it("returns value for valid empty resource", async () => {

				const shape = resource({});
				const result = validate({}, { shape });

				expect(result({ value: v => v })).toEqual({});

			});

			it("returns value for resource with properties", async () => {

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

				const shape = resource({ type: type() });

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
					name: required(string({ minLength: 1 }))
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
				const first = validate(value, { fetch: true, shape });
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


			it("accepts indexed container with scalar variant", async () => {

				const result = validate({ address: { text: "123 Main St" } }, { shape: Contact });
				expect(result({ value: v => v })).toEqual({ address: { text: "123 Main St" } });

			});

			it("accepts indexed container with reference variant", async () => {

				const result = validate({
					address: { PostalAddress: { street: "12 Harbour St", city: "Copenhagen" } }
				}, { shape: Contact });

				expect(result({ value: v => v })).toEqual({
					address: { PostalAddress: { street: "12 Harbour St", city: "Copenhagen" } }
				});

			});

			it("rejects indexed container with unknown variant key", async () => {

				const result = validate({ address: { unknown: "value" } }, { shape: Contact });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("rejects indexed container with invalid variant value", async () => {

				const result = validate({ address: { text: 42 } }, { shape: Contact });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts absent optional indexed union property", async () => {

				const result = validate({}, { shape: Contact });
				expect(result({ value: v => v })).toEqual({});

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

				const shape = resource({ label: optional(localised()) });
				const result = validate({ label: { en: "hello" } }, { shape });

				expect(result({ value: v => v })).toEqual({ label: { en: "hello" } });

			});

		});

		describe("localised shorthand on scalar cardinality", () => {

			it("accepts localised array shorthand on optional property", async () => {

				const shape = resource({ labels: multiple(localised()) });
				const result = validate({ labels: ["hello"] }, { shape });

				expect(result({ value: v => v })).toEqual({ labels: ["hello"] });

			});

		});

	});

	describe("validate (template)", () => {

		describe("return behaviour", () => {

			it("returns a new reference on success", async () => {

				const shape = resource({ name: required(string()) });
				const model = { name: "Alice" };

				const result = validate(model, { fetch: true, shape })({ value: v => v });

				expect(result).not.toBe(model);
				expect(result).toEqual(model);

			});

			it("returns an immutable model on success", async () => {

				const shape = resource({ name: required(string()) });

				const result = validate({}, { fetch: true, shape })({ value: v => v });

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

				const second = validate(branded, { fetch: true, shape });
				const revalidated = second({ value: v => v });

				expect(revalidated).not.toBe(branded);

			});

			it("skips validation for template already validated with same shape", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: [true] };
				const first = validate(value, { fetch: true, shape });
				const branded = first({ value: v => v });

				const second = validate(branded, { fetch: true, shape });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("skips validation when plain was true and is now false", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: "Alice" };
				const first = validate(value, { fetch: true, shape, plain: true });
				const branded = first({ value: v => v });

				const second = validate(branded, { fetch: true, shape, plain: false });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("skips validation when plain was true and is now omitted", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: "Alice" };
				const first = validate(value, { fetch: true, shape, plain: true });
				const branded = first({ value: v => v });

				const second = validate(branded, { fetch: true, shape });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("revalidates when plain was false and is now true", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: "Alice" };
				const first = validate(value, { fetch: true, shape, plain: false });
				const branded = first({ value: v => v });

				const second = validate(branded, { fetch: true, shape, plain: true });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("revalidates when plain was omitted and is now true", async () => {

				const shape = resource({
					name: required(string())
				});

				const value = { name: "Alice" };
				const first = validate(value, { fetch: true, shape });
				const branded = first({ value: v => v });

				const second = validate(branded, { fetch: true, shape, plain: true });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("skips validation when depth was stricter and is now relaxed", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const value = { child: { label: "x" } };
				const first = validate(value, { fetch: true, shape, depth: 1 });
				const branded = first({ value: v => v });

				const second = validate(branded, { fetch: true, shape, depth: 3 });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("skips validation when depth was limited and is now omitted", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const value = { child: { label: "x" } };
				const first = validate(value, { fetch: true, shape, depth: 2 });
				const branded = first({ value: v => v });

				const second = validate(branded, { fetch: true, shape });
				expect(second({ value: v => v })).toBe(branded);

			});

			it("revalidates when depth was relaxed and is now stricter", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const value = { child: { label: "x" } };
				const first = validate(value, { fetch: true, shape, depth: 5 });
				const branded = first({ value: v => v });

				const second = validate(branded, { fetch: true, shape, depth: 2 });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("revalidates when depth was omitted and is now limited", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const value = { child: { label: "x" } };
				const first = validate(value, { fetch: true, shape });
				const branded = first({ value: v => v });

				const second = validate(branded, { fetch: true, shape, depth: 1 });
				expect(second({ value: v => v })).not.toBe(branded);

			});

			it("revalidates when shape changes", async () => {

				const shapeA = resource({
					name: required(string())
				});

				const shapeB = resource({
					name: required(string({ minLength: 1 }))
				});

				const value = { name: "Alice" };
				const first = validate(value, { fetch: true, shape: shapeA });
				const branded = first({ value: v => v });

				const second = validate(branded, { fetch: true, shape: shapeB });
				expect(second({ value: v => v })).not.toBe(branded);

			});

		});

		describe("accepts missing required property", () => {

			it("accepts missing required property", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({}, { fetch: true, shape });
				expect(result({ value: v => v })).toEqual({});

			});

		});



		describe("model mode", () => {

			it("returns value for valid model", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "Alice" }, { fetch: true, shape });
				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

			it("returns value for empty model", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({}, { fetch: true, shape });
				expect(result({ value: v => v })).toEqual({});

			});

			it("accepts nested model via reference when depth is omitted (defaults to null)", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const result = validate({ child: { label: "x" } }, { fetch: true, shape });
				expect(result({ value: v => v })).toEqual({ child: { label: "x" } });

			});

			it("accepts nested model via reference when depth is null", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const result = validate({ child: { label: "x" } }, { fetch: true, shape });
				expect(result({ value: v => v })).toEqual({ child: { label: "x" } });

			});

			it("accepts nested model via reference when depth is 1", async () => {

				const Inner = resource({ label: required(string()) });

				const shape = resource({
					child: optional(reference(Inner))
				});

				const result = validate({ child: { label: "x" } }, { fetch: true, shape, depth: 1 });
				expect(result({ value: v => v })).toEqual({ child: { label: "x" } });

			});

			it("accepts aggregate binding when plain is omitted (defaults to false)", async () => {

				const Target = resource({
					price: optional(integer())
				});

				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{ "total=count:": 0 }] }, { fetch: true, shape });
				expect(result({ value: v => v })).toEqual({ items: [{ "total=count:": 0 }] });

			});

			it("accepts aggregate binding when plain is false", async () => {

				const Target = resource({
					price: optional(integer())
				});

				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{ "total=count:": 0 }] }, { fetch: true, shape, plain: false });
				expect(result({ value: v => v })).toEqual({ items: [{ "total=count:": 0 }] });

			});

			it("rejects aggregate binding when plain is true", async () => {

				const shape = resource({
					price: optional(integer())
				});

				const result = validate({ "total=count:": 0 }, { fetch: true, shape, plain: true });
				expect(result({ trace: t => t })).toBeDefined();

			});

			it("accepts non-aggregate binding when plain is true", async () => {

				const Target = resource({
					released: optional(year())
				});

				const shape = resource({ items: multiple(reference(Target)) });

				const result = validate({ items: [{ "y=year:released": 0 }] }, { fetch: true, shape, plain: true });
				expect(result({ value: v => v })).toEqual({ items: [{ "y=year:released": 0 }] });

			});

			it("accepts plain property when plain is true", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "" }, { fetch: true, shape, plain: true });
				expect(result({ value: v => v })).toEqual({ name: "" });

			});

		});

		describe("lazy shapes", () => {

			it("resolves factory for model mode", async () => {

				const shape = resource({
					name: required(string())
				});

				const result = validate({ name: "Alice" }, { fetch: true, shape: () => shape });
				expect(result({ value: v => v })).toEqual({ name: "Alice" });

			});

		});

	});

});

describe("traces", () => {

	describe("collect", () => {

		it("returns undefined when all entries are undefined", async () => {

			expect(collect({ minLength: undefined, maxLength: undefined })).toBeUndefined();

		});

		it("returns undefined for empty entries", async () => {

			expect(collect({})).toBeUndefined();

		});

		it("filters out undefined entries", async () => {

			const result = collect({ minLength: "too short", maxLength: undefined });

			expect(result).toEqual({ minLength: "too short" });

		});

		it("preserves all failed entries", async () => {

			const result = collect({ minLength: "too short", pattern: "no match" });

			expect(result).toEqual({ minLength: "too short", pattern: "no match" });

		});

		it("filters out empty string entries", async () => {

			expect(collect({ minLength: "" })).toBeUndefined();

		});

		it("filters out empty object entries", async () => {

			expect(collect({ minLength: {} })).toBeUndefined();

		});

		it("preserves nested trace entries", async () => {

			const result = collect({ name: { minLength: "too short" } });

			expect(result).toEqual({ name: { minLength: "too short" } });

		});

	});

	describe("every", () => {

		it("returns undefined when all values pass", async () => {

			expect(every([1, 2, 3], () => true)).toBeUndefined();

		});

		it("returns undefined when validator returns undefined", async () => {

			expect(every([1, 2, 3], () => undefined)).toBeUndefined();

		});

		it("returns violation message for single failing value", async () => {

			const result = every(["ab"], () => "too short");

			expect(result).toBe("too short");

		});

		it("returns message without count prefix for single value", async () => {

			const result = every(["ab"], () => "too short");

			expect(typeof result === "string" && !result.startsWith("(")).toBeTruthy();

		});

		it("returns message with count prefix for multiple failing values", async () => {

			const result = every(["a", "b", "c"], () => "too short");

			expect(result).toMatch(/^\(3\/3\)/);

		});

		it("counts only failing values in prefix", async () => {

			const result = every(
				["ab", "hello", "c"],
				v => v.length >= 3 || "too short"
			);

			expect(result).toMatch(/^\(2\/3\)/);

		});

		it("returns undefined for empty values array", async () => {

			expect(every([], () => "error")).toBeUndefined();

		});

		it("normalises true results from validator", async () => {

			const result = every([1, 2], v => v > 0 || "must be positive");

			expect(result).toBeUndefined();

		});

		it("returns keyed trace directly for single failing value", async () => {

			const keyed = { name: "required" };

			const result = every([1], () => keyed);

			expect(result).toEqual(keyed);

		});

		it("wraps single keyed failure in index key for multi-element array", async () => {

			const keyed = { name: "required" };

			const result = every([1, 2], v => v === 1 ? keyed : undefined);

			expect(result).toEqual({ "0": keyed });

		});

		it("wraps multiple keyed failures in index keys", async () => {

			const result = every([1, 2], () => ({ name: "required" }));

			expect(result).toEqual({
				"0": { name: "required" },
				"1": { name: "required" }
			});

		});

		it("wraps mixed failures in index keys when any is keyed", async () => {

			const result = every([1, 2, 3], v =>
				v === 1 ? "bad" : { name: "required" }
			);

			expect(result).toEqual({
				"0": "bad",
				"1": { name: "required" },
				"2": { name: "required" }
			});

		});

		it("applies count prefix when all failures are strings", async () => {

			const result = every(["a", "b", "c"], () => "too short");

			expect(result).toMatch(/^\(3\/3\) too short$/);

		});

		it("omits passing values from index-keyed trace", async () => {

			const result = every([1, 2, 3], v =>
				v === 2 ? undefined : { name: "required" }
			);

			expect(result).toEqual({
				"0": { name: "required" },
				"2": { name: "required" }
			});

		});

	});

	describe("group", () => {

		it("returns undefined when validator returns true", async () => {

			expect(group([1, 2, 3], () => true)).toBeUndefined();

		});

		it("returns undefined when validator returns undefined", async () => {

			expect(group([1, 2, 3], () => undefined)).toBeUndefined();

		});

		it("returns trace when validator returns string", async () => {

			expect(group([1, 2], () => "missing required value")).toBe("missing required value");

		});

		it("returns trace when validator returns keyed object", async () => {

			const result = group([1, 2], () => ({ hasValue: "missing 3" }));

			expect(result).toEqual({ hasValue: "missing 3" });

		});

		it("passes entire collection to validator", async () => {

			const result = group(
				["apple", "cherry"],
				vs => ["apple", "banana"].every(v => vs.includes(v)) || "missing banana"
			);

			expect(result).toBe("missing banana");

		});

		it("normalises empty string from validator to undefined", async () => {

			expect(group([1], () => "")).toBeUndefined();

		});

		it("normalises empty object from validator to undefined", async () => {

			expect(group([1], () => ({}))).toBeUndefined();

		});

	});

	describe("normalise", () => {

		it("returns undefined for undefined", async () => {

			expect(normalise(undefined)).toBeUndefined();

		});

		it("returns undefined for true", async () => {

			expect(normalise(true)).toBeUndefined();

		});

		it("returns undefined for empty string", async () => {

			expect(normalise("")).toBeUndefined();

		});

		it("returns undefined for empty object", async () => {

			expect(normalise({})).toBeUndefined();

		});

		it("passes through non-empty string", async () => {

			expect(normalise("error message")).toBe("error message");

		});

		it("passes through non-empty object", async () => {

			const result = normalise({ minLength: "too short" });

			expect(result).toEqual({ minLength: "too short" });

		});

		it("passes through nested trace object", async () => {

			const nested = { name: { minLength: "too short" } };

			expect(normalise(nested)).toEqual(nested);

		});

	});

});

