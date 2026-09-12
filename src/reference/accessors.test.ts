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
import { getShapeTarget } from "./accessors.js";
import { reference } from "./index.js";
import { resource, type ResourceConstraints, type ResourceShape } from "../resource/index.js";
import { string } from "../string/index.js";


/**
 * Builds a bare target shape, carrying nothing but the constraints its identifiers are held to.
 */
function target(constraints: ResourceConstraints = {}, ...parents: readonly ResourceShape[]): ResourceShape {
	return resource(...parents, {}, constraints);
}


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
