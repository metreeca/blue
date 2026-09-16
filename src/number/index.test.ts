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
} from "./index.js";


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
