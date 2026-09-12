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
import { reference } from "./index.js";
import { resource, type ResourceConstraints, type ResourceShape } from "../resource/index.js";


/**
 * Builds a bare target shape, carrying nothing but the constraints its identifiers are held to.
 */
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
