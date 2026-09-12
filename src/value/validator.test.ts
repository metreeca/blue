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
import { boolean } from "../boolean/index.js";
import { dictionary } from "../dictionary/index.js";
import { integer } from "../number/index.js";
import { reference } from "../reference/index.js";
import { id, required, resource } from "../resource/index.js";
import { string } from "../string/index.js";
import { union } from "../union/index.js";
import { match, validateShape } from "./validator.js";


describe("validateShape", () => {

	it("routes values to the validators of the shape's kind", async () => {

		expect(validateShape(["Widget"], string())).toBeUndefined();
		expect(validateShape([42], integer())).toBeUndefined();
		expect(validateShape([true], boolean())).toBeUndefined();
		expect(validateShape([{ en: ["Widget"] }], dictionary())).toBeUndefined();
		expect(validateShape(["app:/vendors/1"], reference(resource({ id: id() })))).toBeUndefined();

	});

	it("reports a value of another kind", async () => {

		expect(validateShape([42], string())).toBeDefined();
		expect(validateShape(["Widget"], integer())).toBeDefined();

	});

	it("routes a polymorphic shape to the branch the value belongs to", async () => {

		const shape = union(string(), integer());

		expect(validateShape([42], shape)).toBeUndefined();
		expect(validateShape([true], shape)).toBeDefined();

	});

	it("routes a resource shape to the members it declares", async () => {

		const shape = resource({ name: required(string()) });

		expect(validateShape([{ name: "Widget" }], shape)).toBeUndefined();
		expect(validateShape([{ name: 42 }], shape)).toBeDefined();

	});

	it("carries the scope through to the validator it routes to", async () => {

		const shape = integer({ minInclusive: 10 });

		expect(validateShape([0], shape)).toBeDefined();
		expect(validateShape([0], shape, { scope: "model" })).toBeUndefined();

	});

	it("validates every value it is given", async () => {

		expect(validateShape(["Widget", "Gadget"], string())).toBeUndefined();
		expect(validateShape(["Widget", 42], string())).toBeDefined();
		expect(validateShape([], string())).toBeUndefined();

	});

});

describe("match", () => {

	it.each<[string, string, string, boolean]>([
		["a placeholder segment", "app:/users/123", "/users/{id}", true],
		["a mismatched segment", "app:/products/123", "/users/{id}", false],
		["a trailing wildcard", "app:/users/1/2", "/users/*", true],
		["an absolute pattern", "https://example.net/users/1", "https://example.net/users/{id}", true],
		["a root-relative pattern against an absolute IRI", "https://example.net/users/1", "/users/{id}", true]
	])("matches %s", async (_label, iri, pattern, expected) => {

		expect(match(iri, pattern)).toBe(expected);

	});

	it("rejects a malformed pattern", async () => {

		expect(() => match("app:/users/1", "users/{id}")).toThrow(TypeError);

	});

});
