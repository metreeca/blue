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
import { deriveBoolean, mergeBoolean, narrowsBoolean, validateBoolean } from "./boolean.core.js";
import { boolean } from "./boolean.js";
import { TraceError } from "./index.core.js";
import { decimal, integer, number } from "./number.js";
import { reference } from "./reference.js";
import { resource } from "./resource.js";
import { date, string, time } from "./string.js";
import { text } from "./text.js";
import { union, type UnionShape } from "./union.js";
import {
	checkValues,
	deriveValue,
	deriveValues,
	mergeValue,
	mergeValues,
	narrowsValue,
	narrowsValues
} from "./value.core.js";
import { cardinality, multiple, optional, required, type SetShape } from "./value.js";

describe("factories", () => {

	describe("boolean", () => {

		describe("shape", () => {

			it("returns a shape with kind 'boolean'", async () => {

				expect(boolean().kind).toBe("boolean");
				expect(boolean(true).kind).toBe("boolean");
				expect(boolean({ model: true }).kind).toBe("boolean");

			});

			it.each<[string, () => boolean, boolean]>([
				["no arguments", () => boolean().model, false],
				["empty constraints", () => boolean({}).model, false],
				["model argument", () => boolean(true).model, true],
				["model constraint", () => boolean({ model: true }).model, true]
			])("resolves model from %s", async (_label, model, expected) => {

				expect(model()).toBe(expected);

			});

			it("returns an immutable shape", async () => {

				const shape = boolean();

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = true).toThrow();

			});

			it("includes only kind and model properties", async () => {

				expect(Object.keys(boolean()).sort()).toEqual(["kind", "model"]);

			});

		});

	});

});

describe("operators", () => {

	describe("narrowsBoolean", () => {

		it("accepts an identical child", async () => {

			expect(narrowsBoolean(boolean(), boolean())).toBeUndefined();

		});

		it("accepts a child with an equal model", async () => {

			expect(narrowsBoolean(boolean(true), boolean(true))).toBeUndefined();

		});

		it("rejects a child with a different model", async () => {

			expect(narrowsBoolean(boolean(true), boolean(false))).toBeDefined();

		});

	});

	describe("mergeBoolean", () => {

		it("preserves kind as 'boolean'", async () => {

			expect(mergeBoolean(boolean(), boolean()).kind).toBe("boolean");

		});

		it.each([false, true])("merges shapes with equal model <%s>", async (model) => {

			expect(mergeBoolean(boolean(model), boolean(model)).model).toBe(model);

		});

		it("rejects shapes with different models", async () => {

			expect(() => mergeBoolean(boolean(true), boolean(false))).toThrow(RangeError);

		});

	});

	describe("deriveBoolean", () => {

		it("derives false regardless of the shape model", async () => {

			expect(deriveBoolean(boolean())).toBe(false);
			expect(deriveBoolean(boolean(true))).toBe(false);

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

		it.each<[string, readonly unknown[], RegExp]>([
			["a single non-boolean value", [42], /expected <boolean> values$/],
			["mixed valid and non-boolean values", [true, 42, "hello"], /expected <boolean> values \(2\/3\)/],
			["multiple non-boolean values", [42, "hello"], /expected <boolean> values \(2\/2\)/]
		])("returns a kind trace for %s", async (_label, values, message) => {

			const trace = validateBoolean(values, boolean());

			expect(trace).toHaveProperty("{kind}");
			expect((trace as Record<string, string>)["{kind}"]).toMatch(message);

		});

	});

});
