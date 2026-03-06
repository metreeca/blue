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
import { mergeBoolean, validateBoolean } from "./boolean.core.js";
import { boolean } from "./boolean.js";


describe("factories", () => {

	describe("boolean", () => {

		describe("shape", () => {

			it("returns a shape with kind 'boolean'", async () => {

				expect(boolean().kind).toBe("boolean");
				expect(boolean(true).kind).toBe("boolean");
				expect(boolean({ model: true }).kind).toBe("boolean");

			});

			it("returns a shape with default model", async () => {

				expect(boolean().model).toBe(false);
				expect(boolean({}).model).toBe(false);

			});

			it("returns a shape with model argument", async () => {

				expect(boolean(true).model).toBe(true);

			});

			it("returns a shape with model constraint", async () => {

				expect(boolean({ model: true }).model).toBe(true);

			});

			it("returns an immutable shape", async () => {

				const shape = boolean();

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = true).toThrow();

			});

		});

		describe("constraints", () => {

			describe("combined", () => {

				it("includes only provided properties", async () => {

					expect(Object.keys(boolean()).sort()).toEqual(["kind", "model"]);

				});

			});

		});

	});

});

describe("operators", () => {

	describe("validateBoolean", () => {

		describe("type filtering", () => {

			it("returns undefined for valid boolean values", async () => {

				expect(validateBoolean([true, false], boolean())).toBeUndefined();

			});

			it("returns undefined for empty values", async () => {

				expect(validateBoolean([], boolean())).toBeUndefined();

			});

			it("returns trace with kind key for non-boolean value", async () => {

				const trace = validateBoolean([42], boolean());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for multiple non-boolean values", async () => {

				const trace = validateBoolean([42, "hello"], boolean());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");
				expect((trace as Record<string, string>)["{kind}"]).toMatch(/\(2\/2\)/);

			});

			it("returns trace with kind key for mixed values", async () => {

				const trace = validateBoolean([true, 42, "hello"], boolean());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for mixed values with passing booleans", async () => {

				const trace = validateBoolean([true, 42], boolean());

				expect(trace).toHaveProperty("{kind}");

			});

		});

	});

	describe("mergeBoolean", () => {

		describe("kind", () => {

			it("preserves kind as 'boolean'", async () => {

				const merged = mergeBoolean(boolean(), boolean());

				expect(merged.kind).toBe("boolean");

			});

		});

		describe("model", () => {

			it("merges shapes with equal models", async () => {

				const merged = mergeBoolean(boolean(), boolean());

				expect(merged.model).toBe(false);

			});

			it("merges shapes with equal non-default models", async () => {

				const merged = mergeBoolean(boolean(true), boolean(true));

				expect(merged.model).toBe(true);

			});

			it("rejects shapes with different models", async () => {

				expect(() => mergeBoolean(boolean(true), boolean(false))).toThrow(RangeError);

			});

		});

	});

});
