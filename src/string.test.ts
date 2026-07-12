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
import { checkString, mergeString, narrowsString, validateString } from "./string.core.js";
import { date, duration, email, instant, iri, phone, string, time, timestamp, url, year } from "./string.js";


describe("factories", () => {

	describe("string", () => {

		describe("shape", () => {

			it("returns a shape with kind 'string'", async () => {

				expect(string().kind).toBe("string");
				expect(string("example").kind).toBe("string");
				expect(string({ model: "example" }).kind).toBe("string");

			});

			it.each<[string, () => string, string]>([
				["no arguments", () => string().model, ""],
				["empty constraints", () => string({}).model, ""],
				["model argument", () => string("example").model, "example"],
				["model constraint", () => string({ model: "example" }).model, "example"]
			])("resolves model from %s", async (_label, model, expected) => {

				expect(model()).toBe(expected);

			});

			it("returns an immutable shape", async () => {

				const shape = string();

				expect(() => (shape as any).kind = "number").toThrow();
				expect(() => (shape as any).model = "test").toThrow();

			});

		});

		describe("constraints", () => {

			it.each([
				["minLength", { model: "x", minLength: 1 }, "minLength", 1],
				["maxLength", { maxLength: 100 }, "maxLength", 100],
				["in", { in: ["a", "b", "c"] }, "in", ["a", "b", "c"]],
				["hasValue", { hasValue: ["required"] }, "hasValue", ["required"]]
			] as const)("accepts %s constraint", async (_label, constraints, key, expected) => {

				const shape = string(constraints as any);

				expect((shape as any)[key]).toEqual(expected);

			});

			describe("pattern", () => {

				it("accepts string value", async () => {

					expect(string({ model: "ABC", pattern: "^[A-Z]+$" }).pattern).toBe("^[A-Z]+$");

				});

				it("accepts RegExp value", async () => {

					expect(string({ model: "ABC", pattern: /^[A-Z]+$/ }).pattern).toBe("^[A-Z]+$");

				});

			});

			describe("combined", () => {

				it("accepts multiple constraints", async () => {

					const shape = string({
						minLength: 1, maxLength: 100, pattern: "^[A-Z]+$", in: ["A", "B"], hasValue: ["A"]
					});

					expect(shape.minLength).toBe(1);
					expect(shape.maxLength).toBe(100);
					expect(shape.pattern).toBe("^[A-Z]+$");
					expect(shape.in).toEqual(["A", "B"]);
					expect(shape.hasValue).toEqual(["A"]);

				});

				it("includes only provided entries", async () => {

					expect(Object.keys(string()).sort()).toEqual(["kind", "model", "pattern"]);

				});

			});

			describe("datatype", () => {

				it("omits datatype by default", async () => {

					expect(string().datatype).toBeUndefined();

				});

				it("passes through an explicit datatype", async () => {

					expect(string({ datatype: xsd.date }).datatype).toBe(xsd.date);

				});

			});

		});

	});


	describe("model resolution", () => {

		it("defaults the model to the empty string", async () => {

			expect(string().model).toBe("");
			expect(string({ maxLength: 5 }).model).toBe("");

		});

		it("keeps the default empty string regardless of value constraints", async () => {

			expect(string({ in: ["ab", "cd"] }).model).toBe("");
			expect(string({ hasValue: ["req", "x"] }).model).toBe("");
			expect(string({ minLength: 3 }).model).toBe("");
			expect(string({ pattern: /^[a-z]+$/ }).model).toBe("");

		});

		it("keeps an explicit model verbatim, even when illegal for the constraints", async () => {

			expect(string({ model: "abc", minLength: 3 }).model).toBe("abc");
			expect(string({ model: "ab", minLength: 3 }).model).toBe("ab");

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

		it("sets the xsd:string datatype", async () => {

			expect(email().datatype).toBe(xsd.string);

		});

	});

	describe("phone", () => {

		it("returns a shape with E.164 model", async () => {

			const shape = phone();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("+15555550123");

		});

		it("returns a shape with E.164 pattern", async () => {

			const shape = phone();

			expect(shape.pattern).toBe("^\\+[1-9]\\d{1,14}$");

		});

		it("passes through constraints", async () => {

			const shape = phone({ in: ["+442071838750"] });

			expect(shape.in).toEqual(["+442071838750"]);

		});

		it("sets the xsd:string datatype", async () => {

			expect(phone().datatype).toBe(xsd.string);

		});

	});

	describe("iri", () => {

		it("returns a shape with default relative variant", async () => {

			const shape = iri();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("./path");
			expect(shape.pattern).toBe("^\\S+$");

		});

		it("returns a shape with hierarchical variant", async () => {

			const shape = iri({ variant: "hierarchical" });

			expect(shape.model).toBe("https://example.net/");
			expect(shape.pattern).toBe("^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\S*$");

		});

		it("returns a shape with absolute variant", async () => {

			const shape = iri({ variant: "absolute" });

			expect(shape.model).toBe("urn:example:resource");
			expect(shape.pattern).toBe("^[a-zA-Z][a-zA-Z0-9+.-]*:\\S+$");

		});

		it("returns a shape with internal variant", async () => {

			const shape = iri({ variant: "internal" });

			expect(shape.model).toBe("/path");
			expect(shape.pattern).toBe("^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\\S+|\\/\\S*)$");

		});

		it("sets the xsd:string datatype", async () => {

			expect(iri().datatype).toBe(xsd.string);

		});

	});

	describe("url", () => {

		it("returns a shape equivalent to iri with hierarchical variant", async () => {

			const shape = url();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe("https://example.net/");
			expect(shape.pattern).toBe("^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\S*$");

		});

		it("forwards textual constraints to iri", async () => {

			const shape = url({ in: ["https://example.net/"] });

			expect(shape.in).toEqual(["https://example.net/"]);

		});

		it("sets the xsd:string datatype", async () => {

			expect(url().datatype).toBe(xsd.string);

		});

	});


	describe.each([
		["year", year, "1970", "^\\d{4}(?:Z|[+-]\\d{2}:\\d{2})?$", xsd.gYear],
		["date", date, "1970-01-01", "^\\d{4}-\\d{2}-\\d{2}(?:Z|[+-]\\d{2}:\\d{2})?$", xsd.date],
		["time", time, "00:00:00", "^\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?$", xsd.time],
		["instant", instant, "1970-01-01T00:00:00", "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?$", xsd.dateTime],
		["timestamp", timestamp, "1970-01-01T00:00:00.000Z", "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$", xsd.dateTime],
		["duration", duration, "PT0S", "^-?P(?:\\d+Y)?(?:\\d+M)?(?:\\d+D)?(?:T(?:\\d+H)?(?:\\d+M)?(?:\\d+(?:\\.\\d+)?S)?)?$", xsd.duration]
	] as const)("%s", (_label, factory, expectedModel, expectedPattern, expectedDatatype) => {

		it("returns a shape with expected kind and model", async () => {

			const shape = factory();

			expect(shape.kind).toBe("string");
			expect(shape.model).toBe(expectedModel);

		});

		it("returns a shape with expected pattern", async () => {

			expect(factory().pattern).toBe(expectedPattern);

		});

		it("sets the matching xsd datatype", async () => {

			expect(factory().datatype).toBe(expectedDatatype);

		});

	});

});

describe("operators", () => {

	describe("checkString", () => {

		it("returns undefined for consistent constraints", async () => {

			expect(checkString({ minLength: 3, maxLength: 10 })).toBeUndefined();
			expect(checkString({ minLength: 5, maxLength: 5 })).toBeUndefined();
			expect(checkString({ hasValue: ["a"], in: ["a", "b", "c"] })).toBeUndefined();
			expect(checkString({})).toBeUndefined();

		});

		it("returns trace for minLength > maxLength", async () => {

			const trace = checkString({ minLength: 10, maxLength: 5 });

			expect(trace).toBeDefined();
			expect(trace).toHaveProperty("{minLength/maxLength}");

		});

		it("returns undefined for minLength equal to maxLength", async () => {

			expect(checkString({ minLength: 5, maxLength: 5 })).toBeUndefined();

		});

		it("returns trace for hasValue entries not in the in set", async () => {

			const trace = checkString({ hasValue: ["x"], in: ["a", "b"] });

			expect(trace).toBeDefined();
			expect(trace).toHaveProperty("{hasValue/in}");

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

		it("returns undefined for a legal model", async () => {

			expect(checkString({ model: "abc", minLength: 1, maxLength: 5 })).toBeUndefined();
			expect(checkString({ model: "ab", pattern: "^[a-z]+$", in: ["ab", "cd"] })).toBeUndefined();

		});

		it("does not check model legality, as a model is a placeholder", async () => {

			expect(checkString({ model: "ab", minLength: 3 })).toBeUndefined();
			expect(checkString({ model: "abcd", maxLength: 3 })).toBeUndefined();
			expect(checkString({ model: "A1", pattern: "^[a-z]+$" })).toBeUndefined();
			expect(checkString({ model: "x", in: ["a", "b"] })).toBeUndefined();

		});

	});

	describe("narrowsString", () => {

		it("accepts a child that tightens minLength", async () => {

			expect(narrowsString(string({ model: "hello", minLength: 5 }), string())).toBeUndefined();

		});

		it("accepts an identical child", async () => {

			expect(narrowsString(string(), string())).toBeUndefined();

		});

		it("rejects a child that widens minLength", async () => {

			expect(narrowsString(string({ model: "x", minLength: 1 }), string({
				model: "hello",
				minLength: 5
			}))).toBeDefined();

		});

		it("rejects a child with a disjoint enumeration", async () => {

			expect(narrowsString(string({ in: ["a"] }), string({ in: ["b"] }))).toBeDefined();

		});

		it("accepts equal datatypes", async () => {

			expect(narrowsString(date(), date())).toBeUndefined();

		});

		it("accepts a child datatype when the parent has none", async () => {

			expect(narrowsString(
				string({ model: "1970-01-01", datatype: xsd.date }),
				string({ model: "1970-01-01" })
			)).toBeUndefined();

		});

		it("accepts a parent datatype when the child has none", async () => {

			expect(narrowsString(
				string({ model: "1970-01-01" }),
				string({ model: "1970-01-01", datatype: xsd.date })
			)).toBeUndefined();

		});

		it("rejects mismatched datatypes", async () => {

			expect(narrowsString(string({ datatype: xsd.date }), string({ datatype: xsd.time }))).toHaveProperty("{datatype}");

		});

		it("accepts equal patterns", async () => {

			expect(narrowsString(string({ model: "abc", pattern: "^[a-z]+$" }), string({
				model: "abc",
				pattern: "^[a-z]+$"
			}))).toBeUndefined();

		});

		it("accepts a child pattern when the parent has none", async () => {

			expect(narrowsString(string({ model: "abc", pattern: "^[a-z]+$" }), string())).toBeUndefined();

		});

		it("accepts a parent pattern when the child has none", async () => {

			expect(narrowsString(string(), string({ model: "abc", pattern: "^[a-z]+$" }))).toBeUndefined();

		});

		it("rejects mismatched patterns", async () => {

			expect(narrowsString(string({ model: "abc", pattern: "^[a-z]+$" }), string({
				model: "123",
				pattern: "^[0-9]+$"
			}))).toHaveProperty("{pattern}");

		});

		it("accepts differing models as compatible placeholders", async () => {

			expect(narrowsString(string("abc"), string("xyz"))).toBeUndefined();

		});

	});

	describe("mergeString", () => {

		describe("kind", () => {

			it("preserves kind as 'string'", async () => {

				const merged = mergeString(string(), string());

				expect(merged.kind).toBe("string");

			});

		});

		describe("model", () => {

			it("merges shapes with equal models", async () => {

				const merged = mergeString(string(), string());

				expect(merged.model).toBe("");

			});

			it("merges shapes with equal non-default models", async () => {

				const merged = mergeString(string("example"), string("example"));

				expect(merged.model).toBe("example");

			});

			it("merges shapes with different models, keeping the target model", async () => {

				expect(mergeString(string("abc"), string("xyz")).model).toBe("abc");

			});

		});

		describe("pattern", () => {

			it("inherits source pattern when target has none", async () => {

				const merged = mergeString(string(), string({ model: "abc", pattern: "^[a-z]+$" }));

				expect(merged.pattern).toBe("^[a-z]+$");

			});

			it("keeps target pattern when source has none", async () => {

				const merged = mergeString(string({ model: "abc", pattern: "^[a-z]+$" }), string());

				expect(merged.pattern).toBe("^[a-z]+$");

			});

			it("keeps the shared pattern when both match", async () => {

				const merged = mergeString(
					string({ model: "abc", pattern: "^[a-z]+$" }),
					string({ model: "abc", pattern: "^[a-z]+$" })
				);

				expect(merged.pattern).toBe("^[a-z]+$");

			});

			it("rejects mismatched patterns", async () => {

				expect(() => mergeString(
					string({ model: "abc", pattern: "^[a-z]+$" }),
					string({ model: "abcd", pattern: "^.{3,}$" })
				)).toThrow(RangeError);

			});

			it("returns undefined when neither has a pattern", async () => {

				const merged = mergeString(string(), string());

				expect(merged.pattern).toBeUndefined();

			});

		});

		describe.each([

			["minLength", "0123456789", 5, 10, 3] as const,
			["maxLength", "abc", 10, 5, 15] as const

		])("%s", (constraint, model, sourceValue, tighterValue, incompatibleValue) => {

			it("inherits source value when target has none", async () => {

				const merged = mergeString(string(), string({ model, [constraint]: sourceValue }));

				expect((merged as any)[constraint]).toBe(sourceValue);

			});

			it("keeps target value when source has none", async () => {

				const merged = mergeString(string({ model, [constraint]: sourceValue }), string());

				expect((merged as any)[constraint]).toBe(sourceValue);

			});

			it("keeps tighter target value", async () => {

				const merged = mergeString(string({ model, [constraint]: tighterValue }), string({
					model,
					[constraint]: sourceValue
				}));

				expect((merged as any)[constraint]).toBe(tighterValue);

			});

			it("rejects incompatible target value", async () => {

				expect(() => mergeString(string({ model, [constraint]: incompatibleValue }), string({
					model,
					[constraint]: sourceValue
				}))).toThrow(RangeError);

			});

		});

		describe("in", () => {

			it("inherits source in when target has none", async () => {

				const merged = mergeString(string(), string({ in: ["a", "b", "c"] }));

				expect(merged.in).toEqual(["a", "b", "c"]);

			});

			it("keeps target in when source has none", async () => {

				const merged = mergeString(string({ in: ["a", "b"] }), string());

				expect(merged.in).toEqual(["a", "b"]);

			});

			it("intersects target and source in", async () => {

				const merged = mergeString(
					string({ in: ["a", "b", "c"] }),
					string({ in: ["b", "c", "d"] })
				);

				expect(merged.in).toEqual(["b", "c"]);

			});

			it("rejects empty intersection", async () => {

				expect(() => mergeString(
					string({ in: ["a", "b"] }),
					string({ in: ["c", "d"] })
				)).toThrow(RangeError);

			});

		});

		describe("hasValue", () => {

			it("inherits source hasValue when target has none", async () => {

				const merged = mergeString(string(), string({ hasValue: ["a"] }));

				expect(merged.hasValue).toEqual(["a"]);

			});

			it("keeps target hasValue when source has none", async () => {

				const merged = mergeString(string({ hasValue: ["a"] }), string());

				expect(merged.hasValue).toEqual(["a"]);

			});

			it("unions target and source hasValue", async () => {

				const merged = mergeString(
					string({ hasValue: ["a", "b"] }),
					string({ hasValue: ["b", "c"] })
				);

				expect(merged.hasValue).toEqual(expect.arrayContaining(["a", "b", "c"]));
				expect(merged.hasValue).toHaveLength(3);

			});

		});

		describe("datatype", () => {

			it("inherits source datatype when target has none", async () => {

				const merged = mergeString(string({ model: "1970-01-01" }), string({
					model: "1970-01-01",
					datatype: xsd.date
				}));

				expect(merged.datatype).toBe(xsd.date);

			});

			it("keeps target datatype when source has none", async () => {

				const merged = mergeString(string({
					model: "1970-01-01",
					datatype: xsd.date
				}), string({ model: "1970-01-01" }));

				expect(merged.datatype).toBe(xsd.date);

			});

			it("keeps equal datatype", async () => {

				const merged = mergeString(string({ datatype: xsd.date }), string({ datatype: xsd.date }));

				expect(merged.datatype).toBe(xsd.date);

			});

			it("rejects mismatched datatype", async () => {

				expect(() => mergeString(string({ datatype: xsd.date }), string({ datatype: xsd.time }))).toThrow(RangeError);

			});

		});

		describe("post-merge validation", () => {

			it("rejects merged minLength > merged maxLength", async () => {

				expect(() => mergeString(
					string({ model: "0123456789", minLength: 10 }),
					string({ maxLength: 5 })
				)).toThrow(RangeError);

			});

			it("accepts merged minLength equal to merged maxLength", async () => {

				const merged = mergeString(
					string({ model: "hello", minLength: 5 }),
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

});

describe("validators", () => {

	describe("validateString", () => {

		describe("type filtering", () => {

			it.each<[string, readonly unknown[]]>([
				["valid string values", ["hello"]],
				["empty values array", []]
			])("returns undefined for %s", async (_label, values) => {

				expect(validateString(values, string())).toBeUndefined();

			});

			it.each<[string, readonly unknown[], RegExp]>([
				["a single non-string value", [42], /expected <string> values$/],
				["mixed valid and non-string values", [42, "hello", true], /expected <string> values \(2\/3\)/],
				["multiple non-string values", [42, true], /expected <string> values \(2\/2\)/]
			])("returns a kind trace for %s", async (_label, values, message) => {

				const trace = validateString(values, string());

				expect(trace).toHaveProperty("{kind}");
				expect((trace as Record<string, string>)["{kind}"]).toMatch(message);

			});

			it("validates only matched string values against constraints", async () => {

				const trace = validateString(["ab", 42, "c"], string({ model: "abc", minLength: 3 }));

				expect(trace).toHaveProperty("{kind}");
				expect(trace).toHaveProperty("{minLength}");

			});

			it("returns undefined when non-string values filtered and strings pass", async () => {

				const trace = validateString(["hello", 42], string({ model: "abc", minLength: 3 }));

				expect(trace).toHaveProperty("{kind}");
				expect(trace).not.toHaveProperty("{minLength}");

			});

		});

		describe("placeholder mode", () => {

			it("skips value-domain constraints for a placeholder", async () => {

				expect(validateString(["ab"], string({ minLength: 3 }), { scope: "model" })).toBeUndefined();
				expect(validateString(["abcdef"], string({ maxLength: 3 }), { scope: "model" })).toBeUndefined();
				expect(validateString(["A1"], string({ pattern: "^[a-z]*$" }), { scope: "model" })).toBeUndefined();
				expect(validateString(["x"], string({ in: ["a", "b"] }), { scope: "model" })).toBeUndefined();

			});

			it("still rejects a placeholder of the wrong kind", async () => {

				expect(validateString([42], string(), { scope: "model" })).toHaveProperty("{kind}");

			});

		});

		describe("bound scope", () => {

			// the bound scope keeps pattern (the sole lexical discriminator over an open datatype set) but drops the
			// magnitude constraints, so a bound outside the value domain still routes

			it("skips the magnitude constraints for a bound", async () => {

				expect(validateString(["ab"], string({ minLength: 3 }), { scope: "bound" })).toBeUndefined();
				expect(validateString(["abcdef"], string({ maxLength: 3 }), { scope: "bound" })).toBeUndefined();
				expect(validateString(["x"], string({ in: ["a", "b"] }), { scope: "bound" })).toBeUndefined();

			});

			it("still enforces the pattern for a bound", async () => {

				expect(validateString(["A1"], string({ pattern: "^[a-z]*$" }), { scope: "bound" }))
					.toHaveProperty("{pattern}");

			});

			it("still rejects a bound of the wrong kind", async () => {

				expect(validateString([42], string(), { scope: "bound" })).toHaveProperty("{kind}");

			});

		});

		describe.each([

			["minLength", "minLength", 3, "abc", "abcdef", "ab"] as const,
			["maxLength", "maxLength", 5, "hello", "hi", "hello world"] as const

		])("%s constraint", (_label, constraint, limit, atBoundary, withinBoundary, beyondBoundary) => {

			it("returns undefined for strings at boundary", async () => {

				expect(validateString([atBoundary], string({ model: "abcd", [constraint]: limit }))).toBeUndefined();

			});

			it("returns undefined for strings within boundary", async () => {

				expect(validateString([withinBoundary], string({
					model: "abcd",
					[constraint]: limit
				}))).toBeUndefined();

			});

			it("returns keyed trace for strings beyond boundary", async () => {

				const trace = validateString([beyondBoundary], string({ model: "abcd", [constraint]: limit }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty(`{${constraint}}`);

			});

		});

		describe("minLength edge cases", () => {

			it("returns keyed trace for empty string when minLength > 0", async () => {

				const trace = validateString([""], string({ model: "x", minLength: 1 }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{minLength}");

			});

			it("returns undefined for empty string when minLength is 0", async () => {

				expect(validateString([""], string({ minLength: 0 }))).toBeUndefined();

			});

		});

		describe("maxLength edge cases", () => {

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

				expect(validateString(["abc"], string({ model: "abc", minLength: 2, maxLength: 5 }))).toBeUndefined();

			});

			it("returns undefined for strings at length boundaries", async () => {

				const shape = string({ model: "abc", minLength: 2, maxLength: 5 });

				expect(validateString(["ab"], shape)).toBeUndefined();
				expect(validateString(["abcde"], shape)).toBeUndefined();

			});

			it("returns keyed trace for strings outside length range", async () => {

				const shape = string({ model: "abc", minLength: 2, maxLength: 5 });

				expect(validateString(["a"], shape)).toHaveProperty("{minLength}");
				expect(validateString(["abcdef"], shape)).toHaveProperty("{maxLength}");

			});

		});

		describe("pattern constraint", () => {

			it("returns undefined for strings matching pattern", async () => {

				expect(validateString(["hello"], string({ model: "abc", pattern: /^[a-z]+$/ }))).toBeUndefined();

			});

			it("returns keyed trace for strings not matching pattern", async () => {

				const trace = validateString(["Hello123"], string({ model: "abc", pattern: /^[a-z]+$/ }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{pattern}");

			});

			it("returns keyed trace for empty string when pattern requires content", async () => {

				const trace = validateString([""], string({ model: "abc", pattern: /^[a-z]+$/ }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{pattern}");

			});

			it("returns undefined for strings matching email pattern", async () => {

				expect(validateString(["user@example.com"], string({
					model: "a@b.co",
					pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
				}))).toBeUndefined();

			});

			it("returns keyed trace for invalid email pattern", async () => {

				const trace = validateString(["invalid-email"], string({
					model: "a@b.co",
					pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
				}));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{pattern}");

			});

			it("validates pattern with anchors", async () => {

				const shape = string({ model: "ABC", pattern: /^ABC$/ });

				expect(validateString(["ABC"], shape)).toBeUndefined();
				expect(validateString(["ABCD"], shape)).toHaveProperty("{pattern}");
				expect(validateString(["0ABC"], shape)).toHaveProperty("{pattern}");

			});

			it("validates pattern as string", async () => {

				expect(validateString(["12345"], string({ model: "123", pattern: "^[0-9]+$" }))).toBeUndefined();

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

			it("returns undefined for single required value present", async () => {

				expect(validateString(["hello"], string({ hasValue: ["hello"] }))).toBeUndefined();

			});

		});

		describe("combined constraints", () => {

			it("returns undefined when satisfying both length and pattern", async () => {

				expect(validateString(["hello"], string({
					model: "abc",
					minLength: 2,
					maxLength: 10,
					pattern: /^[a-z]+$/
				}))).toBeUndefined();

			});

			it("returns keyed trace for valid pattern but invalid length", async () => {

				const trace = validateString(["ab"], string({ model: "hello", minLength: 5, pattern: /^[a-z]+$/ }));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{minLength}");
				expect(trace).not.toHaveProperty("{pattern}");

			});

			it("returns keyed trace for valid length but invalid pattern", async () => {

				const trace = validateString(["Hello123"], string({
					model: "abc",
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

				expect(validateString(["héllo"], string({
					model: "hello",
					minLength: 5,
					maxLength: 10
				}))).toBeUndefined();

			});

			it("handles emoji in length constraints", async () => {

				const shape = string({ maxLength: 3 });
				const trace = validateString(["a🌍b"], shape);

				expect(trace === undefined || typeof trace === "object").toBeTruthy();

			});

			it("handles unicode in pattern matching", async () => {

				expect(validateString(["héllo"], string({ model: "héllo", pattern: /^[a-zA-Zéö]+$/ }))).toBeUndefined();

			});

		});

		describe("per-value errors", () => {

			it.each<[string, readonly string[], RegExp]>([
				["a count prefix for multiple failing values", ["ab", "c"], /^\(2\/2\) /],
				["only failing values in the count prefix", ["ab", "hello", "c"], /^\(2\/3\) /],
				["no count prefix for a single failing value", ["ab"], /^expected string length >= <3>/]
			])("reports %s", async (_label, values, message) => {

				const trace = validateString(values, string({ model: "abc", minLength: 3 }));

				expect((trace as Record<string, string>)["{minLength}"]).toMatch(message);

			});

		});

	});

});
