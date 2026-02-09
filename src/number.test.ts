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
import { isNumberConstraints, isNumberShape, isNumericConstraints, validateNumber } from "./number.core.js";
import { byte, decimal, double, float, int, integer, long, number, short } from "./number.js";


describe("guards", () => {

	describe("isNumberShape", () => {

		it("returns true for valid number shape", async () => {

			expect(isNumberShape(number())).toBe(true);
			expect(isNumberShape(number(42))).toBe(true);

		});

		it("returns false for object with wrong kind", async () => {

			expect(isNumberShape({ kind: "string", model: 0 })).toBe(false);

		});

		it("returns false for object with non-number model", async () => {

			expect(isNumberShape({ kind: "number", model: "0" })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isNumberShape(null)).toBe(false);
			expect(isNumberShape(undefined)).toBe(false);

		});

	});

	describe("isNumberConstraints", () => {

		it("returns true for empty object", async () => {

			expect(isNumberConstraints({})).toBe(true);

		});

		it("returns true for object with number model", async () => {

			expect(isNumberConstraints({ model: 42 })).toBe(true);

		});

		it("returns true for object with valid constraints", async () => {

			expect(isNumberConstraints({ minInclusive: 0, maxInclusive: 100 })).toBe(true);
			expect(isNumberConstraints({ minExclusive: 0, maxExclusive: 100 })).toBe(true);

		});

		it("returns false for object with non-number model", async () => {

			expect(isNumberConstraints({ model: "42" })).toBe(false);

		});

		it("returns false for object with non-number range constraints", async () => {

			expect(isNumberConstraints({ minInclusive: "0" })).toBe(false);
			expect(isNumberConstraints({ maxInclusive: "100" })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isNumberConstraints(null)).toBe(false);
			expect(isNumberConstraints(undefined)).toBe(false);

		});

	});

	describe("isNumericConstraints", () => {

		it("returns true for empty object", async () => {

			expect(isNumericConstraints({})).toBe(true);

		});

		it("returns true for object with valid numeric constraints", async () => {

			expect(isNumericConstraints({ in: [1, 2, 3] })).toBe(true);
			expect(isNumericConstraints({ hasValue: [1, 2] })).toBe(true);

		});

		it("returns false for non-object values", async () => {

			expect(isNumericConstraints(null)).toBe(false);
			expect(isNumericConstraints(undefined)).toBe(false);

		});

	});

});

describe("factories", () => {

	describe("number", () => {

		describe("shape", () => {

			it("returns a shape with kind 'number'", async () => {

				expect(number().kind).toBe("number");
				expect(number(42).kind).toBe("number");
				expect(number({ model: 42 }).kind).toBe("number");

			});

			it("returns a shape with default model", async () => {

				expect(number().model).toBe(0);
				expect(number({}).model).toBe(0);

			});

			it("returns a shape with model argument", async () => {

				expect(number(42).model).toBe(42);

			});

			it("returns a shape with model constraint", async () => {

				expect(number({ model: 42 }).model).toBe(42);

			});

			it("returns an immutable shape", async () => {

				const shape = number();

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = 1).toThrow();

			});

		});

		describe("constraints", () => {

			describe("model", () => {

				it("rejects non-number value", async () => {

					expect(() => number({ model: "42" } as any)).toThrow(TypeError);

				});

			});

			describe("minExclusive", () => {

				it("accepts constraint", async () => {

					expect(number({ minExclusive: 0 }).minExclusive).toBe(0);

				});

				it("rejects non-number value", async () => {

					expect(() => number({ minExclusive: "0" } as any)).toThrow(TypeError);

				});

			});

			describe("maxExclusive", () => {

				it("accepts constraint", async () => {

					expect(number({ maxExclusive: 100 }).maxExclusive).toBe(100);

				});

				it("rejects non-number value", async () => {

					expect(() => number({ maxExclusive: "100" } as any)).toThrow(TypeError);

				});

			});

			describe("minInclusive", () => {

				it("accepts constraint", async () => {

					expect(number({ minInclusive: 0 }).minInclusive).toBe(0);

				});

				it("rejects non-number value", async () => {

					expect(() => number({ minInclusive: "0" } as any)).toThrow(TypeError);

				});

			});

			describe("maxInclusive", () => {

				it("accepts constraint", async () => {

					expect(number({ maxInclusive: 100 }).maxInclusive).toBe(100);

				});

				it("rejects non-number value", async () => {

					expect(() => number({ maxInclusive: "100" } as any)).toThrow(TypeError);

				});

			});

			describe("in", () => {

				it("accepts constraint", async () => {

					expect(number({ in: [1, 2, 3] }).in).toEqual([1, 2, 3]);

				});

				it("rejects non-array value", async () => {

					expect(() => number({ in: "1,2,3" } as any)).toThrow(TypeError);

				});

				it("rejects non-number array elements", async () => {

					expect(() => number({ in: [1, "2", 3] } as any)).toThrow(TypeError);

				});

			});

			describe("hasValue", () => {

				it("accepts constraint", async () => {

					expect(number({ hasValue: [1, 2] }).hasValue).toEqual([1, 2]);

				});

				it("rejects non-array value", async () => {

					expect(() => number({ hasValue: 1 } as any)).toThrow(TypeError);

				});

				it("rejects non-number array elements", async () => {

					expect(() => number({ hasValue: [1, "2"] } as any)).toThrow(TypeError);

				});

			});

			describe("combined", () => {

				it("accepts multiple constraints", async () => {

					const shape = number({ minInclusive: 0, maxInclusive: 100, in: [1, 2, 3] });

					expect(shape.minInclusive).toBe(0);
					expect(shape.maxInclusive).toBe(100);
					expect(shape.in).toEqual([1, 2, 3]);

				});

				it("includes only provided properties", async () => {

					expect(Object.keys(number()).sort()).toEqual(["kind", "model"]);

				});

				it("rejects extra properties", async () => {

					expect(() => number({ extra: "ignored" } as any)).toThrow(TypeError);

				});

			});

		});

	});

	describe("byte", () => {

		it("returns a shape with model 8", async () => {

			expect(byte().kind).toBe("number");
			expect(byte().model).toBe(8);

		});

		it("passes through constraints", async () => {

			const shape = byte({ minInclusive: -128, maxInclusive: 127 });

			expect(shape.minInclusive).toBe(-128);
			expect(shape.maxInclusive).toBe(127);

		});

	});

	describe("short", () => {

		it("returns a shape with model 16", async () => {

			expect(short().kind).toBe("number");
			expect(short().model).toBe(16);

		});

		it("passes through constraints", async () => {

			const shape = short({ minInclusive: -32768, maxInclusive: 32767 });

			expect(shape.minInclusive).toBe(-32768);
			expect(shape.maxInclusive).toBe(32767);

		});

	});

	describe("int", () => {

		it("returns a shape with model 32", async () => {

			expect(int().kind).toBe("number");
			expect(int().model).toBe(32);

		});

		it("passes through constraints", async () => {

			const shape = int({ minInclusive: 0, maxInclusive: 1000 });

			expect(shape.minInclusive).toBe(0);
			expect(shape.maxInclusive).toBe(1000);

		});

	});

	describe("long", () => {

		it("returns a shape with model 64", async () => {

			expect(long().kind).toBe("number");
			expect(long().model).toBe(64);

		});

		it("passes through constraints", async () => {

			const shape = long({ minInclusive: 0 });

			expect(shape.minInclusive).toBe(0);

		});

	});

	describe("float", () => {

		it("returns a shape with model 0.32", async () => {

			expect(float().kind).toBe("number");
			expect(float().model).toBe(0.32);

		});

		it("passes through constraints", async () => {

			const shape = float({ minInclusive: 0, maxExclusive: 1 });

			expect(shape.minInclusive).toBe(0);
			expect(shape.maxExclusive).toBe(1);

		});

	});

	describe("double", () => {

		it("returns a shape with model 0.64", async () => {

			expect(double().kind).toBe("number");
			expect(double().model).toBe(0.64);

		});

		it("passes through constraints", async () => {

			const shape = double({ minExclusive: -1, maxExclusive: 1 });

			expect(shape.minExclusive).toBe(-1);
			expect(shape.maxExclusive).toBe(1);

		});

	});

	describe("integer", () => {

		it("returns a shape with model 1", async () => {

			expect(integer().kind).toBe("number");
			expect(integer().model).toBe(1);

		});

		it("passes through constraints", async () => {

			const shape = integer({ minInclusive: 1, maxInclusive: 100 });

			expect(shape.minInclusive).toBe(1);
			expect(shape.maxInclusive).toBe(100);

		});

	});

	describe("decimal", () => {

		it("returns a shape with model 1.1", async () => {

			expect(decimal().kind).toBe("number");
			expect(decimal().model).toBe(1.1);

		});

		it("passes through constraints", async () => {

			const shape = decimal({ minInclusive: 0, maxInclusive: 99.99 });

			expect(shape.minInclusive).toBe(0);
			expect(shape.maxInclusive).toBe(99.99);

		});

	});

});

describe("validators", () => {

	describe("validateNumber", () => {

		describe("minExclusive constraint", () => {

			it("returns empty trace for values strictly greater than minimum", async () => {

				expect(validateNumber([1], number({ minExclusive: 0 }))).toEqual([]);

			});

			it("returns trace for values equal to minimum", async () => {

				expect(validateNumber([0], number({ minExclusive: 0 })).length).toBeGreaterThan(0);

			});

			it("returns trace for values less than minimum", async () => {

				expect(validateNumber([-1], number({ minExclusive: 0 })).length).toBeGreaterThan(0);

			});

			it("returns empty trace for fractional values above boundary", async () => {

				expect(validateNumber([0.0001], number({ minExclusive: 0 }))).toEqual([]);

			});

		});

		describe("maxExclusive constraint", () => {

			it("returns empty trace for values strictly less than maximum", async () => {

				expect(validateNumber([99], number({ maxExclusive: 100 }))).toEqual([]);

			});

			it("returns trace for values equal to maximum", async () => {

				expect(validateNumber([100], number({ maxExclusive: 100 })).length).toBeGreaterThan(0);

			});

			it("returns trace for values greater than maximum", async () => {

				expect(validateNumber([101], number({ maxExclusive: 100 })).length).toBeGreaterThan(0);

			});

			it("returns empty trace for fractional values below boundary", async () => {

				expect(validateNumber([99.9999], number({ maxExclusive: 100 }))).toEqual([]);

			});

		});

		describe("minInclusive constraint", () => {

			it("returns empty trace for values greater than minimum", async () => {

				expect(validateNumber([1], number({ minInclusive: 0 }))).toEqual([]);

			});

			it("returns empty trace for values equal to minimum", async () => {

				expect(validateNumber([0], number({ minInclusive: 0 }))).toEqual([]);

			});

			it("returns trace for values less than minimum", async () => {

				expect(validateNumber([-1], number({ minInclusive: 0 })).length).toBeGreaterThan(0);

			});

		});

		describe("maxInclusive constraint", () => {

			it("returns empty trace for values less than maximum", async () => {

				expect(validateNumber([99], number({ maxInclusive: 100 }))).toEqual([]);

			});

			it("returns empty trace for values equal to maximum", async () => {

				expect(validateNumber([100], number({ maxInclusive: 100 }))).toEqual([]);

			});

			it("returns trace for values greater than maximum", async () => {

				expect(validateNumber([101], number({ maxInclusive: 100 })).length).toBeGreaterThan(0);

			});

		});

		describe("combined range constraints", () => {

			it("returns empty trace for values within inclusive range", async () => {

				expect(validateNumber([50], number({ minInclusive: 0, maxInclusive: 100 }))).toEqual([]);

			});

			it("returns empty trace for values at inclusive boundaries", async () => {

				const shape = number({ minInclusive: 0, maxInclusive: 100 });

				expect(validateNumber([0], shape)).toEqual([]);
				expect(validateNumber([100], shape)).toEqual([]);

			});

			it("returns empty trace for values within exclusive range", async () => {

				expect(validateNumber([50], number({ minExclusive: 0, maxExclusive: 100 }))).toEqual([]);

			});

			it("returns trace for values at exclusive boundaries", async () => {

				const shape = number({ minExclusive: 0, maxExclusive: 100 });

				expect(validateNumber([0], shape).length).toBeGreaterThan(0);
				expect(validateNumber([100], shape).length).toBeGreaterThan(0);

			});

			it("validates mixed range (minInclusive, maxExclusive)", async () => {

				const shape = number({ minInclusive: 0, maxExclusive: 100 });

				expect(validateNumber([0], shape)).toEqual([]);
				expect(validateNumber([99], shape)).toEqual([]);
				expect(validateNumber([100], shape).length).toBeGreaterThan(0);

			});

			it("validates mixed range (minExclusive, maxInclusive)", async () => {

				const shape = number({ minExclusive: 0, maxInclusive: 100 });

				expect(validateNumber([0], shape).length).toBeGreaterThan(0);
				expect(validateNumber([1], shape)).toEqual([]);
				expect(validateNumber([100], shape)).toEqual([]);

			});

		});

		describe("in constraint", () => {

			it("returns empty trace for values in the enumeration", async () => {

				const shape = number({ in: [1, 2, 3] });

				expect(validateNumber([1], shape)).toEqual([]);
				expect(validateNumber([2], shape)).toEqual([]);
				expect(validateNumber([3], shape)).toEqual([]);

			});

			it("returns trace for values not in the enumeration", async () => {

				expect(validateNumber([4], number({ in: [1, 2, 3] })).length).toBeGreaterThan(0);

			});

			it("returns trace for values close to but not in the enumeration", async () => {

				expect(validateNumber([1.5], number({ in: [1, 2, 3] })).length).toBeGreaterThan(0);

			});

			it("returns trace for empty enumeration", async () => {

				expect(validateNumber([1], number({ in: [] })).length).toBeGreaterThan(0);

			});

			it("validates single-value enumeration", async () => {

				const shape = number({ in: [42] });

				expect(validateNumber([42], shape)).toEqual([]);
				expect(validateNumber([0], shape).length).toBeGreaterThan(0);

			});

			it("returns empty trace for negative values in enumeration", async () => {

				expect(validateNumber([-1], number({ in: [-1, 0, 1] }))).toEqual([]);

			});

			it("validates floating-point values in enumeration", async () => {

				const shape = number({ in: [1.5, 2.5, 3.5] });

				expect(validateNumber([1.5], shape)).toEqual([]);
				expect(validateNumber([1], shape).length).toBeGreaterThan(0);

			});

		});

		describe("hasValue constraint", () => {

			it("returns empty trace when all required values are present", async () => {

				expect(validateNumber([1, 2, 3], number({ hasValue: [1, 2] }))).toEqual([]);

			});

			it("returns empty trace when values exactly match required", async () => {

				expect(validateNumber([1, 2], number({ hasValue: [1, 2] }))).toEqual([]);

			});

			it("returns trace when required value is missing", async () => {

				expect(validateNumber([1, 3], number({ hasValue: [1, 2] })).length).toBeGreaterThan(0);

			});

			it("returns trace when values array is empty", async () => {

				expect(validateNumber([], number({ hasValue: [1] })).length).toBeGreaterThan(0);

			});

			it("returns empty trace when hasValue is empty array", async () => {

				expect(validateNumber([1, 2], number({ hasValue: [] }))).toEqual([]);

			});

			it("returns empty trace for single required value present", async () => {

				expect(validateNumber([1], number({ hasValue: [1] }))).toEqual([]);

			});

		});

		describe("combined constraints", () => {

			it("returns empty trace when satisfying both range and enumeration", async () => {

				const shape = number({ minInclusive: 0, maxInclusive: 10, in: [2, 4, 6, 8] });

				expect(validateNumber([2], shape)).toEqual([]);
				expect(validateNumber([8], shape)).toEqual([]);

			});

			it("returns trace for values satisfying range but not enumeration", async () => {

				expect(validateNumber([5], number({
					minInclusive: 0,
					maxInclusive: 10,
					in: [2, 4, 6, 8]
				})).length).toBeGreaterThan(0);

			});

			it("validates values against both enumeration and range", async () => {

				const shape = number({ minInclusive: 5, in: [1, 2, 3, 7, 8, 9] });

				expect(validateNumber([1], shape).length).toBeGreaterThan(0);
				expect(validateNumber([7], shape)).toEqual([]);

			});

		});

		describe("no constraints", () => {

			it("returns empty trace for any finite number with no constraints", async () => {

				const shape = number();

				expect(validateNumber([0], shape)).toEqual([]);
				expect(validateNumber([42], shape)).toEqual([]);
				expect(validateNumber([-42], shape)).toEqual([]);
				expect(validateNumber([3.14159], shape)).toEqual([]);

			});

		});

		describe("per-value errors", () => {

			it("reports one error per failing value for minInclusive", async () => {

				expect(validateNumber([-1, -2], number({ minInclusive: 0 }))).toHaveLength(2);

			});

			it("reports one error per failing value for maxInclusive", async () => {

				expect(validateNumber([150, 200], number({ maxInclusive: 100 }))).toHaveLength(2);

			});

			it("reports one error per failing value for minExclusive", async () => {

				expect(validateNumber([0, -1], number({ minExclusive: 0 }))).toHaveLength(2);

			});

			it("reports one error per failing value for maxExclusive", async () => {

				expect(validateNumber([100, 101], number({ maxExclusive: 100 }))).toHaveLength(2);

			});

			it("reports one error per failing value for in", async () => {

				expect(validateNumber([4, 5], number({ in: [1, 2, 3] }))).toHaveLength(2);

			});

			it("reports errors only for failing values", async () => {

				expect(validateNumber([-1, 50, -2], number({ minInclusive: 0 }))).toHaveLength(2);

			});

		});

	});

});
