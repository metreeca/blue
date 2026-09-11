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
import { mergeBoolean, narrowsBoolean, validateBoolean } from "./boolean.core.js";
import { boolean } from "./boolean.js";
import type { Scope } from "./index.core.js";


describe("factories", () => {

	describe("boolean", () => {

		describe("shape", () => {

			it("returns a shape with kind 'boolean'", async () => {

				expect(boolean().kind).toBe("boolean");

			});

			it("returns an immutable shape", async () => {

				const shape = boolean();

				expect(() => Object.assign(shape, { kind: "string" })).toThrow();

			});

			it("includes only the kind entry", async () => {

				expect(Object.keys(boolean()).sort()).toEqual(["kind"]);

			});

		});

	});

});

describe("operators", () => {

	describe("narrowsBoolean", () => {

		it("accepts an identical child", async () => {

			expect(narrowsBoolean(boolean(), boolean())).toBeUndefined();

		});

	});

	describe("mergeBoolean", () => {

		it("preserves kind as 'boolean'", async () => {

			expect(mergeBoolean(boolean(), boolean()).kind).toBe("boolean");

		});

		it("returns an immutable shape", async () => {

			const merged = mergeBoolean(boolean(), boolean());

			expect(() => Object.assign(merged, { kind: "string" })).toThrow();

		});

		it("carries nothing beyond the kind", async () => {

			expect(Object.keys(mergeBoolean(boolean(), boolean())).sort()).toEqual(["kind"]);

		});

	});

});

describe("validators", () => {

	describe("validateBoolean", () => {

		it.each<[string, readonly unknown[]]>([
			["valid boolean values", [true, false]],
			["empty values", []]
		])("returns undefined for %s", async (_label, values) => {

			expect(validateBoolean(values, boolean())).toBeUndefined();

		});

		it.each<[string, readonly unknown[], readonly number[]]>([
			["a single non-boolean value", [42], [0]],
			["mixed valid and non-boolean values", [true, 42, "hello"], [1, 2]],
			["multiple non-boolean values", [42, "hello"], [0, 1]]
		])("keys a kind violation by element for %s", async (_label, values, indices) => {

			expect(validateBoolean(values, boolean())).toEqual([
				Object.fromEntries(indices.map(index => [`${index}`, ["{type} expected <boolean> value"]]))
			]);

		});

		it.each<[string, Scope]>([
			["state", "state"],
			["bound", "bound"],
			["model", "model"]
		])("enforces the kind alone at the %s scope", async (_label, scope) => {

			expect(validateBoolean([true], boolean(), { scope })).toBeUndefined();
			expect(validateBoolean([42], boolean(), { scope }))
				.toEqual([{ "0": ["{type} expected <boolean> value"] }]);

		});

	});

});
