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
import { number } from "../number/index.js";
import { string } from "../string/index.js";
import { union } from "./index.js";
import { validateUnion } from "./validator.js";


describe("validateUnion", () => {

	const shape = union(string(), number());

	it("returns undefined for empty values", async () => {

		expect(validateUnion([], shape)).toBeUndefined();

	});

	it("accepts a value belonging to one branch", async () => {

		expect(validateUnion(["hello"], shape)).toBeUndefined();
		expect(validateUnion([42], shape)).toBeUndefined();

	});

	it("keys a violation by element for a value belonging to no branch", async () => {

		expect(validateUnion([true], shape)).toEqual([{ "0": [expect.stringContaining("no")] }]);

	});

	it("reports only the values belonging to no branch", async () => {

		const trace = validateUnion(["hello", true, 42], shape);

		expect(trace).toEqual([{ "1": [expect.stringContaining("no")] }]);

	});

	it("rejects a value belonging to several branches as ambiguous", async () => {

		const overlapping = union(string({ minLength: 1 }), string({ maxLength: 9 }));

		expect(validateUnion(["hello"], overlapping))
			.toEqual([{ "0": [expect.stringContaining("several")] }]);

	});

	it("admits a placeholder fitting several branches", async () => {

		const overlapping = union(string({ minLength: 1 }), string({ maxLength: 9 }));

		expect(validateUnion(["hello"], overlapping, { scope: "model" })).toBeUndefined();

	});

	it("still rejects a placeholder fitting no branch", async () => {

		expect(validateUnion([true], shape, { scope: "model" }))
			.toEqual([{ "0": [expect.stringContaining("no")] }]);

	});

	it("requires a bound to single out one branch", async () => {

		expect(validateUnion([42], shape, { scope: "bound" })).toBeUndefined();
		expect(validateUnion([true], shape, { scope: "bound" }))
			.toEqual([{ "0": [expect.stringContaining("no")] }]);

	});

	it("admits a bound outside the value domain of the branch it singles out", async () => {

		const bounded = union(number({ minInclusive: 1, maxInclusive: 5 }), string());

		expect(validateUnion([8], bounded, { scope: "bound" })).toBeUndefined();

	});

});
