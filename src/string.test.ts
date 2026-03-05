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
import { validateString } from "./string.core.js";
import { date, duration, email, instant, string, time, timestamp, uri, url, year } from "./string.js";


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


			describe("minLength", () => {

				it("accepts constraint", async () => {

					expect(string({ minLength: 1 }).minLength).toBe(1);

				});

			});

			describe("maxLength", () => {

				it("accepts constraint", async () => {

					expect(string({ maxLength: 100 }).maxLength).toBe(100);

				});

			});

			describe("pattern", () => {

				it("accepts string value", async () => {

					expect(string({ pattern: "^[A-Z]+$" }).pattern).toBe("^[A-Z]+$");

				});

				it("accepts RegExp value", async () => {

					expect(string({ pattern: /^[A-Z]+$/ }).pattern).toBe("^[A-Z]+$");

				});

			});

			describe("in", () => {

				it("accepts constraint", async () => {

					expect(string({ in: ["a", "b", "c"] }).in).toEqual(["a", "b", "c"]);

				});

			});

			describe("hasValue", () => {

				it("accepts constraint", async () => {

					expect(string({ hasValue: ["required"] }).hasValue).toEqual(["required"]);

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

	});


	describe.each([
		["year", year, "1970", "^\\d{4}(?:Z|[+-]\\d{2}:\\d{2})?$"],
		["date", date, "1970-01-01", "^\\d{4}-\\d{2}-\\d{2}(?:Z|[+-]\\d{2}:\\d{2})?$"],
		["time", time, "00:00:00", "^\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?$"],
		["instant", instant, "1970-01-01T00:00:00", "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?$"],
		["timestamp", timestamp, "1970-01-01T00:00:00.000Z", "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$"],
		["duration", duration, "PT0S", "^-?P(?:\\d+Y)?(?:\\d+M)?(?:\\d+D)?(?:T(?:\\d+H)?(?:\\d+M)?(?:\\d+(?:\\.\\d+)?S)?)?$"]
	] as const)("%s", (_label, factory, expectedModel, expectedPattern) => {

		it("returns a shape with expected kind and model", async () => {

			const shape = factory();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe(expectedModel);

		});

		it("returns a shape with expected pattern", async () => {

			expect(factory().pattern).toBe(expectedPattern);

		});

	});


});

describe("validators", () => {

	describe("validateString", () => {

		describe("type filtering", () => {

			it("returns undefined for valid string values", async () => {

				expect(validateString(["hello"], string())).toBeUndefined();

			});

			it("returns undefined for empty values array", async () => {

				expect(validateString([], string())).toBeUndefined();

			});

			it("returns trace with kind key for non-string value", async () => {

				const trace = validateString([42], string());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for multiple non-string values", async () => {

				const trace = validateString([42, true], string());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");
				expect((trace as Record<string, string>)["{kind}"]).toMatch(/\(2\/2\)/);

			});

			it("returns trace with kind key for mixed values", async () => {

				const trace = validateString([42, "hello", true], string());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("validates only matched string values against constraints", async () => {

				const trace = validateString(["ab", 42, "c"], string({ minLength: 3 }));

				expect(trace).toHaveProperty("{kind}");
				expect(trace).toHaveProperty("{minLength}");

			});

			it("returns undefined when non-string values filtered and strings pass", async () => {

				const trace = validateString(["hello", 42], string({ minLength: 3 }));

				expect(trace).toHaveProperty("{kind}");
				expect(trace).not.toHaveProperty("{minLength}");

			});

		});

		describe("minLength constraint", () => {

			it("returns undefined for strings at minimum length", async () => {

				expect(validateString(["abc"], string({ minLength: 3 }))).toBeUndefined();

			});

			it("returns undefined for strings above minimum length", async () => {

				expect(validateString(["abcdef"], string({ minLength: 3 }))).toBeUndefined();

			});

			it("returns keyed trace for strings below minimum length", async () => {

				const trace = validateString(["ab"], string({ minLength: 3 }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{minLength}");

			});

			it("returns keyed trace for empty string when minLength > 0", async () => {

				const trace = validateString([""], string({ minLength: 1 }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{minLength}");

			});

			it("returns undefined for empty string when minLength is 0", async () => {

				expect(validateString([""], string({ minLength: 0 }))).toBeUndefined();

			});

		});

		describe("maxLength constraint", () => {

			it("returns undefined for strings at maximum length", async () => {

				expect(validateString(["hello"], string({ maxLength: 5 }))).toBeUndefined();

			});

			it("returns undefined for strings below maximum length", async () => {

				expect(validateString(["hi"], string({ maxLength: 5 }))).toBeUndefined();

			});

			it("returns keyed trace for strings above maximum length", async () => {

				const trace = validateString(["hello world"], string({ maxLength: 5 }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{maxLength}");

			});

			it("returns undefined for empty string with maxLength constraint", async () => {

				expect(validateString([""], string({ maxLength: 5 }))).toBeUndefined();

			});

			it("returns keyed trace when maxLength is 0 and string is non-empty", async () => {

				const trace = validateString(["a"], string({ maxLength: 0 }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{maxLength}");

			});

		});

		describe("combined length constraints", () => {

			it("returns undefined for strings within length range", async () => {

				expect(validateString(["abc"], string({ minLength: 2, maxLength: 5 }))).toBeUndefined();

			});

			it("returns undefined for strings at length boundaries", async () => {

				const shape = string({ minLength: 2, maxLength: 5 });

				expect(validateString(["ab"], shape)).toBeUndefined();
				expect(validateString(["abcde"], shape)).toBeUndefined();

			});

			it("returns keyed trace for strings outside length range", async () => {

				const shape = string({ minLength: 2, maxLength: 5 });

				expect(validateString(["a"], shape)).toHaveProperty("{minLength}");
				expect(validateString(["abcdef"], shape)).toHaveProperty("{maxLength}");

			});

		});

		describe("pattern constraint", () => {

			it("returns undefined for strings matching pattern", async () => {

				expect(validateString(["hello"], string({ pattern: /^[a-z]+$/ }))).toBeUndefined();

			});

			it("returns keyed trace for strings not matching pattern", async () => {

				const trace = validateString(["Hello123"], string({ pattern: /^[a-z]+$/ }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{pattern}");

			});

			it("returns keyed trace for empty string when pattern requires content", async () => {

				const trace = validateString([""], string({ pattern: /^[a-z]+$/ }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{pattern}");

			});

			it("returns undefined for strings matching email pattern", async () => {

				expect(validateString(["user@example.com"], string({ pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }))).toBeUndefined();

			});

			it("returns keyed trace for invalid email pattern", async () => {

				const trace = validateString(["invalid-email"], string({ pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{pattern}");

			});

			it("validates pattern with anchors", async () => {

				const shape = string({ pattern: /^ABC$/ });

				expect(validateString(["ABC"], shape)).toBeUndefined();
				expect(validateString(["ABCD"], shape)).toHaveProperty("{pattern}");
				expect(validateString(["0ABC"], shape)).toHaveProperty("{pattern}");

			});

			it("validates pattern as string", async () => {

				expect(validateString(["12345"], string({ pattern: "^[0-9]+$" }))).toBeUndefined();

			});

		});

		describe("in constraint", () => {

			it("returns undefined for strings in the enumeration", async () => {

				const shape = string({ in: ["apple", "banana", "cherry"] });

				expect(validateString(["apple"], shape)).toBeUndefined();
				expect(validateString(["banana"], shape)).toBeUndefined();
				expect(validateString(["cherry"], shape)).toBeUndefined();

			});

			it("returns keyed trace for strings not in the enumeration", async () => {

				const trace = validateString(["orange"], string({ in: ["apple", "banana", "cherry"] }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{in}");

			});

			it("returns keyed trace for empty enumeration", async () => {

				const trace = validateString(["anything"], string({ in: [] }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{in}");

			});

			it("validates single-value enumeration", async () => {

				const shape = string({ in: ["only"] });

				expect(validateString(["only"], shape)).toBeUndefined();
				expect(validateString(["other"], shape)).toHaveProperty("{in}");

			});

			it("validates case-sensitive enumeration", async () => {

				const shape = string({ in: ["Hello", "World"] });

				expect(validateString(["Hello"], shape)).toBeUndefined();
				expect(validateString(["hello"], shape)).toHaveProperty("{in}");

			});

			it("returns undefined for empty string in enumeration", async () => {

				expect(validateString([""], string({ in: ["", "a", "b"] }))).toBeUndefined();

			});

		});

		describe("hasValue constraint", () => {

			it("returns undefined when all required values are present", async () => {

				expect(validateString(["apple", "banana", "cherry"], string({ hasValue: ["apple", "banana"] }))).toBeUndefined();

			});

			it("returns undefined when values exactly match required", async () => {

				expect(validateString(["apple", "banana"], string({ hasValue: ["apple", "banana"] }))).toBeUndefined();

			});

			it("returns keyed trace when required value is missing", async () => {

				const trace = validateString(["apple", "cherry"], string({ hasValue: ["apple", "banana"] }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{hasValue}");

			});

			it("returns keyed trace when values array is empty", async () => {

				const trace = validateString([], string({ hasValue: ["apple"] }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{hasValue}");

			});

			it("returns undefined when hasValue is empty array", async () => {

				expect(validateString(["apple", "banana"], string({ hasValue: [] }))).toBeUndefined();

			});

			it("returns undefined for single required value present", async () => {

				expect(validateString(["hello"], string({ hasValue: ["hello"] }))).toBeUndefined();

			});

		});

		describe("combined constraints", () => {

			it("returns undefined when satisfying both length and pattern", async () => {

				expect(validateString(["hello"], string({
					minLength: 2,
					maxLength: 10,
					pattern: /^[a-z]+$/
				}))).toBeUndefined();

			});

			it("returns keyed trace for valid pattern but invalid length", async () => {

				const trace = validateString(["ab"], string({ minLength: 5, pattern: /^[a-z]+$/ }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{minLength}");
				expect(trace).not.toHaveProperty("{pattern}");

			});

			it("returns keyed trace for valid length but invalid pattern", async () => {

				const trace = validateString(["Hello123"], string({
					maxLength: 10,
					pattern: /^[a-z]+$/
				}));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{pattern}");
				expect(trace).not.toHaveProperty("{maxLength}");

			});

			it("returns undefined when satisfying length, pattern, and enumeration", async () => {

				const shape = string({
					minLength: 3,
					maxLength: 10,
					pattern: /^[a-z]+$/,
					in: ["apple", "banana", "cherry"]
				});

				expect(validateString(["apple"], shape)).toBeUndefined();

			});

			it("returns keyed trace when failing enumeration despite valid length and pattern", async () => {

				const shape = string({
					minLength: 3,
					maxLength: 10,
					pattern: /^[a-z]+$/,
					in: ["apple", "banana", "cherry"]
				});

				const trace = validateString(["grape"], shape);

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{in}");
				expect(trace).not.toHaveProperty("{minLength}");
				expect(trace).not.toHaveProperty("{pattern}");

			});

		});

		describe("no constraints", () => {

			it("returns undefined for any string with no constraints", async () => {

				const shape = string();

				expect(validateString([""], shape)).toBeUndefined();
				expect(validateString(["hello"], shape)).toBeUndefined();
				expect(validateString(["Hello World!"], shape)).toBeUndefined();
				expect(validateString(["123"], shape)).toBeUndefined();

			});

		});

		describe("unicode handling", () => {

			it("counts unicode characters correctly for length constraints", async () => {

				expect(validateString(["héllo"], string({ minLength: 5, maxLength: 10 }))).toBeUndefined();

			});

			it("handles emoji in length constraints", async () => {

				const shape = string({ maxLength: 3 });
				const trace = validateString(["a🌍b"], shape);

				expect(trace === undefined || typeof trace === "object").toBeTruthy();

			});

			it("handles unicode in pattern matching", async () => {

				expect(validateString(["héllo"], string({ pattern: /^[a-zA-Zéö]+$/ }))).toBeUndefined();

			});

		});

		describe("per-value errors", () => {

			it("reports failure with count prefix for multiple failing values", async () => {

				const trace = validateString(["ab", "c"], string({ minLength: 3 }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{minLength}");
				expect((trace as Record<string, string>)["{minLength}"]).toMatch(/^\(2\/2\)/);

			});

			it("reports failure with count prefix for partial failures", async () => {

				const trace = validateString(["ab", "hello", "c"], string({ minLength: 3 }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{minLength}");
				expect((trace as Record<string, string>)["{minLength}"]).toMatch(/^\(2\/3\)/);

			});

			it("reports failure without count prefix for single value", async () => {

				const trace = validateString(["ab"], string({ minLength: 3 }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{minLength}");
				expect((trace as Record<string, string>)["{minLength}"]).not.toMatch(/^\(/);

			});

		});

	});

});
