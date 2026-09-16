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
import { number } from "./index.js";
import { validateNumber } from "./validator.js";


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
