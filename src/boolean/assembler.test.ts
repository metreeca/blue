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

});

describe("mergeBoolean", () => {

	it("preserves kind as 'boolean'", async () => {

		expect(mergeBoolean(boolean(), boolean()).kind).toBe("boolean");

	});

	it("returns an immutable shape", async () => {

		const merged = mergeBoolean(boolean(), boolean());

		expect(() => Object.assign(merged, { kind: "string" })).toThrow();

	});

	it("carries nothing beyond the kind", async () => {

		expect(Object.keys(mergeBoolean(boolean(), boolean())).sort()).toEqual(["kind"]);

	});

});
