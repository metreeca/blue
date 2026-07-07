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
import { TraceError } from "./index.core.js";
import { mergeReference, narrowsReference, validateReference } from "./reference.core.js";
import { reference, type ReferenceConstraints } from "./reference.js";
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

	describe.each<[string, ReferenceConstraints]>([
		["reference", {}],
		["foreign", { foreign: true }],
		["captive", { captive: true }]
	])("%s", (_label, constraints) => {

		describe("shape", () => {

			it("returns a shape with kind 'reference'", async () => {

				expect(reference(resource({}), constraints).kind).toBe("reference");

			});

			it("returns a shape with default model", async () => {

				expect(reference(resource({}), constraints).model).toBe("app:/");

			});

			it("returns an immutable shape", async () => {

				const shape = reference(resource({}), constraints);

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = "/test").toThrow();

			});

		});

	});

	describe.each<[string, "foreign" | "captive", ReferenceConstraints]>([
		["foreign", "foreign", { foreign: true }],
		["captive", "captive", { captive: true }]
	])("%s", (_label, flag, constraints) => {

		it(`exposes ${flag} set to true and is immutable`, async () => {

			const shape = reference(resource({}), constraints);

			expect(shape[flag]).toBe(true);
			expect(() => (shape as any)[flag] = false).toThrow();

		});

	});

});

describe("operators", () => {

	describe("narrowsReference", () => {

		it("accepts an identical child", async () => {

			const Target = resource({ name: required(string()) });

			expect(narrowsReference(reference(Target), reference(Target))).toBeUndefined();

		});

		it("rejects a child targeting a different shape", async () => {

			const A = resource({ name: required(string()) });
			const B = resource({ code: required(string()) });

			expect(narrowsReference(reference(A), reference(B))).toBeDefined();

		});

	});

	describe("mergeReference", () => {

		it("preserves kind as 'reference'", async () => {

			const merged = mergeReference(reference(resource({})), reference(resource({})));

			expect(merged.kind).toBe("reference");

		});

		it("merges shapes with equal models", async () => {

			const merged = mergeReference(reference(resource({})), reference(resource({})));

			expect(merged.model).toBe("app:/");

		});

		describe.each<[string, "foreign" | "captive", ReferenceConstraints]>([
			["foreign", "foreign", { foreign: true }],
			["captive", "captive", { captive: true }]
		])("%s", (_label, flag, constraints) => {

			it(`inherits ${flag} from source`, async () => {

				const merged = mergeReference(reference(resource({})), reference(resource({}), constraints));

				expect(merged[flag]).toBe(true);

			});

			it(`preserves absent ${flag} when neither defines it`, async () => {

				const merged = mergeReference(reference(resource({})), reference(resource({})));

				expect(merged[flag]).toBeUndefined();

			});

			it(`tolerates matching ${flag} on both target and source`, async () => {

				const merged = mergeReference(
					reference(resource({}), constraints),
					reference(resource({}), constraints)
				);

				expect(merged[flag]).toBe(true);

			});

			it(`rejects ${flag} redefinition by target`, async () => {

				expect(() => mergeReference(
					reference(resource({}), constraints),
					reference(resource({}))
				)).toThrow(TraceError);

			});

		});

		describe("shape", () => {

			it("preserves the shared target shape", async () => {

				const target = resource({});

				const merged = mergeReference(reference(target), reference(target));

				expect(merged.shape).toBe(target);

			});

			it("rejects a divergent target shape", async () => {

				expect(() => mergeReference(
					reference(resource({ name: required(string()) })),
					reference(resource({ label: required(string()) }))
				)).toThrow(TraceError);

			});

		});

	});

});

describe("validators", () => {

	describe("validateReferences", () => {

		describe("type filtering", () => {

			it.each<[string, readonly unknown[]]>([
				["valid reference values", ["app:/users/123"]],
				["empty values", []]
			])("returns undefined for %s", async (_label, values) => {

				expect(validateReference(values, reference(resource({})))).toBeUndefined();

			});

			it.each<[string, readonly unknown[], RegExp]>([
				["a single non-reference value", [42], /expected <reference> values$/],
				["mixed valid and non-reference values", ["app:/users/123", 42], /expected <reference> values$/],
				["multiple non-reference values", [42, true], /expected <reference> values \(2\/2\)/],

				// references MUST be absolute IRIs; a root-relative string carries no scheme

				["a relative (non-absolute) IRI", ["/users/123"], /expected <reference> values$/]
			])("returns a kind trace for %s", async (_label, values, message) => {

				const trace = validateReference(values, reference(resource({})));

				expect(trace).toHaveProperty("{kind}");
				expect((trace as Record<string, string>)["{kind}"]).toMatch(message);

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

				expect(validateReference(valid, shape)).toBeUndefined();

			});

			it("rejects invalid references", async () => {

				const shape = reference(resource(options, {}));

				expect(validateReference(invalid, shape)).toHaveProperty(errorKey);

			});

		});

		describe("lazy shape resolution", () => {

			it("resolves lazy shape function before validation", async () => {

				const target = resource({ pattern: "/users/{id}" }, {});
				const shape = reference(() => target);

				expect(validateReference(["app:/users/123"], shape)).toBeUndefined();
				expect(validateReference(["app:/products/123"], shape)).toHaveProperty("{pattern}");

			});

		});

		describe("placeholder mode", () => {

			it("skips target value constraints for a placeholder", async () => {

				const shape = reference(resource({ pattern: "/users/{id}" }, {}));

				expect(validateReference(["app:/products/999"], shape, { scope: "model" })).toBeUndefined();

			});

			// a reference placeholder matches the full IRI-reference production (qest §5.2): the empty string
			// together with the relative, root-relative, and absolute forms, not the absolute-only instance form

			it.each<[string, readonly unknown[]]>([
				["an absolute IRI", ["app:/vendors/1"]],
				["a root-relative IRI", ["/vendors/"]],
				["a relative IRI", ["vendors/1"]],
				["the empty string", [""]]
			])("accepts %s placeholder", async (_label, values) => {

				const shape = reference(resource({}));

				expect(validateReference(values, shape, { scope: "model" })).toBeUndefined();

			});

			it("still rejects a placeholder of the wrong kind", async () => {

				const shape = reference(resource({}));

				expect(validateReference([42], shape, { scope: "model" })).toHaveProperty("{kind}");

			});

		});

		describe("bound scope", () => {

			// the bound scope keeps the target IRI pattern (the syntactic discriminator) but drops the in and hasValue
			// value-domain constraints

			it("skips the target in constraint for a bound", async () => {

				const shape = reference(resource({ in: ["app:/users/1", "app:/users/2"] }, {}));

				expect(validateReference(["app:/users/99"], shape, { scope: "bound" })).toBeUndefined();

			});

			it("still enforces the target pattern for a bound", async () => {

				const shape = reference(resource({ pattern: "/users/{id}" }, {}));

				expect(validateReference(["app:/products/999"], shape, { scope: "bound" })).toHaveProperty("{pattern}");

			});

			it("still rejects a bound of the wrong kind", async () => {

				const shape = reference(resource({}));

				expect(validateReference([42], shape, { scope: "bound" })).toHaveProperty("{kind}");

			});

		});

	});

});
