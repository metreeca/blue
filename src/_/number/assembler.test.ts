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
import { checkNumber, mergeNumber, narrowsNumber } from "./assembler.js";
import { int, type NumberShape, number } from "./index.js";


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
