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
import { isBooleanConstraints, isBooleanShape, validateBoolean } from "./boolean.core.js";
import { boolean } from "./boolean.js";


describe("guards", () => {

	describe("isBooleanShape", () => {

		it("returns true for valid boolean shape", async () => {

			expect(isBooleanShape(boolean())).toBe(true);
			expect(isBooleanShape(boolean(true))).toBe(true);

		});

		it("returns false for object with wrong kind", async () => {

			expect(isBooleanShape({ kind: "string", model: false })).toBe(false);

		});

		it("returns false for object with non-boolean model", async () => {

			expect(isBooleanShape({ kind: "boolean", model: "false" })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isBooleanShape(null)).toBe(false);
			expect(isBooleanShape(undefined)).toBe(false);

		});

	});

	describe("isBooleanConstraints", () => {

		it("returns true for empty object", async () => {

			expect(isBooleanConstraints({})).toBe(true);

		});

		it("returns true for object with boolean model", async () => {

			expect(isBooleanConstraints({ model: true })).toBe(true);
			expect(isBooleanConstraints({ model: false })).toBe(true);

		});

		it("returns false for object with non-boolean model", async () => {

			expect(isBooleanConstraints({ model: "true" })).toBe(false);
			expect(isBooleanConstraints({ model: 1 })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isBooleanConstraints(null)).toBe(false);
			expect(isBooleanConstraints(undefined)).toBe(false);
			expect(isBooleanConstraints("string")).toBe(false);

		});

	});

});

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

			describe("model", () => {

				it("rejects non-boolean value", async () => {

					expect(() => boolean({ model: "true" } as any)).toThrow(TypeError);

				});

			});

			describe("combined", () => {

				it("includes only provided properties", async () => {

					expect(Object.keys(boolean()).sort()).toEqual(["kind", "model"]);

				});

				it("rejects extra properties", async () => {

					expect(() => boolean({ extra: "ignored" } as any)).toThrow(TypeError);

				});

			});

		});

	});

});

describe("validators", () => {

	describe("validateBoolean", () => {

		it("returns undefined for valid boolean values", async () => {

			expect(validateBoolean([true, false], boolean())).toBeUndefined();

		});

		it("returns undefined for empty values", async () => {

			expect(validateBoolean([], boolean())).toBeUndefined();

		});

	});

});
