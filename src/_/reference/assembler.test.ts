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
import { mergeReference, narrowsReference } from "./assembler.js";
import { reference } from "./index.js";
import { resource, type ResourceConstraints, type ResourceShape } from "../resource/index.js";


/**
 * Builds a bare target shape, carrying nothing but the constraints its identifiers are held to.
 */
function target(constraints: ResourceConstraints = {}, ...parents: readonly ResourceShape[]): ResourceShape {
	return resource(...parents, {}, constraints);
}


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
