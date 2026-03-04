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
import { validateNumber } from "./number.core.js";
import { byte, decimal, double, float, int, integer, long, number, short } from "./number.js";


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

			describe("minExclusive", () => {

				it("accepts constraint", async () => {

					expect(number({ minExclusive: 0 }).minExclusive).toBe(0);

				});

			});

			describe("maxExclusive", () => {

				it("accepts constraint", async () => {

					expect(number({ maxExclusive: 100 }).maxExclusive).toBe(100);

				});

			});

			describe("minInclusive", () => {

				it("accepts constraint", async () => {

					expect(number({ minInclusive: 0 }).minInclusive).toBe(0);

				});

			});

			describe("maxInclusive", () => {

				it("accepts constraint", async () => {

					expect(number({ maxInclusive: 100 }).maxInclusive).toBe(100);

				});

			});

			describe("in", () => {

				it("accepts constraint", async () => {

					expect(number({ in: [1, 2, 3] }).in).toEqual([1, 2, 3]);

				});

			});

			describe("hasValue", () => {

				it("accepts constraint", async () => {

					expect(number({ hasValue: [1, 2] }).hasValue).toEqual([1, 2]);

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

		describe("type filtering", () => {

			it("returns undefined for valid numeric values", async () => {

				expect(validateNumber([42], number())).toBeUndefined();

			});

			it("returns undefined for empty values array", async () => {

				expect(validateNumber([], number())).toBeUndefined();

			});

			it("returns trace with kind key for non-numeric value", async () => {

				const trace = validateNumber(["hello"], number());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for multiple non-numeric values", async () => {

				const trace = validateNumber(["hello", true], number());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");
				expect((trace as Record<string, string>)["{kind}"]).toMatch(/\(2\/2\)/);

			});

			it("returns trace with kind key for mixed values", async () => {

				const trace = validateNumber(["hello", 42, true], number());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("validates only matched numeric values against constraints", async () => {

				const trace = validateNumber([-1, "hello", -2], number({ minInclusive: 0 }));

				expect(trace).toHaveProperty("{kind}");
				expect(trace).toHaveProperty("{minInclusive}");

			});

			it("returns undefined when non-numeric values filtered and numbers pass", async () => {

				const trace = validateNumber([42, "hello"], number({ minInclusive: 0 }));

				expect(trace).toHaveProperty("{kind}");
				expect(trace).not.toHaveProperty("{minInclusive}");

			});

		});

		describe("minExclusive constraint", () => {

			it("returns undefined for values strictly greater than minimum", async () => {

				expect(validateNumber([1], number({ minExclusive: 0 }))).toBeUndefined();

			});

			it("returns trace for values equal to minimum", async () => {

				expect(validateNumber([0], number({ minExclusive: 0 }))).toHaveProperty("{minExclusive}");

			});

			it("returns trace for values less than minimum", async () => {

				expect(validateNumber([-1], number({ minExclusive: 0 }))).toHaveProperty("{minExclusive}");

			});

			it("returns undefined for fractional values above boundary", async () => {

				expect(validateNumber([0.0001], number({ minExclusive: 0 }))).toBeUndefined();

			});

		});

		describe("maxExclusive constraint", () => {

			it("returns undefined for values strictly less than maximum", async () => {

				expect(validateNumber([99], number({ maxExclusive: 100 }))).toBeUndefined();

			});

			it("returns trace for values equal to maximum", async () => {

				expect(validateNumber([100], number({ maxExclusive: 100 }))).toHaveProperty("{maxExclusive}");

			});

			it("returns trace for values greater than maximum", async () => {

				expect(validateNumber([101], number({ maxExclusive: 100 }))).toHaveProperty("{maxExclusive}");

			});

			it("returns undefined for fractional values below boundary", async () => {

				expect(validateNumber([99.9999], number({ maxExclusive: 100 }))).toBeUndefined();

			});

		});

		describe("minInclusive constraint", () => {

			it("returns undefined for values greater than minimum", async () => {

				expect(validateNumber([1], number({ minInclusive: 0 }))).toBeUndefined();

			});

			it("returns undefined for values equal to minimum", async () => {

				expect(validateNumber([0], number({ minInclusive: 0 }))).toBeUndefined();

			});

			it("returns trace for values less than minimum", async () => {

				expect(validateNumber([-1], number({ minInclusive: 0 }))).toHaveProperty("{minInclusive}");

			});

		});

		describe("maxInclusive constraint", () => {

			it("returns undefined for values less than maximum", async () => {

				expect(validateNumber([99], number({ maxInclusive: 100 }))).toBeUndefined();

			});

			it("returns undefined for values equal to maximum", async () => {

				expect(validateNumber([100], number({ maxInclusive: 100 }))).toBeUndefined();

			});

			it("returns trace for values greater than maximum", async () => {

				expect(validateNumber([101], number({ maxInclusive: 100 }))).toHaveProperty("{maxInclusive}");

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

				expect(validateNumber([0], shape)).toHaveProperty("{minExclusive}");
				expect(validateNumber([100], shape)).toHaveProperty("{maxExclusive}");

			});

			it("validates mixed range (minInclusive, maxExclusive)", async () => {

				const shape = number({ minInclusive: 0, maxExclusive: 100 });

				expect(validateNumber([0], shape)).toBeUndefined();
				expect(validateNumber([99], shape)).toBeUndefined();
				expect(validateNumber([100], shape)).toHaveProperty("{maxExclusive}");

			});

			it("validates mixed range (minExclusive, maxInclusive)", async () => {

				const shape = number({ minExclusive: 0, maxInclusive: 100 });

				expect(validateNumber([0], shape)).toHaveProperty("{minExclusive}");
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

				expect(validateNumber([4], number({ in: [1, 2, 3] }))).toHaveProperty("{in}");

			});

			it("returns trace for values close to but not in the enumeration", async () => {

				expect(validateNumber([1.5], number({ in: [1, 2, 3] }))).toHaveProperty("{in}");

			});

			it("returns trace for empty enumeration", async () => {

				expect(validateNumber([1], number({ in: [] }))).toHaveProperty("{in}");

			});

			it("validates single-value enumeration", async () => {

				const shape = number({ in: [42] });

				expect(validateNumber([42], shape)).toBeUndefined();
				expect(validateNumber([0], shape)).toHaveProperty("{in}");

			});

			it("returns undefined for negative values in enumeration", async () => {

				expect(validateNumber([-1], number({ in: [-1, 0, 1] }))).toBeUndefined();

			});

			it("validates floating-point values in enumeration", async () => {

				const shape = number({ in: [1.5, 2.5, 3.5] });

				expect(validateNumber([1.5], shape)).toBeUndefined();
				expect(validateNumber([1], shape)).toHaveProperty("{in}");

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

				expect(validateNumber([1, 3], number({ hasValue: [1, 2] }))).toHaveProperty("{hasValue}");

			});

			it("returns trace when values array is empty", async () => {

				expect(validateNumber([], number({ hasValue: [1] }))).toHaveProperty("{hasValue}");

			});

			it("returns undefined when hasValue is empty array", async () => {

				expect(validateNumber([1, 2], number({ hasValue: [] }))).toBeUndefined();

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
				}))).toHaveProperty("{in}");

			});

			it("validates values against both enumeration and range", async () => {

				const shape = number({ minInclusive: 5, in: [1, 2, 3, 7, 8, 9] });

				const result = validateNumber([4], shape);

				expect(result).toHaveProperty("{minInclusive}");
				expect(result).toHaveProperty("{in}");
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

		describe("per-value errors", () => {

			it("includes count prefix for multiple failing values", async () => {

				const result = validateNumber([-1, -2], number({ minInclusive: 0 }));

				expect(typeof result === "object" && typeof (result as any)["{minInclusive}"] === "string"
					&& (result as any)["{minInclusive}"].startsWith("(2/2)")).toBeTruthy();

			});

			it("reports errors only for failing values in count prefix", async () => {

				const result = validateNumber([-1, 50, -2], number({ minInclusive: 0 }));

				expect(typeof result === "object" && typeof (result as any)["{minInclusive}"] === "string"
					&& (result as any)["{minInclusive}"].startsWith("(2/3)")).toBeTruthy();

			});

			it("omits count prefix for single value", async () => {

				const result = validateNumber([-1], number({ minInclusive: 0 }));

				expect(typeof result === "object" && typeof (result as any)["{minInclusive}"] === "string"
					&& !(result as any)["{minInclusive}"].startsWith("(")).toBeTruthy();

			});

		});

	});

});
