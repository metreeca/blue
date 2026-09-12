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
} from "./index.js";
import { validateString } from "./validator.js";


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
