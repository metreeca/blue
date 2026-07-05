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
import { byte, decimal, double, float, int, integer, long, number, short } from "./number.js";

describe("factories", () => {

	describe("number", () => {

		describe("shape", () => {

			it("returns a shape with kind 'number'", async () => {

				expect(number().kind).toBe("number");
				expect(number(42).kind).toBe("number");
				expect(number({ model: 42 }).kind).toBe("number");

			});

			it.each<[string, () => number, number]>([
				["no arguments", () => number().model, 0],
				["empty constraints", () => number({}).model, 0],
				["model argument", () => number(42).model, 42],
				["model constraint", () => number({ model: 42 }).model, 42]
			])("resolves model from %s", async (_label, model, expected) => {

				expect(model()).toBe(expected);

			});

			it("returns an immutable shape", async () => {

				const shape = number();

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = 1).toThrow();

			});

		});

		describe("constraints", () => {

			it.each<[string, Record<string, unknown>, string, unknown]>([
				["minExclusive", { minExclusive: 0 }, "minExclusive", 0],
				["maxExclusive", { maxExclusive: 100 }, "maxExclusive", 100],
				["minInclusive", { minInclusive: 0 }, "minInclusive", 0],
				["maxInclusive", { maxInclusive: 100 }, "maxInclusive", 100],
				["in", { in: [1, 2, 3] }, "in", [1, 2, 3]],
				["hasValue", { hasValue: [1, 2] }, "hasValue", [1, 2]]
			])("accepts %s constraint", async (_name, constraints, field, expected) => {

				expect((number(constraints as any) as any)[field]).toEqual(expected);

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

			describe("datatype", () => {

				it("omits datatype by default", async () => {

					expect(number().datatype).toBeUndefined();

				});

				it("passes through an explicit datatype", async () => {

					expect(number({ datatype: xsd.int }).datatype).toBe(xsd.int);

				});

			});

		});

	});

	describe("model resolution", () => {

		it("defaults the model to 0", async () => {

			expect(number().model).toBe(0);
			expect(byte().model).toBe(0);

		});

		it("keeps the default 0 regardless of value constraints", async () => {

			expect(number({ minInclusive: 5 }).model).toBe(0);
			expect(number({ minExclusive: 0, maxExclusive: 10 }).model).toBe(0);
			expect(number({ in: [2, 3] }).model).toBe(0);
			expect(byte({ minInclusive: 10, maxInclusive: 20 }).model).toBe(0);

		});

		it("keeps an explicit model verbatim, even when illegal for the constraints", async () => {

			expect(number({ model: 7 }).model).toBe(7);
			expect(number({ model: 0, minInclusive: 5 }).model).toBe(0);

		});

		it("rejects an empty integral range", async () => {

			expect(() => integer({ minExclusive: 0, maxExclusive: 1 })).toThrow(RangeError);

		});

	});

	describe.each([
		["byte", byte, 0, xsd.byte],
		["short", short, 0, xsd.short],
		["int", int, 0, xsd.int],
		["long", long, 0, xsd.long],
		["float", float, 0, xsd.float],
		["double", double, 0, xsd.double],
		["integer", integer, 0, xsd.integer],
		["decimal", decimal, 0, xsd.decimal]
	] as const)("%s", (_label, factory, expectedModel, expectedDatatype) => {

		it("returns a shape with expected kind and model", async () => {

			expect(factory().kind).toBe("number");
			expect(factory().model).toBe(expectedModel);

		});

		it("sets the matching xsd datatype", async () => {

			expect(factory().datatype).toBe(expectedDatatype);

		});

		it("passes through constraints", async () => {

			const shape = factory({ minInclusive: 0 });

			expect(shape.minInclusive).toBe(0);

		});

	});

	describe.each([
		["byte", byte, -128, 127],
		["short", short, -32768, 32767],
		["int", int, -2147483648, 2147483647],
		["long", long, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
		["float", float, -((2-2** -23)*2**127), (2-2** -23)*2**127]
	] as const)("%s range defaults", (_label, factory, expectedMin, expectedMax) => {

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

	describe.each([
		["double", double],
		["integer", integer],
		["decimal", decimal]
	] as const)("%s no range defaults", (_label, factory) => {

		it("omits range bounds by default", async () => {

			const shape = factory();

			expect(shape.minInclusive).toBeUndefined();
			expect(shape.maxInclusive).toBeUndefined();

		});

	});

	describe.each([
		["byte", byte],
		["short", short],
		["int", int],
		["long", long],
		["integer", integer]
	] as const)("%s integral default", (_label, factory) => {

		it("marks the shape integral", async () => {

			expect(factory().integral).toBe(true);

		});

	});

	describe.each([
		["float", float],
		["double", double],
		["decimal", decimal]
	] as const)("%s fractional default", (_label, factory) => {

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

			expect(checkNumber({ minExclusive: 10, maxExclusive: 10 })).toHaveProperty("{minExclusive/maxExclusive}");
			expect(checkNumber({ minExclusive: 10, maxExclusive: 5 })).toHaveProperty("{minExclusive/maxExclusive}");

		});

		it("returns trace for minInclusive > maxInclusive", async () => {

			expect(checkNumber({ minInclusive: 10, maxInclusive: 5 })).toHaveProperty("{minInclusive/maxInclusive}");

		});

		it("returns undefined for minInclusive equal to maxInclusive", async () => {

			expect(checkNumber({ minInclusive: 5, maxInclusive: 5 })).toBeUndefined();

		});

		it("returns trace for minExclusive >= maxInclusive", async () => {

			expect(checkNumber({ minExclusive: 10, maxInclusive: 10 })).toHaveProperty("{minExclusive/maxInclusive}");
			expect(checkNumber({ minExclusive: 10, maxInclusive: 5 })).toHaveProperty("{minExclusive/maxInclusive}");

		});

		it("returns trace for minInclusive >= maxExclusive", async () => {

			expect(checkNumber({ minInclusive: 10, maxExclusive: 10 })).toHaveProperty("{minInclusive/maxExclusive}");
			expect(checkNumber({ minInclusive: 10, maxExclusive: 5 })).toHaveProperty("{minInclusive/maxExclusive}");

		});

		it("returns trace for hasValue entries not in the in set", async () => {

			expect(checkNumber({ hasValue: [5], in: [1, 2, 3] })).toHaveProperty("{hasValue/in}");

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

			expect(checkNumber({ integral: true, minInclusive: 1.5 })).toHaveProperty("{integral/minInclusive}");
			expect(checkNumber({ integral: true, maxInclusive: 9.5 })).toHaveProperty("{integral/maxInclusive}");
			expect(checkNumber({ integral: true, minExclusive: 0.5 })).toHaveProperty("{integral/minExclusive}");
			expect(checkNumber({ integral: true, maxExclusive: 8.5 })).toHaveProperty("{integral/maxExclusive}");

		});

		it("returns trace for a fractional in member when integral", async () => {

			expect(checkNumber({ integral: true, in: [1, 2.5] })).toHaveProperty("{integral/in}");

		});

		it("returns trace for a fractional hasValue member when integral", async () => {

			expect(checkNumber({ integral: true, hasValue: [1.5] })).toHaveProperty("{integral/hasValue}");

		});

		it("ignores fractional bounds and sets when not integral", async () => {

			expect(checkNumber({ minInclusive: 1.5, in: [1.5], hasValue: [1.5] })).toBeUndefined();

		});

		it("returns trace for an empty integral range", async () => {

			expect(checkNumber({
				integral: true,
				minExclusive: 0,
				maxExclusive: 1
			})).toHaveProperty("{integral/range}");

		});

		it("returns undefined for a non-empty integral range", async () => {

			expect(checkNumber({ integral: true, minInclusive: 0, maxInclusive: 0 })).toBeUndefined();

		});

		it("returns undefined for a narrow continuous range", async () => {

			expect(checkNumber({ minExclusive: 0, maxExclusive: 1 })).toBeUndefined();

		});

		it("returns undefined for a legal model", async () => {

			expect(checkNumber({ model: 5, minInclusive: 0, maxInclusive: 10 })).toBeUndefined();
			expect(checkNumber({ model: 2, in: [1, 2, 3] })).toBeUndefined();

		});

		it("does not check model legality, as a model is a placeholder", async () => {

			expect(checkNumber({ model: -1, minInclusive: 0 })).toBeUndefined();
			expect(checkNumber({ model: 11, maxInclusive: 10 })).toBeUndefined();
			expect(checkNumber({ model: 0, minExclusive: 0 })).toBeUndefined();
			expect(checkNumber({ model: 10, maxExclusive: 10 })).toBeUndefined();
			expect(checkNumber({ model: 1.5, integral: true })).toBeUndefined();
			expect(checkNumber({ model: 5, in: [1, 2, 3] })).toBeUndefined();

		});

		it("reports constraint inconsistency regardless of the model", async () => {

			expect(checkNumber({ model: 5, minInclusive: 10, maxInclusive: 0 }))
				.toHaveProperty("{minInclusive/maxInclusive}");

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

		it("accepts equal datatypes", async () => {

			expect(narrowsNumber(int(), int())).toBeUndefined();

		});

		it("accepts a child datatype when the parent has none", async () => {

			expect(narrowsNumber(number({ model: 32, datatype: xsd.int }), number({ model: 32 }))).toBeUndefined();

		});

		it("accepts a parent datatype when the child has none", async () => {

			expect(narrowsNumber(number({ model: 32 }), number({ model: 32, datatype: xsd.int }))).toBeUndefined();

		});

		it("rejects mismatched datatypes", async () => {

			expect(narrowsNumber(number({ datatype: xsd.int }), number({ datatype: xsd.long }))).toHaveProperty("{datatype}");

		});

		it("accepts a child that inherits an integral parent", async () => {

			expect(narrowsNumber(number(), number({ integral: true }))).toBeUndefined();

		});

		it("accepts a child that adds an integral constraint", async () => {

			expect(narrowsNumber(number({ integral: true }), number())).toBeUndefined();

		});

		it("rejects a child that drops an integral parent", async () => {

			expect(narrowsNumber(number({ integral: false }), number({ integral: true }))).toHaveProperty("{integral}");

		});

		it("accepts differing models as compatible placeholders", async () => {

			expect(narrowsNumber(number(32), number(64))).toBeUndefined();

		});

	});

	describe("mergeNumber", () => {

		describe("kind", () => {

			it("preserves kind as 'number'", async () => {

				const merged = mergeNumber(number(), number());

				expect(merged.kind).toBe("number");

			});

		});

		describe("model", () => {

			it("merges shapes with equal models", async () => {

				const merged = mergeNumber(number(), number());

				expect(merged.model).toBe(0);

			});

			it("merges shapes with equal non-default models", async () => {

				const merged = mergeNumber(number(42), number(42));

				expect(merged.model).toBe(42);

			});

			it("merges shapes with different models, keeping the target model", async () => {

				expect(mergeNumber(number(32), number(64)).model).toBe(32);

			});

		});

		describe.each([
			["minExclusive", "minExclusive", 0, 10, 5, 3] as const,
			["maxExclusive", "maxExclusive", 100, 50, 100, 150] as const,
			["minInclusive", "minInclusive", 0, 10, 5, 3] as const,
			["maxInclusive", "maxInclusive", 100, 50, 100, 150] as const
		])("%s", (_name, field, inheritValue, tighterTarget, tighterSource, rejectedTarget) => {

			it(`inherits source ${field} when target has none`, async () => {

				const merged = mergeNumber(number(), number({ [field]: inheritValue }));

				expect((merged as any)[field]).toBe(inheritValue);

			});

			it(`keeps target ${field} when source has none`, async () => {

				const merged = mergeNumber(number({ [field]: inheritValue }), number());

				expect((merged as any)[field]).toBe(inheritValue);

			});

			it(`keeps tighter target ${field}`, async () => {

				const merged = mergeNumber(number({ [field]: tighterTarget }), number({ [field]: tighterSource }));

				expect((merged as any)[field]).toBe(tighterTarget);

			});

			it(`rejects incompatible target ${field}`, async () => {

				expect(() => mergeNumber(number({ [field]: rejectedTarget }), number({ [field]: tighterSource }))).toThrow(RangeError);

			});

		});

		describe("in", () => {

			it("inherits source in when target has none", async () => {

				const merged = mergeNumber(number(), number({ in: [1, 2, 3] }));

				expect(merged.in).toEqual([1, 2, 3]);

			});

			it("keeps target in when source has none", async () => {

				const merged = mergeNumber(number({ in: [1, 2] }), number());

				expect(merged.in).toEqual([1, 2]);

			});

			it("intersects target and source in", async () => {

				const merged = mergeNumber(
					number({ in: [1, 2, 3] }),
					number({ in: [2, 3, 4] })
				);

				expect(merged.in).toEqual([2, 3]);

			});

			it("rejects empty intersection", async () => {

				expect(() => mergeNumber(
					number({ in: [1, 2] }),
					number({ in: [3, 4] })
				)).toThrow(RangeError);

			});

		});

		describe("hasValue", () => {

			it("inherits source hasValue when target has none", async () => {

				const merged = mergeNumber(number(), number({ hasValue: [1] }));

				expect(merged.hasValue).toEqual([1]);

			});

			it("keeps target hasValue when source has none", async () => {

				const merged = mergeNumber(number({ hasValue: [1] }), number());

				expect(merged.hasValue).toEqual([1]);

			});

			it("unions target and source hasValue", async () => {

				const merged = mergeNumber(
					number({ hasValue: [1, 2] }),
					number({ hasValue: [2, 3] })
				);

				expect(merged.hasValue).toEqual(expect.arrayContaining([1, 2, 3]));
				expect(merged.hasValue).toHaveLength(3);

			});

		});

		describe("datatype", () => {

			it("inherits source datatype when target has none", async () => {

				const merged = mergeNumber(number({ model: 32 }), number({ model: 32, datatype: xsd.int }));

				expect(merged.datatype).toBe(xsd.int);

			});

			it("keeps target datatype when source has none", async () => {

				const merged = mergeNumber(number({ model: 32, datatype: xsd.int }), number({ model: 32 }));

				expect(merged.datatype).toBe(xsd.int);

			});

			it("keeps equal datatype", async () => {

				const merged = mergeNumber(number({ datatype: xsd.int }), number({ datatype: xsd.int }));

				expect(merged.datatype).toBe(xsd.int);

			});

			it("rejects mismatched datatype", async () => {

				expect(() => mergeNumber(number({ datatype: xsd.int }), number({ datatype: xsd.long }))).toThrow(RangeError);

			});

		});

		describe("integral", () => {

			it("inherits an integral parent when the child omits it", async () => {

				const merged = mergeNumber(number(), number({ integral: true }));

				expect(merged.integral).toBe(true);

			});

			it("keeps the child integral when the parent omits it", async () => {

				const merged = mergeNumber(number({ integral: true }), number());

				expect(merged.integral).toBe(true);

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

			it.each<[string, readonly unknown[], RegExp]>([
				["a single non-numeric value", ["hello"], /expected <number> values$/],
				["mixed valid and non-numeric values", ["hello", 42, true], /expected <number> values \(2\/3\)/],
				["multiple non-numeric values", ["hello", true], /expected <number> values \(2\/2\)/]
			])("returns a kind trace for %s", async (_label, values, message) => {

				const trace = validateNumber(values, number());

				expect(trace).toHaveProperty("{kind}");
				expect((trace as Record<string, string>)["{kind}"]).toMatch(message);

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

		describe("placeholder mode", () => {

			it("skips value-domain constraints for a placeholder", async () => {

				expect(validateNumber([500], number({ maxInclusive: 100 }), { model: true })).toBeUndefined();
				expect(validateNumber([-1], number({ minInclusive: 0 }), { model: true })).toBeUndefined();
				expect(validateNumber([5], number({ in: [1, 2, 3] }), { model: true })).toBeUndefined();
				expect(validateNumber([1.5], number({ integral: true }), { model: true })).toBeUndefined();

			});

			it("still rejects a placeholder of the wrong kind", async () => {

				expect(validateNumber(["nope"], number(), { model: true })).toHaveProperty("{kind}");

			});

		});

		describe.each([
			["minExclusive", { minExclusive: 0 }, "{minExclusive}", 1, 0, -1, 0.0001],
			["maxExclusive", { maxExclusive: 100 }, "{maxExclusive}", 99, 100, 101, 99.9999]
		])("%s constraint", (_name, constraints, traceKey, passingValue, boundaryValue, failingValue, fractionalValue) => {

			it("returns undefined for values strictly within bound", async () => {

				expect(validateNumber([passingValue], number(constraints))).toBeUndefined();

			});

			it("returns trace for values equal to bound", async () => {

				expect(validateNumber([boundaryValue], number(constraints))).toHaveProperty(traceKey);

			});

			it("returns trace for values beyond bound", async () => {

				expect(validateNumber([failingValue], number(constraints))).toHaveProperty(traceKey);

			});

			it("returns undefined for fractional values within bound", async () => {

				expect(validateNumber([fractionalValue], number(constraints))).toBeUndefined();

			});

		});

		describe.each([
			["minInclusive", { minInclusive: 0 }, "{minInclusive}", 1, 0, -1],
			["maxInclusive", { maxInclusive: 100 }, "{maxInclusive}", 99, 100, 101]
		])("%s constraint", (_name, constraints, traceKey, passingValue, boundaryValue, failingValue) => {

			it("returns undefined for values within bound", async () => {

				expect(validateNumber([passingValue], number(constraints))).toBeUndefined();

			});

			it("returns undefined for values equal to bound", async () => {

				expect(validateNumber([boundaryValue], number(constraints))).toBeUndefined();

			});

			it("returns trace for values beyond bound", async () => {

				expect(validateNumber([failingValue], number(constraints))).toHaveProperty(traceKey);

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

				const shape = number({ minInclusive: 5, in: [7, 8, 9] });

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

		describe("integral constraint", () => {

			it("accepts integers when integral", async () => {

				expect(validateNumber([42], number({ integral: true }))).toBeUndefined();

			});

			it("rejects fractional values when integral", async () => {

				expect(validateNumber([3.5], number({ integral: true }))).toHaveProperty("{integral}");

			});

			it("accepts fractional values when not integral", async () => {

				expect(validateNumber([3.5], number({ integral: false }))).toBeUndefined();
				expect(validateNumber([3.5], number())).toBeUndefined();

			});

		});

		describe("per-value errors", () => {

			it.each<[string, readonly number[], RegExp]>([
				["a count prefix for multiple failing values", [-1, -2], /^\(2\/2\) /],
				["only failing values in the count prefix", [-1, 50, -2], /^\(2\/3\) /],
				["no count prefix for a single failing value", [-1], /^expected values >= <0>/]
			])("includes %s", async (_label, values, message) => {

				const trace = validateNumber(values, number({ minInclusive: 0 }));

				expect((trace as Record<string, string>)["{minInclusive}"]).toMatch(message);

			});

		});

	});

});
