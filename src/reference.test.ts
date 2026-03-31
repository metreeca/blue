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
import { mergeReference, validateReferences } from "./reference.core.js";
import { reference } from "./reference.js";
import { resource } from "./resource.js";
import { string } from "./string.js";
import { multiple, optional, repeatable, required } from "./value.js";


describe("factories", () => {


	describe.each([
		["multiple", multiple, undefined, undefined],
		["repeatable", repeatable, 1, undefined],
		["optional", optional, undefined, 1],
		["required", required, 1, 1]
	])("%s", (_label, factory, expectedMin, expectedMax) => {

		it("returns a range with expected cardinality", async () => {

			const range = factory(string());

			expect(range.minCount).toBe(expectedMin);
			expect(range.maxCount).toBe(expectedMax);
			expect(range.shape.kind).toBe("string");

		});

		it("returns an immutable range", async () => {

			const range = factory(string());

			expect(() => {
				(range as any).minCount = 99;
			}).toThrow();

		});

		it("includes only expected properties", async () => {

			const range = factory(string());

			expect(Object.keys(range).sort()).toEqual(["kind", "maxCount", "minCount", "model", "shape"]);

		});

	});


	describe("reference", () => {

		describe("shape", () => {

			it("returns a shape with kind 'reference'", async () => {

				expect(reference(resource({})).kind).toBe("reference");

			});

			it("returns a shape with default model", async () => {

				expect(reference(resource({})).model).toBe("app:/");

			});

			it("returns an immutable shape", async () => {

				const shape = reference(resource({}));

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = "/test").toThrow();

			});

		});

	});

	describe("foreign", () => {

		describe("shape", () => {

			it("returns a shape with kind 'reference'", async () => {

				expect(reference(resource({}), { foreign: true }).kind).toBe("reference");

			});

			it("returns a shape with foreign set to true", async () => {

				expect(reference(resource({}), { foreign: true }).foreign).toBe(true);

			});

			it("returns a shape with default model", async () => {

				expect(reference(resource({}), { foreign: true }).model).toBe("app:/");

			});

			it("returns an immutable shape", async () => {

				const shape = reference(resource({}), { foreign: true });

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).foreign = false).toThrow();

			});

		});

	});

	describe("captive", () => {

		describe("shape", () => {

			it("returns a shape with kind 'reference'", async () => {

				expect(reference(resource({}), { captive: true }).kind).toBe("reference");

			});

			it("returns a shape with captive set to true", async () => {

				expect(reference(resource({}), { captive: true }).captive).toBe(true);

			});

			it("returns a shape with default model", async () => {

				expect(reference(resource({}), { captive: true }).model).toBe("app:/");

			});

			it("returns an immutable shape", async () => {

				const shape = reference(resource({}), { captive: true });

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).captive = false).toThrow();

			});

		});

	});

});

describe("operators", () => {

	describe("validateReference", () => {

		describe("type filtering", () => {

			it("returns undefined for valid reference values", async () => {

				expect(validateReferences(["app:/users/123"], reference(resource({})))).toBeUndefined();

			});

			it("returns undefined for empty values array", async () => {

				expect(validateReferences([], reference(resource({})))).toBeUndefined();

			});

			it("returns trace with kind key for non-reference value", async () => {

				const trace = validateReferences([42], reference(resource({})));

				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for multiple non-reference values", async () => {

				const trace = validateReferences([42, true], reference(resource({})));

				expect(trace).toHaveProperty("{kind}");
				expect((trace as Record<string, string>)["{kind}"]).toMatch(/\(2\/2\)/);

			});

			it("returns trace with kind key for mixed values", async () => {

				const trace = validateReferences(["app:/users/123", 42], reference(resource({})));

				expect(trace).toHaveProperty("{kind}");

			});

		});

		describe("no constraints", () => {

			it("accepts any reference when target shape has no constraints", async () => {

				const target = resource({});
				const shape = reference(target);

				expect(validateReferences(["app:/users/123"], shape)).toBeUndefined();

			});

			it("accepts empty values", async () => {

				const target = resource({});
				const shape = reference(target);

				expect(validateReferences([], shape)).toBeUndefined();

			});

		});

		describe.each([

			{
				constraint: "pattern",
				options: { pattern: "/users/{id}" } as const,
				valid: ["app:/users/123"],
				invalid: ["app:/products/123"],
				errorKey: "{pattern}"
			},

			{
				constraint: "in",
				options: { in: ["app:/users/1", "app:/users/2"] } as const,
				valid: ["app:/users/1"],
				invalid: ["app:/users/99"],
				errorKey: "{in}"
			},

			{
				constraint: "hasValue",
				options: { hasValue: ["app:/users/1"] } as const,
				valid: ["app:/users/1", "app:/users/2"],
				invalid: ["app:/users/2"],
				errorKey: "{hasValue}"
			}

		])("$constraint constraint", ({ options, valid, invalid, errorKey }) => {

			it("accepts valid references", async () => {

				const shape = reference(resource(options, {}));

				expect(validateReferences(valid, shape)).toBeUndefined();

			});

			it("rejects invalid references", async () => {

				const shape = reference(resource(options, {}));

				expect(validateReferences(invalid, shape)).toHaveProperty(errorKey);

			});

		});

		describe("lazy shape resolution", () => {

			it("resolves lazy shape function before validation", async () => {

				const target = resource({ pattern: "/users/{id}" }, {});
				const shape = reference(() => target);

				expect(validateReferences(["app:/users/123"], shape)).toBeUndefined();
				expect(validateReferences(["app:/products/123"], shape)).toHaveProperty("{pattern}");

			});

		});

	});

	describe("mergeReference", () => {

		describe("kind", () => {

			it("preserves kind as 'reference'", async () => {

				const merged = mergeReference(reference(resource({})), reference(resource({})));

				expect(merged.kind).toBe("reference");

			});

		});

		describe("model", () => {

			it("merges shapes with equal models", async () => {

				const merged = mergeReference(reference(resource({})), reference(resource({})));

				expect(merged.model).toBe("app:/");

			});

		});

		describe("foreign", () => {

			it("preserves foreign from target", async () => {

				const merged = mergeReference(
					reference(resource({}), { foreign: true }),
					reference(resource({}), { foreign: true })
				);

				expect(merged.foreign).toBe(true);

			});

			it("preserves absent foreign from target", async () => {

				const merged = mergeReference(reference(resource({})), reference(resource({})));

				expect(merged.foreign).toBeUndefined();

			});

		});

		describe("captive", () => {

			it("preserves captive from target", async () => {

				const merged = mergeReference(
					reference(resource({}), { captive: true }),
					reference(resource({}), { captive: true })
				);

				expect(merged.captive).toBe(true);

			});

			it("preserves absent captive from target", async () => {

				const merged = mergeReference(reference(resource({})), reference(resource({})));

				expect(merged.captive).toBeUndefined();

			});

		});

		describe("shape", () => {

			it("preserves shape from target", async () => {

				const target = resource({});
				const source = resource({});

				const merged = mergeReference(reference(target), reference(source));

				expect(merged.shape).toBe(target);

			});

		});

	});

});
