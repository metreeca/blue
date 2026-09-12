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
import type { Scope } from "./index.core.js";
import { getShapeTarget, mergeReference, narrowsReference, validateReference } from "./reference.core.js";
import { reference } from "./reference.js";
import { resource, type ResourceConstraints, type ResourceShape } from "./resource/index.js";
import { string } from "./string/index.js";


// build a bare target shape, carrying nothing but the constraints its identifiers are held to

function target(constraints: ResourceConstraints = {}, ...parents: readonly ResourceShape[]): ResourceShape {
	return resource(...parents, {}, constraints);
}


describe("factories", () => {

	describe("reference", () => {

		it("returns a shape with kind 'reference'", async () => {

			expect(reference(target()).kind).toBe("reference");

		});

		it("returns a shape carrying its target", async () => {

			const Vendor = target();

			expect(reference(Vendor).target).toBe(Vendor);

		});

		it("keeps a deferred target deferred", async () => {

			const Vendor = target();
			const deferred = () => Vendor;

			expect(reference(deferred).target).toBe(deferred);

		});

		it("returns an immutable shape", async () => {

			const shape = reference(target());

			expect(() => Object.assign(shape, { kind: "string" })).toThrow();

		});

		it("includes only the kind and target entries", async () => {

			expect(Object.keys(reference(target())).sort()).toEqual(["kind", "target"]);

		});

	});

});

describe("operators", () => {

	describe("narrowsReference", () => {

		const Wider = target();
		const Narrower = target({}, Wider);
		const Narrowest = target({}, Narrower);

		it("accepts an identical child", async () => {

			expect(narrowsReference(reference(Wider), reference(Wider))).toBeUndefined();

		});

		it("accepts a child pointing at an extending shape", async () => {

			expect(narrowsReference(reference(Narrower), reference(Wider))).toBeUndefined();

		});

		it("accepts a child pointing at a transitively extending shape", async () => {

			expect(narrowsReference(reference(Narrowest), reference(Wider))).toBeUndefined();

		});

		it("accepts a child pointing at a shape extending one of several inherited parents", async () => {

			const Other = target();
			const Both = target({}, Other, Wider);

			expect(narrowsReference(reference(Both), reference(Wider))).toBeUndefined();

		});

		it("resolves a deferred target on either side", async () => {

			expect(narrowsReference(reference(() => Narrower), reference(() => Wider))).toBeUndefined();

		});

		it("rejects a child pointing at the extended shape", async () => {

			expect(narrowsReference(reference(Wider), reference(Narrower)))
				.toContainEqual(expect.stringContaining("{target}"));

		});

		it("rejects a child pointing at an unrelated shape", async () => {

			expect(narrowsReference(
				reference(target({ pattern: "/users/{id}" })),
				reference(target({ pattern: "/vendors/{id}" }))
			)).toBeDefined();

		});

	});

	describe("mergeReference", () => {

		const Wider = target();
		const Narrower = target({}, Wider);

		it("preserves kind as 'reference'", async () => {

			expect(mergeReference(reference(Wider), reference(Wider)).kind).toBe("reference");

		});

		it("preserves the shared target", async () => {

			expect(mergeReference(reference(Wider), reference(Wider)).target).toBe(Wider);

		});

		it("keeps the extending target", async () => {

			expect(mergeReference(reference(Narrower), reference(Wider)).target).toBe(Narrower);

		});

		it("returns an immutable shape", async () => {

			const merged = mergeReference(reference(Wider), reference(Wider));

			expect(() => Object.assign(merged, { kind: "string" })).toThrow();

		});

		it("rejects a divergent target", async () => {

			expect(() => mergeReference(
				reference(target({ pattern: "/users/{id}" })),
				reference(target({ pattern: "/vendors/{id}" }))
			)).toThrow(TraceError);

		});

	});

	describe("getShapeTarget", () => {

		it("crosses a reference to the shape it points at", async () => {

			const Vendor = target();

			expect(getShapeTarget(reference(Vendor))).toBe(Vendor);

		});

		it("resolves a deferred target", async () => {

			const Vendor = target();

			expect(getShapeTarget(reference(() => Vendor))).toBe(Vendor);

		});

		it("takes a resource shape to itself", async () => {

			const Vendor = target();

			expect(getShapeTarget(Vendor)).toBe(Vendor);

		});

		it("resolves a deferred range", async () => {

			const Vendor = target();

			expect(getShapeTarget(() => Vendor)).toBe(Vendor);

		});

		it("yields nothing for a range pointing at no resource", async () => {

			expect(getShapeTarget(string())).toBeUndefined();

		});

	});

});

describe("validators", () => {

	describe("validateReference", () => {

		describe("type filtering", () => {

			it.each<[string, readonly unknown[]]>([
				["valid reference values", ["app:/users/123"]],
				["empty values", []]
			])("returns undefined for %s", async (_label, values) => {

				expect(validateReference(values, reference(target()))).toBeUndefined();

			});

			it.each<[string, readonly unknown[], readonly number[]]>([
				["a single non-reference value", [42], [0]],
				["mixed valid and non-reference values", ["app:/users/123", 42], [1]],
				["multiple non-reference values", [42, true], [0, 1]],

				// references MUST be absolute IRIs; a root-relative string carries no scheme

				["a relative (non-absolute) IRI", ["/users/123"], [0]]
			])("keys a kind violation by element for %s", async (_label, values, indices) => {

				expect(validateReference(values, reference(target()))).toEqual([
					Object.fromEntries(indices.map(index => [`${index}`, ["{type} expected <Reference> value"]]))
				]);

			});

		});

		describe.each([

			{
				constraint: "pattern",
				constraints: { pattern: "/users/{id}" } as const,
				valid: ["app:/users/123"],
				invalid: ["app:/products/123"],
				error: [{ "0": [expect.stringContaining("{format}")] }]
			},

			{
				constraint: "in",
				constraints: { in: ["app:/users/1", "app:/users/2"] } as const,
				valid: ["app:/users/1"],
				invalid: ["app:/users/99"],
				error: [{ "0": [expect.stringContaining("{domain}")] }]
			},

			{
				constraint: "hasValue",
				constraints: { hasValue: ["app:/users/1"] } as const,
				valid: ["app:/users/1", "app:/users/2"],
				invalid: ["app:/users/2"],
				error: [expect.stringContaining("{values}")]
			}

		])("$constraint constraint", ({ constraints, valid, invalid, error }) => {

			it("accepts the references the target admits", async () => {

				expect(validateReference(valid, reference(target(constraints)))).toBeUndefined();

			});

			it("rejects the references the target refuses", async () => {

				expect(validateReference(invalid, reference(target(constraints)))).toEqual(error);

			});

		});

		describe("deferred target", () => {

			it("resolves a deferred target before validating", async () => {

				const Users = target({ pattern: "/users/{id}" });
				const shape = reference(() => Users);

				expect(validateReference(["app:/users/123"], shape)).toBeUndefined();
				expect(validateReference(["app:/products/123"], shape))
					.toEqual([{ "0": [expect.stringContaining("{format}")] }]);

			});

		});

		describe("placeholder mode", () => {

			it("skips the target value constraints for a placeholder", async () => {

				expect(validateReference(["app:/products/999"], reference(target({ pattern: "/users/{id}" })), {
					scope: "model"
				})).toBeUndefined();

				expect(validateReference(["app:/users/99"], reference(target({ in: ["app:/users/1"] })), {
					scope: "model"
				})).toBeUndefined();

			});

			// a reference placeholder matches the full IRI-reference production: the empty string together with the
			// relative, root-relative, and absolute forms, not the absolute-only instance form

			it.each<[string, readonly unknown[]]>([
				["an absolute IRI", ["app:/vendors/1"]],
				["a root-relative IRI", ["/vendors/"]],
				["a relative IRI", ["vendors/1"]],
				["the empty string", [""]]
			])("accepts %s placeholder", async (_label, values) => {

				expect(validateReference(values, reference(target()), { scope: "model" })).toBeUndefined();

			});

			it("still rejects a placeholder of the wrong kind", async () => {

				expect(validateReference([42], reference(target()), { scope: "model" }))
					.toEqual([{ "0": ["{type} expected <IRI> value"] }]);

			});

		});

		describe("bound scope", () => {

			// the bound scope keeps the target IRI pattern, the syntactic discriminator, and drops the value-domain
			// constraints

			it("skips the target value-domain constraints for a bound", async () => {

				expect(validateReference(["app:/users/99"], reference(target({ in: ["app:/users/1"] })), {
					scope: "bound"
				})).toBeUndefined();

				expect(validateReference(["app:/users/2"], reference(target({ hasValue: ["app:/users/1"] })), {
					scope: "bound"
				})).toBeUndefined();

			});

			it("still enforces the target pattern for a bound", async () => {

				expect(validateReference(["app:/products/999"], reference(target({ pattern: "/users/{id}" })), {
					scope: "bound"
				})).toEqual([{ "0": [expect.stringContaining("{format}")] }]);

			});

			it("still rejects a bound of the wrong kind", async () => {

				expect(validateReference([42], reference(target()), { scope: "bound" }))
					.toEqual([{ "0": ["{type} expected <Reference> value"] }]);

			});

		});

		describe.each<[string, Scope]>([
			["state", "state"],
			["bound", "bound"],
			["model", "model"]
		])("%s scope", (_label, scope) => {

			it("returns undefined for empty values", async () => {

				expect(validateReference([], reference(target()), { scope })).toBeUndefined();

			});

		});

	});

});
