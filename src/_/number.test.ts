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

import { xsd } from "@metreeca/core/datatype";
import { describe, expect, it } from "vitest";
import { checkNumber, mergeNumber, narrowsNumber, validateNumber } from "./number.core.js";
import {
	byte,
	decimal,
	double,
	float,
	int,
	integer,
	long,
	number,
	type NumberRangeConstraints,
	type NumberShape,
	short
} from "./number.js";


describe("factories", () => {

	describe("number", () => {

		describe("shape", () => {

			it("returns a shape with kind 'number'", async () => {

				expect(number().kind).toBe("number");
				expect(number({ minInclusive: 0 }).kind).toBe("number");

			});

			it("returns an immutable shape", async () => {

				const shape = number();

				expect(() => Object.assign(shape, { kind: "string" })).toThrow();

			});

		});

		describe("constraints", () => {

			it("accepts the range constraints", async () => {

				expect(number({ minExclusive: 0 }).minExclusive).toBe(0);
				expect(number({ maxExclusive: 100 }).maxExclusive).toBe(100);
				expect(number({ minInclusive: 0 }).minInclusive).toBe(0);
				expect(number({ maxInclusive: 100 }).maxInclusive).toBe(100);

			});

			it("accepts the value constraints", async () => {

				expect(number({ in: [1, 2, 3] }).in).toEqual([1, 2, 3]);
				expect(number({ hasValue: [1, 2] }).hasValue).toEqual([1, 2]);

			});

			describe("combined", () => {

				it("accepts multiple constraints", async () => {

					const shape = number({ minInclusive: 0, maxInclusive: 100, in: [1, 2, 3] });

					expect(shape.minInclusive).toBe(0);
					expect(shape.maxInclusive).toBe(100);
					expect(shape.in).toEqual([1, 2, 3]);

				});

				it("includes only provided entries", async () => {

					expect(Object.keys(number()).sort()).toEqual(["kind"]);

				});

			});

			describe("datatype", () => {

				it("omits datatype by default", async () => {

					expect(number().datatype).toBeUndefined();

				});

				it("passes through an explicit datatype", async () => {

					expect(number({ datatype: xsd.int }).datatype).toBe(xsd.int);

				});

			});

			describe("consistency", () => {

				it("rejects contradictory bounds", async () => {

					expect(() => number({ minInclusive: 10, maxInclusive: 5 })).toThrow(RangeError);

				});

				it("rejects required values outside the enumeration", async () => {

					expect(() => number({ in: [1, 2], hasValue: [5] })).toThrow(RangeError);

				});

				it("rejects an empty integral range", async () => {

					expect(() => integer({ minExclusive: 0, maxExclusive: 1 })).toThrow(RangeError);

				});

			});

		});

	});

	describe.each<[string, (constraints?: NumberRangeConstraints) => NumberShape, string]>([
		["byte", byte, xsd.byte],
		["short", short, xsd.short],
		["int", int, xsd.int],
		["long", long, xsd.long],
		["float", float, xsd.float],
		["double", double, xsd.double],
		["integer", integer, xsd.integer],
		["decimal", decimal, xsd.decimal]
	])("%s", (_label, factory, expectedDatatype) => {

		it("returns a shape with kind 'number'", async () => {

			expect(factory().kind).toBe("number");

		});

		it("sets the matching xsd datatype", async () => {

			expect(factory().datatype).toBe(expectedDatatype);

		});

		it("passes through constraints", async () => {

			expect(factory({ minInclusive: 0 }).minInclusive).toBe(0);

		});

	});

	describe.each<[string, (constraints?: NumberRangeConstraints) => NumberShape, number, number]>([
		["byte", byte, -128, 127],
		["short", short, -32768, 32767],
		["int", int, -2147483648, 2147483647],
		["long", long, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
		["float", float, -((2-2** -23)*2**127), (2-2** -23)*2**127]
	])("%s range defaults", (_label, factory, expectedMin, expectedMax) => {

		it("applies default range bounds", async () => {

			const shape = factory();

			expect(shape.minInclusive).toBe(expectedMin);
			expect(shape.maxInclusive).toBe(expectedMax);

		});

		it("preserves the unsupplied bound when one is overridden", async () => {

			const shape = factory({ minInclusive: 0 });

			expect(shape.minInclusive).toBe(0);
			expect(shape.maxInclusive).toBe(expectedMax);

		});

	});

	describe.each<[string, () => NumberShape]>([
		["double", double],
		["integer", integer],
		["decimal", decimal]
	])("%s no range defaults", (_label, factory) => {

		it("omits range bounds by default", async () => {

			const shape = factory();

			expect(shape.minInclusive).toBeUndefined();
			expect(shape.maxInclusive).toBeUndefined();

		});

	});

	describe.each<[string, () => NumberShape]>([
		["byte", byte],
		["short", short],
		["int", int],
		["long", long],
		["integer", integer]
	])("%s integral default", (_label, factory) => {

		it("marks the shape integral", async () => {

			expect(factory().integral).toBe(true);

		});

	});

	describe.each<[string, () => NumberShape]>([
		["float", float],
		["double", double],
		["decimal", decimal]
	])("%s fractional default", (_label, factory) => {

		it("leaves the shape non-integral", async () => {

			expect(factory().integral).toBeUndefined();

		});

	});

	describe("integral consistency", () => {

		it("rejects a fractional enumeration on an integer factory", async () => {

			expect(() => integer({ in: [1.5] })).toThrow(RangeError);

		});

		it("rejects fractional bounds on an integer factory", async () => {

			expect(() => integer({ minInclusive: 1.5 })).toThrow(RangeError);

		});

	});

});

describe("operators", () => {

	describe("checkNumber", () => {

		it("returns undefined for consistent constraints", async () => {

			expect(checkNumber({ minInclusive: 0, maxInclusive: 100 })).toBeUndefined();
			expect(checkNumber({ minExclusive: 0, maxExclusive: 100 })).toBeUndefined();
			expect(checkNumber({ minInclusive: 5, maxInclusive: 5 })).toBeUndefined();
			expect(checkNumber({ hasValue: [1], in: [1, 2, 3] })).toBeUndefined();
			expect(checkNumber({})).toBeUndefined();

		});

		it("returns trace for minExclusive >= maxExclusive", async () => {

			expect(checkNumber({ minExclusive: 10, maxExclusive: 10 }))
				.toContainEqual(expect.stringContaining("{minExclusive/maxExclusive}"));
			expect(checkNumber({ minExclusive: 10, maxExclusive: 5 }))
				.toContainEqual(expect.stringContaining("{minExclusive/maxExclusive}"));

		});

		it("returns trace for minInclusive > maxInclusive", async () => {

			expect(checkNumber({ minInclusive: 10, maxInclusive: 5 }))
				.toContainEqual(expect.stringContaining("{minInclusive/maxInclusive}"));

		});

		it("returns undefined for minInclusive equal to maxInclusive", async () => {

			expect(checkNumber({ minInclusive: 5, maxInclusive: 5 })).toBeUndefined();

		});

		it("returns trace for minExclusive >= maxInclusive", async () => {

			expect(checkNumber({ minExclusive: 10, maxInclusive: 10 }))
				.toContainEqual(expect.stringContaining("{minExclusive/maxInclusive}"));
			expect(checkNumber({ minExclusive: 10, maxInclusive: 5 }))
				.toContainEqual(expect.stringContaining("{minExclusive/maxInclusive}"));

		});

		it("returns trace for minInclusive >= maxExclusive", async () => {

			expect(checkNumber({ minInclusive: 10, maxExclusive: 10 }))
				.toContainEqual(expect.stringContaining("{minInclusive/maxExclusive}"));
			expect(checkNumber({ minInclusive: 10, maxExclusive: 5 }))
				.toContainEqual(expect.stringContaining("{minInclusive/maxExclusive}"));

		});

		it("returns trace for hasValue entries not in the in set", async () => {

			expect(checkNumber({ hasValue: [5], in: [1, 2, 3] }))
				.toContainEqual(expect.stringContaining("{hasValue/in}"));

		});

		it("returns undefined when hasValue entries are in the in set", async () => {

			expect(checkNumber({ hasValue: [1], in: [1, 2, 3] })).toBeUndefined();

		});

		it("returns undefined when only one bound is specified", async () => {

			expect(checkNumber({ minInclusive: 5 })).toBeUndefined();
			expect(checkNumber({ maxExclusive: 10 })).toBeUndefined();

		});

		it("returns undefined for integer bounds and sets when integral", async () => {

			expect(checkNumber({
				integral: true,
				minInclusive: 0, maxInclusive: 10,
				in: [1, 2, 3], hasValue: [1]
			})).toBeUndefined();

		});

		it("returns trace for fractional bounds when integral", async () => {

			expect(checkNumber({ integral: true, minInclusive: 1.5 }))
				.toContainEqual(expect.stringContaining("{minInclusive}"));
			expect(checkNumber({ integral: true, maxInclusive: 9.5 }))
				.toContainEqual(expect.stringContaining("{maxInclusive}"));
			expect(checkNumber({ integral: true, minExclusive: 0.5 }))
				.toContainEqual(expect.stringContaining("{minExclusive}"));
			expect(checkNumber({ integral: true, maxExclusive: 8.5 }))
				.toContainEqual(expect.stringContaining("{maxExclusive}"));

		});

		it("returns trace for a fractional in member when integral", async () => {

			expect(checkNumber({ integral: true, in: [1, 2.5] })).toContainEqual(expect.stringContaining("{in}"));

		});

		it("returns trace for a fractional hasValue member when integral", async () => {

			expect(checkNumber({ integral: true, hasValue: [1.5] }))
				.toContainEqual(expect.stringContaining("{hasValue}"));

		});

		it("ignores fractional bounds and sets when not integral", async () => {

			expect(checkNumber({ minInclusive: 1.5, in: [1.5], hasValue: [1.5] })).toBeUndefined();

		});

		it("returns trace for an empty integral range", async () => {

			expect(checkNumber({ integral: true, minExclusive: 0, maxExclusive: 1 }))
				.toContainEqual(expect.stringContaining("{range}"));

		});

		it("returns undefined for a non-empty integral range", async () => {

			expect(checkNumber({ integral: true, minInclusive: 0, maxInclusive: 0 })).toBeUndefined();

		});

		it("returns trace for an empty integral range across both bounds on a side", async () => {

			expect(checkNumber({ integral: true, minInclusive: 0, minExclusive: 5, maxExclusive: 6 }))
				.toContainEqual(expect.stringContaining("{range}"));

		});

		it("returns undefined for a narrow continuous range", async () => {

			expect(checkNumber({ minExclusive: 0, maxExclusive: 1 })).toBeUndefined();

		});

	});

	describe("narrowsNumber", () => {

		it("accepts a child that tightens a bound", async () => {

			expect(narrowsNumber(number({ minInclusive: 5 }), number())).toBeUndefined();

		});

		it("accepts an identical child", async () => {

			expect(narrowsNumber(number(), number())).toBeUndefined();

		});

		it("rejects a child that widens a bound", async () => {

			expect(narrowsNumber(number({ minInclusive: 0 }), number({ minInclusive: 5 }))).toBeDefined();

		});

		it("rejects a child with a disjoint enumeration", async () => {

			expect(narrowsNumber(number({ in: [1] }), number({ in: [2] }))).toBeDefined();

		});

		it("accepts a child narrowing an enumeration", async () => {

			expect(narrowsNumber(number({ in: [1] }), number({ in: [1, 2] }))).toBeUndefined();

		});

		it("rejects a child widening an enumeration", async () => {

			// a value the parent omits would be intersected away, leaving the state wider than the shape admits

			expect(narrowsNumber(number({ in: [1, 2] }), number({ in: [1] }))).toBeDefined();

		});

		it("accepts a child adding required values", async () => {

			expect(narrowsNumber(
				number({ in: [1, 2], hasValue: [1, 2] }),
				number({ in: [1, 2], hasValue: [1] })
			)).toBeUndefined();

		});

		it("rejects a child dropping a required value", async () => {

			// hasValue floors the value set, so a value the child omits would be unioned back in, leaving the
			// child stating a weaker requirement than it enforces

			expect(narrowsNumber(
				number({ in: [1, 2], hasValue: [1] }),
				number({ in: [1, 2], hasValue: [1, 2] })
			)).toBeDefined();

		});

		it("accepts equal datatypes", async () => {

			expect(narrowsNumber(int(), int())).toBeUndefined();

		});

		it("accepts a child datatype when the parent has none", async () => {

			expect(narrowsNumber(number({ datatype: xsd.int }), number())).toBeUndefined();

		});

		it("accepts a parent datatype when the child has none", async () => {

			expect(narrowsNumber(number(), number({ datatype: xsd.int }))).toBeUndefined();

		});

		it("rejects mismatched datatypes", async () => {

			expect(narrowsNumber(number({ datatype: xsd.int }), number({ datatype: xsd.long })))
				.toContainEqual(expect.stringContaining("{datatype}"));

		});

		it("accepts a child that inherits an integral parent", async () => {

			expect(narrowsNumber(number(), number({ integral: true }))).toBeUndefined();

		});

		it("accepts a child that adds an integral constraint", async () => {

			expect(narrowsNumber(number({ integral: true }), number())).toBeUndefined();

		});

		it("rejects a child that drops an integral parent", async () => {

			expect(narrowsNumber(number({ integral: false }), number({ integral: true })))
				.toContainEqual(expect.stringContaining("{integral}"));

		});

	});

	describe("mergeNumber", () => {

		describe("kind", () => {

			it("preserves kind as 'number'", async () => {

				expect(mergeNumber(number(), number()).kind).toBe("number");

			});

		});

		describe.each([

			{
				label: "minExclusive",
				shaped: (value: number) => number({ minExclusive: value }),
				bound: (shape: NumberShape) => shape.minExclusive,
				inherited: 0, tighterTarget: 10, tighterSource: 5, rejected: 3
			},

			{
				label: "maxExclusive",
				shaped: (value: number) => number({ maxExclusive: value }),
				bound: (shape: NumberShape) => shape.maxExclusive,
				inherited: 100, tighterTarget: 50, tighterSource: 100, rejected: 150
			},

			{
				label: "minInclusive",
				shaped: (value: number) => number({ minInclusive: value }),
				bound: (shape: NumberShape) => shape.minInclusive,
				inherited: 0, tighterTarget: 10, tighterSource: 5, rejected: 3
			},

			{
				label: "maxInclusive",
				shaped: (value: number) => number({ maxInclusive: value }),
				bound: (shape: NumberShape) => shape.maxInclusive,
				inherited: 100, tighterTarget: 50, tighterSource: 100, rejected: 150
			}

		])("$label", ({ shaped, bound, inherited, tighterTarget, tighterSource, rejected }) => {

			it("inherits source value when target has none", async () => {

				expect(bound(mergeNumber(number(), shaped(inherited)))).toBe(inherited);

			});

			it("keeps target value when source has none", async () => {

				expect(bound(mergeNumber(shaped(inherited), number()))).toBe(inherited);

			});

			it("keeps tighter target value", async () => {

				expect(bound(mergeNumber(shaped(tighterTarget), shaped(tighterSource)))).toBe(tighterTarget);

			});

			it("rejects incompatible target value", async () => {

				expect(() => mergeNumber(shaped(rejected), shaped(tighterSource))).toThrow(RangeError);

			});

		});

		describe("in", () => {

			it("inherits source in when target has none", async () => {

				expect(mergeNumber(number(), number({ in: [1, 2, 3] })).in).toEqual([1, 2, 3]);

			});

			it("keeps target in when source has none", async () => {

				expect(mergeNumber(number({ in: [1, 2] }), number()).in).toEqual([1, 2]);

			});

			it("keeps a target in narrowing source", async () => {

				expect(mergeNumber(
					number({ in: [2, 3] }),
					number({ in: [1, 2, 3] })
				).in).toEqual([2, 3]);

			});

			it("rejects a target in widening source", async () => {

				expect(() => mergeNumber(
					number({ in: [1, 2, 3] }),
					number({ in: [2, 3, 4] })
				)).toThrow(RangeError);

			});

			it("rejects disjoint sets", async () => {

				expect(() => mergeNumber(
					number({ in: [1, 2] }),
					number({ in: [3, 4] })
				)).toThrow(RangeError);

			});

		});

		describe("hasValue", () => {

			it("inherits source hasValue when target has none", async () => {

				expect(mergeNumber(number(), number({ hasValue: [1] })).hasValue).toEqual([1]);

			});

			it("keeps target hasValue when source has none", async () => {

				expect(mergeNumber(number({ hasValue: [1] }), number()).hasValue).toEqual([1]);

			});

			it("keeps a target hasValue extending source", async () => {

				const merged = mergeNumber(
					number({ hasValue: [1, 2, 3] }),
					number({ hasValue: [2, 3] })
				);

				expect(merged.hasValue).toEqual(expect.arrayContaining([1, 2, 3]));
				expect(merged.hasValue).toHaveLength(3);

			});

			it("rejects a target hasValue dropping a source value", async () => {

				expect(() => mergeNumber(
					number({ hasValue: [1, 2] }),
					number({ hasValue: [2, 3] })
				)).toThrow(RangeError);

			});

		});

		describe("datatype", () => {

			it("inherits source datatype when target has none", async () => {

				expect(mergeNumber(number(), number({ datatype: xsd.int })).datatype).toBe(xsd.int);

			});

			it("keeps target datatype when source has none", async () => {

				expect(mergeNumber(number({ datatype: xsd.int }), number()).datatype).toBe(xsd.int);

			});

			it("keeps equal datatype", async () => {

				expect(mergeNumber(
					number({ datatype: xsd.int }),
					number({ datatype: xsd.int })
				).datatype).toBe(xsd.int);

			});

			it("rejects mismatched datatype", async () => {

				expect(() => mergeNumber(
					number({ datatype: xsd.int }),
					number({ datatype: xsd.long })
				)).toThrow(RangeError);

			});

		});

		describe("integral", () => {

			it("inherits an integral parent when the child omits it", async () => {

				expect(mergeNumber(number(), number({ integral: true })).integral).toBe(true);

			});

			it("keeps the child integral when the parent omits it", async () => {

				expect(mergeNumber(number({ integral: true }), number()).integral).toBe(true);

			});

			it("rejects a child that drops an integral parent", async () => {

				expect(() => mergeNumber(number({ integral: false }), number({ integral: true }))).toThrow(RangeError);

			});

			it("rejects a child whose fractional enumeration contradicts an integral parent", async () => {

				expect(() => mergeNumber(number({ in: [1.5] }), number({ integral: true }))).toThrow(RangeError);

			});

		});

		describe("post-merge validation", () => {

			it("rejects merged minExclusive >= merged maxExclusive", async () => {

				expect(() => mergeNumber(
					number({ minExclusive: 10 }),
					number({ maxExclusive: 10 })
				)).toThrow(RangeError);

			});

			it("rejects merged minInclusive > merged maxInclusive", async () => {

				expect(() => mergeNumber(
					number({ minInclusive: 10 }),
					number({ maxInclusive: 5 })
				)).toThrow(RangeError);

			});

			it("accepts merged minInclusive equal to merged maxInclusive", async () => {

				const merged = mergeNumber(
					number({ minInclusive: 5 }),
					number({ maxInclusive: 5 })
				);

				expect(merged.minInclusive).toBe(5);
				expect(merged.maxInclusive).toBe(5);

			});

			it("rejects merged minExclusive >= merged maxInclusive", async () => {

				expect(() => mergeNumber(
					number({ minExclusive: 10 }),
					number({ maxInclusive: 10 })
				)).toThrow(RangeError);

			});

			it("rejects merged minInclusive >= merged maxExclusive", async () => {

				expect(() => mergeNumber(
					number({ minInclusive: 10 }),
					number({ maxExclusive: 10 })
				)).toThrow(RangeError);

			});

			it("rejects hasValue entries not in merged in set", async () => {

				expect(() => mergeNumber(
					number({ hasValue: [5] }),
					number({ in: [1, 2, 3] })
				)).toThrow(RangeError);

			});

			it("accepts hasValue entries that are in merged in set", async () => {

				const merged = mergeNumber(
					number({ hasValue: [1] }),
					number({ in: [1, 2, 3] })
				);

				expect(merged.hasValue).toEqual([1]);

			});

		});

	});

});

describe("validators", () => {

	describe("validateNumber", () => {

		describe("type filtering", () => {

			it.each<[string, readonly unknown[]]>([
				["valid numeric values", [42]],
				["empty values array", []]
			])("returns undefined for %s", async (_label, values) => {

				expect(validateNumber(values, number())).toBeUndefined();

			});

			it.each<[string, readonly unknown[], readonly number[]]>([
				["a single non-numeric value", ["hello"], [0]],
				["mixed valid and non-numeric values", ["hello", 42, true], [0, 2]],
				["multiple non-numeric values", ["hello", true], [0, 1]]
			])("keys a kind violation by element for %s", async (_label, values, indices) => {

				expect(validateNumber(values, number())).toEqual([
					Object.fromEntries(indices.map(index => [`${index}`, ["{type} expected <number> value"]]))
				]);

			});

			it("keys type and constraint violations by element", async () => {

				expect(validateNumber([-1, "hello", -2], number({ minInclusive: 0 }))).toEqual([{
					"0": ["{gte} expected value greater than or equal to <0>"],
					"1": ["{type} expected <number> value"],
					"2": ["{gte} expected value greater than or equal to <0>"]
				}]);

			});

			it("reports only the wrong-typed value, matched numbers passing", async () => {

				expect(validateNumber([42, "hello"], number({ minInclusive: 0 })))
					.toEqual([{ "1": ["{type} expected <number> value"] }]);

			});

		});

		describe("placeholder mode", () => {

			it("skips value-domain constraints for a placeholder", async () => {

				expect(validateNumber([500], number({ maxInclusive: 100 }), { scope: "model" })).toBeUndefined();
				expect(validateNumber([-1], number({ minInclusive: 0 }), { scope: "model" })).toBeUndefined();
				expect(validateNumber([5], number({ in: [1, 2, 3] }), { scope: "model" })).toBeUndefined();
				expect(validateNumber([1.5], number({ integral: true }), { scope: "model" })).toBeUndefined();

			});

			it("still rejects a placeholder of the wrong kind", async () => {

				expect(validateNumber(["nope"], number(), { scope: "model" }))
					.toEqual([{ "0": ["{type} expected <number> value"] }]);

			});

		});

		describe("bound scope", () => {

			// a number carries no pattern, so the bound scope has nothing between kind and the full domain to keep:
			// it skips every value-domain constraint, exactly as the model scope does

			it("skips value-domain constraints for a bound", async () => {

				expect(validateNumber([500], number({ maxInclusive: 100 }), { scope: "bound" })).toBeUndefined();
				expect(validateNumber([-1], number({ minInclusive: 0 }), { scope: "bound" })).toBeUndefined();
				expect(validateNumber([5], number({ in: [1, 2, 3] }), { scope: "bound" })).toBeUndefined();
				expect(validateNumber([1.5], number({ integral: true }), { scope: "bound" })).toBeUndefined();

			});

			it("still rejects a bound of the wrong kind", async () => {

				expect(validateNumber(["nope"], number(), { scope: "bound" }))
					.toEqual([{ "0": ["{type} expected <number> value"] }]);

			});

		});

		describe.each([

			{
				label: "minExclusive",
				shape: number({ minExclusive: 0 }),
				facet: "{gt}", passing: 1, boundary: 0, failing: -1, fractional: 0.0001
			},

			{
				label: "maxExclusive",
				shape: number({ maxExclusive: 100 }),
				facet: "{lt}", passing: 99, boundary: 100, failing: 101, fractional: 99.9999
			}

		])("$label constraint", ({ shape, facet, passing, boundary, failing, fractional }) => {

			it("returns undefined for values strictly within bound", async () => {

				expect(validateNumber([passing], shape)).toBeUndefined();

			});

			it("returns trace for values equal to bound", async () => {

				expect(validateNumber([boundary], shape)).toEqual([{ "0": [expect.stringContaining(facet)] }]);

			});

			it("returns trace for values beyond bound", async () => {

				expect(validateNumber([failing], shape)).toEqual([{ "0": [expect.stringContaining(facet)] }]);

			});

			it("returns undefined for fractional values within bound", async () => {

				expect(validateNumber([fractional], shape)).toBeUndefined();

			});

		});

		describe.each([

			{
				label: "minInclusive",
				shape: number({ minInclusive: 0 }),
				facet: "{gte}", passing: 1, boundary: 0, failing: -1
			},

			{
				label: "maxInclusive",
				shape: number({ maxInclusive: 100 }),
				facet: "{lte}", passing: 99, boundary: 100, failing: 101
			}

		])("$label constraint", ({ shape, facet, passing, boundary, failing }) => {

			it("returns undefined for values within bound", async () => {

				expect(validateNumber([passing], shape)).toBeUndefined();

			});

			it("returns undefined for values equal to bound", async () => {

				expect(validateNumber([boundary], shape)).toBeUndefined();

			});

			it("returns trace for values beyond bound", async () => {

				expect(validateNumber([failing], shape)).toEqual([{ "0": [expect.stringContaining(facet)] }]);

			});

		});

		describe("combined range constraints", () => {

			it("returns undefined for values within inclusive range", async () => {

				expect(validateNumber([50], number({ minInclusive: 0, maxInclusive: 100 }))).toBeUndefined();

			});

			it("returns undefined for values at inclusive boundaries", async () => {

				const shape = number({ minInclusive: 0, maxInclusive: 100 });

				expect(validateNumber([0], shape)).toBeUndefined();
				expect(validateNumber([100], shape)).toBeUndefined();

			});

			it("returns undefined for values within exclusive range", async () => {

				expect(validateNumber([50], number({ minExclusive: 0, maxExclusive: 100 }))).toBeUndefined();

			});

			it("returns trace for values at exclusive boundaries", async () => {

				const shape = number({ minExclusive: 0, maxExclusive: 100 });

				expect(validateNumber([0], shape)).toEqual([{ "0": [expect.stringContaining("{gt}")] }]);
				expect(validateNumber([100], shape)).toEqual([{ "0": [expect.stringContaining("{lt}")] }]);

			});

			it("validates mixed range (minInclusive, maxExclusive)", async () => {

				const shape = number({ minInclusive: 0, maxExclusive: 100 });

				expect(validateNumber([0], shape)).toBeUndefined();
				expect(validateNumber([99], shape)).toBeUndefined();
				expect(validateNumber([100], shape)).toEqual([{ "0": [expect.stringContaining("{lt}")] }]);

			});

			it("validates mixed range (minExclusive, maxInclusive)", async () => {

				const shape = number({ minExclusive: 0, maxInclusive: 100 });

				expect(validateNumber([0], shape)).toEqual([{ "0": [expect.stringContaining("{gt}")] }]);
				expect(validateNumber([1], shape)).toBeUndefined();
				expect(validateNumber([100], shape)).toBeUndefined();

			});

		});

		describe("in constraint", () => {

			it("returns undefined for values in the enumeration", async () => {

				const shape = number({ in: [1, 2, 3] });

				expect(validateNumber([1], shape)).toBeUndefined();
				expect(validateNumber([2], shape)).toBeUndefined();
				expect(validateNumber([3], shape)).toBeUndefined();

			});

			it("returns trace for values not in the enumeration", async () => {

				expect(validateNumber([4], number({ in: [1, 2, 3] })))
					.toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

			});

			it("returns trace for values close to but not in the enumeration", async () => {

				expect(validateNumber([1.5], number({ in: [1, 2, 3] })))
					.toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

			});

			it("validates single-value enumeration", async () => {

				const shape = number({ in: [42] });

				expect(validateNumber([42], shape)).toBeUndefined();
				expect(validateNumber([0], shape)).toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

			});

			it("returns undefined for negative values in enumeration", async () => {

				expect(validateNumber([-1], number({ in: [-1, 0, 1] }))).toBeUndefined();

			});

			it("validates floating-point values in enumeration", async () => {

				const shape = number({ in: [1.5, 2.5, 3.5] });

				expect(validateNumber([1.5], shape)).toBeUndefined();
				expect(validateNumber([1], shape)).toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

			});

		});

		describe("hasValue constraint", () => {

			it("returns undefined when all required values are present", async () => {

				expect(validateNumber([1, 2, 3], number({ hasValue: [1, 2] }))).toBeUndefined();

			});

			it("returns undefined when values exactly match required", async () => {

				expect(validateNumber([1, 2], number({ hasValue: [1, 2] }))).toBeUndefined();

			});

			it("returns trace when required value is missing", async () => {

				expect(validateNumber([1, 3], number({ hasValue: [1, 2] })))
					.toEqual([expect.stringContaining("{values}")]);

			});

			it("returns trace when values array is empty", async () => {

				expect(validateNumber([], number({ hasValue: [1] })))
					.toEqual([expect.stringContaining("{values}")]);

			});

			it("returns undefined for single required value present", async () => {

				expect(validateNumber([1], number({ hasValue: [1] }))).toBeUndefined();

			});

		});

		describe("combined constraints", () => {

			it("returns undefined when satisfying both range and enumeration", async () => {

				const shape = number({ minInclusive: 0, maxInclusive: 10, in: [2, 4, 6, 8] });

				expect(validateNumber([2], shape)).toBeUndefined();
				expect(validateNumber([8], shape)).toBeUndefined();

			});

			it("returns trace for values satisfying range but not enumeration", async () => {

				expect(validateNumber([5], number({
					minInclusive: 0,
					maxInclusive: 10,
					in: [2, 4, 6, 8]
				}))).toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

			});

			it("validates values against both enumeration and range", async () => {

				const shape = number({ minInclusive: 5, in: [7, 8, 9] });

				expect(validateNumber([4], shape)).toEqual([{
					"0": [
						expect.stringContaining("{gte}"),
						expect.stringContaining("{domain}")
					]
				}]);
				expect(validateNumber([7], shape)).toBeUndefined();

			});

		});

		describe("no constraints", () => {

			it("returns undefined for any finite number with no constraints", async () => {

				const shape = number();

				expect(validateNumber([0], shape)).toBeUndefined();
				expect(validateNumber([42], shape)).toBeUndefined();
				expect(validateNumber([-42], shape)).toBeUndefined();
				expect(validateNumber([3.14159], shape)).toBeUndefined();

			});

		});

		describe("integral constraint", () => {

			it("accepts integers when integral", async () => {

				expect(validateNumber([42], number({ integral: true }))).toBeUndefined();

			});

			it("rejects fractional values when integral", async () => {

				expect(validateNumber([3.5], number({ integral: true })))
					.toEqual([{ "0": [expect.stringContaining("{integer}")] }]);

			});

			it("accepts fractional values when not integral", async () => {

				expect(validateNumber([3.5], number({ integral: false }))).toBeUndefined();
				expect(validateNumber([3.5], number())).toBeUndefined();

			});

		});

		describe("per-value errors", () => {

			it.each<[string, readonly number[], readonly number[]]>([
				["both failing values", [-1, -2], [0, 1]],
				["only the failing values", [-1, 50, -2], [0, 2]],
				["a single failing value", [-1], [0]]
			])("keys range violations by element (%s)", async (_label, values, indices) => {

				expect(validateNumber(values, number({ minInclusive: 0 }))).toEqual([
					Object.fromEntries(indices.map(index =>
						[`${index}`, ["{gte} expected value greater than or equal to <0>"]]
					))
				]);

			});

		});

	});

});
