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
import { match } from "./validator.js";


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
