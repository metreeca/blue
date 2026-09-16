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
import { mergeBoolean, narrowsBoolean } from "./assembler.js";
import { boolean } from "./index.js";


describe("narrowsBoolean", () => {

	it("accepts an identical child", async () => {

		expect(narrowsBoolean(boolean(), boolean())).toBeUndefined();

	});

	it("accepts a child closing an open inherited domain", async () => {

		expect(narrowsBoolean(boolean({ in: true }), boolean())).toBeUndefined();

	});

	it("accepts a child leaving an inherited enumeration to carry through", async () => {

		expect(narrowsBoolean(boolean(), boolean({ in: true }))).toBeUndefined();

	});

	it("accepts a child restating the inherited value", async () => {

		expect(narrowsBoolean(boolean({ in: false }), boolean({ in: false }))).toBeUndefined();

	});

	it("returns trace for a child admitting the other value", async () => {

		expect(narrowsBoolean(boolean({ in: true }), boolean({ in: false })))
			.toContainEqual(expect.stringContaining("{in}"));

	});

});

describe("mergeBoolean", () => {

	it("preserves kind as 'boolean'", async () => {

		expect(mergeBoolean(boolean(), boolean()).kind).toBe("boolean");

	});

	it("returns an immutable shape", async () => {

		const merged = mergeBoolean(boolean(), boolean());

		expect(() => Object.assign(merged, { kind: "string" })).toThrow();

	});

	it("leaves the domain open where neither shape enumerates a value", async () => {

		expect(mergeBoolean(boolean(), boolean()).in).toBeUndefined();

	});

	describe("in", () => {

		it("inherits source in when target has none", async () => {

			expect(mergeBoolean(boolean(), boolean({ in: false })).in).toBe(false);

		});

		it("keeps target in when source has none", async () => {

			expect(mergeBoolean(boolean({ in: false }), boolean()).in).toBe(false);

		});

		it("keeps the value both shapes state", async () => {

			expect(mergeBoolean(boolean({ in: true }), boolean({ in: true })).in).toBe(true);

		});

		it("rejects a target admitting the other value", async () => {

			expect(() => mergeBoolean(boolean({ in: true }), boolean({ in: false }))).toThrow(RangeError);

		});

	});

});
