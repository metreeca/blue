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
import { checkString, mergeString, narrowsString } from "./assembler.js";
import { date, string, type StringShape } from "./index.js";


describe("checkString", () => {

	it("returns undefined for consistent constraints", async () => {

		expect(checkString({ minLength: 3, maxLength: 10 })).toBeUndefined();
		expect(checkString({ minLength: 5, maxLength: 5 })).toBeUndefined();
		expect(checkString({ hasValue: ["a"], in: ["a", "b", "c"] })).toBeUndefined();
		expect(checkString({})).toBeUndefined();

	});

	it("returns trace for minLength > maxLength", async () => {

		const trace = checkString({ minLength: 10, maxLength: 5 });

		expect(trace).toContainEqual(expect.stringContaining("{minLength/maxLength}"));

	});

	it("returns undefined for minLength equal to maxLength", async () => {

		expect(checkString({ minLength: 5, maxLength: 5 })).toBeUndefined();

	});

	it("returns trace for hasValue entries not in the in set", async () => {

		const trace = checkString({ hasValue: ["x"], in: ["a", "b"] });

		expect(trace).toContainEqual(expect.stringContaining("{hasValue/in}"));

	});

	it("returns undefined when hasValue entries are in the in set", async () => {

		expect(checkString({ hasValue: ["a"], in: ["a", "b", "c"] })).toBeUndefined();

	});

	it("returns undefined when only minLength is specified", async () => {

		expect(checkString({ minLength: 5 })).toBeUndefined();

	});

	it("returns undefined when only maxLength is specified", async () => {

		expect(checkString({ maxLength: 10 })).toBeUndefined();

	});

});

describe("narrowsString", () => {

	it("accepts a child that tightens minLength", async () => {

		expect(narrowsString(string({ minLength: 5 }), string())).toBeUndefined();

	});

	it("accepts an identical child", async () => {

		expect(narrowsString(string(), string())).toBeUndefined();

	});

	it("rejects a child that widens minLength", async () => {

		expect(narrowsString(string({ minLength: 1 }), string({ minLength: 5 }))).toBeDefined();

	});

	it("rejects a child with a disjoint enumeration", async () => {

		expect(narrowsString(string({ in: ["a"] }), string({ in: ["b"] }))).toBeDefined();

	});

	it("accepts a child narrowing an enumeration", async () => {

		expect(narrowsString(string({ in: ["a"] }), string({ in: ["a", "b"] }))).toBeUndefined();

	});

	it("rejects a child widening an enumeration", async () => {

		// a value the parent omits would be intersected away, leaving the state wider than the shape admits

		expect(narrowsString(string({ in: ["a", "b"] }), string({ in: ["a"] }))).toBeDefined();

	});

	it("accepts a child adding required values", async () => {

		expect(narrowsString(
			string({ in: ["a", "b"], hasValue: ["a", "b"] }),
			string({ in: ["a", "b"], hasValue: ["a"] })
		)).toBeUndefined();

	});

	it("rejects a child dropping a required value", async () => {

		// hasValue floors the value set, so a value the child omits would be unioned back in, leaving the
		// child stating a weaker requirement than it enforces

		expect(narrowsString(
			string({ in: ["a", "b"], hasValue: ["a"] }),
			string({ in: ["a", "b"], hasValue: ["a", "b"] })
		)).toBeDefined();

	});

	it("accepts equal datatypes", async () => {

		expect(narrowsString(date(), date())).toBeUndefined();

	});

	it("accepts a child datatype when the parent has none", async () => {

		expect(narrowsString(string({ datatype: xsd.date }), string())).toBeUndefined();

	});

	it("accepts a parent datatype when the child has none", async () => {

		expect(narrowsString(string(), string({ datatype: xsd.date }))).toBeUndefined();

	});

	it("rejects mismatched datatypes", async () => {

		expect(narrowsString(string({ datatype: xsd.date }), string({ datatype: xsd.time })))
			.toContainEqual(expect.stringContaining("{datatype}"));

	});

	it("accepts equal patterns", async () => {

		expect(narrowsString(string({ pattern: "^[a-z]+$" }), string({ pattern: "^[a-z]+$" }))).toBeUndefined();

	});

	it("accepts a child pattern when the parent has none", async () => {

		expect(narrowsString(string({ pattern: "^[a-z]+$" }), string())).toBeUndefined();

	});

	it("accepts a parent pattern when the child has none", async () => {

		expect(narrowsString(string(), string({ pattern: "^[a-z]+$" }))).toBeUndefined();

	});

	it("rejects mismatched patterns", async () => {

		expect(narrowsString(string({ pattern: "^[a-z]+$" }), string({ pattern: "^[0-9]+$" })))
			.toContainEqual(expect.stringContaining("{pattern}"));

	});

});

describe("mergeString", () => {

	describe("kind", () => {

		it("preserves kind as 'string'", async () => {

			expect(mergeString(string(), string()).kind).toBe("string");

		});

	});

	describe("pattern", () => {

		it("inherits source pattern when target has none", async () => {

			expect(mergeString(string(), string({ pattern: "^[a-z]+$" })).pattern).toBe("^[a-z]+$");

		});

		it("keeps target pattern when source has none", async () => {

			expect(mergeString(string({ pattern: "^[a-z]+$" }), string()).pattern).toBe("^[a-z]+$");

		});

		it("keeps the shared pattern when both match", async () => {

			expect(mergeString(
				string({ pattern: "^[a-z]+$" }),
				string({ pattern: "^[a-z]+$" })
			).pattern).toBe("^[a-z]+$");

		});

		it("rejects mismatched patterns", async () => {

			expect(() => mergeString(
				string({ pattern: "^[a-z]+$" }),
				string({ pattern: "^.{3,}$" })
			)).toThrow(RangeError);

		});

		it("returns undefined when neither has a pattern", async () => {

			expect(mergeString(string(), string()).pattern).toBeUndefined();

		});

	});

	describe.each([

		{
			label: "minLength",
			shaped: (value: number) => string({ minLength: value }),
			bound: (shape: StringShape) => shape.minLength,
			source: 5, tighter: 10, incompatible: 3
		},

		{
			label: "maxLength",
			shaped: (value: number) => string({ maxLength: value }),
			bound: (shape: StringShape) => shape.maxLength,
			source: 10, tighter: 5, incompatible: 15
		}

	])("$label", ({ shaped, bound, source, tighter, incompatible }) => {

		it("inherits source value when target has none", async () => {

			expect(bound(mergeString(string(), shaped(source)))).toBe(source);

		});

		it("keeps target value when source has none", async () => {

			expect(bound(mergeString(shaped(source), string()))).toBe(source);

		});

		it("keeps tighter target value", async () => {

			expect(bound(mergeString(shaped(tighter), shaped(source)))).toBe(tighter);

		});

		it("rejects incompatible target value", async () => {

			expect(() => mergeString(shaped(incompatible), shaped(source))).toThrow(RangeError);

		});

	});

	describe("in", () => {

		it("inherits source in when target has none", async () => {

			expect(mergeString(string(), string({ in: ["a", "b", "c"] })).in).toEqual(["a", "b", "c"]);

		});

		it("keeps target in when source has none", async () => {

			expect(mergeString(string({ in: ["a", "b"] }), string()).in).toEqual(["a", "b"]);

		});

		it("keeps a target in narrowing source", async () => {

			expect(mergeString(
				string({ in: ["b", "c"] }),
				string({ in: ["a", "b", "c"] })
			).in).toEqual(["b", "c"]);

		});

		it("rejects a target in widening source", async () => {

			expect(() => mergeString(
				string({ in: ["a", "b", "c"] }),
				string({ in: ["b", "c", "d"] })
			)).toThrow(RangeError);

		});

		it("rejects disjoint sets", async () => {

			expect(() => mergeString(
				string({ in: ["a", "b"] }),
				string({ in: ["c", "d"] })
			)).toThrow(RangeError);

		});

	});

	describe("hasValue", () => {

		it("inherits source hasValue when target has none", async () => {

			expect(mergeString(string(), string({ hasValue: ["a"] })).hasValue).toEqual(["a"]);

		});

		it("keeps target hasValue when source has none", async () => {

			expect(mergeString(string({ hasValue: ["a"] }), string()).hasValue).toEqual(["a"]);

		});

		it("keeps a target hasValue extending source", async () => {

			const merged = mergeString(
				string({ hasValue: ["a", "b", "c"] }),
				string({ hasValue: ["b", "c"] })
			);

			expect(merged.hasValue).toEqual(expect.arrayContaining(["a", "b", "c"]));
			expect(merged.hasValue).toHaveLength(3);

		});

		it("rejects a target hasValue dropping a source value", async () => {

			expect(() => mergeString(
				string({ hasValue: ["a", "b"] }),
				string({ hasValue: ["b", "c"] })
			)).toThrow(RangeError);

		});

	});

	describe("datatype", () => {

		it("inherits source datatype when target has none", async () => {

			expect(mergeString(string(), string({ datatype: xsd.date })).datatype).toBe(xsd.date);

		});

		it("keeps target datatype when source has none", async () => {

			expect(mergeString(string({ datatype: xsd.date }), string()).datatype).toBe(xsd.date);

		});

		it("keeps equal datatype", async () => {

			expect(mergeString(
				string({ datatype: xsd.date }),
				string({ datatype: xsd.date })
			).datatype).toBe(xsd.date);

		});

		it("rejects mismatched datatype", async () => {

			expect(() => mergeString(
				string({ datatype: xsd.date }),
				string({ datatype: xsd.time })
			)).toThrow(RangeError);

		});

	});

	describe("post-merge validation", () => {

		it("rejects merged minLength > merged maxLength", async () => {

			expect(() => mergeString(
				string({ minLength: 10 }),
				string({ maxLength: 5 })
			)).toThrow(RangeError);

		});

		it("accepts merged minLength equal to merged maxLength", async () => {

			const merged = mergeString(
				string({ minLength: 5 }),
				string({ maxLength: 5 })
			);

			expect(merged.minLength).toBe(5);
			expect(merged.maxLength).toBe(5);

		});

		it("rejects hasValue entries not in merged in set", async () => {

			expect(() => mergeString(
				string({ hasValue: ["x"] }),
				string({ in: ["a", "b"] })
			)).toThrow(RangeError);

		});

		it("accepts hasValue entries that are in merged in set", async () => {

			const merged = mergeString(
				string({ hasValue: ["a"] }),
				string({ in: ["a", "b", "c"] })
			);

			expect(merged.hasValue).toEqual(["a"]);

		});

	});

});
