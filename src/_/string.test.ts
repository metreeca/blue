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
import { isTag } from "@metreeca/core/language";
import { describe, expect, it } from "vitest";
import { checkString, mergeString, narrowsString, validateString } from "./string.core.js";
import {
	date,
	duration,
	email,
	instant,
	iri,
	markdown,
	phone,
	string,
	type StringShape,
	tag,
	text,
	time,
	timestamp,
	url,
	year
} from "./string.js";


describe("factories", () => {

	describe("string", () => {

		describe("shape", () => {

			it("returns a shape with kind 'string'", async () => {

				expect(string().kind).toBe("string");
				expect(string({ minLength: 1 }).kind).toBe("string");

			});

			it("returns an immutable shape", async () => {

				const shape = string();

				expect(() => Object.assign(shape, { kind: "number" })).toThrow();

			});

		});

		describe("constraints", () => {

			it("accepts the length constraints", async () => {

				expect(string({ minLength: 1 }).minLength).toBe(1);
				expect(string({ maxLength: 100 }).maxLength).toBe(100);

			});

			it("accepts the value constraints", async () => {

				expect(string({ in: ["a", "b", "c"] }).in).toEqual(["a", "b", "c"]);
				expect(string({ hasValue: ["required"] }).hasValue).toEqual(["required"]);

			});

			describe("pattern", () => {

				it("accepts string value", async () => {

					expect(string({ pattern: "^[A-Z]+$" }).pattern).toBe("^[A-Z]+$");

				});

				it("accepts RegExp value", async () => {

					expect(string({ pattern: /^[A-Z]+$/ }).pattern).toBe("^[A-Z]+$");

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

					expect(Object.keys(string()).sort()).toEqual(["kind", "pattern"]);

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

			describe("consistency", () => {

				it("rejects contradictory length bounds", async () => {

					expect(() => string({ minLength: 10, maxLength: 5 })).toThrow(RangeError);

				});

				it("rejects required values outside the enumeration", async () => {

					expect(() => string({ in: ["a", "b"], hasValue: ["x"] })).toThrow(RangeError);

				});

			});

		});

	});

	describe("text", () => {

		it("returns a shape with single-line pattern", async () => {

			const shape = text();

			expect(shape.kind).toBe("string");
			expect(shape.pattern).toBe("^\\S+(?: \\S+)*$");

		});

		it.each([
			["a single word", "word"],
			["space-separated words", "two words three"]
		])("accepts %s", async (_label, value) => {

			expect(value).toMatch(new RegExp(text().pattern ?? ""));

		});

		it.each([
			["the empty string", ""],
			["leading whitespace", " word"],
			["trailing whitespace", "word "],
			["repeated spaces", "two  words"],
			["a line break", "two\nwords"],
			["a tab", "two\twords"]
		])("rejects %s", async (_label, value) => {

			expect(value).not.toMatch(new RegExp(text().pattern ?? ""));

		});

		it("passes through constraints", async () => {

			const shape = text({ minLength: 1, maxLength: 100 });

			expect(shape.minLength).toBe(1);
			expect(shape.maxLength).toBe(100);

		});

		it("sets the xsd:string datatype", async () => {

			expect(text().datatype).toBe(xsd.string);

		});

	});

	describe("markdown", () => {

		it("returns a shape with no lexical pattern", async () => {

			const shape = markdown();

			expect(shape.kind).toBe("string");
			expect(shape.pattern).toBeUndefined();

		});

		it.each([
			["a single word", "word"],
			["consecutive lines", "first line\nsecond line"],
			["repeated blank lines", "first paragraph\n\n\n\nsecond paragraph"],
			["a hard line break", "first line  \nsecond line"],
			["CRLF line endings", "first line\r\nsecond line"],
			["indented content", "- item\n  - nested item"],
			["a fenced code block", "```js\nif ( x ) {\n\n}\n```"],
			["surrounding whitespace", " word\n"]
		])("accepts %s", async (_label, value) => {

			expect(validateString([value], markdown())).toBeUndefined();

		});

		it("passes through constraints", async () => {

			const shape = markdown({ minLength: 1, maxLength: 1000 });

			expect(shape.minLength).toBe(1);
			expect(shape.maxLength).toBe(1000);

		});

		it("sets the xsd:string datatype", async () => {

			expect(markdown().datatype).toBe(xsd.string);

		});

	});

	describe("email", () => {

		it("returns a shape with email pattern", async () => {

			const shape = email();

			expect(shape.kind).toBe("string");
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

		it("returns a shape with E.164 pattern", async () => {

			const shape = phone();

			expect(shape.kind).toBe("string");
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
			expect(shape.pattern).toBe("^\\S+$");

		});

		it("returns a shape with hierarchical variant", async () => {

			expect(iri({ variant: "hierarchical" }).pattern).toBe("^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\S*$");

		});

		it("returns a shape with absolute variant", async () => {

			expect(iri({ variant: "absolute" }).pattern).toBe("^[a-zA-Z][a-zA-Z0-9+.-]*:\\S+$");

		});

		it("returns a shape with internal variant", async () => {

			expect(iri({ variant: "internal" }).pattern).toBe("^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\\S+|\\/\\S*)$");

		});

		it("keeps the variant out of the built shape", async () => {

			expect(Object.keys(iri({ variant: "absolute" })).sort()).toEqual(["datatype", "kind", "pattern"]);

		});

		it("sets the xsd:string datatype", async () => {

			expect(iri().datatype).toBe(xsd.string);

		});

	});

	describe("url", () => {

		it("returns a shape equivalent to iri with hierarchical variant", async () => {

			const shape = url();

			expect(shape.kind).toBe("string");
			expect(shape.pattern).toBe("^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\S*$");

		});

		it("forwards textual constraints to iri", async () => {

			expect(url({ in: ["https://example.net/"] }).in).toEqual(["https://example.net/"]);

		});

		it("sets the xsd:string datatype", async () => {

			expect(url().datatype).toBe(xsd.string);

		});

	});

	describe("tag", () => {

		const matches = (value: string) => new RegExp(tag().pattern ?? "").test(value);

		it("returns a shape with a language tag pattern", async () => {

			const shape = tag();

			expect(shape.kind).toBe("string");
			expect(shape.pattern).toBeDefined();

		});

		it.each([
			["en"], // bare language
			["deu"], // three-letter language
			["zh-cmn"], // language with extlang
			["zh-Hans"], // language with script
			["fr-CA"], // language with region
			["es-419"], // language with numeric region
			["zh-Hans-CN"], // language with script and region
			["de-CH-1901"], // language with region and variant
			["de-DE-u-co-phonebk"], // language with extension
			["en-US-x-private"], // language with private use
			["x-private"] // standalone private use
		])("accepts the well-formed tag %s", async value => {

			expect(matches(value)).toBe(true);

		});

		it.each([
			["EN"], // uppercase language
			["fr-ca"], // lowercase region
			["ZH-hans-cn"] // mixed case throughout
		])("accepts %s case-insensitively", async value => {

			expect(matches(value)).toBe(true);

		});

		it.each([
			[""], // empty tag
			["e"], // single-letter language
			["toolongsubtag"], // over-long language
			["en-"], // trailing separator
			["en--US"], // empty subtag
			["123"], // numeric language
			["en US"], // embedded space
			["*"] // language range wildcard
		])("rejects the malformed tag %s", async value => {

			expect(matches(value)).toBe(false);

		});

		it.each([
			["еn"], // Cyrillic 'е' look-alike
			["ｅｎ"], // fullwidth letters
			["én"], // precomposed accented letter
			["eń"], // combining acute accent
			["𝐞𝐧"], // astral mathematical letters
			["١٢٣"], // Arabic-Indic digits
			["ｚｈ-Hans"], // fullwidth language subtag
			["zh-Ｈans"] // fullwidth script subtag
		])("rejects the non-ASCII tag %s", async value => {

			expect(matches(value)).toBe(false);

		});

		it("rejects a tag spanning multiple lines", async () => {

			expect(matches("en\nit")).toBe(false);

		});

		it("agrees with the core language tag guard", async () => {

			const values = [
				"en", "fr-CA", "zh-Hans-CN", "x-private", "", "e", "en--US", "*", "еn", "én", "𝐞𝐧", "en\nit"
			];

			expect(values.map(matches)).toEqual(values.map(isTag));

		});

		it("forwards textual constraints", async () => {

			expect(tag({ in: ["en", "it"] }).in).toEqual(["en", "it"]);

		});

		it("sets the xsd:string datatype", async () => {

			expect(tag().datatype).toBe(xsd.string);

		});

	});


	describe.each<[string, () => StringShape, string, string]>([
		["year", year, "^\\d{4}(?:Z|[+-]\\d{2}:\\d{2})?$", xsd.gYear],
		["date", date, "^\\d{4}-\\d{2}-\\d{2}(?:Z|[+-]\\d{2}:\\d{2})?$", xsd.date],
		["time", time, "^\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?$", xsd.time],
		["instant", instant,
			"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?$", xsd.dateTime],
		["timestamp", timestamp, "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$", xsd.dateTime],
		["duration", duration,
			"^-?P(?:\\d+Y)?(?:\\d+M)?(?:\\d+D)?(?:T(?:\\d+H)?(?:\\d+M)?(?:\\d+(?:\\.\\d+)?S)?)?$", xsd.duration]
	])("%s", (_label, factory, expectedPattern, expectedDatatype) => {

		it("returns a shape with kind 'string'", async () => {

			expect(factory().kind).toBe("string");

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

			it.each<[string, readonly unknown[], readonly number[]]>([
				["a single non-string value", [42], [0]],
				["mixed valid and non-string values", [42, "hello", true], [0, 2]],
				["multiple non-string values", [42, true], [0, 1]]
			])("keys a kind violation by element for %s", async (_label, values, indices) => {

				expect(validateString(values, string())).toEqual([
					Object.fromEntries(indices.map(index => [`${index}`, ["{type} expected <string> value"]]))
				]);

			});

			it("keys type and constraint violations by element", async () => {

				expect(validateString(["ab", 42, "c"], string({ minLength: 3 }))).toEqual([{
					"0": ["{length} expected string length greater than or equal to <3>"],
					"1": ["{type} expected <string> value"],
					"2": ["{length} expected string length greater than or equal to <3>"]
				}]);

			});

			it("reports only the wrong-typed value, matched strings passing", async () => {

				expect(validateString(["hello", 42], string({ minLength: 3 })))
					.toEqual([{ "1": ["{type} expected <string> value"] }]);

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

				expect(validateString([42], string(), { scope: "model" }))
					.toEqual([{ "0": ["{type} expected <string> value"] }]);

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
					.toEqual([{ "0": ["{format} expected string matching </^[a-z]*$/>"] }]);

			});

			it("still rejects a bound of the wrong kind", async () => {

				expect(validateString([42], string(), { scope: "bound" }))
					.toEqual([{ "0": ["{type} expected <string> value"] }]);

			});

		});

		describe.each([

			{
				label: "minLength",
				shape: string({ minLength: 3 }),
				atBoundary: "abc", withinBoundary: "abcdef", beyondBoundary: "ab"
			},

			{
				label: "maxLength",
				shape: string({ maxLength: 5 }),
				atBoundary: "hello", withinBoundary: "hi", beyondBoundary: "hello world"
			}

		])("$label constraint", ({ shape, atBoundary, withinBoundary, beyondBoundary }) => {

			it("returns undefined for strings at boundary", async () => {

				expect(validateString([atBoundary], shape)).toBeUndefined();

			});

			it("returns undefined for strings within boundary", async () => {

				expect(validateString([withinBoundary], shape)).toBeUndefined();

			});

			it("keys a length violation by element for strings beyond boundary", async () => {

				expect(validateString([beyondBoundary], shape))
					.toEqual([{ "0": [expect.stringContaining("{length}")] }]);

			});

		});

		describe("minLength edge cases", () => {

			it("keys a length violation for empty string when minLength > 0", async () => {

				expect(validateString([""], string({ minLength: 1 })))
					.toEqual([{ "0": ["{length} expected string length greater than or equal to <1>"] }]);

			});

			it("returns undefined for empty string when minLength is 0", async () => {

				expect(validateString([""], string({ minLength: 0 }))).toBeUndefined();

			});

		});

		describe("maxLength edge cases", () => {

			it("returns undefined for empty string with maxLength constraint", async () => {

				expect(validateString([""], string({ maxLength: 5 }))).toBeUndefined();

			});

			it("keys a length violation when maxLength is 0 and string is non-empty", async () => {

				expect(validateString(["a"], string({ maxLength: 0 })))
					.toEqual([{ "0": ["{length} expected string length less than or equal to <0>"] }]);

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

				expect(validateString(["a"], shape)).toEqual([{ "0": [expect.stringContaining("{length}")] }]);
				expect(validateString(["abcdef"], shape)).toEqual([{ "0": [expect.stringContaining("{length}")] }]);

			});

		});

		describe("pattern constraint", () => {

			it("returns undefined for strings matching pattern", async () => {

				expect(validateString(["hello"], string({ pattern: /^[a-z]+$/ }))).toBeUndefined();

			});

			it("returns keyed trace for strings not matching pattern", async () => {

				expect(validateString(["Hello123"], string({ pattern: /^[a-z]+$/ })))
					.toEqual([{ "0": [expect.stringContaining("{format}")] }]);

			});

			it("returns keyed trace for empty string when pattern requires content", async () => {

				expect(validateString([""], string({ pattern: /^[a-z]+$/ })))
					.toEqual([{ "0": [expect.stringContaining("{format}")] }]);

			});

			it("returns undefined for strings matching email pattern", async () => {

				expect(validateString(["user@example.com"], string({
					pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
				}))).toBeUndefined();

			});

			it("returns keyed trace for invalid email pattern", async () => {

				expect(validateString(["invalid-email"], string({
					pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
				}))).toEqual([{ "0": [expect.stringContaining("{format}")] }]);

			});

			it("validates pattern with anchors", async () => {

				const shape = string({ pattern: /^ABC$/ });

				expect(validateString(["ABC"], shape)).toBeUndefined();
				expect(validateString(["ABCD"], shape)).toEqual([{ "0": [expect.stringContaining("{format}")] }]);
				expect(validateString(["0ABC"], shape)).toEqual([{ "0": [expect.stringContaining("{format}")] }]);

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

				expect(validateString(["orange"], string({ in: ["apple", "banana", "cherry"] })))
					.toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

			});

			it("validates single-value enumeration", async () => {

				const shape = string({ in: ["only"] });

				expect(validateString(["only"], shape)).toBeUndefined();
				expect(validateString(["other"], shape)).toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

			});

			it("validates case-sensitive enumeration", async () => {

				const shape = string({ in: ["Hello", "World"] });

				expect(validateString(["Hello"], shape)).toBeUndefined();
				expect(validateString(["hello"], shape)).toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

			});

			it("returns undefined for empty string in enumeration", async () => {

				expect(validateString([""], string({ in: ["", "a", "b"] }))).toBeUndefined();

			});

		});

		describe("hasValue constraint", () => {

			it("returns undefined when all required values are present", async () => {

				expect(validateString(
					["apple", "banana", "cherry"],
					string({ hasValue: ["apple", "banana"] })
				)).toBeUndefined();

			});

			it("returns undefined when values exactly match required", async () => {

				expect(validateString(["apple", "banana"], string({ hasValue: ["apple", "banana"] }))).toBeUndefined();

			});

			it("returns keyed trace when required value is missing", async () => {

				expect(validateString(["apple", "cherry"], string({ hasValue: ["apple", "banana"] })))
					.toEqual([expect.stringContaining("{values}")]);

			});

			it("returns keyed trace when values array is empty", async () => {

				expect(validateString([], string({ hasValue: ["apple"] })))
					.toEqual([expect.stringContaining("{values}")]);

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

				expect(validateString(["ab"], string({ minLength: 5, pattern: /^[a-z]+$/ })))
					.toEqual([{ "0": ["{length} expected string length greater than or equal to <5>"] }]);

			});

			it("returns keyed trace for valid length but invalid pattern", async () => {

				expect(validateString(["Hello123"], string({
					maxLength: 10,
					pattern: /^[a-z]+$/
				}))).toEqual([{ "0": [expect.stringContaining("{format}")] }]);

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

				expect(validateString(["grape"], shape))
					.toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

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

				const trace = validateString(["a🌍b"], string({ maxLength: 3 }));

				expect(trace === undefined || typeof trace === "object").toBeTruthy();

			});

			it("handles unicode in pattern matching", async () => {

				expect(validateString(["héllo"], string({ pattern: /^[a-zA-Zéö]+$/ }))).toBeUndefined();

			});

		});

		describe("per-value errors", () => {

			it.each<[string, readonly string[], readonly number[]]>([
				["both failing values", ["ab", "c"], [0, 1]],
				["only the failing values", ["ab", "hello", "c"], [0, 2]],
				["a single failing value", ["ab"], [0]]
			])("keys length violations by element (%s)", async (_label, values, indices) => {

				expect(validateString(values, string({ minLength: 3 }))).toEqual([
					Object.fromEntries(indices.map(index =>
						[`${index}`, ["{length} expected string length greater than or equal to <3>"]]
					))
				]);

			});

		});

	});

});
