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

import { TraceError } from "@metreeca/core/trace";
import { describe, expect, it } from "vitest";
import { mergeReference, narrowsReference, validateReference } from "./reference.core.js";
import { getShapeTarget, reference, type ReferenceConstraints } from "./reference.js";
import { id, resource, type ResourceShape } from "./resource.js";
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

		it("includes only expected entries", async () => {

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

		const Wider = resource({ name: required(string()) });
		const Narrower = resource({ extends: Wider }, { name: required(string({ minLength: 1 })) });
		const Narrowest = resource({ extends: Narrower }, {});

		it("accepts an identical child", async () => {

			const Target = resource({ name: required(string()) });

			expect(narrowsReference(reference(Target), reference(Target))).toBeUndefined();

		});

		it("accepts a child targeting an extending shape", async () => {

			expect(narrowsReference(reference(Narrower), reference(Wider))).toBeUndefined();

		});

		it("accepts a child targeting a transitively extending shape", async () => {

			expect(narrowsReference(reference(Narrowest), reference(Wider))).toBeUndefined();

		});

		it("accepts a child targeting a shape extending one of several inherited parents", async () => {

			const Other = resource({ code: required(string()) });
			const Multiple = resource({ extends: [Other, Wider] }, {});

			expect(narrowsReference(reference(Multiple), reference(Wider))).toBeUndefined();

		});

		it("rejects a child targeting an extended shape", async () => {

			expect(narrowsReference(reference(Wider), reference(Narrower))).toBeDefined();

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

			it("keeps the extending target shape", async () => {

				const Wider = resource({ name: required(string()) });
				const Narrower = resource({ extends: Wider }, { name: required(string({ minLength: 1 })) });

				const merged = mergeReference(reference(Narrower), reference(Wider));

				expect(merged.shape).toBe(Narrower);

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

describe("inheritance", () => {

	const Wider = resource({ id: id(), label: required(string()) });
	const Narrower = resource({ extends: Wider }, { label: required(string({ minLength: 1 })) });

	const Parent = resource({ id: id(), link: required(reference(Wider)) });

	function target(shape: ResourceShape, entry: string): undefined | ResourceShape {

		const member = shape.entries[entry];

		return member?.kind === "property" ? getShapeTarget(member.range.shape) : undefined;

	}

	it("re-points an inherited reference at an extending target", async () => {

		const Child = resource({ extends: Parent }, { link: required(reference(Narrower)) });

		expect(target(Child, "link")).toBe(Narrower);

	});

	it("re-points an inherited reference at a lazily declared extending target", async () => {

		const Child = resource({ extends: Parent }, { link: required(reference(() => Narrower)) });

		expect(target(Child, "link")).toBe(Narrower);

	});

	it("retains the inherited target definition without restating it", async () => {

		const Child = resource({ extends: Parent }, { link: required(reference(Narrower)) });

		expect(Object.keys(target(Child, "link")?.entries ?? {})).toEqual(expect.arrayContaining(["id", "label"]));

	});

	it("rejects re-pointing at an unrelated target", async () => {

		const Unrelated = resource({ id: id(), code: required(string()) });

		expect(() => resource({ extends: Parent }, { link: required(reference(Unrelated)) })).toThrow(TraceError);

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

			it.each<[string, readonly unknown[], readonly number[]]>([
				["a single non-reference value", [42], [0]],
				["mixed valid and non-reference values", ["app:/users/123", 42], [1]],
				["multiple non-reference values", [42, true], [0, 1]],

				// references MUST be absolute IRIs; a root-relative string carries no scheme

				["a relative (non-absolute) IRI", ["/users/123"], [0]]
			])("keys a kind violation by element for %s", async (_label, values, indices) => {

				expect(validateReference(values, reference(resource({})))).toEqual([
					Object.fromEntries(indices.map(index => [`${index}`, ["{type} expected <Reference> value"]]))
				]);

			});

		});

		describe.each([

			{
				constraint: "pattern",
				options: { pattern: "/users/{id}" } as const,
				valid: ["app:/users/123"],
				invalid: ["app:/products/123"],
				error: [{ "0": [expect.stringContaining("{format}")] }]
			},

			{
				constraint: "in",
				options: { in: ["app:/users/1", "app:/users/2"] } as const,
				valid: ["app:/users/1"],
				invalid: ["app:/users/99"],
				error: [{ "0": [expect.stringContaining("{domain}")] }]
			},

			{
				constraint: "hasValue",
				options: { hasValue: ["app:/users/1"] } as const,
				valid: ["app:/users/1", "app:/users/2"],
				invalid: ["app:/users/2"],
				error: [expect.stringContaining("{values}")]
			}

		])("$constraint constraint", ({ options, valid, invalid, error }) => {

			it("accepts valid references", async () => {

				const shape = reference(resource(options, {}));

				expect(validateReference(valid, shape)).toBeUndefined();

			});

			it("rejects invalid references", async () => {

				const shape = reference(resource(options, {}));

				expect(validateReference(invalid, shape)).toEqual(error);

			});

		});

		describe("lazy shape resolution", () => {

			it("resolves lazy shape function before validation", async () => {

				const target = resource({ pattern: "/users/{id}" }, {});
				const shape = reference(() => target);

				expect(validateReference(["app:/users/123"], shape)).toBeUndefined();
				expect(validateReference(["app:/products/123"], shape))
					.toEqual([{ "0": [expect.stringContaining("{format}")] }]);

			});

		});

		describe("placeholder mode", () => {

			it("skips target value constraints for a placeholder", async () => {

				const shape = reference(resource({ pattern: "/users/{id}" }, {}));

				expect(validateReference(["app:/products/999"], shape, { scope: "model" })).toBeUndefined();

			});

			// a reference placeholder matches the full IRI-reference production (qest §5.2): the empty string
			// together with the relative, root-relative, and absolute forms, not the absolute-only instance form

			it("skips the target in constraint for a placeholder", async () => {

				const shape = reference(resource({ in: ["app:/users/1", "app:/users/2"] }, {}));

				expect(validateReference(["app:/users/99"], shape, { scope: "model" })).toBeUndefined();

			});

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

				expect(validateReference([42], shape, { scope: "model" }))
					.toEqual([{ "0": ["{type} expected <IRI> value"] }]);

			});

		});

		describe("bound scope", () => {

			// the bound scope keeps the target IRI pattern (the syntactic discriminator) but drops the in and hasValue
			// value-domain constraints

			it("skips the target in constraint for a bound", async () => {

				const shape = reference(resource({ in: ["app:/users/1", "app:/users/2"] }, {}));

				expect(validateReference(["app:/users/99"], shape, { scope: "bound" })).toBeUndefined();

			});

			it("skips the target hasValue constraint for a bound", async () => {

				const shape = reference(resource({ hasValue: ["app:/users/1"] }, {}));

				expect(validateReference(["app:/users/2"], shape, { scope: "bound" })).toBeUndefined();

			});

			it("still enforces the target pattern for a bound", async () => {

				const shape = reference(resource({ pattern: "/users/{id}" }, {}));

				expect(validateReference(["app:/products/999"], shape, { scope: "bound" }))
					.toEqual([{ "0": [expect.stringContaining("{format}")] }]);

			});

			it("still rejects a bound of the wrong kind", async () => {

				const shape = reference(resource({}));

				expect(validateReference([42], shape, { scope: "bound" }))
					.toEqual([{ "0": ["{type} expected <Reference> value"] }]);

			});

		});

	});

});
