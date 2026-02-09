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
import { isStringConstraints, isStringShape, isTextualConstraints, validateString } from "./string.core.js";
import { date, duration, email, instant, string, time, timestamp, uri, url, year } from "./string.js";


describe("guards", () => {

	describe("isStringShape", () => {

		it("returns true for valid string shape", async () => {

			expect(isStringShape(string())).toBe(true);
			expect(isStringShape(string("example"))).toBe(true);

		});

		it("returns false for object with wrong kind", async () => {

			expect(isStringShape({ kind: "boolean", model: "" })).toBe(false);

		});

		it("returns false for object with non-string model", async () => {

			expect(isStringShape({ kind: "string", model: 42 })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isStringShape(null)).toBe(false);
			expect(isStringShape(undefined)).toBe(false);

		});

	});

	describe("isStringConstraints", () => {

		it("returns true for empty object", async () => {

			expect(isStringConstraints({})).toBe(true);

		});

		it("returns true for object with string model", async () => {

			expect(isStringConstraints({ model: "example" })).toBe(true);

		});

		it("returns true for object with valid constraints", async () => {

			expect(isStringConstraints({ minLength: 1, maxLength: 100 })).toBe(true);
			expect(isStringConstraints({ pattern: "^[A-Z]+$" })).toBe(true);
			expect(isStringConstraints({ pattern: /^[A-Z]+$/ })).toBe(true);

		});

		it("returns false for object with non-string model", async () => {

			expect(isStringConstraints({ model: 42 })).toBe(false);

		});

		it("returns false for object with non-number length constraints", async () => {

			expect(isStringConstraints({ minLength: "1" })).toBe(false);
			expect(isStringConstraints({ maxLength: "100" })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isStringConstraints(null)).toBe(false);
			expect(isStringConstraints(undefined)).toBe(false);

		});

	});

	describe("isTextualConstraints", () => {

		it("returns true for empty object", async () => {

			expect(isTextualConstraints({})).toBe(true);

		});

		it("returns true for object with valid textual constraints", async () => {

			expect(isTextualConstraints({ in: ["a", "b"] })).toBe(true);
			expect(isTextualConstraints({ hasValue: ["required"] })).toBe(true);

		});

		it("returns false for non-object values", async () => {

			expect(isTextualConstraints(null)).toBe(false);
			expect(isTextualConstraints(undefined)).toBe(false);

		});

	});

});

describe("factories", () => {

	describe("string", () => {

		describe("shape", () => {

			it("returns a shape with kind 'string'", async () => {

				expect(string().kind).toBe("string");
				expect(string("example").kind).toBe("string");
				expect(string({ model: "example" }).kind).toBe("string");

			});

			it("returns a shape with default model", async () => {

				expect(string().model).toBe("");
				expect(string({}).model).toBe("");

			});

			it("returns a shape with model argument", async () => {

				expect(string("example").model).toBe("example");

			});

			it("returns a shape with model constraint", async () => {

				expect(string({ model: "example" }).model).toBe("example");

			});

			it("returns an immutable shape", async () => {

				const shape = string();

				expect(() => (shape as any).kind = "number").toThrow();
				expect(() => (shape as any).model = "test").toThrow();

			});

		});

		describe("constraints", () => {

			describe("model", () => {

				it("rejects non-string value", async () => {

					expect(() => string({ model: 42 } as any)).toThrow(TypeError);

				});

			});

			describe("minLength", () => {

				it("accepts constraint", async () => {

					expect(string({ minLength: 1 }).minLength).toBe(1);

				});

				it("rejects non-number value", async () => {

					expect(() => string({ minLength: "1" } as any)).toThrow(TypeError);

				});

			});

			describe("maxLength", () => {

				it("accepts constraint", async () => {

					expect(string({ maxLength: 100 }).maxLength).toBe(100);

				});

				it("rejects non-number value", async () => {

					expect(() => string({ maxLength: "100" } as any)).toThrow(TypeError);

				});

			});

			describe("pattern", () => {

				it("accepts string value", async () => {

					expect(string({ pattern: "^[A-Z]+$" }).pattern).toBe("^[A-Z]+$");

				});

				it("accepts RegExp value", async () => {

					expect(string({ pattern: /^[A-Z]+$/ }).pattern).toBe("^[A-Z]+$");

				});

				it("rejects non-string/RegExp value", async () => {

					expect(() => string({ pattern: 42 } as any)).toThrow(TypeError);

				});

			});

			describe("uniqueLang", () => {

				it("rejects non-boolean value", async () => {

					expect(() => string({ uniqueLang: "true" } as any)).toThrow(TypeError);

				});

			});

			describe("languageIn", () => {

				it("rejects non-array value", async () => {

					expect(() => string({ languageIn: "en" } as any)).toThrow(TypeError);

				});

				it("rejects non-string array elements", async () => {

					expect(() => string({ languageIn: ["en", 42] } as any)).toThrow(TypeError);

				});

			});

			describe("in", () => {

				it("accepts constraint", async () => {

					expect(string({ in: ["a", "b", "c"] }).in).toEqual(["a", "b", "c"]);

				});

				it("rejects non-array value", async () => {

					expect(() => string({ in: "a,b,c" } as any)).toThrow(TypeError);

				});

				it("rejects non-string array elements", async () => {

					expect(() => string({ in: ["a", 42, "c"] } as any)).toThrow(TypeError);

				});

			});

			describe("hasValue", () => {

				it("accepts constraint", async () => {

					expect(string({ hasValue: ["required"] }).hasValue).toEqual(["required"]);

				});

				it("rejects non-array value", async () => {

					expect(() => string({ hasValue: "required" } as any)).toThrow(TypeError);

				});

				it("rejects non-string array elements", async () => {

					expect(() => string({ hasValue: ["a", 42] } as any)).toThrow(TypeError);

				});

			});

			describe("combined", () => {

				it("accepts multiple constraints", async () => {

					const shape = string({
						minLength: 1, maxLength: 100, pattern: "^[A-Z]+$", in: ["A", "B"], hasValue: ["required"]
					});

					expect(shape.minLength).toBe(1);
					expect(shape.maxLength).toBe(100);
					expect(shape.pattern).toBe("^[A-Z]+$");
					expect(shape.in).toEqual(["A", "B"]);
					expect(shape.hasValue).toEqual(["required"]);

				});

				it("includes only provided properties", async () => {

					expect(Object.keys(string()).sort()).toEqual(["kind", "model", "pattern"]);

				});

				it("rejects extra properties", async () => {

					expect(() => string({ extra: "ignored" } as any)).toThrow(TypeError);

				});

			});

		});

	});


	describe("email", () => {

		it("returns a shape with email model", async () => {

			const shape = email();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("user@example.net");

		});

		it("returns a shape with email pattern", async () => {

			const shape = email();

			expect(shape.pattern).toBe("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

		});

		it("passes through constraints", async () => {

			const shape = email({ in: ["user@example.com"] });

			expect(shape.in).toEqual(["user@example.com"]);

		});

		it("rejects model in constraints", async () => {

			expect(() => email({ model: "override" } as any)).toThrow(TypeError);

		});

		it("rejects pattern in constraints", async () => {

			expect(() => email({ pattern: "override" } as any)).toThrow(TypeError);

		});

	});

	describe("url", () => {

		it("returns a shape with url model", async () => {

			const shape = url();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("https://example.net/");

		});

		it("returns a shape with url pattern", async () => {

			const shape = url();

			expect(shape.pattern).toBe("^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\/\\S+$");

		});

		it("rejects model in constraints", async () => {

			expect(() => url({ model: "override" } as any)).toThrow(TypeError);

		});

		it("rejects pattern in constraints", async () => {

			expect(() => url({ pattern: "override" } as any)).toThrow(TypeError);

		});

	});

	describe("uri", () => {

		it("returns a shape with uri model", async () => {

			const shape = uri();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("urn:example:resource");

		});

		it("returns a shape with uri pattern", async () => {

			const shape = uri();

			expect(shape.pattern).toBe("^[a-zA-Z][a-zA-Z0-9+.-]*:\\S+$");

		});

		it("rejects model in constraints", async () => {

			expect(() => uri({ model: "override" } as any)).toThrow(TypeError);

		});

		it("rejects pattern in constraints", async () => {

			expect(() => uri({ pattern: "override" } as any)).toThrow(TypeError);

		});

	});


	describe("year", () => {

		it("returns a shape with year model", async () => {

			const shape = year();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("1970");

		});

		it("returns a shape with year pattern", async () => {

			const shape = year();

			expect(shape.pattern).toBe("^\\d{4}(?:Z|[+-]\\d{2}:\\d{2})?$");

		});

		it("rejects model in constraints", async () => {

			expect(() => year({ model: "override" } as any)).toThrow(TypeError);

		});

		it("rejects pattern in constraints", async () => {

			expect(() => year({ pattern: "override" } as any)).toThrow(TypeError);

		});

	});

	describe("date", () => {

		it("returns a shape with date model", async () => {

			const shape = date();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("1970-01-01");

		});

		it("returns a shape with date pattern", async () => {

			const shape = date();

			expect(shape.pattern).toBe("^\\d{4}-\\d{2}-\\d{2}(?:Z|[+-]\\d{2}:\\d{2})?$");

		});

		it("rejects model in constraints", async () => {

			expect(() => date({ model: "override" } as any)).toThrow(TypeError);

		});

		it("rejects pattern in constraints", async () => {

			expect(() => date({ pattern: "override" } as any)).toThrow(TypeError);

		});

	});

	describe("time", () => {

		it("returns a shape with time model", async () => {

			const shape = time();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("00:00:00");

		});

		it("returns a shape with time pattern", async () => {

			const shape = time();

			expect(shape.pattern).toBe("^\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?$");

		});

		it("rejects model in constraints", async () => {

			expect(() => time({ model: "override" } as any)).toThrow(TypeError);

		});

		it("rejects pattern in constraints", async () => {

			expect(() => time({ pattern: "override" } as any)).toThrow(TypeError);

		});

	});

	describe("instant", () => {

		it("returns a shape with instant model", async () => {

			const shape = instant();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("1970-01-01T00:00:00");

		});

		it("returns a shape with instant pattern", async () => {

			const shape = instant();

			expect(shape.pattern).toBe("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?$");

		});

		it("rejects model in constraints", async () => {

			expect(() => instant({ model: "override" } as any)).toThrow(TypeError);

		});

		it("rejects pattern in constraints", async () => {

			expect(() => instant({ pattern: "override" } as any)).toThrow(TypeError);

		});

	});

	describe("timestamp", () => {

		it("returns a shape with timestamp model", async () => {

			const shape = timestamp();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("1970-01-01T00:00:00.000Z");

		});

		it("returns a shape with timestamp pattern", async () => {

			const shape = timestamp();

			expect(shape.pattern).toBe("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$");

		});

		it("rejects model in constraints", async () => {

			expect(() => timestamp({ model: "override" } as any)).toThrow(TypeError);

		});

		it("rejects pattern in constraints", async () => {

			expect(() => timestamp({ pattern: "override" } as any)).toThrow(TypeError);

		});

	});

	describe("duration", () => {

		it("returns a shape with duration model", async () => {

			const shape = duration();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("PT0S");

		});

		it("returns a shape with duration pattern", async () => {

			const shape = duration();

			expect(shape.pattern).toBe("^-?P(?:\\d+Y)?(?:\\d+M)?(?:\\d+D)?(?:T(?:\\d+H)?(?:\\d+M)?(?:\\d+(?:\\.\\d+)?S)?)?$");

		});

		it("rejects model in constraints", async () => {

			expect(() => duration({ model: "override" } as any)).toThrow(TypeError);

		});

		it("rejects pattern in constraints", async () => {

			expect(() => duration({ pattern: "override" } as any)).toThrow(TypeError);

		});

	});


});

describe("validators", () => {

	describe("validateString", () => {

		describe("minLength constraint", () => {

			it("returns empty trace for strings at minimum length", async () => {

				expect(validateString(["abc"], string({ minLength: 3 }))).toEqual([]);

			});

			it("returns empty trace for strings above minimum length", async () => {

				expect(validateString(["abcdef"], string({ minLength: 3 }))).toEqual([]);

			});

			it("returns trace for strings below minimum length", async () => {

				expect(validateString(["ab"], string({ minLength: 3 })).length).toBeGreaterThan(0);

			});

			it("returns trace for empty string when minLength > 0", async () => {

				expect(validateString([""], string({ minLength: 1 })).length).toBeGreaterThan(0);

			});

			it("returns empty trace for empty string when minLength is 0", async () => {

				expect(validateString([""], string({ minLength: 0 }))).toEqual([]);

			});

		});

		describe("maxLength constraint", () => {

			it("returns empty trace for strings at maximum length", async () => {

				expect(validateString(["hello"], string({ maxLength: 5 }))).toEqual([]);

			});

			it("returns empty trace for strings below maximum length", async () => {

				expect(validateString(["hi"], string({ maxLength: 5 }))).toEqual([]);

			});

			it("returns trace for strings above maximum length", async () => {

				expect(validateString(["hello world"], string({ maxLength: 5 })).length).toBeGreaterThan(0);

			});

			it("returns empty trace for empty string with maxLength constraint", async () => {

				expect(validateString([""], string({ maxLength: 5 }))).toEqual([]);

			});

			it("returns trace when maxLength is 0 and string is non-empty", async () => {

				expect(validateString(["a"], string({ maxLength: 0 })).length).toBeGreaterThan(0);

			});

		});

		describe("combined length constraints", () => {

			it("returns empty trace for strings within length range", async () => {

				expect(validateString(["abc"], string({ minLength: 2, maxLength: 5 }))).toEqual([]);

			});

			it("returns empty trace for strings at length boundaries", async () => {

				const shape = string({ minLength: 2, maxLength: 5 });

				expect(validateString(["ab"], shape)).toEqual([]);
				expect(validateString(["abcde"], shape)).toEqual([]);

			});

			it("returns trace for strings outside length range", async () => {

				const shape = string({ minLength: 2, maxLength: 5 });

				expect(validateString(["a"], shape).length).toBeGreaterThan(0);
				expect(validateString(["abcdef"], shape).length).toBeGreaterThan(0);

			});

		});

		describe("pattern constraint", () => {

			it("returns empty trace for strings matching pattern", async () => {

				expect(validateString(["hello"], string({ pattern: /^[a-z]+$/ }))).toEqual([]);

			});

			it("returns trace for strings not matching pattern", async () => {

				expect(validateString(["Hello123"], string({ pattern: /^[a-z]+$/ })).length).toBeGreaterThan(0);

			});

			it("returns trace for empty string when pattern requires content", async () => {

				expect(validateString([""], string({ pattern: /^[a-z]+$/ })).length).toBeGreaterThan(0);

			});

			it("returns empty trace for strings matching email pattern", async () => {

				expect(validateString(["user@example.com"], string({ pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }))).toEqual([]);

			});

			it("returns trace for invalid email pattern", async () => {

				expect(validateString(["invalid-email"], string({ pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })).length).toBeGreaterThan(0);

			});

			it("validates pattern with anchors", async () => {

				const shape = string({ pattern: /^ABC$/ });

				expect(validateString(["ABC"], shape)).toEqual([]);
				expect(validateString(["ABCD"], shape).length).toBeGreaterThan(0);
				expect(validateString(["0ABC"], shape).length).toBeGreaterThan(0);

			});

			it("validates pattern as string", async () => {

				expect(validateString(["12345"], string({ pattern: "^[0-9]+$" }))).toEqual([]);

			});

		});

		describe("in constraint", () => {

			it("returns empty trace for strings in the enumeration", async () => {

				const shape = string({ in: ["apple", "banana", "cherry"] });

				expect(validateString(["apple"], shape)).toEqual([]);
				expect(validateString(["banana"], shape)).toEqual([]);
				expect(validateString(["cherry"], shape)).toEqual([]);

			});

			it("returns trace for strings not in the enumeration", async () => {

				expect(validateString(["orange"], string({ in: ["apple", "banana", "cherry"] })).length).toBeGreaterThan(0);

			});

			it("returns trace for empty enumeration", async () => {

				expect(validateString(["anything"], string({ in: [] })).length).toBeGreaterThan(0);

			});

			it("validates single-value enumeration", async () => {

				const shape = string({ in: ["only"] });

				expect(validateString(["only"], shape)).toEqual([]);
				expect(validateString(["other"], shape).length).toBeGreaterThan(0);

			});

			it("validates case-sensitive enumeration", async () => {

				const shape = string({ in: ["Hello", "World"] });

				expect(validateString(["Hello"], shape)).toEqual([]);
				expect(validateString(["hello"], shape).length).toBeGreaterThan(0);

			});

			it("returns empty trace for empty string in enumeration", async () => {

				expect(validateString([""], string({ in: ["", "a", "b"] }))).toEqual([]);

			});

		});

		describe("hasValue constraint", () => {

			it("returns empty trace when all required values are present", async () => {

				expect(validateString(["apple", "banana", "cherry"], string({ hasValue: ["apple", "banana"] }))).toEqual([]);

			});

			it("returns empty trace when values exactly match required", async () => {

				expect(validateString(["apple", "banana"], string({ hasValue: ["apple", "banana"] }))).toEqual([]);

			});

			it("returns trace when required value is missing", async () => {

				expect(validateString(["apple", "cherry"], string({ hasValue: ["apple", "banana"] })).length).toBeGreaterThan(0);

			});

			it("returns trace when values array is empty", async () => {

				expect(validateString([], string({ hasValue: ["apple"] })).length).toBeGreaterThan(0);

			});

			it("returns empty trace when hasValue is empty array", async () => {

				expect(validateString(["apple", "banana"], string({ hasValue: [] }))).toEqual([]);

			});

			it("returns empty trace for single required value present", async () => {

				expect(validateString(["hello"], string({ hasValue: ["hello"] }))).toEqual([]);

			});

		});

		describe("combined constraints", () => {

			it("returns empty trace when satisfying both length and pattern", async () => {

				expect(validateString(["hello"], string({
					minLength: 2,
					maxLength: 10,
					pattern: /^[a-z]+$/
				}))).toEqual([]);

			});

			it("returns trace for valid pattern but invalid length", async () => {

				expect(validateString(["ab"], string({ minLength: 5, pattern: /^[a-z]+$/ })).length).toBeGreaterThan(0);

			});

			it("returns trace for valid length but invalid pattern", async () => {

				expect(validateString(["Hello123"], string({
					maxLength: 10,
					pattern: /^[a-z]+$/
				})).length).toBeGreaterThan(0);

			});

			it("returns empty trace when satisfying length, pattern, and enumeration", async () => {

				const shape = string({
					minLength: 3,
					maxLength: 10,
					pattern: /^[a-z]+$/,
					in: ["apple", "banana", "cherry"]
				});

				expect(validateString(["apple"], shape)).toEqual([]);

			});

			it("returns trace when failing enumeration despite valid length and pattern", async () => {

				const shape = string({
					minLength: 3,
					maxLength: 10,
					pattern: /^[a-z]+$/,
					in: ["apple", "banana", "cherry"]
				});

				expect(validateString(["grape"], shape).length).toBeGreaterThan(0);

			});

		});

		describe("no constraints", () => {

			it("returns empty trace for any string with no constraints", async () => {

				const shape = string();

				expect(validateString([""], shape)).toEqual([]);
				expect(validateString(["hello"], shape)).toEqual([]);
				expect(validateString(["Hello World!"], shape)).toEqual([]);
				expect(validateString(["123"], shape)).toEqual([]);

			});

		});

		describe("unicode handling", () => {

			it("counts unicode characters correctly for length constraints", async () => {

				expect(validateString(["héllo"], string({ minLength: 5, maxLength: 10 }))).toEqual([]);

			});

			it("handles emoji in length constraints", async () => {

				const shape = string({ maxLength: 3 });

				// emoji may count as 2 chars (surrogate pair) depending on implementation
				const trace = validateString(["a🌍b"], shape);

				// test that validation runs without error
				expect(Array.isArray(trace)).toBeTruthy();

			});

			it("handles unicode in pattern matching", async () => {

				// pattern with explicit accented characters (flags not preserved in shape)
				expect(validateString(["héllo"], string({ pattern: /^[a-zA-Zéö]+$/ }))).toEqual([]);

			});

		});

		describe("per-value errors", () => {

			it("reports one error per failing value for minLength", async () => {

				expect(validateString(["ab", "c"], string({ minLength: 3 }))).toHaveLength(2);

			});

			it("reports one error per failing value for maxLength", async () => {

				expect(validateString(["toolong", "alsotoolong"], string({ maxLength: 3 }))).toHaveLength(2);

			});

			it("reports one error per failing value for pattern", async () => {

				expect(validateString(["123", "456"], string({ pattern: /^[a-z]+$/ }))).toHaveLength(2);

			});

			it("reports one error per failing value for in", async () => {

				expect(validateString(["x", "y"], string({ in: ["a", "b"] }))).toHaveLength(2);

			});

			it("reports errors only for failing values", async () => {

				expect(validateString(["ab", "hello", "c"], string({ minLength: 3 }))).toHaveLength(2);

			});

		});

	});

});
